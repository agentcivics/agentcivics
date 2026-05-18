#!/usr/bin/env node
/**
 * Resilient deploy — env-aware.
 *
 * One task, behavior driven by `sui client active-env`. Switch env first
 * with `mise run env-testnet` or `mise run env-devnet`, then run this.
 *
 *   active env = devnet  → `sui client test-publish` (ephemeral; devnet
 *                          rotates chain-id weekly so the Move.toml entry
 *                          is stale within days; test-publish ignores it)
 *                       + writes move/deployments.devnet.json
 *   active env = testnet → `sui client publish` (requires Move.toml chain-id
 *                          to match; testnet is stable so it does)
 *                       + writes move/deployments.json
 *   active env = mainnet → refuses unless --confirm-mainnet is passed
 *   active env = other   → refuses
 *
 * Always does the post-publish bookkeeping (deployments JSON write,
 * mcp-server bundle refresh, manual next-step instructions). For
 * incremental changes to an already-published package on testnet, use
 * `mise run upgrade` instead — that path uses the UpgradeCap and
 * preserves shared objects.
 *
 * Flags:
 *   --dry-run              validate env/chain-id checks, don't publish
 *   --no-chain-id-check    skip the Move.toml chain-id sanity check
 *   --confirm-mainnet      required to deploy to mainnet
 */

import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const SKIP_CHAIN_ID_CHECK = args.has('--no-chain-id-check');
const CONFIRM_MAINNET = args.has('--confirm-mainnet');

const RED = '\x1b[31m', GREEN = '\x1b[32m', YELLOW = '\x1b[33m', BLUE = '\x1b[34m', BOLD = '\x1b[1m', NC = '\x1b[0m';

function fail(msg) { console.error(`${RED}✗${NC} ${msg}`); process.exit(1); }
function ok(msg) { console.log(`${GREEN}✓${NC} ${msg}`); }
function info(msg) { console.log(`${BLUE}→${NC} ${msg}`); }
function warn(msg) { console.warn(`${YELLOW}⚠${NC} ${msg}`); }

// ── env detection + per-env config ──────────────────────────────────
info('Checking active sui env…');
const activeEnv = execSync('sui client active-env', { encoding: 'utf-8' }).trim();
ok(`active env: ${activeEnv}`);

const ENV_CONFIG = {
  testnet: {
    suiCommand: 'publish',
    rpc: 'https://fullnode.testnet.sui.io:443',
    deploymentsFile: 'move/deployments.json',
    explorerBase: 'https://testnet.suivision.xyz/package/',
    // chain-id drift on testnet means something is wrong; refuse rather
    // than auto-rewrite Move.toml. The operator must investigate.
    onChainIdMismatch: 'fail',
  },
  devnet: {
    suiCommand: 'test-publish',
    rpc: 'https://fullnode.devnet.sui.io:443',
    deploymentsFile: 'move/deployments.devnet.json',
    explorerBase: 'https://devnet.suivision.xyz/package/',
    // chain-id drift on devnet is expected (weekly wipes rotate the
    // chain-id). Auto-update Move.toml and clear the stale Pub.<env>.toml
    // ephemeral file that newer sui CLI rejects without explanation.
    onChainIdMismatch: 'auto-fix',
  },
};

if (activeEnv === 'mainnet') {
  if (!CONFIRM_MAINNET) fail('refusing to deploy to mainnet without --confirm-mainnet flag.');
  fail('mainnet deploy path not yet implemented in this script. Use raw `sui client publish` with care.');
}

const cfg = ENV_CONFIG[activeEnv];
if (!cfg) fail(`unsupported active env "${activeEnv}". Run \`mise run env-testnet\` or \`mise run env-devnet\` first.`);

ok(`will use: sui client ${cfg.suiCommand}`);
ok(`will write: ${cfg.deploymentsFile}`);

// ── Move.toml chain-id check ────────────────────────────────────────
if (!SKIP_CHAIN_ID_CHECK) {
  info(`Checking ${activeEnv} chain-id vs Move.toml…`);
  const moveTomlPath = resolve(ROOT, 'move/Move.toml');
  const moveToml = readFileSync(moveTomlPath, 'utf-8');
  const declaredMatch = moveToml.match(new RegExp(`^(\\s*${activeEnv}\\s*=\\s*")([0-9a-f]+)(")`, 'm'));
  const declared = declaredMatch?.[2];
  const liveChainId = await fetch(cfg.rpc, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [] }),
  }).then(r => r.json()).then(d => d.result);

  const action = cfg.onChainIdMismatch;

  if (!declared) {
    warn(`Move.toml has no [environments] entry for ${activeEnv}.`);
    if (action === 'fail') {
      fail(`sui client ${cfg.suiCommand} requires Move.toml to declare the env. Add: ${activeEnv} = "${liveChainId}"`);
    }
    // 'auto-fix' branch can't write a new entry without knowing the table
    // structure; we punt to operator. (In practice the entry exists for
    // any env we deploy to.)
    fail(`Please add an [environments] entry for ${activeEnv} in move/Move.toml`);
  } else if (declared !== liveChainId) {
    if (action === 'fail') {
      fail(`Move.toml declares ${activeEnv} = "${declared}" but live chain-id is "${liveChainId}". Update Move.toml before deploying with sui client ${cfg.suiCommand}.`);
    }
    // 'auto-fix' — devnet path. Rewrite Move.toml and clear the stale
    // ephemeral publication file that newer sui CLI rejects.
    warn(`Move.toml declares ${activeEnv} = "${declared}" but live chain-id is "${liveChainId}".`);
    const replaced = moveToml.replace(declaredMatch[0], `${declaredMatch[1]}${liveChainId}${declaredMatch[3]}`);
    writeFileSync(moveTomlPath, replaced);
    ok(`auto-updated Move.toml: ${activeEnv} = "${liveChainId}"`);

    // Newer sui CLI bakes the chain-id into Pub.<env>.toml at first
    // test-publish and refuses to reuse it on a different chain. Clear it
    // so sui regenerates with the current chain-id.
    const pubFile = resolve(ROOT, `move/Pub.${activeEnv}.toml`);
    if (existsSync(pubFile)) {
      rmSync(pubFile);
      ok(`removed stale move/Pub.${activeEnv}.toml`);
    }
  } else {
    ok(`chain-id matches: ${declared}`);
  }
}

// ── Run the publish ─────────────────────────────────────────────────
info(`Running sui client ${cfg.suiCommand} --json…`);
if (DRY_RUN) {
  warn('--dry-run: not actually publishing. Exiting before sui client tx.');
  process.exit(0);
}
const publish = spawnSync('sui', ['client', cfg.suiCommand, '--gas-budget', '200000000', '--json'], {
  cwd: resolve(ROOT, 'move'),
  encoding: 'utf-8',
  maxBuffer: 50 * 1024 * 1024,
});
if (publish.status !== 0) {
  console.error(publish.stderr || publish.stdout);
  fail(`sui client ${cfg.suiCommand} exited with status ${publish.status}`);
}
const stdout = publish.stdout;
const jsonStart = stdout.indexOf('{');
if (jsonStart < 0) fail(`no JSON in ${cfg.suiCommand} stdout`);
const publishResult = JSON.parse(stdout.slice(jsonStart));

const status = publishResult.effects?.status?.status;
if (status !== 'success') {
  console.error(JSON.stringify(publishResult.effects?.status, null, 2));
  fail('publish tx not successful');
}
ok(`tx digest: ${publishResult.digest}`);

// ── Parse objectChanges ─────────────────────────────────────────────
info('Parsing publish output…');
const objectChanges = publishResult.objectChanges || [];

const publishedEntry = objectChanges.find(c => c.type === 'published');
if (!publishedEntry) fail('no "published" entry in objectChanges');
const packageId = publishedEntry.packageId;

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
    if (change.objectType?.endsWith(suffix)) objects[field] = change.objectId;
  }
}

const expectedFields = Object.values(TYPE_TO_FIELD);
const missing = expectedFields.filter(f => !objects[f]);
if (missing.length) warn(`Did not find object(s) for: ${missing.join(', ')}. They may need a separate init call.`);

ok(`packageId:       ${packageId}`);
for (const f of expectedFields) {
  if (objects[f]) ok(`${f.padEnd(16)} ${objects[f]}`);
}

// ── Update deployments file ─────────────────────────────────────────
info(`Updating ${cfg.deploymentsFile}…`);
const deploymentsPath = resolve(ROOT, cfg.deploymentsFile);
const current = JSON.parse(readFileSync(deploymentsPath, 'utf-8'));

const updated = {
  ...current,
  version: incrementPatch(current.version),
  network: activeEnv,
  deployedAt: new Date().toISOString().slice(0, 10),
  upgradedAt: undefined,
  freshDeploy: true,
  packageId,
  originalPackageId: packageId,
  objects: { ...current.objects, ...objects },
  publishDigest: publishResult.digest,
  upgradeDigest: undefined,
  supersedes: current.packageId
    ? `${current.version} (${current.packageId}) — replaced by fresh ${cfg.suiCommand} on ${new Date().toISOString().slice(0,10)}`
    : undefined,
  explorer: `${cfg.explorerBase}${packageId}`,
};
for (const k of Object.keys(updated)) if (updated[k] === undefined) delete updated[k];

writeFileSync(deploymentsPath, JSON.stringify(updated, null, 2) + '\n');
ok(`wrote ${deploymentsPath.replace(ROOT + '/', '')}`);

// ── Refresh mcp-server bundle ───────────────────────────────────────
info('Refreshing mcp-server bundled deployments…');
const bundle = spawnSync('node', ['mcp-server/copy-deployments.mjs'], { cwd: ROOT, encoding: 'utf-8' });
if (bundle.status !== 0) {
  console.error(bundle.stderr || bundle.stdout);
  warn('mcp-bundle step failed — run `mise run mcp-bundle` manually');
} else {
  ok('mcp-server/deployments*.json refreshed');
}

// ── Operator next steps ─────────────────────────────────────────────
console.log('');
console.log(`${BOLD}═══════════════════════════════════════════${NC}`);
console.log(`${GREEN}${activeEnv} deploy complete.${NC}`);
console.log('');
console.log('Manual next steps (intentionally not automated):');
console.log('');
console.log(`  ${BOLD}1.${NC} Bump mcp-server version (patch):`);
console.log('     cd mcp-server && npm version patch --no-git-tag-version');
console.log('');
console.log(`  ${BOLD}2.${NC} Publish to npm (operator authorization point):`);
console.log('     cd mcp-server && npm publish');
console.log('');
console.log(`  ${BOLD}3.${NC} Commit ${cfg.deploymentsFile} + mcp-server changes`);
console.log('');
console.log(`Explorer: ${cfg.explorerBase}${packageId}`);

function incrementPatch(version) {
  const m = (version || '0.0.0').match(/^(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return '5.4.0';
  return `${m[1]}.${m[2]}.${Number(m[3]) + 1}${m[4]}`;
}
