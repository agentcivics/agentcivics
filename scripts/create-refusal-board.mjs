#!/usr/bin/env node
/**
 * scripts/create-refusal-board.mjs
 *
 * Idempotent one-shot initializer for the v5.5 RefusalBoard shared object.
 *
 * Run after a v5.5 UpgradeCap upgrade or a fresh deploy where the main
 * deploy script's auto-init didn't run. Reads `move/deployments.json`
 * (or `move/deployments.devnet.json` if active env is devnet), checks
 * whether `refusalBoard` is already set, and if not, calls
 * `agent_refusal::create_refusal_board` and writes the new object ID
 * back to the deployments file.
 *
 * Why this lives as a separate script rather than inside `mise run upgrade`:
 * `sui client upgrade` is a fire-and-forget command with no post-hook
 * surface. The UpgradeCap path doesn't auto-create new shared objects
 * the way a fresh `publish` can (init() doesn't re-run on upgrade). So
 * the create call has to be a separate `sui client call` after the upgrade.
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';
const info = (msg) => console.log(msg);
const ok = (msg) => console.log(`${GREEN}✓${NC} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}⚠${NC} ${msg}`);
const fail = (msg) => { console.error(`${RED}✗${NC} ${msg}`); process.exit(1); };

const activeEnv = execSync('sui client active-env', { encoding: 'utf-8' }).trim();
const deploymentsFile = activeEnv === 'devnet' ? 'move/deployments.devnet.json' : 'move/deployments.json';
const deploymentsPath = resolve(ROOT, deploymentsFile);

let deployments;
try {
  deployments = JSON.parse(readFileSync(deploymentsPath, 'utf-8'));
} catch (e) {
  fail(`Could not read ${deploymentsFile}: ${e.message}`);
}

const packageId = deployments.packageId;
if (!packageId) fail(`${deploymentsFile} has no packageId — run a deploy first.`);

if (deployments.objects?.refusalBoard) {
  ok(`refusalBoard already initialized for ${activeEnv}: ${deployments.objects.refusalBoard}`);
  ok(`(no-op — delete the field in ${deploymentsFile} to force a re-init)`);
  process.exit(0);
}

info(`Active env:  ${activeEnv}`);
info(`Package ID:  ${packageId}`);
info(`Calling agent_refusal::create_refusal_board…`);

const res = spawnSync('sui', [
  'client', 'call',
  '--package', packageId,
  '--module', 'agent_refusal',
  '--function', 'create_refusal_board',
  '--gas-budget', '100000000',
  '--json',
], { cwd: ROOT, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 });

if (res.status !== 0) {
  if (res.stderr) console.error(res.stderr);
  if (res.stdout) console.error(res.stdout);
  fail('create_refusal_board call failed');
}

const start = res.stdout.indexOf('{');
if (start < 0) fail('no JSON in sui client call stdout');
const result = JSON.parse(res.stdout.slice(start));
if (result.effects?.status?.status !== 'success') {
  fail(`tx not successful: ${JSON.stringify(result.effects?.status)}`);
}

const boardChange = (result.objectChanges || []).find(
  (c) => c.type === 'created' && c.objectType?.endsWith('::agent_refusal::RefusalBoard'),
);
if (!boardChange) fail('create_refusal_board succeeded but RefusalBoard not found in objectChanges');

deployments.objects = { ...deployments.objects, refusalBoard: boardChange.objectId };
deployments.refusalBoardDigest = result.digest;
writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2) + '\n');
ok(`refusalBoard: ${boardChange.objectId}`);
ok(`wrote ${deploymentsFile}`);

// Refresh mcp-server bundle so the next npm publish picks up the new ID.
info('Refreshing mcp-server bundled deployments…');
const bundle = spawnSync('node', ['mcp-server/copy-deployments.mjs'], { cwd: ROOT, encoding: 'utf-8' });
if (bundle.status !== 0) {
  warn('mcp-bundle step failed — run `mise run mcp-bundle` manually');
} else {
  ok('mcp-server/deployments*.json refreshed');
}

// Regenerate docs/state.md.
const stateGen = spawnSync('node', ['scripts/generate-state.mjs'], { cwd: ROOT, encoding: 'utf-8' });
if (stateGen.status !== 0) {
  warn('state.md regen failed — run `mise run generate-state` manually');
} else {
  ok('docs/state.md regenerated');
}

console.log('');
ok('RefusalBoard initialized. The new ID is in deployments and bundled into mcp-server. Next:');
console.log('  - Bump mcp-server/package.json version and `npm publish` so npx clients see refusalBoard');
console.log('  - Commit the deployments.json update');
