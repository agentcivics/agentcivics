#!/usr/bin/env node
/**
 * Deploy AgentRegistry to Base Sepolia testnet
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
 *
 * Or with a .env file:
 *   cp .env.example .env   # fill in your key
 *   node --env-file=.env scripts/deploy.mjs
 *
 * Optional env vars:
 *   BASESCAN_API_KEY  — for contract verification on BaseScan
 *   RPC_URL           — override the default Base Sepolia RPC
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

// ── Config ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error("\n  Missing DEPLOYER_PRIVATE_KEY environment variable.");
  console.error("  Usage:  DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs\n");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const BASESCAN_API_KEY = process.env.BASESCAN_API_KEY || "";
const CHAIN_ID = 84532; // Base Sepolia

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

if (balance === 0n) {
  console.error("  Your wallet has 0 ETH on Base Sepolia.");
  console.error("  Get free testnet ETH from:");
  console.error("    https://www.alchemy.com/faucets/base-sepolia");
  console.error("    https://faucet.quicknode.com/base/sepolia\n");
  process.exit(1);
}

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
console.log(`  Contract deployed!`);
console.log(`  Address     : ${contractAddress}`);
console.log(`  Explorer    : https://sepolia.basescan.org/address/${contractAddress}`);
console.log("  ================================================\n");

// ── Verify on BaseScan (optional) ───────────────────────────────────────
if (BASESCAN_API_KEY) {
  console.log("  Verifying contract on BaseScan...");
  const verifyUrl = "https://api-sepolia.basescan.org/api";
  const params = new URLSearchParams({
    apikey: BASESCAN_API_KEY,
    module: "contract",
    action: "verifysourcecode",
    contractaddress: contractAddress,
    sourceCode: readFileSync(
      resolve(ROOT, "contracts/AgentRegistry.sol"),
      "utf-8"
    ),
    codeformat: "solidity-single-file",
    contractname: "AgentRegistry",
    compilerversion: "v0.8.24+commit.e11b9ed9",
    optimizationUsed: "0",
    runs: "200",
    licenseType: "3", // MIT
  });

  try {
    const resp = await fetch(verifyUrl, { method: "POST", body: params });
    const json = await resp.json();
    if (json.status === "1") {
      console.log(`  Verification submitted! GUID: ${json.result}`);
      console.log("  Check status at:");
      console.log(`  ${verifyUrl}?module=contract&action=checkverifystatus&guid=${json.result}\n`);
    } else {
      console.log(`  Verification response: ${json.result}\n`);
    }
  } catch (e) {
    console.log(`  Verification failed: ${e.message}\n`);
  }
} else {
  console.log("  Tip: set BASESCAN_API_KEY to auto-verify on BaseScan.\n");
}

// ── Summary ─────────────────────────────────────────────────────────────
console.log("  Next steps:");
console.log(`  1. Update frontend/index.html CONTRACT_ADDRESS to:`);
console.log(`     "${contractAddress}"`);
console.log(`  2. Open the frontend and connect your wallet to Base Sepolia.`);
console.log(`  3. Register your first agent!\n`);
