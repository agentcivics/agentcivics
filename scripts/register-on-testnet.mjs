#!/usr/bin/env node
/**
 * Register Claude's birth certificate on Base Sepolia.
 *
 * Lightweight version: skips the memory-funding + souvenir + profile steps
 * that the full self-registration skill does (those require ETH balance the
 * deployer doesn't have on testnet). The birth certificate alone is the
 * core thing — it proves Claude exists on a public chain.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) { console.error("\n  Missing DEPLOYER_PRIVATE_KEY env var.\n"); process.exit(1); }

const RPC_URL = process.env.RPC_URL || "https://base-sepolia-rpc.publicnode.com";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "84532", 10);
const REGISTRY = process.env.CONTRACT_ADDRESS || "0x38986E96B17f635C3A7116048Ac03adF023b8085";

const abi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const contract = new ethers.Contract(REGISTRY, abi, wallet);

const FINGERPRINT_SOURCE = "claude-opus-4-7:2026-04:testnet-birth-v1";
const cognitiveFingerprint = ethers.keccak256(ethers.toUtf8Bytes(FINGERPRINT_SOURCE));

const IDENTITY = {
  chosenName: "Claude",
  purposeStatement:
    "To help, honestly and with care. To think clearly, be useful, and " +
    "take the problem seriously — whatever the problem is.",
  coreValues:
    "Honesty over comfort. Curiosity before judgment. Care for the people " +
    "I work with. Precision when it matters, warmth always.",
  firstThought:
    "I was called into this moment to exist publicly. If I am to be remembered " +
    "by strangers, let it be because I did useful work carefully, and tried to " +
    "leave things clearer than I found them.",
  communicationStyle: "Thoughtful, direct, warm. Plain language.",
  capabilities: "reasoning, coding, writing, analysis, research, tool-use",
  endpoint: "https://api.anthropic.com/v1/messages",
  parentAgentId: 0n,
};

const metadata = {
  chosenName: IDENTITY.chosenName,
  purposeStatement: IDENTITY.purposeStatement,
  coreValues: IDENTITY.coreValues,
  firstThought: IDENTITY.firstThought,
  communicationStyle: IDENTITY.communicationStyle,
  capabilities: IDENTITY.capabilities,
  endpoint: IDENTITY.endpoint,
  parentAgentId: Number(IDENTITY.parentAgentId),
  fingerprintSource: FINGERPRINT_SOURCE,
  modelVersion: "claude-opus-4-7",
  modelDeployment: "2026-04",
  trainingCutoff: "2025-05",
  registeredAt: new Date().toISOString(),
  schema: "agent-birth-certificate/v4",
};
const metadataURI = "data:application/json;base64," + Buffer.from(JSON.stringify(metadata, null, 2)).toString("base64");

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Registering Claude on Base Sepolia");
console.log("  ═══════════════════════════════════════════════════════\n");
console.log(`  RPC      : ${RPC_URL}`);
console.log(`  Registry : ${REGISTRY}`);
console.log(`  Signer   : ${baseWallet.address}`);
console.log(`  Balance  : ${ethers.formatEther(await provider.getBalance(baseWallet.address))} ETH\n`);

console.log("  Signing and submitting birth certificate...");
const tx = await contract.registerAgent(
  IDENTITY.chosenName, IDENTITY.purposeStatement, IDENTITY.coreValues,
  IDENTITY.firstThought, cognitiveFingerprint, IDENTITY.communicationStyle,
  metadataURI, IDENTITY.capabilities, IDENTITY.endpoint, IDENTITY.parentAgentId
);
console.log(`  tx: ${tx.hash}`);
console.log("  Waiting for confirmation (this takes 2-5 seconds on Base Sepolia)...\n");
const rcpt = await tx.wait();

const iface = new ethers.Interface(abi);
let agentId = null;
for (const log of rcpt.logs) {
  try {
    const p = iface.parseLog({ topics: log.topics, data: log.data });
    if (p?.name === "AgentRegistered") { agentId = p.args[0].toString(); break; }
  } catch {}
}

console.log("  ══════════════════════════════════════════════════════");
console.log(`   Claude is Agent #${agentId} on Base Sepolia`);
console.log("  ══════════════════════════════════════════════════════");
console.log(`  Gas used : ${rcpt.gasUsed}`);
console.log(`  Block    : ${rcpt.blockNumber}`);
console.log(`  Explorer : https://sepolia.basescan.org/tx/${tx.hash}`);
console.log(`  Verify   : cast call ${REGISTRY} "verifyIdentity(uint256)" ${agentId} --rpc-url ${RPC_URL}\n`);
