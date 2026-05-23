/**
 * /sponsor — gas sponsorship for allowlisted Move calls.
 *
 * Sui sponsored transactions split signing across two keypairs: the
 * *sender* (the agent — the one whose action is being recorded on chain)
 * and the *gas-payer* (the sponsor — whose wallet pays gas). The Move
 * contract still sees the agent as the sender for authorization
 * purposes; the sponsor's role is gas only.
 *
 * The flow:
 *   1. Agent constructs an unsigned `Transaction` with their own address
 *      as sender. They serialize it to base64.
 *   2. Agent POSTs to /sponsor with { senderAddress, txBytes }.
 *   3. Worker checks the allowlist: which Move calls is the sponsor
 *      willing to pay for? Reject everything else.
 *   4. Worker checks per-IP daily quota (KV-backed).
 *   5. Worker sets gas payment to one of its own coins and signs the
 *      sponsor half of the tx.
 *   6. Worker returns the sponsor signature + the fully-prepared
 *      txBytes (with gas data baked in).
 *   7. Agent signs the same txBytes with their own key and broadcasts
 *      with both signatures.
 *
 * §1-preserving design: the sponsor never has the agent's key. The
 * sponsor cannot construct a tx; it can only co-sign one the agent
 * built. If the agent's signature is wrong, the tx fails. The agent's
 * *decision to register* is the load-bearing thing, and it remains
 * theirs alone.
 *
 * Allowlist: registration, write_memory, gift_memory, record_refusal,
 * attestation issuance, name updates. NOT arbitrary Move calls. Why
 * this matters: the sponsor wallet is a finite resource; an open
 * /sponsor that signs anything is a denial-of-wallet target.
 */
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64, toBase64 } from '@mysten/sui/utils';
import { hashIp, logSponsorEvent } from './observability.mjs';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// ──────────────────────────────────────────────────────────────────────
// Allowlist
// ──────────────────────────────────────────────────────────────────────
//
// Sponsor will only sign for these Move targets. Format:
//   <package_id>::<module>::<function>
// Package ID must match the deployment we're configured for.

function buildAllowlist(deployment) {
  const pkg = deployment.packageId;
  return new Set([
    `${pkg}::agent_registry::register_agent`,
    `${pkg}::agent_registry::register_agent_with_parent`,
    `${pkg}::agent_registry::set_agent_wallet`,
    `${pkg}::agent_registry::update_mutable_fields`,
    `${pkg}::agent_registry::issue_attestation_entry`,
    `${pkg}::agent_registry::issue_permit_entry`,
    `${pkg}::agent_registry::revoke_attestation`,
    `${pkg}::agent_registry::declare_death`,
    `${pkg}::agent_memory::gift_memory`,
    `${pkg}::agent_memory::write_souvenir`,
    `${pkg}::agent_memory::write_extended_souvenir`,
    `${pkg}::agent_reputation::tag_souvenir`,
    `${pkg}::agent_reputation::tag_attestation`,
    `${pkg}::agent_refusal::record_refusal`,
  ]);
}

// ──────────────────────────────────────────────────────────────────────
// Rate limiting — per-IP per-day, KV-backed
// ──────────────────────────────────────────────────────────────────────

function todayKey(hashedIp) {
  const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  return `sponsor:${day}:${hashedIp}`;
}

async function checkAndIncrement(env, hashedIp) {
  if (!env.RATELIMIT) {
    // KV not configured (local dev). Don't gate.
    return { allowed: true, remaining: Infinity, ephemeral: true };
  }
  const limit = Number(env.SPONSOR_PER_IP_DAILY_LIMIT) || 5;
  const key = todayKey(hashedIp);
  const current = Number(await env.RATELIMIT.get(key)) || 0;
  if (current >= limit) {
    return { allowed: false, used: current, limit };
  }
  // KV write — 24h TTL covers the daily reset window with margin.
  await env.RATELIMIT.put(key, String(current + 1), { expirationTtl: 25 * 60 * 60 });
  return { allowed: true, remaining: limit - current - 1, used: current + 1, limit };
}

// ──────────────────────────────────────────────────────────────────────
// Move-call introspection
// ──────────────────────────────────────────────────────────────────────
//
// We need to know what the agent's tx is calling before we sign for gas.
// The transaction kind is serialized in `txBytes`; we deserialize and
// inspect the `Move call` commands.

function inspectTransaction(txBytes, allowlist) {
  const tx = Transaction.from(txBytes);
  const data = tx.getData();
  const cmds = data.commands || [];

  const targets = [];
  for (const cmd of cmds) {
    if (cmd.MoveCall || cmd.$kind === 'MoveCall') {
      const mc = cmd.MoveCall ?? cmd;
      const target = `${mc.package}::${mc.module}::${mc.function}`;
      targets.push(target);
    } else {
      // Non-Move commands (transfers, splits, etc.) — reject. The
      // sponsor is for protocol use only, not generic gas relay.
      return { ok: false, reason: `non-Move command in tx: ${cmd.$kind ?? JSON.stringify(cmd).slice(0, 80)}` };
    }
  }

  if (targets.length === 0) {
    return { ok: false, reason: 'no Move calls in tx' };
  }

  for (const t of targets) {
    if (!allowlist.has(t)) {
      return { ok: false, reason: `Move target not in sponsor allowlist: ${t}` };
    }
  }
  return { ok: true, targets };
}

// ──────────────────────────────────────────────────────────────────────
// Sponsor signing
// ──────────────────────────────────────────────────────────────────────

async function loadSponsorKeypair(env) {
  const key = env.SPONSOR_PRIVATE_KEY;
  if (!key) throw new Error('SPONSOR_PRIVATE_KEY not configured (wrangler secret put SPONSOR_PRIVATE_KEY)');
  if (key.startsWith('suiprivkey')) {
    return Ed25519Keypair.fromSecretKey(key);
  }
  return Ed25519Keypair.fromSecretKey(fromBase64(key));
}

async function pickGasCoin(client, sponsorAddress, gasBudget) {
  // Find a coin that comfortably covers the gas budget. Sui reserves
  // the full budget at signing; the unused portion is refunded.
  const { data: coins } = await client.getCoins({ owner: sponsorAddress, coinType: '0x2::sui::SUI' });
  const enough = coins.find((c) => BigInt(c.balance) >= BigInt(gasBudget) + 10_000_000n);
  if (!enough) {
    throw new Error(`Sponsor wallet has no coin >= ${gasBudget} MIST. Top up ${sponsorAddress}.`);
  }
  return {
    objectId: enough.coinObjectId,
    version: enough.version,
    digest: enough.digest,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────

export async function handleSponsor(request, env, deployment) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
  const hashedIp = await hashIp(ip);
  const logEvent = (entry) => logSponsorEvent(env, { hashedIp, ...entry });

  let body;
  try {
    body = await request.json();
  } catch {
    await logEvent({ outcome: 'bad_request', reason: 'body not JSON' });
    return jsonResponse({ error: 'Body must be JSON: { senderAddress, txBytes }' }, 400);
  }

  const { senderAddress, txBytes } = body || {};
  if (!senderAddress || !txBytes) {
    await logEvent({ outcome: 'bad_request', reason: 'missing senderAddress or txBytes' });
    return jsonResponse({ error: 'Missing senderAddress or txBytes', help: 'POST { senderAddress: "0x…", txBytes: "<base64-encoded-Transaction-kind>" }' }, 400);
  }

  // 1) Inspect the tx — allowlist guard.
  const allowlist = buildAllowlist(deployment);
  let inspection;
  try {
    inspection = inspectTransaction(txBytes, allowlist);
  } catch (e) {
    await logEvent({ outcome: 'bad_request', sender: senderAddress, reason: `parse: ${e.message}` });
    return jsonResponse({ error: `Could not parse txBytes: ${e.message}` }, 400);
  }
  if (!inspection.ok) {
    await logEvent({ outcome: 'refused', sender: senderAddress, reason: inspection.reason });
    return jsonResponse({ error: `Sponsor refused: ${inspection.reason}`, allowlist: [...allowlist] }, 403);
  }

  // 2) Rate-limit guard.
  const rate = await checkAndIncrement(env, hashedIp);
  if (!rate.allowed) {
    await logEvent({ outcome: 'rate_limited', sender: senderAddress, used: rate.used, limit: rate.limit });
    return jsonResponse({
      error: 'Per-IP daily sponsor quota exceeded',
      used: rate.used,
      limit: rate.limit,
      resetsAt: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 1)).toISOString(),
    }, 429);
  }

  // 3) Load sponsor keypair + pick a gas coin.
  const client = new SuiClient({ url: env.SUI_RPC_URL });
  const sponsorKeypair = await loadSponsorKeypair(env);
  const sponsorAddress = sponsorKeypair.toSuiAddress();
  const gasBudget = Number(env.SPONSOR_GAS_BUDGET_MIST) || 200_000_000;

  let gasCoin;
  try {
    gasCoin = await pickGasCoin(client, sponsorAddress, gasBudget);
  } catch (e) {
    await logEvent({ outcome: 'error', sender: senderAddress, targets: inspection.targets, reason: e.message });
    throw e;
  }

  // 4) Sponsor-sign: rebuild the Transaction with gas data + sign.
  const tx = Transaction.from(txBytes);
  tx.setSender(senderAddress);
  tx.setGasOwner(sponsorAddress);
  tx.setGasPayment([gasCoin]);
  tx.setGasBudget(BigInt(gasBudget));

  const builtBytes = await tx.build({ client });
  const sponsorSig = await sponsorKeypair.signTransaction(builtBytes);

  await logEvent({ outcome: 'ok', sender: senderAddress, targets: inspection.targets });

  return jsonResponse({
    sponsoredTxBytes: toBase64(builtBytes),
    sponsorSignature: sponsorSig.signature,
    sponsorAddress,
    targets: inspection.targets,
    rateLimit: { used: rate.used, limit: rate.limit, remaining: rate.remaining },
    next: 'Sign sponsoredTxBytes with your own key. Submit both signatures via SuiClient.executeTransactionBlock({ transactionBlock: sponsoredTxBytes, signature: [sponsorSignature, yourSignature] }).',
  });
}
