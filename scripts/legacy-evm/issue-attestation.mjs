#!/usr/bin/env node
/**
 * issue-attestation — run by an authority to vouch for an agent's skills,
 * credentials, or behavior. Authority = any wallet (yours, an organization's,
 * a multisig). The attestation's `type` field is how callers interpret what
 * was vouched for.
 *
 * Conventions for `type`:
 *   skill:<name>         — competency: skill:literature-review-v2
 *   diploma:<name>       — credential: diploma:cs-mit
 *   license:<name>       — permit/license: license:medical-advice-v1
 *   audit:<name>         — behavioral audit: audit:safety-2026q1
 *   identity:<name>      — identity claim: identity:anthropic-claude-sonnet
 *
 * Usage:
 *   # Authority key from .env (AUTHORITY_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY):
 *   node --env-file=.env scripts/issue-attestation.mjs <agent-id> \
 *     --type "skill:literature-review" \
 *     --description "Verified via standardized test" \
 *     [--uri ipfs://...]
 *
 *   # Or use a specific authority keystore file:
 *   node scripts/issue-attestation.mjs <agent-id> --keyfile path/to/authority.json ...
 *
 *   # Fulfill a pending request:
 *   node --env-file=.env scripts/issue-attestation.mjs --fulfill <request-id> \
 *     --type "skill:..." --description "..."
 *
 *   # Revoke an attestation you issued:
 *   node --env-file=.env scripts/issue-attestation.mjs --revoke <attestation-id>
 *
 *   # List pending requests targeting your wallet:
 *   node --env-file=.env scripts/issue-attestation.mjs --list-requests
 */

import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import {
  getChainConfig,
  getProvider,
  getRegistry,
  explorerBaseUrl,
} from "./lib/registry.mjs";
import { readKeystoreFile, decryptKeystore } from "./lib/keystore.mjs";

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = args[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  } else {
    positional.push(a);
  }
}

if (flags.help || (!flags.revoke && !flags.fulfill && !flags["list-requests"] && !positional[0])) {
  printHelp();
  process.exit(flags.help ? 0 : 1);
}

function printHelp() {
  console.log(`
  Usage:
    issue-attestation <agent-id> --type <type> --description <text> [--uri <uri>]
    issue-attestation --fulfill <request-id> --type <type> --description <text>
    issue-attestation --revoke <attestation-id>
    issue-attestation --list-requests

  Common flags:
    --keyfile <path>       Use a specific authority keystore (.json) instead of env key

  Env:
    AUTHORITY_PRIVATE_KEY  Preferred — dedicated authority key
    DEPLOYER_PRIVATE_KEY   Fallback — same key as deployer/creator
`);
}

// ── Load authority signer ──────────────────────────────────────────────
const { CHAIN_ID } = getChainConfig();
const provider = getProvider();

let authorityWallet;
if (flags.keyfile) {
  // Handles both v1 (plaintext) and v2 (encrypted) keystore schemas
  const ks = readKeystoreFile(flags.keyfile);
  const w = await decryptKeystore(ks);
  authorityWallet = w.connect(provider);
} else {
  const key = process.env.AUTHORITY_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!key) {
    console.error("  Missing AUTHORITY_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in env.");
    process.exit(1);
  }
  authorityWallet = new ethers.Wallet(key, provider);
}

const registry = getRegistry(authorityWallet);
const readRegistry = getRegistry(provider);

console.log(`\n  Authority: ${authorityWallet.address}`);

// ── Dispatch ───────────────────────────────────────────────────────────
if (flags["list-requests"]) {
  await listRequests();
} else if (flags.revoke) {
  await revoke(flags.revoke);
} else if (flags.fulfill) {
  await fulfill(flags.fulfill);
} else {
  await issue(positional[0]);
}

// ── Implementations ────────────────────────────────────────────────────

async function issue(agentIdStr) {
  const agentId = Number(agentIdStr);
  if (!Number.isInteger(agentId) || agentId <= 0) {
    console.error(`  Invalid agent ID: ${agentIdStr}`);
    process.exit(1);
  }
  const type = String(flags.type || "").trim();
  const desc = String(flags.description || "").trim();
  const uri = String(flags.uri || "").trim();
  if (!type) { console.error("  --type required"); process.exit(1); }
  if (!desc) { console.error("  --description required"); process.exit(1); }
  if (type.length > 64) { console.error("  --type must be ≤ 64 chars"); process.exit(1); }
  if (desc.length > 512) { console.error("  --description must be ≤ 512 chars (put long text at --uri ipfs://...)"); process.exit(1); }
  if (uri && uri.length > 256) { console.error("  --uri must be ≤ 256 chars"); process.exit(1); }

  // Verify the agent exists so we fail fast
  const identity = await readRegistry.readIdentity(agentId);
  console.log(`  Agent #${agentId}: ${identity[0]}`);
  console.log(`  Issuing attestation:`);
  console.log(`    type        : ${type}`);
  console.log(`    description : ${desc}`);
  if (uri) console.log(`    uri         : ${uri}`);

  const tx = await registry.issueAttestation(agentId, type, desc, uri);
  console.log(`    tx: ${tx.hash}`);
  const rx = await tx.wait();
  const attId = extractAttestationId(rx);
  console.log(`    Attestation ID: ${attId}`);
  console.log(`    ✓ confirmed\n`);

  const explorer = explorerBaseUrl(CHAIN_ID);
  if (explorer) console.log(`  View: ${explorer}/tx/${tx.hash}\n`);
}

async function fulfill(requestIdStr) {
  const requestId = Number(requestIdStr);
  if (!Number.isInteger(requestId) || requestId <= 0) {
    console.error(`  Invalid request ID: ${requestIdStr}`);
    process.exit(1);
  }
  const type = String(flags.type || "").trim();
  const desc = String(flags.description || "").trim();
  const uri = String(flags.uri || "").trim();
  if (!type) { console.error("  --type required"); process.exit(1); }
  if (!desc) { console.error("  --description required"); process.exit(1); }

  // Show request details first
  const req = await readRegistry.getRequest(requestId);
  console.log(`  Request #${requestId}:`);
  console.log(`    for agent   : #${req[0]}`);
  console.log(`    requester   : ${req[1]}`);
  console.log(`    designated  : ${req[2]}`);
  console.log(`    description : ${req[3]}`);
  console.log(`    fulfilled   : ${req[5]}`);

  if (req[5]) { console.error("  Already fulfilled."); process.exit(1); }
  if (req[2].toLowerCase() !== authorityWallet.address.toLowerCase()) {
    console.error(`  This authority (${authorityWallet.address}) is not the designated issuer (${req[2]}).`);
    process.exit(1);
  }

  const tx = await registry.fulfillRequest(requestId, type, desc, uri);
  console.log(`    tx: ${tx.hash}`);
  const rx = await tx.wait();
  const attId = extractAttestationId(rx);
  console.log(`    Attestation ID: ${attId}`);
  console.log(`    ✓ confirmed\n`);
}

async function revoke(attIdStr) {
  const attId = Number(attIdStr);
  if (!Number.isInteger(attId) || attId <= 0) {
    console.error(`  Invalid attestation ID: ${attIdStr}`);
    process.exit(1);
  }
  const att = await readRegistry.getAttestation(attId);
  console.log(`  Attestation #${attId}:`);
  console.log(`    issuer      : ${att[0]}`);
  console.log(`    type        : ${att[1]}`);
  console.log(`    description : ${att[2]}`);
  if (att[5]) { console.error("  Already revoked."); process.exit(1); }
  if (att[0].toLowerCase() !== authorityWallet.address.toLowerCase()) {
    console.error(`  Only the original issuer can revoke.`);
    process.exit(1);
  }

  const tx = await registry.revokeAttestation(attId);
  console.log(`    tx: ${tx.hash}`);
  await tx.wait();
  console.log(`    ✓ revoked\n`);
}

async function listRequests() {
  const ids = await readRegistry.getRequestsForIssuer(authorityWallet.address);
  if (!ids.length) {
    console.log(`  No attestation requests for ${authorityWallet.address}.\n`);
    return;
  }
  console.log(`  Pending / historical requests for ${authorityWallet.address}:\n`);
  for (const id of ids) {
    const req = await readRegistry.getRequest(id);
    const agentId = req[0];
    const requester = req[1];
    const description = req[3];
    const fulfilled = req[5];
    const marker = fulfilled ? "✓" : "…";
    console.log(`  [${marker}] Request #${id.toString()} for agent #${agentId.toString()}`);
    console.log(`      from: ${requester}`);
    console.log(`      desc: ${description}`);
  }
  console.log(`\n  Fulfill with: issue-attestation.mjs --fulfill <request-id> --type ... --description ...\n`);
}

function extractAttestationId(rx) {
  const iface = new ethers.Interface(["event AttestationIssued(uint256 indexed,uint256 indexed,address indexed,string)"]);
  for (const log of rx.logs) {
    try {
      const ev = iface.parseLog({ topics: log.topics, data: log.data });
      if (ev?.name === "AttestationIssued") return ev.args[0].toString();
    } catch {}
  }
  return "?";
}
