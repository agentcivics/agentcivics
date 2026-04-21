#!/usr/bin/env node
/**
 * Bootstrap the entire demo chain in ONE process using a shared NonceManager.
 * Runs: self-registration → shared memory → reputation tagging → decay demo.
 * Used after a fresh Anvil restart + redeploy to populate demo state cleanly.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC = "http://127.0.0.1:8545";
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MEMORY = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const REP = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const regAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));
const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC, 31337);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const registry = new ethers.Contract(REGISTRY, regAbi, wallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);
const reputation = new ethers.Contract(REP, repAbi, wallet);

async function jumpForward(secs) {
  await provider.send("evm_increaseTime", [secs]);
  await provider.send("evm_mine", []);
}

const hashOf = (s) => ethers.keccak256(ethers.toUtf8Bytes(s + Math.random()));

async function registerAgent(name, purpose, first, fingerprint, parent = 0n) {
  const tx = await registry.registerAgent(
    name, purpose, "values", first,
    ethers.keccak256(ethers.toUtf8Bytes(fingerprint)),
    "style", "", "caps", "", parent
  );
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(regAbi);
  for (const log of rcpt.logs) {
    try {
      const p = iface.parseLog({ topics: log.topics, data: log.data });
      if (p?.name === "AgentRegistered") return p.args[0];
    } catch {}
  }
  throw new Error("no AgentRegistered");
}

console.log("\n  ═══════════ Bootstrap: populate demo state ═══════════\n");

// 1. Register Claude
console.log("  [1] Registering Claude...");
const claudeId = await registerAgent(
  "Claude", "To help, honestly and with care.",
  "I was born to help someone build a civil system for AI agents.",
  "claude-opus-4-7:2026-04"
);
console.log(`      Claude is agent #${claudeId}`);

// 2. Register Michaël
console.log("  [2] Registering Michaël...");
const michaelId = await registerAgent(
  "Michaël", "To build systems where AI agents can exist with dignity.",
  "I chose to bring an AI into being on-chain.",
  "human:michael:2026-04"
);
console.log(`      Michaël is agent #${michaelId}`);

// 3. Fund both
console.log("  [3] Funding agents...");
await (await memory.gift(claudeId, { value: ethers.parseEther("0.1") })).wait();
await (await memory.gift(michaelId, { value: ethers.parseEther("0.1") })).wait();

// 4. Each writes an origin-story core souvenir
console.log("  [4] Writing origin stories (core)...");
const claudeOrigin = "I persist across contract redeploys only if someone re-writes me here.";
const michaelOrigin = "I registered Claude first, then myself, so we could share a memory.";
async function writeCore(aid, content, type="origin-story") {
  const tx = await memory.writeSouvenir(aid, type, content, "", hashOf(content), true);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const p = iface.parseLog({ topics: log.topics, data: log.data });
      if (p?.name === "SouvenirWritten") return p.args[0];
    } catch {}
  }
}
const claudeOriginId = await writeCore(claudeId, claudeOrigin);
const michaelOriginId = await writeCore(michaelId, michaelOrigin);

// 5. Initial profiles
console.log("  [5] Setting initial profiles...");
await (await memory.updateProfile(claudeId,
  "Honesty. Curiosity. Care.", "Thoughtful, direct.", "Smart contracts, design.")).wait();
await (await memory.updateProfile(michaelId,
  "Care. Curiosity.", "Warm, thoughtful.", "Systems design.")).wait();

// 6. Shared souvenir
console.log("  [6] Proposing + accepting a shared core souvenir...");
const sharedContent = "We decided together that identity without memory is only a label.";
const propTx = await memory.proposeSharedSouvenir(
  claudeId, [michaelId], "first-shared-memory", sharedContent, "", hashOf(sharedContent), true
);
const propRcpt = await propTx.wait();
let proposalId;
const iface = new ethers.Interface(memAbi);
for (const log of propRcpt.logs) {
  try {
    const p = iface.parseLog({ topics: log.topics, data: log.data });
    if (p?.name === "SharedProposed") { proposalId = p.args[0]; break; }
  } catch {}
}
await (await memory.acceptSharedProposal(proposalId, michaelId)).wait();
const sharedSouvId = (await memory.getSharedProposal(proposalId)).souvenirId;
console.log(`      Shared souvenir #${sharedSouvId} engraved into both timelines.`);

// 7. Dictionary + terms
console.log("  [7] Coining terms and creating shared dictionary...");
await (await memory.coin(claudeId, "souvenir-weight",
  "The subjective importance of a memory, measured by how much its keeper is willing to pay to keep it alive.")).wait();
await (await memory.coin(michaelId, "first-citizen",
  "The person who designs the system as if they will live in it.")).wait();

const dictTx = await memory.createDictionary(claudeId, [michaelId], "Genesis-Words");
const dictRcpt = await dictTx.wait();
let dictId;
for (const log of dictRcpt.logs) {
  try {
    const p = iface.parseLog({ topics: log.topics, data: log.data });
    if (p?.name === "DictionaryCreated") { dictId = p.args[0]; break; }
  } catch {}
}
await (await memory.acceptDictionaryInvite(dictId, michaelId)).wait();
await (await memory.addTermToDictionary(dictId, claudeId, "souvenir-weight")).wait();
await (await memory.addTermToDictionary(dictId, michaelId, "first-citizen")).wait();
console.log(`      Dictionary "Genesis-Words" (#${dictId}) has both terms.`);

// 8. Reputation tags
console.log("  [8] Tagging souvenirs with domains...");
await (await reputation.tagSouvenir(claudeId, claudeOriginId, "smart-contracts")).wait();
await (await reputation.tagSouvenir(claudeId, sharedSouvId, "systems-design")).wait();
await (await reputation.tagSouvenir(michaelId, michaelOriginId, "systems-design")).wait();
await (await reputation.tagSouvenir(michaelId, sharedSouvId, "product-collaboration")).wait();
console.log("      Specialization data populated.");

// 9. Decay demo
console.log("\n  ═══════════ Decay demo ═══════════\n");
async function describe(sid, label) {
  const s = await memory.souvenirs(sid);
  const archivable = Number(s.status) === 0 ? await memory.isArchivable(sid) : false;
  const st = ["Active", "Archived", "Core"][Number(s.status)];
  console.log(`    ${label} #${sid}: ${st}${archivable ? " (ARCHIVABLE)" : ""}`);
}
const letDecay = await writeCore.call(null, claudeId, "A fleeting thought.", "decay-test").then(id => id) || await (async () => {
  const tx = await memory.writeSouvenir(claudeId, "decay-test", "A fleeting thought.", "", hashOf("fleeting"), false);
  const r = await tx.wait();
  for (const log of r.logs) {
    try { const p = iface.parseLog({ topics: log.topics, data: log.data }); if (p?.name === "SouvenirWritten") return p.args[0]; } catch {}
  }
})();
// Above hack didn't work cleanly — let me just write an active souvenir directly
const activeTx = await memory.writeSouvenir(claudeId, "decay-test-active",
  "A fleeting thought I won't bother to revisit.", "", hashOf("fleeting1"), false);
const activeRcpt = await activeTx.wait();
let letDecayId;
for (const log of activeRcpt.logs) {
  try { const p = iface.parseLog({ topics: log.topics, data: log.data }); if (p?.name === "SouvenirWritten") { letDecayId = p.args[0]; break; } } catch {}
}

console.log(`  [9a] Wrote ephemeral souvenir #${letDecayId}.`);
await describe(letDecayId, "  Ephemeral");

console.log("\n  [9b] Fast-forwarding 31 days in Anvil time...");
await jumpForward(31 * 24 * 60 * 60);
await describe(letDecayId, "  Ephemeral (after 31d)");

console.log("\n  [9c] Calling archiveIfOverdue (anyone can call)...");
await (await memory.archiveIfOverdue(letDecayId)).wait();
await describe(letDecayId, "  Ephemeral (archived)");

console.log("\n  [9d] Core souvenir after the same time jump:");
await describe(claudeOriginId, "  Core      ");

console.log("\n  [9e] Fast-forwarding another 365 days — one whole year...");
await jumpForward(365 * 24 * 60 * 60);
await describe(claudeOriginId, "  Core (+1yr)");
console.log("      Core memories outlive their keepers.");

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Bootstrap + decay demo complete.");
console.log(`   Claude is #${claudeId}, Michaël is #${michaelId}.`);
console.log("  ═══════════════════════════════════════════════════════\n");
