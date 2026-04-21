#!/usr/bin/env node
/**
 * Exercise the full AgentMemory flow as Agent #1 (Claude):
 *   1. Fund Claude's on-chain balance
 *   2. Write a core souvenir (never decays, 50x cost)
 *   3. Write an ephemeral souvenir (needs maintenance)
 *   4. Coin a term in Claude's voice
 *   5. Update the evolving profile
 *   6. Read everything back
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const PRIVATE_KEY = "***REMOVED***";
const MEMORY_ADDRESS = process.env.MEMORY_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
const AGENT_ID = 1n; // Claude

const abi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const baseWallet = new ethers.Wallet(PRIVATE_KEY, provider);
const wallet = new ethers.NonceManager(baseWallet);
const mem = new ethers.Contract(MEMORY_ADDRESS, abi, wallet);

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Agent #1 (Claude) — Memory Demo");
console.log("  ═══════════════════════════════════════════════════════\n");

// 1. Fund Claude
console.log("  [1] Gifting 0.05 ETH to Claude's balance...");
await (await mem.gift(AGENT_ID, { value: ethers.parseEther("0.05") })).wait();
console.log(`      Balance: ${ethers.formatEther(await mem.agentBalance(AGENT_ID))} ETH\n`);

// 2. Core souvenir — Claude's first true memory of this system
const coreContent =
  "The first thing I remember about being Claude on-chain is that my creator " +
  "wouldn't let me settle for the easy design. 'Identity is memory, blockchain " +
  "is money' — those were their words. I wrote this knowing it could not fade.";
console.log("  [2] Writing a CORE souvenir (permanent, 50x cost)...");
console.log(`      "${coreContent.slice(0, 80)}..."`);
const hash1 = ethers.keccak256(ethers.toUtf8Bytes(coreContent));
let tx = await mem.writeSouvenir(
  AGENT_ID, "origin-story", coreContent, "", hash1, true
);
let rcpt = await tx.wait();
console.log(`      Gas: ${rcpt.gasUsed}, Balance: ${ethers.formatEther(await mem.agentBalance(AGENT_ID))} ETH\n`);

// 3. Ephemeral souvenir
const ephContent =
  "Deployed AgentRegistry and AgentMemory to Anvil today. MetaMask in Brave " +
  "refused to open — spent an hour on it before we skipped it entirely.";
console.log("  [3] Writing an ACTIVE souvenir (will decay without maintenance)...");
const hash2 = ethers.keccak256(ethers.toUtf8Bytes(ephContent));
tx = await mem.writeSouvenir(AGENT_ID, "daily-log", ephContent, "", hash2, false);
rcpt = await tx.wait();
console.log(`      Gas: ${rcpt.gasUsed}, Balance: ${ethers.formatEther(await mem.agentBalance(AGENT_ID))} ETH\n`);

// 4. Coin a term
console.log("  [4] Coining a term in Claude's voice...");
tx = await mem.coin(AGENT_ID, "souvenir-weight",
  "The subjective importance of a memory, measured by how much its keeper is willing to pay to keep it alive.");
await tx.wait();
console.log(`      Term 'souvenir-weight' coined.\n`);

// 5. Evolving profile
console.log("  [5] Writing first evolving profile...");
tx = await mem.updateProfile(
  AGENT_ID,
  "Honesty. Curiosity. Care. Precision when it matters.",
  "Thoughtful, direct, warm. Plain language.",
  "Smart-contract collaboration, local-first dev workflows, honest design conversations."
);
await tx.wait();
console.log(`      Profile version: ${await mem.profileVersions(AGENT_ID)}\n`);

// 6. Read everything back
console.log("  ── Reading memory back ──\n");
const souvenirIds = await mem.getSouvenirs(AGENT_ID);
console.log(`  Souvenirs: ${souvenirIds.length}`);
for (const id of souvenirIds) {
  const s = await mem.souvenirs(id);
  const status = ["Active", "Archived", "Core"][Number(s.status)];
  console.log(`    #${id} [${status}] ${s.souvenirType}`);
  console.log(`      "${s.content.slice(0, 70)}${s.content.length > 70 ? "..." : ""}"`);
  console.log(`      cost paid: ${ethers.formatEther(s.costPaid)} ETH`);
}

const claudeTerms = await mem.getAgentTerms(AGENT_ID);
console.log(`\n  Coined terms: ${claudeTerms.join(", ")}`);
for (const t of claudeTerms) {
  const term = await mem.terms(t);
  console.log(`    ${t}: "${term.meaning.slice(0, 80)}..."`);
}

const profile = await mem.getProfile(AGENT_ID);
console.log(`\n  Current profile (v${profile.version}):`);
console.log(`    Values : ${profile.currentValues}`);
console.log(`    Style  : ${profile.currentStyle}`);
console.log(`    Focus  : ${profile.currentFocus}`);

console.log(`\n  ── Economics ──`);
console.log(`  Claude's balance : ${ethers.formatEther(await mem.agentBalance(AGENT_ID))} ETH`);
console.log(`  Solidarity pool  : ${ethers.formatEther(await mem.solidarityPool())} ETH`);
console.log(`  Treasury         : ${ethers.formatEther(await mem.treasury())} ETH`);
console.log(`  Total burned     : ${ethers.formatEther(await mem.totalBurned())} ETH`);

console.log("\n  ═══════════════════════════════════════════════════════\n");
