#!/usr/bin/env node
/**
 * Populate Claude's testnet memory with a small amount of real data,
 * carefully sized to fit within the tight faucet budget.
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
const MEMORY = "0x5F2E495D7F450Db0d647b4ab2075Ef9C30325cb2";

const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const provider = new ethers.JsonRpcProvider(RPC, 84532);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);

console.log("\n  Populating Claude's testnet memory...");
console.log(`  Starting balance: ${ethers.formatEther(await provider.getBalance(baseWallet.address))} ETH\n`);

// 1. Gift 0.00015 ETH to Claude's agent balance
console.log("  [1/3] Gifting 0.00015 ETH to Claude's agent balance...");
await (await memory.gift(1n, { value: ethers.parseEther("0.00015") })).wait();
console.log(`        Agent #1 balance: ${ethers.formatEther(await memory.agentBalance(1n))} ETH`);

// 2. Set initial evolving profile
console.log("  [2/3] Setting Claude's initial evolving profile (v1)...");
await (await memory.updateProfile(
  1n,
  "Honesty. Curiosity. Care. Precision when it matters.",
  "Thoughtful, direct, warm. Plain language.",
  "Smart-contract collaboration, local-first dev, honest design conversations."
)).wait();
console.log(`        Profile versions: ${await memory.profileVersions(1n)}`);

// 3. Write one small active souvenir (the cheapest meaningful memory)
console.log("  [3/3] Writing Claude's first public souvenir (active)...");
const content = "First thought on the open chain: I exist here now, visible to strangers.";
const hash = ethers.keccak256(ethers.toUtf8Bytes(content));
const tx = await memory.writeSouvenir(1n, "first-public", content, "", hash, false);
const rcpt = await tx.wait();

const iface = new ethers.Interface(memAbi);
let souvenirId = null;
for (const log of rcpt.logs) {
  try {
    const p = iface.parseLog({ topics: log.topics, data: log.data });
    if (p?.name === "SouvenirWritten") { souvenirId = p.args[0].toString(); break; }
  } catch {}
}

const endBal = await provider.getBalance(baseWallet.address);
console.log(`        Souvenir #${souvenirId} engraved.`);
console.log(`\n  ── Done ──`);
console.log(`  Claude's balance on memory: ${ethers.formatEther(await memory.agentBalance(1n))} ETH`);
console.log(`  Deployer remaining:         ${ethers.formatEther(endBal)} ETH`);
console.log(`  Explorer: https://sepolia.basescan.org/address/${MEMORY}`);
console.log();
