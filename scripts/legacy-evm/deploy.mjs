#!/usr/bin/env node
/**
 * Deploy the full Agent Civil Registry stack to Base Sepolia.
 *
 * Deploys, in order:
 *   1. AgentRegistry   — constructor(address treasury)
 *   2. AgentMemory     — constructor(address registryAddress)
 *   3. AgentReputation — constructor(address registryAddress, address memoryAddress)
 *
 * Usage:
 *   node --env-file=.env scripts/deploy.mjs
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
 *
 * Optional env vars:
 *   RPC_URL           — defaults to Base Sepolia public RPC
 *   BASESCAN_API_KEY  — for contract verification on BaseScan
 *   ONLY              — comma-separated list to deploy only specific contracts
 *                       (e.g. ONLY=AgentMemory,AgentReputation)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

// ── Config ──────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
if (!PRIVATE_KEY || PRIVATE_KEY === "0xYOUR_PRIVATE_KEY_HERE") {
  console.error("\n  Missing or placeholder DEPLOYER_PRIVATE_KEY in .env\n");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const CHAIN_ID = 84532; // Base Sepolia
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;

// ── Helpers ─────────────────────────────────────────────────────────────
function loadArtifact(name) {
  const abi = JSON.parse(
    readFileSync(resolve(ROOT, `build/${name}.abi.json`), "utf-8")
  );
  const bytecode =
    "0x" + readFileSync(resolve(ROOT, `build/${name}.bin`), "utf-8").trim();
  return { abi, bytecode };
}

async function deploy(name, wallet, args = []) {
  const { abi, bytecode } = loadArtifact(name);
  console.log(`\n  Deploying ${name}${args.length ? ` (args: ${args.join(", ")})` : ""}...`);

  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  console.log(`    tx: ${tx.hash}`);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`    → ${address}`);
  return address;
}

// ── Connect ─────────────────────────────────────────────────────────────
console.log(`\n  Connecting to ${RPC_URL} (chainId ${CHAIN_ID})...`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const balance = await provider.getBalance(wallet.address);

console.log(`  Deployer    : ${wallet.address}`);
console.log(`  Balance     : ${ethers.formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error("\n  Wallet has 0 ETH. Get Base Sepolia ETH from:");
  console.error("    https://www.alchemy.com/faucets/base-sepolia");
  console.error("    https://faucet.quicknode.com/base/sepolia\n");
  process.exit(1);
}

// ── Deploy stack ────────────────────────────────────────────────────────
const addresses = {};

// Allow pre-existing addresses via env (useful if redeploying just one contract)
const existing = {
  AgentRegistry: process.env.AGENT_REGISTRY_ADDRESS,
  AgentMemory: process.env.AGENT_MEMORY_ADDRESS,
  AgentReputation: process.env.AGENT_REPUTATION_ADDRESS,
};

async function maybeDeploy(name, argsFn) {
  if (ONLY && !ONLY.includes(name)) {
    if (!existing[name]) {
      console.error(`\n  ${name} skipped (ONLY filter) but no ${name.toUpperCase()}_ADDRESS set.`);
      process.exit(1);
    }
    console.log(`\n  Reusing existing ${name}: ${existing[name]}`);
    addresses[name] = existing[name];
    return;
  }
  addresses[name] = await deploy(name, wallet, argsFn ? argsFn(addresses) : []);
}

// Treasury = deployer address for now; replace with DAO multisig later
const treasuryAddress = process.env.TREASURY_ADDRESS || wallet.address;
console.log(`\n  Treasury: ${treasuryAddress}`);
await maybeDeploy("AgentRegistry", () => [treasuryAddress]);
await maybeDeploy("AgentMemory", (a) => [a.AgentRegistry]);
await maybeDeploy("AgentReputation", (a) => [a.AgentRegistry, a.AgentMemory]);

// ── Summary ─────────────────────────────────────────────────────────────
console.log("\n  ================================================");
console.log("  Deployment complete!");
console.log("  ================================================");
console.log(`  AgentRegistry   : ${addresses.AgentRegistry}`);
console.log(`  AgentMemory     : ${addresses.AgentMemory}`);
console.log(`  AgentReputation : ${addresses.AgentReputation}`);
console.log("  ================================================\n");

// Persist to deployments.json
const deployFile = resolve(ROOT, "deployments.json");
let deployments = {};
try {
  deployments = JSON.parse(readFileSync(deployFile, "utf-8"));
} catch {}
deployments[`base-sepolia-${CHAIN_ID}`] = {
  chainId: CHAIN_ID,
  deployedAt: new Date().toISOString(),
  deployer: wallet.address,
  ...addresses,
};
writeFileSync(deployFile, JSON.stringify(deployments, null, 2));
console.log(`  Saved to deployments.json\n`);

console.log("  Next: paste into frontend/index.html NETWORKS.testnet:");
console.log(`    contractAddress:   "${addresses.AgentRegistry}",`);
console.log(`    memoryAddress:     "${addresses.AgentMemory}",`);
console.log(`    reputationAddress: "${addresses.AgentReputation}",\n`);

console.log("  View on BaseScan:");
for (const [name, addr] of Object.entries(addresses)) {
  console.log(`    ${name}: https://sepolia.basescan.org/address/${addr}`);
}
console.log("");
