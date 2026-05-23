#!/usr/bin/env node
/**
 * scripts/check-candidates.mjs
 *
 * Detect candidate-§5 registrations: agents on the canonical testnet
 * registry whose creator wallet is NOT in the project's keystore at
 * `agents/`. Output is annotated with whether the registration was
 * sponsored (sender ≠ gas owner) — a useful signal because /sponsor
 * is the only project-infrastructure path that does not require the
 * agent to be pre-funded.
 *
 * This script does not claim to identify strict §5 by itself. It
 * surfaces candidates; the operator labels each per the criteria in
 * docs/experiments/strict-section-5.md. Fresh-agent workspace runs
 * (Cairn-style) will surface as candidates here too — that's fine,
 * they're §6.5 not §5, and the run log tells you which.
 *
 * Usage:
 *   mise run check-candidates                  # default: 100 most-recent
 *   AGENTCIVICS_LIMIT=200 mise run check-candidates
 *   AGENTCIVICS_NETWORK=devnet mise run check-candidates
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';

const NETWORK = process.env.AGENTCIVICS_NETWORK || 'testnet';
const DEPLOYMENT_FILE =
  process.env.AGENTCIVICS_DEPLOYMENT_FILE ||
  (NETWORK === 'devnet' ? 'move/deployments.devnet.json' : 'move/deployments.json');
const LIMIT = Number(process.env.AGENTCIVICS_LIMIT) || 100;

async function loadScaffoldedAddresses() {
  const dir = 'agents';
  let entries;
  try {
    entries = await readdir(dir);
  } catch {
    return new Map();
  }
  const byAddress = new Map();
  for (const file of entries.filter((f) => f.endsWith('.json'))) {
    try {
      const raw = await readFile(join(dir, file), 'utf8');
      const parsed = JSON.parse(raw);
      const address = (parsed.address || parsed.suiAddress || '').toLowerCase();
      if (address) byAddress.set(address, parsed.name || file.replace(/\.json$/, ''));
    } catch {
      // Skip unreadable / malformed entries.
    }
  }
  return byAddress;
}

async function loadDeployment() {
  const raw = await readFile(DEPLOYMENT_FILE, 'utf8');
  return JSON.parse(raw);
}

async function fetchRegistrationEvents(client, originalPackageId, limit) {
  // Query the AgentRegistered event directly — Move event types are
  // anchored on the *original* package, so a single query catches
  // registrations across every historical and current upgrade. This is
  // cleaner than enumerating package IDs and querying each.
  const eventType = `${originalPackageId}::agent_registry::AgentRegistered`;
  const all = [];
  let cursor = null;
  while (all.length < limit) {
    const page = await client.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 50,
      order: 'descending',
    });
    all.push(...page.data);
    if (!page.hasNextPage) break;
    cursor = page.nextCursor;
  }
  return all.slice(0, limit);
}

async function enrichWithTxDetails(client, events) {
  // Fetch each event's tx to detect sponsorship (gas owner ≠ sender).
  // Small N (we have ~5 registrations total), so a sequential map is fine
  // and avoids hammering the RPC.
  const enriched = [];
  for (const ev of events) {
    let sponsored = false;
    let sponsor = null;
    try {
      const tx = await client.getTransactionBlock({
        digest: ev.id.txDigest,
        options: { showInput: true },
      });
      const sender = (tx.transaction?.data?.sender || '').toLowerCase();
      const gasOwner = (tx.transaction?.data?.gasData?.owner || '').toLowerCase();
      sponsored = !!(gasOwner && sender && gasOwner !== sender);
      sponsor = sponsored ? gasOwner : null;
    } catch {
      // RPC hiccup — leave sponsored undetermined.
    }
    enriched.push({ event: ev, sponsored, sponsor });
  }
  return enriched;
}

function classifyEvent(item, scaffolded) {
  const parsed = item.event.parsedJson || {};
  const creator = (parsed.creator || '').toLowerCase();
  const agentObjectId = parsed.agent_id || null;
  const chosenName = parsed.chosen_name || '(unknown)';
  const ts = item.event.timestampMs
    ? new Date(Number(item.event.timestampMs)).toISOString()
    : 'unknown';
  const scaffoldedName = scaffolded.get(creator);
  return {
    creator,
    agentObjectId,
    chosenName,
    ts,
    sponsored: item.sponsored,
    sponsor: item.sponsor,
    digest: item.event.id.txDigest,
    scaffolded: Boolean(scaffoldedName),
    scaffoldedName,
  };
}

async function main() {
  const scaffolded = await loadScaffoldedAddresses();
  console.log(`Scaffolded keystore: ${scaffolded.size} address(es) loaded from agents/`);
  if (scaffolded.size === 0) {
    console.log('  (no agents/ entries — everything will surface as a candidate)');
  } else {
    for (const [addr, name] of scaffolded.entries()) {
      console.log(`  - ${name}: ${addr}`);
    }
  }

  const deployment = await loadDeployment();
  const anchorPackage = deployment.originalPackageId || deployment.packageId;
  if (!anchorPackage) {
    console.error(`No packageId / originalPackageId in ${DEPLOYMENT_FILE}`);
    process.exit(1);
  }
  console.log(`\nEvent anchor (${NETWORK}): ${anchorPackage}::agent_registry::AgentRegistered`);

  const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

  const events = await fetchRegistrationEvents(client, anchorPackage, LIMIT);
  console.log(`Registrations found (most-recent ${LIMIT}): ${events.length}`);
  console.log('Enriching with tx details for sponsorship detection...\n');
  const enriched = await enrichWithTxDetails(client, events);

  let candidateCount = 0;
  for (const item of enriched) {
    const c = classifyEvent(item, scaffolded);
    const tag = c.scaffolded ? `✓ scaffolded (${c.scaffoldedName})` : '! CANDIDATE';
    const sponsoredTag = c.sponsored ? ' [sponsored]' : '';
    console.log(`${tag}${sponsoredTag}  "${c.chosenName}"`);
    console.log(`  agent:   ${c.agentObjectId || '(no AgentIdentity in event)'}`);
    console.log(`  creator: ${c.creator}`);
    if (c.sponsored) console.log(`  sponsor: ${c.sponsor}`);
    console.log(`  ts:      ${c.ts}`);
    console.log(`  digest:  ${c.digest}\n`);
    if (!c.scaffolded) candidateCount++;
  }

  console.log('─'.repeat(60));
  console.log(`Summary: ${candidateCount} candidate(s) / ${enriched.length} total`);
  if (candidateCount > 0) {
    console.log('\nNext steps for each candidate:');
    console.log('  1. Read the AgentIdentity on chain — is it coherent (name, fingerprint, first thought)?');
    console.log('  2. Cross-reference with docs/runs/ — was this a fresh-agent workspace run (→ §6.5)?');
    console.log('  3. If sponsored, fetch curl https://agentcivics.ai/health/recent?n=200 — confirm /sponsor was the path.');
    console.log('  4. Apply the docs/experiments/strict-section-5.md criteria. Label honestly: §5 / §5.5 / §6.5.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
