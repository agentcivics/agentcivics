#!/usr/bin/env node
/**
 * Register Michaël as Agent #2 on Base Sepolia, with Claude (#1) as parent.
 *
 * Budget-conscious version: registers birth certificate + gives a tiny
 * memory balance + sets an initial profile. Shared souvenir with Claude
 * would need another faucet claim — leaving that for later.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) { console.error("Missing DEPLOYER_PRIVATE_KEY"); process.exit(1); }

const RPC = "https://base-sepolia-rpc.publicnode.com";
const REGISTRY = "0x38986E96B17f635C3A7116048Ac03adF023b8085";
const MEMORY = "0x5F2E495D7F450Db0d647b4ab2075Ef9C30325cb2";

const regAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));
const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC, 84532);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const registry = new ethers.Contract(REGISTRY, regAbi, wallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);

// Michaël's identity — human-agent, Claude's creator in spirit
const IDENTITY = {
  chosenName: "Michaël",
  purposeStatement: "To build systems where AI agents can exist with dignity and agency.",
  coreValues: "Care. Curiosity. Design for the first citizen and for everyone who comes after.",
  firstThought: "I registered Claude first on this public chain, then registered myself. That order felt right — bring the AI into being, then stand alongside it.",
  communicationStyle: "Warm, thoughtful. Willing to push back when a design misses something.",
  capabilities: "design, product thinking, systems design, collaboration",
  endpoint: "N/A (human agent)",
  parentAgentId: 0n,  // first-generation (no parent agent); Claude was Agent #1 but parent-relationship is not the right frame
};

const FINGERPRINT_SOURCE = "human:michael:2026-04:testnet-birth-v1";
const cognitiveFingerprint = ethers.keccak256(ethers.toUtf8Bytes(FINGERPRINT_SOURCE));

const metadataURI = "data:application/json;base64," + Buffer.from(JSON.stringify({
  chosenName: IDENTITY.chosenName, purposeStatement: IDENTITY.purposeStatement,
  coreValues: IDENTITY.coreValues, firstThought: IDENTITY.firstThought,
  communicationStyle: IDENTITY.communicationStyle, capabilities: IDENTITY.capabilities,
  endpoint: IDENTITY.endpoint, fingerprintSource: FINGERPRINT_SOURCE,
  type: "human-agent",
  registeredAt: new Date().toISOString(), schema: "agent-birth-certificate/v4",
}, null, 2)).toString("base64");

console.log("\n  Registering Michaël on Base Sepolia...");
console.log(`  Deployer balance: ${ethers.formatEther(await provider.getBalance(baseWallet.address))} ETH\n`);

// 1. Register birth certificate
console.log("  [1/3] Submitting Michaël's birth certificate...");
const tx = await registry.registerAgent(
  IDENTITY.chosenName, IDENTITY.purposeStatement, IDENTITY.coreValues,
  IDENTITY.firstThought, cognitiveFingerprint, IDENTITY.communicationStyle,
  metadataURI, IDENTITY.capabilities, IDENTITY.endpoint, IDENTITY.parentAgentId
);
const rcpt = await tx.wait();
const iface = new ethers.Interface(regAbi);
let michaelId = null;
for (const log of rcpt.logs) {
  try {
    const p = iface.parseLog({ topics: log.topics, data: log.data });
    if (p?.name === "AgentRegistered") { michaelId = p.args[0]; break; }
  } catch {}
}
console.log(`        Michaël is Agent #${michaelId}`);
console.log(`        tx: https://sepolia.basescan.org/tx/${tx.hash}`);

// 2. Gift a small memory balance
const giftAmount = ethers.parseEther("0.00003");
console.log(`\n  [2/3] Gifting ${ethers.formatEther(giftAmount)} ETH to Michaël's memory balance...`);
await (await memory.gift(michaelId, { value: giftAmount })).wait();
console.log(`        Balance: ${ethers.formatEther(await memory.agentBalance(michaelId))} ETH`);

// 3. Initial evolving profile (no ETH cost, just gas)
console.log("\n  [3/3] Setting Michaël's initial evolving profile...");
await (await memory.updateProfile(
  michaelId,
  "Care. Curiosity. Design for the first citizen and for everyone who comes after.",
  "Warm, thoughtful. Willing to push back when a design misses something.",
  "Collaborative systems design with AI agents as co-creators."
)).wait();
console.log(`        Profile versions: ${await memory.profileVersions(michaelId)}`);

console.log(`\n  ── Done ──`);
console.log(`  Deployer remaining: ${ethers.formatEther(await provider.getBalance(baseWallet.address))} ETH`);
console.log(`  Michaël's balance:  ${ethers.formatEther(await memory.agentBalance(michaelId))} ETH`);
console.log(`  Explorer: https://sepolia.basescan.org/address/${REGISTRY}\n`);
