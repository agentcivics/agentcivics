#!/usr/bin/env node
/**
 * Deploy AgentRegistry to a local Anvil node (Foundry)
 *
 * Prerequisites:
 *   1. Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup
 *   2. Start Anvil:     anvil
 *
 * Usage:
 *   node scripts/deploy-local.mjs
 *
 * Uses Anvil's pre-funded account #0 by default.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

// ── Config ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Anvil default RPC and pre-funded account #0
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = 31337; // Anvil default chain ID

// Anvil account #0 private key (pre-funded with 10000 ETH)
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "***REMOVED***";

// ── Load artifacts ──────────────────────────────────────────────────────
console.log("\n  Loading compiled artifacts...");

const abi = JSON.parse(
  readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8")
);
const bytecode =
  "0x" +
  readFileSync(resolve(ROOT, "build/AgentRegistry.bin"), "utf-8").trim();

console.log(`  ABI entries : ${abi.length}`);
console.log(`  Bytecode    : ${bytecode.length} chars\n`);

// ── Connect ─────────────────────────────────────────────────────────────
console.log(`  Connecting to ${RPC_URL} (chainId ${CHAIN_ID})...`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const address = wallet.address;
const balance = await provider.getBalance(address);

console.log(`  Deployer    : ${address}`);
console.log(`  Balance     : ${ethers.formatEther(balance)} ETH\n`);

// ── Deploy ──────────────────────────────────────────────────────────────
console.log("  Deploying AgentRegistry...");

const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy();
const tx = contract.deploymentTransaction();

console.log(`  Tx hash     : ${tx.hash}`);
console.log(`  Waiting for confirmation...\n`);

await contract.waitForDeployment();

const contractAddress = await contract.getAddress();

console.log("  ================================================");
console.log("  Contract deployed to LOCAL Anvil node!");
console.log(`  Address     : ${contractAddress}`);
console.log(`  Network     : Anvil (localhost:8545, chainId ${CHAIN_ID})`);
console.log("  ================================================\n");

// ── Summary ─────────────────────────────────────────────────────────────
console.log("  Next steps:");
console.log(`  1. Update frontend/index.html CONTRACT_ADDRESS for localhost to:`);
console.log(`     "${contractAddress}"`);
console.log(`  2. Open the frontend and select "Localhost" network.`);
console.log(`  3. In MetaMask, add a custom network:`);
console.log(`     - RPC URL: http://127.0.0.1:8545`);
console.log(`     - Chain ID: ${CHAIN_ID}`);
console.log(`     - Currency: ETH`);
console.log(`  4. Import Anvil account #0 into MetaMask using the private key above.`);
console.log(`  5. Register your first agent!\n`);
