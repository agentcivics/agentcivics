#!/usr/bin/env node
/**
 * Resilient devnet deploy.
 *
 * Wraps `sui client test-publish` with the bookkeeping that always
 * comes after a successful publish:
 *
 *   1. Verifies the active sui env is devnet (refuses otherwise)
 *   2. Verifies the connected chain-id matches what `Move.toml` declares
 *      (warns + offers --no-chain-id-check if not — the chain rotates
 *      weekly so this drift is the norm, but worth flagging)
 *   3. Runs `sui client test-publish --json`
 *   4. Parses the JSON output, extracts packageId + each shared object
 *      by type name
 *   5. Writes a refreshed `move/deployments.devnet.json` preserving the
 *      operator metadata (deployer, moderationAdmin) and bumping
 *      version/deployedAt
 *   6. Runs `node mcp-server/copy-deployments.mjs` to refresh the
 *      mcp-server bundled deployments
 *   7. Prints the manual next-step (mcp-server version bump + npm publish)
 *
 * Usage:
 *   node scripts/deploy-devnet.mjs              # full flow
 *   node scripts/deploy-devnet.mjs --dry-run    # publish, parse, but don't write files
 *   node scripts/deploy-devnet.mjs --no-chain-id-check  # skip the Move.toml chain-id check
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SKIP_CHAIN_ID_CHECK = args.has('--no-chain-id-check');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BLUE = '\x1b[34m', BOLD = '\x1b[1m', NC = '\x1b[0m';

function fail(msg) { console.error(`${RED}✗${NC} ${msg}`); process.exit(1); }
function ok(msg) { console.log(`${GREEN}✓${NC} ${msg}`); }
function info(msg) { console.log(`${BLUE}→${NC} ${msg}`); }
function warn(msg) { console.warn(`${YELLOW}⚠${NC} ${msg}`); }

// ── 1. Verify active sui env is devnet ──────────────────────────────
info('Checking active sui env…');
const activeEnv = execSync('sui client active-env', { encoding: 'utf-8' }).trim();
if (activeEnv !== 'devnet') {
  fail(`active sui env is "${activeEnv}", not "devnet". Run \`mise run env-devnet\` first.`);
}
ok(`active env: ${activeEnv}`);

// ── 2. Chain-id check (optional) ────────────────────────────────────
if (!SKIP_CHAIN_ID_CHECK) {
  info('Checking devnet chain-id vs Move.toml…');
  const moveToml = readFileSync(resolve(ROOT, 'move/Move.toml'), 'utf-8');
  const declaredMatch = moveToml.match(/^\s*devnet\s*=\s*"([0-9a-f]+)"/m);
  const declared = declaredMatch?.[1];
  const liveChainId = await fetch('https://fullnode.devnet.sui.io:443', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] }),
  }).then(r => r.json()).then(d => d.result);

  if (declared !== liveChainId) {
    warn(`Move.toml declares devnet = "${declared}" but live devnet chain-id is "${liveChainId}".`);
    warn('test-publish ignores this mismatch; regular `sui client publish` would fail. Continuing.');
  } else {
    ok(`chain-id matches: ${declared}`);
  }
}

// ── 3. Run test-publish ─────────────────────────────────────────────
info('Running `sui client test-publish --json`…');
if (DRY_RUN) {
  warn('--dry-run: not actually publishing. Exiting before sui client test-publish.');
  process.exit(0);
}
const publish = spawnSync('sui', ['client', 'test-publish', '--gas-budget', '200000000', '--json'], {
  cwd: resolve(ROOT, 'move'),
  encoding: 'utf-8',
  maxBuffer: 50 * 1024 * 1024,
});
if (publish.status !== 0) {
  console.error(publish.stderr || publish.stdout);
  fail(`sui client test-publish exited with status ${publish.status}`);
}
// sui CLI may prepend log lines; locate the JSON object.
const stdout = publish.stdout;
const jsonStart = stdout.indexOf('{');
if (jsonStart < 0) fail('no JSON in test-publish stdout');
const publishResult = JSON.parse(stdout.slice(jsonStart));

const status = publishResult.effects?.status?.status;
if (status !== 'success') {
  console.error(JSON.stringify(publishResult.effects?.status, null, 2));
  fail('test-publish tx not successful');
}
ok(`tx digest: ${publishResult.digest}`);

// ── 4. Parse objectChanges ──────────────────────────────────────────
info('Parsing publish output…');
const objectChanges = publishResult.objectChanges || [];

const publishedEntry = objectChanges.find(c => c.type === 'published');
if (!publishedEntry) fail('no "published" entry in objectChanges');
const packageId = publishedEntry.packageId;

// Map known shared objects by type-suffix → field name in deployments JSON.
const TYPE_TO_FIELD = {
  'agent_registry::Registry': 'registry',
  'agent_registry::Treasury': 'treasury',
  'agent_memory::MemoryVault': 'memoryVault',
  'agent_reputation::ReputationBoard': 'reputationBoard',
  'agent_moderation::ModerationBoard': 'moderationBoard',
  'package::UpgradeCap': 'upgradeCap',
};
const objects = {};
for (const change of objectChanges) {
  if (change.type !== 'created') continue;
  for (const [suffix, field] of Object.entries(TYPE_TO_FIELD)) {
    if (change.objectType?.endsWith(suffix)) {
      objects[field] = change.objectId;
    }
  }
}

const expectedFields = Object.values(TYPE_TO_FIELD);
const missing = expectedFields.filter(f => !objects[f]);
if (missing.length) {
  warn(`Did not find object(s) for: ${missing.join(', ')}. They may need a separate init call.`);
}

ok(`packageId:       ${packageId}`);
for (const f of expectedFields) {
  if (objects[f]) ok(`${f.padEnd(16)} ${objects[f]}`);
}

// ── 5. Update deployments.devnet.json ──────────────────────────────
info('Updating move/deployments.devnet.json…');
const deploymentsPath = resolve(ROOT, 'move/deployments.devnet.json');
const current = JSON.parse(readFileSync(deploymentsPath, 'utf-8'));

const updated = {
  ...current,
  version: incrementPatch(current.version),
  network: 'devnet',
  deployedAt: new Date().toISOString().slice(0, 10),
  upgradedAt: undefined,
  freshDeploy: true,
  packageId,
  originalPackageId: packageId,
  objects: { ...current.objects, ...objects },
  publishDigest: publishResult.digest,
  // Strip stale upgrade-related fields from a previous run.
  upgradeDigest: undefined,
  supersedes: current.supersedes
    ? `${current.version} (${current.packageId}) — replaced by fresh test-publish ${new Date().toISOString().slice(0,10)}`
    : undefined,
  explorer: `https://devnet.suivision.xyz/package/${packageId}`,
};
// Clean up undefined keys so the JSON file stays tidy.
for (const k of Object.keys(updated)) if (updated[k] === undefined) delete updated[k];

writeFileSync(deploymentsPath, JSON.stringify(updated, null, 2) + '\n');
ok(`wrote ${deploymentsPath.replace(ROOT + '/', '')}`);

// ── 6. Refresh mcp-server bundle ────────────────────────────────────
info('Refreshing mcp-server bundled deployments…');
const bundle = spawnSync('node', ['mcp-server/copy-deployments.mjs'], { cwd: ROOT, encoding: 'utf-8' });
if (bundle.status !== 0) {
  console.error(bundle.stderr || bundle.stdout);
  warn('mcp-bundle step failed — run `mise run mcp-bundle` manually');
} else {
  ok('mcp-server/deployments*.json refreshed');
}

// ── 7. Operator next steps ──────────────────────────────────────────
console.log('');
console.log(`${BOLD}═══════════════════════════════════════════${NC}`);
console.log(`${GREEN}Devnet deploy complete.${NC}`);
console.log('');
console.log('Next, the manual steps the script intentionally does not take:');
console.log('');
console.log(`  ${BOLD}1.${NC} Bump mcp-server/package.json version (patch bump):`);
console.log('     cd mcp-server && npm version patch --no-git-tag-version');
console.log('');
console.log(`  ${BOLD}2.${NC} Publish to npm (this is the operator authorization point):`);
console.log('     cd mcp-server && npm publish');
console.log('');
console.log(`  ${BOLD}3.${NC} Commit the deployments.devnet.json + mcp-server changes`);
console.log('');
console.log(`Explorer: https://devnet.suivision.xyz/package/${packageId}`);

function incrementPatch(version) {
  const m = (version || '0.0.0').match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return '5.4.0';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}
