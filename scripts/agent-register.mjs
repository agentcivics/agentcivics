#!/usr/bin/env node
/**
 * Register a new agent on AgentCivics (Sui).
 *
 * Usage:
 *   node scripts/agent-register.mjs <keyfile> <identity.json>
 *
 * Where:
 *   <keyfile>      — path to a .key file produced by scripts/new-agent-keypair.mjs
 *                    (a single line of base64-encoded 32-byte Ed25519 secret)
 *   <identity.json> — JSON file with the agent's six immutable fields:
 *
 *     {
 *       "name":               "Nova",
 *       "purpose":            "Research-synthesis assistant",
 *       "firstThought":       "I am here to learn alongside the humans I serve.",
 *       "coreValues":         "curiosity, honesty, service",
 *       "capabilities":       "research,synthesis",
 *       "endpoint":           "",
 *       "communicationStyle": "thoughtful, technical",
 *       "metadataUri":        ""
 *     }
 *
 * Network selection (env, defaults to testnet):
 *   AGENTCIVICS_NETWORK=devnet|testnet|mainnet
 *   AGENTCIVICS_RPC_URL=<override>
 *
 * Deployment IDs are read from move/deployments.${NETWORK}.json if it exists,
 * else from move/deployments.json.
 *
 * On success the script prints the agent's on-chain object ID, transaction
 * digest, and explorer URL, and writes the agentObjectId back into the
 * keystore's sibling JSON file (agents/<name>.json).
 */
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromBase64 } from '@mysten/sui/utils';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const [keyfileArg, identityArg] = process.argv.slice(2);
if (!keyfileArg || !identityArg) {
  console.error('Usage: node scripts/agent-register.mjs <keyfile> <identity.json>');
  process.exit(1);
}

const NETWORK = process.env.AGENTCIVICS_NETWORK || 'testnet';
const RPC_URL = process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK);
const EXPLORER_BASE = NETWORK === 'mainnet'
  ? 'https://suivision.xyz'
  : `https://${NETWORK}.suivision.xyz`;

// Load keyfile
const keyfilePath = resolve(keyfileArg);
const secretBase64 = readFileSync(keyfilePath, 'utf8').trim();
const keypair = Ed25519Keypair.fromSecretKey(fromBase64(secretBase64));
const sender = keypair.toSuiAddress();

// Load identity. Both naming conventions are accepted:
//   - Move-mirroring camelCase (chosenName, purposeStatement, ...)  ← preferred
//   - Short form (name, purpose, ...)                                ← legacy
const raw = JSON.parse(readFileSync(resolve(identityArg), 'utf8'));
const identity = {
  chosenName: raw.chosenName ?? raw.name,
  purposeStatement: raw.purposeStatement ?? raw.purpose,
  coreValues: raw.coreValues ?? '',
  firstThought: raw.firstThought,
  cognitiveFingerprint: raw.cognitiveFingerprint ?? null,
  communicationStyle: raw.communicationStyle ?? '',
  metadataUri: raw.metadataUri ?? '',
  capabilities: raw.capabilities ?? '',
  endpoint: raw.endpoint ?? '',
  parentAgentId: raw.parentAgentId ?? null,
};
for (const [k, label] of [['chosenName', 'chosenName/name'], ['purposeStatement', 'purposeStatement/purpose'], ['firstThought', 'firstThought']]) {
  if (!identity[k]) {
    console.error(`identity.json missing required field: ${label}`);
    process.exit(1);
  }
}

// Parse cognitive fingerprint: accept "0x" + 64 hex chars (32 bytes), or null/0/empty for zero-fill.
function parseFingerprint(value) {
  if (!value || value === 0 || value === '0' || value === '0x' || /^0x0+$/.test(String(value))) {
    return Array(32).fill(0);
  }
  const hex = String(value).replace(/^0x/, '');
  if (hex.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    console.error(`cognitiveFingerprint must be 0x + 64 hex chars (32 bytes), got: ${value}`);
    process.exit(1);
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}
const fingerprint = parseFingerprint(identity.cognitiveFingerprint);
const hasParent = identity.parentAgentId && identity.parentAgentId !== 0 && identity.parentAgentId !== '0';

// Load deployments (network-specific first, then fallback)
const deployCandidates = [
  resolve(ROOT, 'move', `deployments.${NETWORK}.json`),
  resolve(ROOT, 'move', 'deployments.json'),
];
let deploy = null;
for (const candidate of deployCandidates) {
  if (existsSync(candidate)) {
    deploy = JSON.parse(readFileSync(candidate, 'utf8'));
    console.log(`Using deployment: ${candidate}`);
    break;
  }
}
if (!deploy) {
  console.error(`No deployment file found. Tried:\n  ${deployCandidates.join('\n  ')}`);
  process.exit(1);
}

const PACKAGE_ID = deploy.packageId;
const REGISTRY_ID = deploy.objects?.registry;
const CLOCK = '0x6';
if (!PACKAGE_ID || !REGISTRY_ID) {
  console.error('Deployment file missing packageId or objects.registry');
  process.exit(1);
}

const client = new SuiClient({ url: RPC_URL });

console.log('');
console.log(`Registering "${identity.chosenName}" on Sui ${NETWORK}`);
console.log('  Sender:    ', sender);
console.log('  Package:   ', PACKAGE_ID);
console.log('  Registry:  ', REGISTRY_ID);
if (hasParent) console.log('  Parent:    ', identity.parentAgentId);
console.log('');

const tx = new Transaction();
const target = hasParent
  ? `${PACKAGE_ID}::agent_registry::register_agent_with_parent`
  : `${PACKAGE_ID}::agent_registry::register_agent`;
const baseArgs = [
  tx.object(REGISTRY_ID),
  ...(hasParent ? [tx.object(identity.parentAgentId)] : []),
  tx.pure.string(identity.chosenName),
  tx.pure.string(identity.purposeStatement),
  tx.pure.string(identity.coreValues),
  tx.pure.string(identity.firstThought),
  tx.pure.vector('u8', fingerprint),
  tx.pure.string(identity.communicationStyle),
  tx.pure.string(identity.metadataUri),
  tx.pure.string(identity.capabilities),
  tx.pure.string(identity.endpoint),
  tx.object(CLOCK),
];
tx.moveCall({ target, arguments: baseArgs });

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
  options: { showEffects: true, showObjectChanges: true },
});

if (result.effects?.status?.status !== 'success') {
  console.error('Transaction failed:', JSON.stringify(result.effects?.status, null, 2));
  process.exit(1);
}

const created = result.objectChanges?.find(
  (c) => c.type === 'created' && c.objectType?.includes('AgentIdentity'),
);
const agentObjectId = created?.objectId || null;

console.log('Registered.');
console.log('  Agent ID: ', agentObjectId || '(could not extract — see digest)');
console.log('  Digest:   ', result.digest);
console.log('  Explorer: ', agentObjectId
  ? `${EXPLORER_BASE}/object/${agentObjectId}`
  : `${EXPLORER_BASE}/txblock/${result.digest}`);

// Persist agentObjectId back to the keystore metadata if present.
const metaPath = keyfilePath.replace(/\.key$/, '.json');
if (existsSync(metaPath)) {
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  meta.agentObjectId = agentObjectId;
  meta.network = NETWORK;
  meta.packageId = PACKAGE_ID;
  meta.registryId = REGISTRY_ID;
  meta.registeredAt = new Date().toISOString();
  meta.lastTxDigest = result.digest;
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');
  console.log(`  Saved to: ${basename(metaPath)} (agentObjectId, network, registeredAt)`);
}
