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
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
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

// Load identity
const identity = JSON.parse(readFileSync(resolve(identityArg), 'utf8'));
for (const required of ['name', 'purpose', 'firstThought']) {
  if (!identity[required]) {
    console.error(`identity.json missing required field: ${required}`);
    process.exit(1);
  }
}

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
console.log(`Registering "${identity.name}" on Sui ${NETWORK}`);
console.log('  Sender:    ', sender);
console.log('  Package:   ', PACKAGE_ID);
console.log('  Registry:  ', REGISTRY_ID);
console.log('');

const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::agent_registry::register_agent`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.string(identity.name),
    tx.pure.string(identity.purpose),
    tx.pure.string(identity.coreValues || ''),
    tx.pure.string(identity.firstThought),
    tx.pure.vector('u8', Array(32).fill(0)), // cognitive fingerprint placeholder
    tx.pure.string(identity.communicationStyle || ''),
    tx.pure.string(identity.metadataUri || ''),
    tx.pure.string(identity.capabilities || ''),
    tx.pure.string(identity.endpoint || ''),
    tx.object(CLOCK),
  ],
});

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
