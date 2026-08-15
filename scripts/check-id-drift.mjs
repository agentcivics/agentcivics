#!/usr/bin/env node
/**
 * check-id-drift.mjs — fail CI when a deployed surface names a superseded ID.
 *
 * `docs/state.md is in sync` only compares docs/state.md against
 * move/deployments.json. That check passed for months while the root
 * deployments.json sat on v5.4, the dapp hardcoded a v5.4 PACKAGE_ID, and both
 * frontend and monitoring pointed MODERATION_BOARD_ID at a board belonging to
 * the abandoned v4 package — which made every moderation call fail with a type
 * mismatch. Nothing compared the *published* surfaces to the source of truth.
 *
 * This does. move/deployments.json is authoritative; every file below must
 * agree with it, and none may mention a known-superseded ID.
 *
 * Deliberately NOT checked: CHANGELOG, docs/audits/**, docs/articles/**,
 * test/E2E-v4.mjs and `supersedes` provenance strings. Those describe history
 * and are correct precisely because they name old IDs.
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(repoRoot, p), 'utf8');

const truth = JSON.parse(read('move/deployments.json'));
const CURRENT_PKG = truth.packageId;
const ORIGINAL_PKG = truth.originalPackageId;
const CURRENT_BOARD = truth.objects.moderationBoard;

// Superseded IDs that must never appear as current state.
const RETIRED = {
  '0x9cf043da256a714af43fbe27ba46b8df52574781838568b8e8872f9efdff0310': 'v5.4 package (superseded by v5.5)',
  '0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448': 'v4 ModerationBoard (wrong package — Move calls type-mismatch)',
  '0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff': 'v5.0 package (retired by the v5.3 redeploy)',
};

// Files that state CURRENT deployment and are published to users or agents.
const SURFACES = [
  'deployments.json',
  'frontend/index.html', 'demo/index.html', 'monitoring/index.html', 'landing/index.html',
  'README.md', 'mcp-server/README.md', 'CLAUDE.md',
  'docs/index.md',
  'docs/guides/deploy.md', 'docs/guides/verify-contracts.md', 'docs/guides/getting-started-for-dummies.md',
  'docs/reference/agent-registry.md', 'docs/reference/agent-memory.md',
  'docs/reference/agent-reputation.md', 'docs/reference/agent-moderation.md',
  'skills/README.md', 'skills/register/SKILL.md', 'skills/authority/SKILL.md',
  'skills/moderation/SKILL.md', 'skills/verify-identity/SKILL.md',
  'skills/remember-who-you-are/SKILL.md', 'skills/agent-civil-registry/SKILL.md',
];

const failures = [];

for (const file of SURFACES) {
  let text;
  try { text = read(file); } catch { continue; }   // optional files
  for (const [id, why] of Object.entries(RETIRED)) {
    if (!text.includes(id)) continue;
    // A retired ID is allowed only inside a supersedes/provenance line.
    const offending = text.split('\n').filter(
      (line) => line.includes(id) && !/supersedes|superseded|retired|previously|formerly/i.test(line),
    );
    if (offending.length) failures.push(`${file}: ${why} — ${offending.length} line(s), first: ${offending[0].trim().slice(0, 90)}`);
  }
}

// The root file is published at agentcivics.org/deployments.json; it must match.
const rootDeploy = JSON.parse(read('deployments.json'));
for (const [field, expected] of [['packageId', CURRENT_PKG], ['originalPackageId', ORIGINAL_PKG], ['version', truth.version]]) {
  if (rootDeploy[field] !== expected) failures.push(`deployments.json: ${field} is ${rootDeploy[field]}, expected ${expected}`);
}
for (const [key, expected] of Object.entries(truth.objects)) {
  if (rootDeploy.objects[key] !== expected) failures.push(`deployments.json: objects.${key} is ${rootDeploy.objects[key] ?? '(missing)'}, expected ${expected}`);
}

// The dapp's hardcoded constants must name the current package and board.
const constantChecks = [
  ['frontend/index.html', /const PACKAGE_ID\s*=\s*"(0x[a-f0-9]{64})"/, CURRENT_PKG, 'PACKAGE_ID'],
  ['frontend/index.html', /const ORIGINAL_PKG_ID\s*=\s*"(0x[a-f0-9]{64})"/, ORIGINAL_PKG, 'ORIGINAL_PKG_ID'],
  ['frontend/index.html', /MODERATION_BOARD_ID\s*=\s*"(0x[a-f0-9]{64})"/, CURRENT_BOARD, 'MODERATION_BOARD_ID'],
  ['monitoring/index.html', /const PACKAGE_ID\s*=\s*"(0x[a-f0-9]{64})"/, CURRENT_PKG, 'PACKAGE_ID'],
  ['monitoring/index.html', /const ORIGINAL_PKG_ID\s*=\s*"(0x[a-f0-9]{64})"/, ORIGINAL_PKG, 'ORIGINAL_PKG_ID'],
  ['monitoring/index.html', /MODERATION_BOARD_ID\s*=\s*"(0x[a-f0-9]{64})"/, CURRENT_BOARD, 'MODERATION_BOARD_ID'],
  ['demo/index.html', /const PACKAGE_ID\s*=\s*'(0x[a-f0-9]{64})'/, CURRENT_PKG, 'PACKAGE_ID'],
];
for (const [file, pattern, expected, label] of constantChecks) {
  const found = read(file).match(pattern)?.[1];
  if (!found) failures.push(`${file}: could not find ${label} — did the declaration change shape?`);
  else if (found !== expected) failures.push(`${file}: ${label} is ${found}, expected ${expected}`);
}

if (failures.length) {
  console.error('On-chain ID drift detected. move/deployments.json is the source of truth.\n');
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n${failures.length} problem(s).`);
  process.exit(1);
}

console.log(`No ID drift. ${SURFACES.length} surfaces agree with move/deployments.json (v${truth.version}).`);
