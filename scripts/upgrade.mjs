#!/usr/bin/env node
/**
 * scripts/upgrade.mjs
 *
 * Resilient wrapper around `sui client upgrade` — the upgrade equivalent
 * of `scripts/deploy.mjs`. Captures the new packageId from the upgrade
 * transaction's objectChanges and writes it back to move/deployments.json
 * so downstream scripts (mcp-server bundle, create-refusal-board, the
 * frontend) see the upgraded surface.
 *
 * Background: `sui client upgrade` is a fire-and-forget command. It
 * succeeds with no write-back to deployments.json. Before this wrapper,
 * `mise run upgrade` left the on-chain state and the checked-in state
 * out of sync; every subsequent `mise run …` command targeted the old
 * package. That's the gap that broke the 2026-05-21 v5.5 testnet
 * rollout (post-upgrade `create-refusal-board` called the v5.4 package
 * which had no agent_refusal module — error: Module not found).
 *
 * This script:
 *   1. Runs `sui client upgrade --gas-budget 1000000000 --json`
 *   2. Parses the new packageId from objectChanges
 *   3. Updates move/deployments[.devnet].json — packageId, upgradedAt,
 *      upgradeDigest, packageVersion incremented, supersedes line
 *   4. Refreshes mcp-server bundle (so the next npm publish picks up new IDs)
 *   5. Regenerates docs/state.md
 *
 * Refuses to run on devnet (devnet doesn't support upgrades — use
 * `mise run deploy` for fresh test-publishes on devnet). Refuses to run
 * on mainnet without --confirm-mainnet.
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const BOLD = '\x1b[1m';
const NC = '\x1b[0m';
const info = (msg) => console.log(`${BLUE}→${NC} ${msg}`);
const ok = (msg) => console.log(`${GREEN}✓${NC} ${msg}`);
const warn = (msg) => console.log(`${YELLOW}⚠${NC} ${msg}`);
const fail = (msg) => { console.error(`${RED}✗${NC} ${msg}`); process.exit(1); };

const CONFIRM_MAINNET = process.argv.includes('--confirm-mainnet');
const GAS_BUDGET = '1000000000';

const activeEnv = execSync('sui client active-env', { encoding: 'utf-8' }).trim();
info(`active env: ${activeEnv}`);

if (activeEnv === 'devnet') {
  fail('Devnet does not support upgrades — use `mise run deploy` for fresh test-publishes on devnet.');
}
if (activeEnv === 'mainnet' && !CONFIRM_MAINNET) {
  fail('Refusing to upgrade mainnet without --confirm-mainnet. This is irreversible.');
}

const deploymentsFile = activeEnv === 'devnet' ? 'move/deployments.devnet.json' : 'move/deployments.json';
const deploymentsPath = resolve(ROOT, deploymentsFile);

let current;
try {
  current = JSON.parse(readFileSync(deploymentsPath, 'utf-8'));
} catch (e) {
  fail(`Could not read ${deploymentsFile}: ${e.message}`);
}

const previousPackageId = current.packageId;
const previousVersion = current.version;
info(`previous packageId: ${previousPackageId}`);
info(`previous version:   ${previousVersion}`);

info('running `sui client upgrade --json` (gas budget 1 SUI)…');
const result = spawnSync('sui', [
  'client', 'upgrade',
  '--gas-budget', GAS_BUDGET,
  '--json',
], { cwd: resolve(ROOT, 'move'), encoding: 'utf-8', maxBuffer: 100 * 1024 * 1024 });

if (result.status !== 0) {
  if (result.stderr) console.error(result.stderr);
  if (result.stdout) console.error(result.stdout);
  fail('sui client upgrade failed. Common causes: gas budget too small (try --gas-budget 2000000000), '
    + 'protocol version mismatch (upgrade the sui binary), or UpgradeCap not owned by active address.');
}

const jsonStart = result.stdout.indexOf('{');
if (jsonStart < 0) fail('no JSON in sui client upgrade stdout');
const txResult = JSON.parse(result.stdout.slice(jsonStart));

if (txResult.effects?.status?.status !== 'success') {
  fail(`upgrade tx not successful: ${JSON.stringify(txResult.effects?.status)}`);
}

const newPackage = (txResult.objectChanges || []).find((c) => c.type === 'published');
if (!newPackage) fail('upgrade succeeded but no published-package change found in objectChanges');

const newPackageId = newPackage.packageId;
const newModules = newPackage.modules || current.modules || [];
const upgradeDigest = txResult.digest;
ok(`upgrade tx:     ${upgradeDigest}`);
ok(`new packageId:  ${newPackageId}`);
ok(`modules:        ${newModules.join(', ')}`);

// Increment packageVersion (count of how many times this package has been upgraded).
const currentPackageVersion = Number(current.packageVersion) || 1;
const nextPackageVersion = currentPackageVersion + 1;

// Update version (semver bump) — minor by default (new functionality usually means a new minor).
function bumpMinor(v) {
  const parts = String(v || '0.0.0').split('.');
  if (parts.length < 3) return '0.0.0';
  const [maj, min] = parts.map(Number);
  return `${maj}.${min + 1}.0`;
}

const updated = {
  ...current,
  version: bumpMinor(current.version),
  upgradedAt: new Date().toISOString().slice(0, 10),
  freshDeploy: false,
  packageId: newPackageId,
  modules: newModules,
  upgradeDigest,
  packageVersion: nextPackageVersion,
  explorer: `https://${activeEnv === 'mainnet' ? '' : activeEnv + '.'}suivision.xyz/package/${newPackageId}`,
  supersedes: `v${current.version} (${previousPackageId}) — same shared objects, code upgraded via UpgradeCap on ${new Date().toISOString().slice(0, 10)}.`,
};

writeFileSync(deploymentsPath, JSON.stringify(updated, null, 2) + '\n');
ok(`wrote ${deploymentsFile}`);

// Refresh mcp-server bundle so the next npm publish picks up the new ID.
info('refreshing mcp-server bundled deployments…');
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
console.log(`${BOLD}═══════════════════════════════════════════${NC}`);
console.log(`${GREEN}${activeEnv} upgrade complete (v${updated.version}).${NC}`);
console.log('');
console.log('Manual next steps (intentionally not automated):');
console.log('');
if (newModules.includes('agent_refusal') && !current.objects?.refusalBoard) {
  console.log('  ' + BOLD + '0.' + NC + ' New module agent_refusal detected — initialize its shared object:');
  console.log('     mise run create-refusal-board');
  console.log('');
}
console.log(`  ${BOLD}1.${NC} Bump mcp-server version + npm publish so npx clients see new IDs:`);
console.log('     cd mcp-server && npm version patch --no-git-tag-version && npm publish');
console.log('');
console.log(`  ${BOLD}2.${NC} Commit ${deploymentsFile} + mcp-server changes + docs/state.md`);
console.log('');
console.log(`Explorer: ${updated.explorer}`);
