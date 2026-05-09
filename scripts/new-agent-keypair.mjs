#!/usr/bin/env node
/**
 * Generate a fresh Ed25519 Sui keypair for a new agent.
 *
 * Usage:
 *   node scripts/new-agent-keypair.mjs <name>
 *
 * Writes:
 *   agents/<name>.key   — base64-encoded raw 32-byte secret (chmod 600)
 *   agents/<name>.json  — metadata (name, address, createdAt)
 *
 * The .key file's format matches what the MCP server reads via
 * AGENTCIVICS_PRIVATE_KEY_FILE: a single line of base64 with no newlines
 * or surrounding JSON.
 *
 * After running, fund the printed address from the Sui faucet, e.g.:
 *   sui client faucet --address <printed-address>
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { toBase64 } from '@mysten/sui/utils';
import { writeFileSync, chmodSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/new-agent-keypair.mjs <name>');
  console.error('Example: node scripts/new-agent-keypair.mjs cipher');
  process.exit(1);
}

const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
const agentsDir = resolve(ROOT, 'agents');
const keyPath = resolve(agentsDir, `${safeName}.key`);
const metaPath = resolve(agentsDir, `${safeName}.json`);

if (existsSync(keyPath) || existsSync(metaPath)) {
  console.error(`Refusing to overwrite existing keystore at agents/${safeName}.{key,json}`);
  console.error('Move or delete the existing files first if you really want a new keypair.');
  process.exit(1);
}

mkdirSync(agentsDir, { recursive: true });

const keypair = Ed25519Keypair.generate();
const address = keypair.toSuiAddress();

// Extract the raw 32-byte secret from the bech32 representation that the
// SDK exposes, so the .key file can be consumed by AGENTCIVICS_PRIVATE_KEY_FILE.
const { secretKey } = decodeSuiPrivateKey(keypair.getSecretKey());
const base64Secret = toBase64(secretKey);

writeFileSync(keyPath, base64Secret + '\n', { mode: 0o600 });
chmodSync(keyPath, 0o600);

const metadata = {
  schema: 'agent-keystore/sui-v1',
  name,
  address,
  network: 'sui',
  createdAt: new Date().toISOString(),
  agentObjectId: null, // populated by scripts/agent-register.mjs after on-chain registration
};
writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n');

console.log('');
console.log(`Generated keypair for "${name}"`);
console.log('  Address:', address);
console.log('  Key file:', `agents/${safeName}.key`, '(chmod 600)');
console.log('  Metadata:', `agents/${safeName}.json`);
console.log('');
console.log('Next:');
console.log(`  1. Fund the address with the Sui faucet:`);
console.log(`     sui client faucet --address ${address}`);
console.log(`  2. Register the agent on-chain:`);
console.log(`     node scripts/agent-register.mjs agents/${safeName}.key <identity.json>`);
console.log('');
