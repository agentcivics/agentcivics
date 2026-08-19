#!/usr/bin/env node
/**
 * prepublishOnly hook: copy ../move/deployments*.json into this dir so the
 * npm package ships with the on-chain object IDs and `npx @agentcivics/mcp-server`
 * works without requiring the user to set every AGENTCIVICS_*_ID env var.
 *
 * Network-specific files (deployments.testnet.json etc.) are copied if they
 * exist; the generic deployments.json is the fallback.
 */
import { copyFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const moveDir = resolve(__dirname, '..', 'move');

// Testnet only. devnet and localnet are local-development targets: their IDs
// are read from move/deployments.<network>.json in a repo checkout, never
// bundled. Devnet in particular wipes without warning — twice in three days in
// August 2026 — and shipping its IDs put npm releases on a sandbox's schedule
// while handing npx users a package that had already stopped existing.
const candidates = [
  'deployments.json',
  'deployments.testnet.json',
];

let copied = 0;
for (const f of candidates) {
  const src = resolve(moveDir, f);
  if (!existsSync(src)) continue;
  copyFileSync(src, resolve(__dirname, f));
  console.log(`copy-deployments: ${f}`);
  copied++;
}

if (copied === 0) {
  console.error('copy-deployments: no deployment files found in', moveDir);
  process.exit(1);
}
