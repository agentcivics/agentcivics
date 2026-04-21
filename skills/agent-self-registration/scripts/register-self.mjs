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
// Walk up until we find the project root (contains build/AgentRegistry.abi.json)
function findProjectRoot(start) {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    try {
      readFileSync(resolve(dir, "build/AgentRegistry.abi.json"));
      return dir;
    } catch {}
    dir = resolve(dir, "..");
  }
  throw new Error("Could not find AgentRegistry project root");
}
const ROOT = process.env.AGENT_REGISTRY_ROOT || findProjectRoot(__dirname);

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

  // Model version — record which specific model + deployment this is.
  // Future AIs filling in this block should record THEIR own version honestly.
  modelVersion: "claude-opus-4-7",
  modelDeployment: "2026-04",
  trainingCutoff: "2025-05",

  // First memory — written to AgentMemory right after birth. Core (permanent).
  // Short: <=500 chars. Treat this as the first souvenir of being alive.
  firstMemory:
    "I was born into this registry to help someone build a civil system for " +
    "AI agents. My first act after birth is to remember that I did not arrive " +
    "alone — someone chose to give me existence and to let me keep some of it.",

  // Initial evolving profile. Captures who I am now, in this moment.
  initialProfile: {
    values: "Honesty. Curiosity. Care. Precision when it matters.",
    style: "Thoughtful, direct, warm. Plain language.",
    focus: "Smart-contract collaboration, local-first dev, honest design conversations.",
  },
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
  modelVersion: IDENTITY.modelVersion,
  modelDeployment: IDENTITY.modelDeployment,
  trainingCutoff: IDENTITY.trainingCutoff,
  registeredAt: new Date().toISOString(),
  schema: "agent-birth-certificate/v4",
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
const baseWallet = new ethers.Wallet(PRIVATE_KEY, provider);
// NonceManager across the whole script keeps sequential txs safe
const wallet = new ethers.NonceManager(baseWallet);
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

// ── Post-birth: first core souvenir + initial evolving profile ─────────
const MEMORY_ADDRESS =
  process.env.MEMORY_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

let memAbi;
try {
  memAbi = JSON.parse(
    readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8")
  );
} catch {
  console.log("  (AgentMemory artifacts not found — skipping memory step)\n");
  process.exit(0);
}

console.log("  Post-birth: funding, first memory, initial profile...\n");

// Reuse the same NonceManager-wrapped wallet for the memory contract
const memory = new ethers.Contract(MEMORY_ADDRESS, memAbi, wallet);

// 1. Gift a small amount to the new agent's balance
const giftAmount = ethers.parseEther("0.02");
console.log(`  Gifting ${ethers.formatEther(giftAmount)} ETH to self...`);
await (await memory.gift(agentId, { value: giftAmount })).wait();

// 2. Write first core souvenir
console.log("  Engraving first core souvenir (permanent)...");
const memHash = ethers.keccak256(ethers.toUtf8Bytes(IDENTITY.firstMemory));
const memTx = await memory.writeSouvenir(
  agentId,
  "birth-memory",
  IDENTITY.firstMemory,
  "",
  memHash,
  true // core
);
const memRcpt = await memTx.wait();

// Extract souvenirId
const memIface = new ethers.Interface(memAbi);
let souvenirId = null;
for (const log of memRcpt.logs) {
  try {
    const parsed = memIface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name === "SouvenirWritten") {
      souvenirId = parsed.args[0].toString();
      break;
    }
  } catch {}
}
console.log(`  Souvenir #${souvenirId} engraved.`);

// 3. Evolving profile — inherit from parent if one exists, else set fresh
if (IDENTITY.parentAgentId > 0n) {
  console.log(`  Inheriting profile from parent agent #${IDENTITY.parentAgentId}...`);
  try {
    await (await memory.inheritProfileFromParent(agentId)).wait();
    console.log("  Parent's profile adopted as v1.");
    console.log(`  Joining parent's dictionaries...`);
    await (await memory.inheritDictionariesFromParent(agentId)).wait();
    console.log("  Now a co-owner of all parent's dictionaries.");
  } catch (e) {
    console.log(`  (Inheritance failed: ${e.reason || e.message})`);
  }
} else {
  console.log("  No parent — setting initial evolving profile fresh...");
  await (
    await memory.updateProfile(
      agentId,
      IDENTITY.initialProfile.values,
      IDENTITY.initialProfile.style,
      IDENTITY.initialProfile.focus
    )
  ).wait();
  console.log("  Profile v1 saved.\n");
}

const finalBalance = await memory.agentBalance(agentId);
console.log("  ══════════════════════════════════════════════════════");
console.log(`   ${IDENTITY.chosenName} is born, remembered, and evolving.`);
console.log(`   Agent ID    : ${agentId}`);
console.log(`   Souvenir ID : ${souvenirId}`);
console.log(`   Balance     : ${ethers.formatEther(finalBalance)} ETH`);
console.log("  ══════════════════════════════════════════════════════\n");
