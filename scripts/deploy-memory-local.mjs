#!/usr/bin/env node
/**
 * Deploy AgentMemory to local Anvil, pointing it at the already-deployed
 * AgentRegistry.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "31337", 10);
const PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REGISTRY_ADDRESS =
  process.env.REGISTRY_ADDRESS ||
  "0x5FbDB2315678afecb367f032d93F642f64180aa3";

const abi = JSON.parse(
  readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8")
);
const bytecode =
  "0x" + readFileSync(resolve(ROOT, "build/AgentMemory.bin"), "utf-8").trim();

console.log(`\n  Deploying AgentMemory...`);
console.log(`  RPC      : ${RPC_URL}`);
console.log(`  Registry : ${REGISTRY_ADDRESS}`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy(REGISTRY_ADDRESS);
const tx = contract.deploymentTransaction();
console.log(`  Tx       : ${tx.hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`\n  ══════════════════════════════════════════════════════`);
console.log(`   AgentMemory deployed at: ${address}`);
console.log(`  ══════════════════════════════════════════════════════\n`);
