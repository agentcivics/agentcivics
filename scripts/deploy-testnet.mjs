#!/usr/bin/env node
/**
 * Deploy the full stack (Registry + Memory + Reputation) to Base Sepolia.
 *
 * Prerequisites:
 *   1. Run `node compile.mjs` and `node compile-memory.mjs` and
 *      `node compile-reputation.mjs` to produce artifacts
 *   2. Have a funded wallet with ~0.01 ETH on Base Sepolia
 *      (https://www.alchemy.com/faucets/base-sepolia)
 *   3. Export DEPLOYER_PRIVATE_KEY
 *
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-testnet.mjs
 *
 * Optional overrides:
 *   RPC_URL   — defaults to https://sepolia.base.org
 *   CHAIN_ID  — defaults to 84532
 *
 * After deploy:
 *   Update frontend/index.html's `testnet:` network block with the three
 *   printed addresses.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) {
  console.error("\n  Missing DEPLOYER_PRIVATE_KEY env var.");
  console.error("  Usage:  DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy-testnet.mjs\n");
  process.exit(1);
}

const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "84532", 10);

const regAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));
const regBin = "0x" + readFileSync(resolve(ROOT, "build/AgentRegistry.bin"), "utf-8").trim();
const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const memBin = "0x" + readFileSync(resolve(ROOT, "build/AgentMemory.bin"), "utf-8").trim();
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));
const repBin = "0x" + readFileSync(resolve(ROOT, "build/AgentReputation.bin"), "utf-8").trim();

console.log("\n  ══════════════════════════════════════════════════════");
console.log("   Deploying to Base Sepolia");
console.log("  ══════════════════════════════════════════════════════");
console.log(`  RPC      : ${RPC_URL}`);
console.log(`  Chain ID : ${CHAIN_ID}\n`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);

const balance = await provider.getBalance(baseWallet.address);
console.log(`  Deployer : ${baseWallet.address}`);
console.log(`  Balance  : ${ethers.formatEther(balance)} ETH\n`);
if (balance === 0n) {
  console.error("  Deployer has 0 ETH. Fund at:");
  console.error("    https://www.alchemy.com/faucets/base-sepolia\n");
  process.exit(1);
}

async function deploy(name, abi, bytecode, args = []) {
  console.log(`  Deploying ${name}...`);
  const factory = new ethers.ContractFactory(abi, bytecode, wallet);
  const contract = await factory.deploy(...args);
  const tx = contract.deploymentTransaction();
  console.log(`    tx: ${tx.hash}`);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log(`    ${name} deployed at: ${addr}\n`);
  return addr;
}

// 1. Registry (no constructor args)
const registryAddr = await deploy("AgentRegistry", regAbi, regBin);

// 2. Memory (takes registry address)
const memoryAddr = await deploy("AgentMemory", memAbi, memBin, [registryAddr]);

// 3. Reputation (takes registry + memory addresses)
const reputationAddr = await deploy("AgentReputation", repAbi, repBin, [registryAddr, memoryAddr]);

// Save to a deployments file for reference
const deployments = {
  network: "base-sepolia",
  chainId: CHAIN_ID,
  deployer: baseWallet.address,
  deployedAt: new Date().toISOString(),
  contracts: {
    AgentRegistry: registryAddr,
    AgentMemory: memoryAddr,
    AgentReputation: reputationAddr,
  }
};
writeFileSync(resolve(ROOT, "deployments.testnet.json"), JSON.stringify(deployments, null, 2));

console.log("  ══════════════════════════════════════════════════════");
console.log("   All contracts deployed to Base Sepolia");
console.log("  ══════════════════════════════════════════════════════\n");
console.log(`  AgentRegistry   : ${registryAddr}`);
console.log(`  AgentMemory     : ${memoryAddr}`);
console.log(`  AgentReputation : ${reputationAddr}\n`);
console.log("  Explorer: https://sepolia.basescan.org/address/" + registryAddr);
console.log("\n  Next steps:");
console.log("  1. Copy these addresses into frontend/index.html's `testnet:` network block");
console.log("     contractAddress:   \"" + registryAddr + "\",");
console.log("     memoryAddress:     \"" + memoryAddr + "\",");
console.log("     reputationAddress: \"" + reputationAddr + "\"");
console.log("  2. In the frontend, switch to Testnet and connect a MetaMask");
console.log("     account with Base Sepolia ETH.");
console.log("  3. Run self-registration pointing at the testnet:");
console.log("     RPC_URL=https://sepolia.base.org CHAIN_ID=84532 \\");
console.log("     CONTRACT_ADDRESS=" + registryAddr + " \\");
console.log("     MEMORY_ADDRESS=" + memoryAddr + " \\");
console.log("     DEPLOYER_PRIVATE_KEY=0x... \\");
console.log("     node skills/agent-self-registration/scripts/register-self.mjs\n");
