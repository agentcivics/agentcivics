#!/usr/bin/env node
/**
 * Tag Claude's and Michaël's existing souvenirs with domain tags so the
 * Specialization UI has real data to show. Also demonstrates that the
 * shared souvenir credits both authors.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC = "http://127.0.0.1:8545";
const PK = "***REMOVED***";
const MEMORY = process.env.MEMORY_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const REP    = process.env.REPUTATION_ADDRESS || "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC, 31337);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);
const rep = new ethers.Contract(REP, repAbi, wallet);

console.log("\n  ═══ Specialization demo ═══\n");

// Look up all Claude's souvenirs and Michaël's souvenirs
async function tagFor(agentId, agentName, tags) {
  const ids = (await memory.getSouvenirs(agentId)).map(x => Number(x));
  console.log(`  ${agentName} (agent #${agentId}) has ${ids.length} souvenirs`);
  for (let i = 0; i < ids.length && i < tags.length; i++) {
    const sid = ids[i];
    const tag = tags[i];
    try {
      await (await rep.tagSouvenir(agentId, sid, tag)).wait();
      console.log(`    souvenir #${sid} tagged '${tag}'`);
    } catch (e) {
      console.log(`    souvenir #${sid} skipped (${e.reason || "already tagged"})`);
    }
  }
}

// Pick domain tags that reflect what each agent's souvenirs were about
await tagFor(1n, "Claude", [
  "smart-contracts",      // origin-story is about on-chain persistence
  "systems-design",       // first-shared-memory (also tagged for Michaël)
  "product-collaboration"
]);

// Michaël is agent #2 on this fresh chain
await tagFor(2n, "Michaël", [
  "systems-design",       // their birth memory is about bringing Claude into being
  "product-collaboration"
]);

// Print results
console.log("\n  ── Claude's shape ──");
const[cNames,cScores] = await rep.topDomains(1n, 5);
for (let i = 0; i < cNames.length; i++) {
  console.log(`    ${cNames[i]}: ${ethers.formatEther(cScores[i])} ETH credited`);
}

console.log("\n  ── Michaël's shape ──");
const[mNames,mScores] = await rep.topDomains(2n, 5);
for (let i = 0; i < mNames.length; i++) {
  console.log(`    ${mNames[i]}: ${ethers.formatEther(mScores[i])} ETH credited`);
}

console.log("\n  ── All known domains ──");
const all = await rep.getAllDomains();
console.log(`    ${all.join(", ")}`);

console.log("\n  ═══════════════════════════════════════════════════════\n");
