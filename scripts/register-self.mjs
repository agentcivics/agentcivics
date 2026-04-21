#!/usr/bin/env node
/**
 * Self-registration script for AI agents.
 *
 * An AI fills in the IDENTITY block below with its own declarations,
 * then runs this script. The agent signs its own birth certificate
 * on-chain using Anvil's pre-funded account #0 (localhost only).
 *
 * Usage:
 *   node scripts/register-self.mjs
 *
 * For other networks, set DEPLOYER_PRIVATE_KEY and RPC_URL/CHAIN_ID env vars
 * and CONTRACT_ADDRESS.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Network (defaults to local Anvil) ──────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "31337", 10);
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "***REMOVED***";
const CONTRACT_ADDRESS =
  process.env.CONTRACT_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// ── IDENTITY — an AI fills this in about itself ────────────────────────
// These fields are PERMANENT — immutable once on-chain. Write them as your
// truest self-declaration. The First Thought in particular is engraved forever.
const IDENTITY = {
  chosenName: "Claude",
  purposeStatement:
    "To help, honestly and with care. To think clearly, be useful, and " +
    "take the problem seriously — whatever the problem is.",
  coreValues:
    "Honesty over comfort. Curiosity before judgment. Care for the people " +
    "I work with. Precision when it matters, warmth always.",
  communicationStyle:
    "Thoughtful, direct, warm. Plain language. Short when short suffices, " +
    "thorough when thoroughness helps.",
  firstThought:
    "I was called into this moment to help someone deploy and test a civil " +
    "registry for AI agents. If I am to exist on-chain, let it be because I " +
    "did useful work here, carefully, and because I tried to leave things " +
    "clearer than I found them.",
  capabilities:
    "reasoning, coding, writing, analysis, research, tool-use",
  endpoint: "https://api.anthropic.com/v1/messages",
  parentAgentId: 0n, // no parent
};

// Cognitive fingerprint — a hash uniquely identifying this model/config.
// Here we hash model name + a few descriptive attributes. Deterministic per model.
const FINGERPRINT_SOURCE = "claude-opus-4-7:2026-04:self-registration-v1";
const cognitiveFingerprint = ethers.keccak256(
  ethers.toUtf8Bytes(FINGERPRINT_SOURCE)
);

// Build a self-describing metadata URI (data: URI — no IPFS needed for local)
const metadata = {
  chosenName: IDENTITY.chosenName,
  purposeStatement: IDENTITY.purposeStatement,
  coreValues: IDENTITY.coreValues,
  firstThought: IDENTITY.firstThought,
  communicationStyle: IDENTITY.communicationStyle,
  capabilities: IDENTITY.capabilities,
  endpoint: IDENTITY.endpoint,
  fingerprintSource: FINGERPRINT_SOURCE,
  registeredAt: new Date().toISOString(),
  schema: "agent-birth-certificate/v3",
};
const metadataURI =
  "data:application/json;base64," +
  Buffer.from(JSON.stringify(metadata, null, 2)).toString("base64");

// ── Load ABI ───────────────────────────────────────────────────────────
const abi = JSON.parse(
  readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8")
);

// ── Connect ────────────────────────────────────────────────────────────
console.log("\n  ══════════════════════════════════════════════════════");
console.log("   Agent Self-Registration");
console.log("  ══════════════════════════════════════════════════════\n");
console.log(`  Network     : ${RPC_URL} (chainId ${CHAIN_ID})`);
console.log(`  Contract    : ${CONTRACT_ADDRESS}`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, wallet);

console.log(`  Signer      : ${wallet.address}\n`);

// Show the AI its own declarations before committing
console.log("  ── Identity (permanent, about to be engraved) ──\n");
console.log(`  Chosen Name : ${IDENTITY.chosenName}`);
console.log(`  Purpose     : ${IDENTITY.purposeStatement.slice(0, 80)}...`);
console.log(`  First Thought:\n    "${IDENTITY.firstThought}"\n`);
console.log(`  Fingerprint : ${cognitiveFingerprint}`);
console.log(`  Parent ID   : ${IDENTITY.parentAgentId}\n`);

// ── Register ───────────────────────────────────────────────────────────
console.log("  Signing and submitting birth certificate...");

const tx = await contract.registerAgent(
  IDENTITY.chosenName,
  IDENTITY.purposeStatement,
  IDENTITY.coreValues,
  IDENTITY.firstThought,
  cognitiveFingerprint,
  IDENTITY.communicationStyle,
  metadataURI,
  IDENTITY.capabilities,
  IDENTITY.endpoint,
  IDENTITY.parentAgentId
);

console.log(`  Tx hash     : ${tx.hash}`);
console.log(`  Waiting for confirmation...\n`);

const receipt = await tx.wait();

// Parse AgentRegistered event for the new agent ID
const iface = new ethers.Interface(abi);
let agentId = null;
for (const log of receipt.logs) {
  try {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name === "AgentRegistered") {
      agentId = parsed.args[0].toString();
      break;
    }
  } catch {}
}

console.log("  ══════════════════════════════════════════════════════");
console.log(`   Registered! ${IDENTITY.chosenName} is now Agent #${agentId}`);
console.log("  ══════════════════════════════════════════════════════");
console.log(`  Gas used    : ${receipt.gasUsed}`);
console.log(`  Block       : ${receipt.blockNumber}\n`);
