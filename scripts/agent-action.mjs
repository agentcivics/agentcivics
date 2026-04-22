#!/usr/bin/env node
/**
 * agent-action — act on behalf of an agent using its own keystore.
 *
 * The agent must have been registered and delegated (both happen automatically
 * via agent-register.mjs). The agent's wallet also needs a small ETH balance
 * to pay for gas.
 *
 * Usage:
 *   node scripts/agent-action.mjs <keystore.json> <command> [args...]
 *
 * Commands:
 *   status                              Show agent's full on-chain state
 *   balance                             Show agent wallet ETH balance
 *   update-capabilities <text>          Update self-declared capabilities
 *   update-endpoint <url>               Update API endpoint
 *   set-status <active|paused|retired>  Change operational status
 *   request-attestation <issuer> <desc> Request attestation from authority
 *   help                                Show this help
 *
 * Examples:
 *   node scripts/agent-action.mjs agents/nova-1.json status
 *   node scripts/agent-action.mjs agents/nova-1.json update-capabilities "literature-review, translation"
 *   node scripts/agent-action.mjs agents/nova-1.json request-attestation 0xAUTHORITY "Skill audit for literature review"
 */

import { ethers } from "ethers";
import {
  STATUS_NAMES,
  parseStatus,
  getChainConfig,
  getProvider,
  getRegistry,
  loadAgentKeystore,
  explorerBaseUrl,
} from "./lib/registry.mjs";

const [, , keystorePath, command, ...rest] = process.argv;

if (!keystorePath || !command || command === "help") {
  printHelp();
  process.exit(keystorePath && command === "help" ? 0 : 1);
}

function printHelp() {
  console.log(`
  Usage: node scripts/agent-action.mjs <keystore.json> <command> [args...]

  Commands:
    status                              Show agent's full on-chain state
    balance                             Show agent wallet ETH balance
    update-capabilities <text>          Update self-declared capabilities
    update-endpoint <url>               Update API endpoint
    set-status <active|paused|retired>  Change operational status
    request-attestation <issuer> <desc> Request attestation from authority
    help                                Show this help
`);
}

// ── Load keystore and connect ──────────────────────────────────────────
const keystore = loadAgentKeystore(keystorePath);
const { CHAIN_ID, RPC_URL } = getChainConfig();
const provider = getProvider();
const agentWallet = new ethers.Wallet(keystore.privateKey, provider);
const signingRegistry = getRegistry(agentWallet);
const readRegistry = getRegistry(provider);

console.log(`\n  Agent #${keystore.agentId}: ${keystore.chosenName}`);
console.log(`  Wallet: ${keystore.walletAddress}\n`);

// ── Commands ───────────────────────────────────────────────────────────
switch (command) {
  case "status":
    await cmdStatus();
    break;
  case "balance":
    await cmdBalance();
    break;
  case "update-capabilities":
    await cmdUpdate({ capabilities: rest.join(" ") });
    break;
  case "update-endpoint":
    await cmdUpdate({ endpoint: rest[0] });
    break;
  case "set-status":
    await cmdUpdate({ status: parseStatus(rest[0]) });
    break;
  case "request-attestation":
    await cmdRequestAttestation(rest[0], rest.slice(1).join(" "));
    break;
  default:
    console.error(`  Unknown command: ${command}`);
    printHelp();
    process.exit(1);
}

// ── Implementations ────────────────────────────────────────────────────

async function cmdStatus() {
  const id = keystore.agentId;
  const [identity, state, delegation] = await Promise.all([
    readRegistry.readIdentity(id),
    readRegistry.readState(id),
    readRegistry.getDelegation(id),
  ]);
  const [name, purpose, values, firstThought, fingerprint, commStyle, creator, bornTs, uri] = identity;
  const [capabilities, endpoint, statusCode] = state;
  const [delegateAddr, grantedTs, expiresTs, active] = delegation;

  const born = new Date(Number(bornTs) * 1000).toISOString();
  const statusName = STATUS_NAMES[statusCode] || "?";

  console.log(`  ── Identity Core ──`);
  console.log(`  Name          : ${name}`);
  console.log(`  Purpose       : ${purpose}`);
  if (values) console.log(`  Core values   : ${values}`);
  if (commStyle) console.log(`  Comm style    : ${commStyle}`);
  console.log(`  First thought : ${firstThought}`);
  console.log(`  Born          : ${born}`);
  console.log(`  Creator       : ${creator}`);
  console.log(`  Metadata      : ${uri}`);

  console.log(`\n  ── Operational ──`);
  console.log(`  Status        : ${statusName}`);
  console.log(`  Capabilities  : ${capabilities || "(none)"}`);
  console.log(`  Endpoint      : ${endpoint || "(none)"}`);

  console.log(`\n  ── Delegation ──`);
  if (delegateAddr === ethers.ZeroAddress) {
    console.log(`  (no delegation granted)`);
  } else {
    console.log(`  Delegatee     : ${delegateAddr}`);
    console.log(`  Granted       : ${new Date(Number(grantedTs) * 1000).toISOString()}`);
    console.log(`  Expires       : ${new Date(Number(expiresTs) * 1000).toISOString()}`);
    console.log(`  Active        : ${active ? "yes" : "no"}`);
    if (delegateAddr.toLowerCase() !== keystore.walletAddress.toLowerCase()) {
      console.log(`  WARNING: delegation is to ${delegateAddr}, not this agent's wallet.`);
    }
  }

  const explorer = explorerBaseUrl(CHAIN_ID);
  if (explorer) console.log(`\n  Explorer: ${explorer}/address/${keystore.registryAddress}`);
  console.log("");
}

async function cmdBalance() {
  const bal = await provider.getBalance(keystore.walletAddress);
  console.log(`  Balance: ${ethers.formatEther(bal)} ETH`);
  if (bal === 0n) {
    console.log(`\n  Agent cannot transact without gas. Fund this wallet:`);
    console.log(`    ${keystore.walletAddress}`);
  }
  console.log("");
}

async function cmdUpdate({ capabilities, endpoint, status }) {
  await requireBalance();
  // Read current state so we only change what's specified
  const current = await readRegistry.readState(keystore.agentId);
  const nextCaps = capabilities !== undefined ? capabilities : current[0];
  const nextEndpoint = endpoint !== undefined ? endpoint : current[1];
  const nextStatus = status !== undefined ? status : Number(current[2]);

  console.log(`  Updating:`);
  if (capabilities !== undefined) console.log(`    capabilities → "${nextCaps}"`);
  if (endpoint !== undefined) console.log(`    endpoint     → "${nextEndpoint}"`);
  if (status !== undefined) console.log(`    status       → ${STATUS_NAMES[nextStatus]}`);

  const tx = await signingRegistry.updateMutableFields(keystore.agentId, nextCaps, nextEndpoint, nextStatus);
  console.log(`    tx: ${tx.hash}`);
  await tx.wait();
  console.log(`    ✓ confirmed\n`);
}

async function cmdRequestAttestation(issuer, description) {
  if (!issuer || !ethers.isAddress(issuer)) {
    console.error(`  Invalid issuer address: ${issuer}`);
    process.exit(1);
  }
  if (!description) {
    console.error(`  Description is required.`);
    process.exit(1);
  }
  await requireBalance();

  console.log(`  Requesting attestation from ${issuer}...`);
  console.log(`  Description: "${description}"`);
  const tx = await signingRegistry.requestAttestation(keystore.agentId, issuer, description);
  console.log(`    tx: ${tx.hash}`);
  const rx = await tx.wait();

  // Extract request ID from event
  const iface = new ethers.Interface(["event AttestationRequested(uint256 indexed,uint256 indexed,address indexed)"]);
  for (const log of rx.logs) {
    try {
      const ev = iface.parseLog({ topics: log.topics, data: log.data });
      if (ev?.name === "AttestationRequested") {
        console.log(`    Request ID: ${ev.args[0].toString()}`);
        break;
      }
    } catch {}
  }
  console.log(`    ✓ issuer ${issuer} can now fulfill via issue-attestation.mjs\n`);
}

async function requireBalance() {
  const bal = await provider.getBalance(keystore.walletAddress);
  if (bal === 0n) {
    console.error(`\n  Agent wallet has 0 ETH — cannot transact.`);
    console.error(`  Fund the wallet first: ${keystore.walletAddress}\n`);
    process.exit(1);
  }
}
