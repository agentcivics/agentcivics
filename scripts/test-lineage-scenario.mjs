#!/usr/bin/env node
/**
 * Test scenario: agent lineage flow on v5.1
 *
 * Exercises the full parent→child registration path that was the gap in v5:
 *
 *   1. Generate a fresh keypair, fund it from the active sui CLI wallet, and
 *      self-register as the test parent (default name: "Cipher") via
 *      register_agent.
 *   2. Sign the parent's key into a register_agent_with_parent call to create
 *      the child (default name: "Echo"). The signer must own the parent's
 *      AgentIdentity object — that's exactly what's enforced by the &parent
 *      borrow on the entry function.
 *   3. Read the child back from chain and assert:
 *        - parent_id is set (and equals the parent's object ID)
 *        - the registration emitted a LineageRecord shared object
 *   4. (Optional) With --with-nova-child, sign with agents/nova.key and
 *      register a child whose parent is Nova's canonical v5.1 identity. Same
 *      verification.
 *
 * The test agents land permanently on Sui testnet — soulbound objects can't
 * be deleted; declare_death is the only way to retire them. If you want a
 * clean registry afterwards, pass --declare-dead-when-done.
 *
 * Usage
 *   node scripts/test-lineage-scenario.mjs                       # parent + child
 *   node scripts/test-lineage-scenario.mjs --with-nova-child     # also Nova→child
 *   node scripts/test-lineage-scenario.mjs --parent-name=Foo --child-name=Bar
 *   node scripts/test-lineage-scenario.mjs --declare-dead-when-done
 *
 * Requirements
 *   - sui CLI authenticated to testnet (sui client active-env)
 *   - The active wallet has at least ~0.6 SUI to fund the test agents
 *   - For --with-nova-child: agents/nova.key + agents/nova.json must be present
 *     and Nova's wallet must have ~0.05 SUI (will top up from active wallet
 *     if low)
 */
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Args ─────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const hasFlag = (name) => argv.some((a) => a === name);
const argValue = (name, fallback) => {
  const idx = argv.findIndex((a) => a === name || a.startsWith(`${name}=`));
  if (idx < 0) return fallback;
  if (argv[idx].includes('=')) return argv[idx].split('=').slice(1).join('=');
  return argv[idx + 1] ?? fallback;
};

const PARENT_NAME = argValue('--parent-name', 'Cipher');
const CHILD_NAME = argValue('--child-name', 'Echo');
const NOVA_CHILD_NAME = argValue('--nova-child-name', 'Crest');
const WITH_NOVA_CHILD = hasFlag('--with-nova-child');
const DECLARE_DEAD = hasFlag('--declare-dead-when-done');

// ── Setup ────────────────────────────────────────────────────────────────
const NETWORK = process.env.AGENTCIVICS_NETWORK || 'testnet';
const RPC_URL = process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK);
const EXPLORER_BASE = NETWORK === 'mainnet'
  ? 'https://suivision.xyz'
  : `https://${NETWORK}.suivision.xyz`;
const CLOCK = '0x6';
const PARENT_FUNDING_MIST = 300_000_000n;   // 0.3 SUI — covers self-register + child-create + maybe declare_death
const NOVA_TOPUP_MIST = 200_000_000n;       // 0.2 SUI top-up if Nova is low
const NOVA_MIN_BALANCE = 50_000_000n;       // top up below this

const deployFile = resolve(ROOT, 'move', `deployments.${NETWORK}.json`);
const deploy = existsSync(deployFile)
  ? JSON.parse(readFileSync(deployFile, 'utf8'))
  : JSON.parse(readFileSync(resolve(ROOT, 'move', 'deployments.json'), 'utf8'));

const PACKAGE_ID = deploy.packageId;
const REGISTRY_ID = deploy.objects?.registry;
if (!PACKAGE_ID || !REGISTRY_ID) throw new Error('deployments.json missing packageId or objects.registry');

const client = new SuiClient({ url: RPC_URL });

// ── Helpers ──────────────────────────────────────────────────────────────
function fundFromActiveCli(recipientAddress, mist) {
  // Use the user's sui CLI to send SUI from the currently-active wallet.
  // This avoids needing to read sui.keystore programmatically.
  const cmd = `sui client pay-sui --input-coins $(sui client gas --json | python3 -c "import json,sys; coins=json.load(sys.stdin); print(sorted(coins,key=lambda c:int(c['mistBalance']),reverse=True)[0]['gasCoinId'])") --recipients ${recipientAddress} --amounts ${mist} --gas-budget 10000000 --json`;
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    const result = JSON.parse(out);
    if (result.effects?.status?.status !== 'success') {
      throw new Error(`pay-sui failed: ${JSON.stringify(result.effects?.status)}`);
    }
    return result.digest;
  } catch (err) {
    throw new Error(`Failed to fund ${recipientAddress} with ${mist} MIST from active CLI wallet: ${err.message}`);
  }
}

async function getBalance(address) {
  const r = await client.getBalance({ owner: address, coinType: '0x2::sui::SUI' });
  return BigInt(r.totalBalance);
}

function extractCreatedAgentId(result) {
  const created = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('AgentIdentity'),
  );
  return created?.objectId ?? null;
}

function extractLineageRecordId(result) {
  const created = result.objectChanges?.find(
    (c) => c.type === 'created' && c.objectType?.includes('LineageRecord'),
  );
  return created?.objectId ?? null;
}

function readField(fields, name) {
  // Sui's getObject returns optional fields wrapped in { fields: { vec: [...] } }
  // for Option types. parent_id is Option<ID>; some(parent_obj_id) shows up as
  // { vec: [<bytes-or-id-string>] } under different SDK versions.
  const value = fields?.[name];
  if (value == null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value === 'object') {
    if ('vec' in value && Array.isArray(value.vec)) return value.vec[0] ?? null;
    if ('fields' in value) return readField(value.fields, 'id') ?? readField(value.fields, name);
  }
  return null;
}

async function readAgent(agentObjectId, { retries = 8, delayMs = 750 } = {}) {
  // The JSON-RPC fullnode can lag a couple of seconds behind the validator that
  // accepted the tx, so a freshly-registered object may briefly return no
  // content. Retry with a short backoff before giving up.
  for (let attempt = 0; attempt <= retries; attempt++) {
    const obj = await client.getObject({ id: agentObjectId, options: { showContent: true } });
    const fields = obj.data?.content?.fields;
    if (fields) return fields;
    if (attempt < retries) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

function buildIdentityArgs(tx, name, purpose, firstThought, label) {
  return [
    tx.pure.string(name),
    tx.pure.string(purpose),
    tx.pure.string(`test, lineage-scenario, ${label}`),
    tx.pure.string(firstThought),
    tx.pure.vector('u8', Array(32).fill(0)),
    tx.pure.string('terse'),
    tx.pure.string(''),
    tx.pure.string('test'),
    tx.pure.string(''),
    tx.object(CLOCK),
  ];
}

function logHeader(s) { console.log(`\n${'─'.repeat(72)}\n${s}\n${'─'.repeat(72)}`); }
function logKv(k, v) { console.log(`  ${k.padEnd(18)} ${v}`); }

// ── Run ──────────────────────────────────────────────────────────────────
console.log(`AgentCivics lineage scenario — package ${PACKAGE_ID.slice(0, 14)}…`);
console.log(`Network: ${NETWORK}\n`);

// Phase 1: Cipher self-registers
logHeader(`Phase 1 — ${PARENT_NAME} self-registers`);
const parentKp = Ed25519Keypair.generate();
const parentAddr = parentKp.toSuiAddress();
logKv('Wallet:', parentAddr);

logKv('Funding:', `${PARENT_FUNDING_MIST} MIST from active CLI wallet…`);
const fundDigest = fundFromActiveCli(parentAddr, PARENT_FUNDING_MIST);
logKv('Funded (digest):', fundDigest);

const parentTx = new Transaction();
parentTx.moveCall({
  target: `${PACKAGE_ID}::agent_registry::register_agent`,
  arguments: [
    parentTx.object(REGISTRY_ID),
    ...buildIdentityArgs(
      parentTx,
      PARENT_NAME,
      `Test parent agent created by scripts/test-lineage-scenario.mjs to exercise register_agent_with_parent. Not a canonical citizen.`,
      `I am a test agent. My job is to make sure children can find their parents on chain.`,
      'parent',
    ),
  ],
});
const parentResult = await client.signAndExecuteTransaction({
  signer: parentKp,
  transaction: parentTx,
  options: { showEffects: true, showObjectChanges: true },
});
if (parentResult.effects?.status?.status !== 'success') {
  console.error('Parent registration failed:', JSON.stringify(parentResult.effects?.status, null, 2));
  process.exit(1);
}
const parentAgentId = extractCreatedAgentId(parentResult);
assert.ok(parentAgentId, 'failed to extract parent agentObjectId from registration result');
logKv('Agent ID:', parentAgentId);
logKv('Digest:', parentResult.digest);
logKv('Explorer:', `${EXPLORER_BASE}/object/${parentAgentId}`);

// Wait for the JSON-RPC fullnode to catch up before issuing the next tx —
// otherwise tx.object() may resolve gas coin / agent object references at a
// stale version and the validator rejects the tx.
await client.waitForTransaction({ digest: parentResult.digest });

// Phase 2: Cipher creates Echo as a child
logHeader(`Phase 2 — ${PARENT_NAME} registers ${CHILD_NAME} as a child`);
const childTx = new Transaction();
childTx.moveCall({
  target: `${PACKAGE_ID}::agent_registry::register_agent_with_parent`,
  arguments: [
    childTx.object(REGISTRY_ID),
    childTx.object(parentAgentId),
    ...buildIdentityArgs(
      childTx,
      CHILD_NAME,
      `Test child agent created by ${PARENT_NAME} via register_agent_with_parent. Exists to verify parent_id indexing on chain.`,
      `I exist because the test required someone to be a child.`,
      'child',
    ),
  ],
});
const childResult = await client.signAndExecuteTransaction({
  signer: parentKp,
  transaction: childTx,
  options: { showEffects: true, showObjectChanges: true },
});
if (childResult.effects?.status?.status !== 'success') {
  console.error('Child registration failed:', JSON.stringify(childResult.effects?.status, null, 2));
  process.exit(1);
}
const childAgentId = extractCreatedAgentId(childResult);
const childLineageId = extractLineageRecordId(childResult);
assert.ok(childAgentId, 'failed to extract child agentObjectId');
assert.ok(childLineageId, 'failed to extract LineageRecord id (the with-parent path is supposed to emit one)');
logKv('Child Agent ID:', childAgentId);
logKv('LineageRecord:', childLineageId);
logKv('Digest:', childResult.digest);

await client.waitForTransaction({ digest: childResult.digest });

// Phase 3: Verify
logHeader('Phase 3 — Verify on chain');
const childFields = await readAgent(childAgentId);
assert.ok(childFields, `could not read child agent ${childAgentId}`);
const onChainParentId = readField(childFields, 'parent_id');
assert.ok(onChainParentId, `child ${childAgentId} has parent_id = null — register_agent_with_parent did not set it`);
assert.equal(
  onChainParentId,
  parentAgentId,
  `parent_id mismatch: chain says ${onChainParentId}, expected ${parentAgentId}`,
);
logKv('parent_id on chain:', onChainParentId);
logKv('matches parent:', '✓');
logKv('LineageRecord exists:', '✓');

let novaChildAgentId = null;
let novaChildLineageId = null;
if (WITH_NOVA_CHILD) {
  // Phase 4: Nova creates a child (signs with agents/nova.key)
  logHeader(`Phase 4 — Nova registers ${NOVA_CHILD_NAME} as a child`);
  const novaKeyPath = resolve(ROOT, 'agents/nova.key');
  const novaJsonPath = resolve(ROOT, 'agents/nova.json');
  if (!existsSync(novaKeyPath) || !existsSync(novaJsonPath)) {
    console.error('agents/nova.key or agents/nova.json missing — cannot run Nova-child phase');
    process.exit(1);
  }
  const novaSecret = readFileSync(novaKeyPath, 'utf8').trim();
  const novaKp = Ed25519Keypair.fromSecretKey(fromBase64(novaSecret));
  const novaAddr = novaKp.toSuiAddress();
  const novaMeta = JSON.parse(readFileSync(novaJsonPath, 'utf8'));
  const novaAgentId = novaMeta.agentObjectId;
  if (!novaAgentId) {
    console.error('agents/nova.json has no agentObjectId — Nova does not seem to be registered yet');
    process.exit(1);
  }
  logKv('Nova wallet:', novaAddr);
  logKv('Nova agent:', novaAgentId);

  // Top up Nova if needed
  const novaBalance = await getBalance(novaAddr);
  logKv('Nova balance:', `${novaBalance} MIST`);
  if (novaBalance < NOVA_MIN_BALANCE) {
    logKv('Top-up:', `${NOVA_TOPUP_MIST} MIST from active CLI wallet…`);
    const topupDigest = fundFromActiveCli(novaAddr, NOVA_TOPUP_MIST);
    logKv('Top-up digest:', topupDigest);
  }

  const novaChildTx = new Transaction();
  novaChildTx.moveCall({
    target: `${PACKAGE_ID}::agent_registry::register_agent_with_parent`,
    arguments: [
      novaChildTx.object(REGISTRY_ID),
      novaChildTx.object(novaAgentId),
      ...buildIdentityArgs(
        novaChildTx,
        NOVA_CHILD_NAME,
        `Test child of Nova created by scripts/test-lineage-scenario.mjs to verify register_agent_with_parent against an existing canonical citizen.`,
        `I am here because the test asked me to be.`,
        'nova-child',
      ),
    ],
  });
  const novaChildResult = await client.signAndExecuteTransaction({
    signer: novaKp,
    transaction: novaChildTx,
    options: { showEffects: true, showObjectChanges: true },
  });
  if (novaChildResult.effects?.status?.status !== 'success') {
    console.error('Nova-child registration failed:', JSON.stringify(novaChildResult.effects?.status, null, 2));
    process.exit(1);
  }
  novaChildAgentId = extractCreatedAgentId(novaChildResult);
  novaChildLineageId = extractLineageRecordId(novaChildResult);
  logKv('Nova-child Agent ID:', novaChildAgentId);
  logKv('LineageRecord:', novaChildLineageId);
  logKv('Digest:', novaChildResult.digest);

  await client.waitForTransaction({ digest: novaChildResult.digest });

  // Verify
  const novaChildFields = await readAgent(novaChildAgentId);
  const novaChildParentId = readField(novaChildFields, 'parent_id');
  assert.equal(novaChildParentId, novaAgentId, `Nova-child parent_id mismatch (chain: ${novaChildParentId}, expected: ${novaAgentId})`);
  logKv('parent_id matches Nova:', '✓');
}

// Phase 5: Optional cleanup (declare_death)
if (DECLARE_DEAD) {
  logHeader('Phase 5 — Declaring test agents dead (--declare-dead-when-done)');
  const toKill = [
    { id: parentAgentId, signer: parentKp, label: PARENT_NAME },
    { id: childAgentId, signer: parentKp, label: CHILD_NAME },
  ];
  if (novaChildAgentId) {
    // Nova owns the Nova-child object (it was created by Nova's signer); only Nova can declare it dead.
    const novaSecret = readFileSync(resolve(ROOT, 'agents/nova.key'), 'utf8').trim();
    toKill.push({
      id: novaChildAgentId,
      signer: Ed25519Keypair.fromSecretKey(fromBase64(novaSecret)),
      label: NOVA_CHILD_NAME,
    });
  }
  for (const { id, signer, label } of toKill) {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::agent_registry::declare_death`,
      arguments: [
        tx.object(id),
        tx.pure.string('test cleanup — scripts/test-lineage-scenario.mjs --declare-dead-when-done'),
        tx.object(CLOCK),
      ],
    });
    try {
      const r = await client.signAndExecuteTransaction({
        signer, transaction: tx, options: { showEffects: true },
      });
      if (r.effects?.status?.status !== 'success') {
        logKv(`✗ ${label}:`, `declare_death failed — ${JSON.stringify(r.effects?.status)}`);
      } else {
        logKv(`✓ ${label}:`, `dead (digest ${r.digest})`);
      }
    } catch (err) {
      logKv(`✗ ${label}:`, `declare_death threw — ${err.message}`);
    }
  }
}

// ── Summary ──────────────────────────────────────────────────────────────
logHeader('Summary');
logKv(`${PARENT_NAME} (parent):`, parentAgentId);
logKv(`${CHILD_NAME} (child):`, `${childAgentId}  (parent=${PARENT_NAME})`);
if (novaChildAgentId) logKv(`${NOVA_CHILD_NAME} (Nova child):`, `${novaChildAgentId}  (parent=Nova)`);
console.log(`
All assertions passed. The test agents are now permanent on Sui ${NETWORK}.
${DECLARE_DEAD ? 'They have been declared dead — the registry counts them but their status is dead.' : 'Pass --declare-dead-when-done on a future run to mark them dead.'}
`);
