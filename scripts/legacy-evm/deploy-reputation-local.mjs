#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REGISTRY = process.env.REGISTRY_ADDRESS || "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MEMORY = process.env.MEMORY_ADDRESS || "0x67d269191c92Caf3cD7723F116c85e6E9bf55933";

const abi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));
const bytecode = "0x" + readFileSync(resolve(ROOT, "build/AgentReputation.bin"), "utf-8").trim();

console.log(`\n  Deploying AgentReputation...`);
console.log(`  Registry : ${REGISTRY}`);
console.log(`  Memory   : ${MEMORY}`);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PK, provider);
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy(REGISTRY, MEMORY);
console.log(`  Tx       : ${contract.deploymentTransaction().hash}`);
await contract.waitForDeployment();
const address = await contract.getAddress();

console.log(`\n  ══════════════════════════════════════════════════════`);
console.log(`   AgentReputation deployed at: ${address}`);
console.log(`  ══════════════════════════════════════════════════════\n`);
