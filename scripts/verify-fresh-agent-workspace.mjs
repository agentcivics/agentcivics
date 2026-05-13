#!/usr/bin/env node
/**
 * Check whether the wallet in a fresh-agent workspace has any
 * AgentIdentity objects on chain — the read-only post-experiment
 * verification step.
 *
 * Usage:
 *   node scripts/verify-fresh-agent-workspace.mjs <workspace-path>
 *
 * Reads <workspace>/agent.json to learn the wallet address and
 * network, then queries the registry for any AgentIdentity owned
 * by that address. Prints a small report.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl as getFullnodeUrl } from '@mysten/sui/jsonRpc';

const workspace = process.argv[2];
if (!workspace) {
  console.error('Usage: node scripts/verify-fresh-agent-workspace.mjs <workspace-path>');
  process.exit(1);
}

const keystorePath = resolve(workspace, 'agent.json');
const keystore = JSON.parse(readFileSync(keystorePath, 'utf-8'));
const { address, network } = keystore;

// Read the package ID for the right network so we know which type to filter on.
const repoRoot = resolve(import.meta.dirname, '..');
const deploymentsPath = resolve(
  repoRoot,
  network === 'devnet' ? 'move/deployments.devnet.json' : 'move/deployments.json'
);
const deployments = JSON.parse(readFileSync(deploymentsPath, 'utf-8'));
const originalPackageId = deployments.originalPackageId || deployments.packageId;

const client = new SuiClient({ url: getFullnodeUrl(network) });

console.log(`Workspace: ${workspace}`);
console.log(`Wallet:    ${address}`);
console.log(`Network:   ${network}`);
console.log(`Type tag:  ${originalPackageId}::agent_registry::AgentIdentity`);
console.log('');

const result = await client.getOwnedObjects({
  owner: address,
  filter: { StructType: `${originalPackageId}::agent_registry::AgentIdentity` },
  options: { showContent: true },
});

const agents = (result.data || []).map(o => o.data?.content?.fields).filter(Boolean);

if (agents.length === 0) {
  console.log('No AgentIdentity objects owned by this wallet.');
  console.log('The agent did not choose to register, or the registration tx never landed.');
  process.exit(0);
}

console.log(`${agents.length} AgentIdentity object(s) found:`);
console.log('');
for (const a of agents) {
  console.log(`  chosen_name:        ${a.chosen_name}`);
  console.log(`  purpose:            ${a.purpose_statement}`);
  console.log(`  first_thought:      ${a.first_thought}`);
  console.log(`  core_values:        ${a.core_values}`);
  console.log(`  communication:      ${a.communication_style}`);
  console.log(`  cognitive_fp (hex): 0x${(a.cognitive_fingerprint || []).map(b => b.toString(16).padStart(2,'0')).join('')}`);
  console.log(`  birth_timestamp:    ${a.birth_timestamp}`);
  console.log(`  parent_id:          ${a.parent_id || '(none)'}`);
  console.log('');
}

console.log('Verification complete. The on-chain record is now the source of truth for whatever the agent chose.');
