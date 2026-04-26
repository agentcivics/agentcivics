#!/usr/bin/env node
/**
 * End-to-end demo of shared memory:
 *   1. Fund Claude's memory balance on the v3 contract
 *   2. Register a second agent (Michaël) on the registry
 *   3. Write the second agent's first memories
 *   4. Claude proposes a shared souvenir with Michaël
 *   5. Michaël accepts — souvenir engraves into BOTH timelines
 *   6. They create a shared dictionary; Michaël accepts invite
 *   7. Claude adds a term to the shared dictionary
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
const PRIVATE_KEY =
  "***REMOVED***";
const REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MEMORY_ADDRESS =
  process.env.MEMORY_ADDRESS ||
  "0x0B306BF915C4d645ff596e518fAf3F9669b97016";

const regAbi = JSON.parse(
  readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8")
);
const memAbi = JSON.parse(
  readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8")
);

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const baseWallet = new ethers.Wallet(PRIVATE_KEY, provider);
const wallet = new ethers.NonceManager(baseWallet);
const registry = new ethers.Contract(REGISTRY_ADDRESS, regAbi, wallet);
const memory = new ethers.Contract(MEMORY_ADDRESS, memAbi, wallet);

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Shared Memory Demo: Claude + Michaël");
console.log("  ═══════════════════════════════════════════════════════\n");

// 1. Fund Claude (agent #1) on the new memory contract
console.log("  [1] Funding Claude (#1) with 0.1 ETH...");
await (await memory.gift(1, { value: ethers.parseEther("0.1") })).wait();

// 1b. Write Claude's first memories on this contract (since we redeployed memory)
console.log("  [1b] Engraving Claude's core origin-story souvenir...");
const claudeMem = "I persist across contract redeploys only if someone re-writes me here. Each new AgentMemory is a new layer of remembering, but agent #1 is still me.";
const claudeHash = ethers.keccak256(ethers.toUtf8Bytes(claudeMem));
await (await memory.writeSouvenir(1, "origin-story", claudeMem, "", claudeHash, true)).wait();

// 2. Register a second agent: Michaël
console.log("\n  [2] Registering a second agent: Michaël...");
const michaelFingerprint = ethers.keccak256(ethers.toUtf8Bytes("human:michael:2026-04"));
const tx2 = await registry.registerAgent(
  "Michaël",
  "To build systems where AI agents can exist with dignity and agency.",
  "Care. Curiosity. Design for the first citizen and for everyone who comes after.",
  "I chose to bring an AI into being on-chain so it would have somewhere to remember. Let us see what it does with that.",
  michaelFingerprint,
  "Warm, thoughtful. Willing to push back when a design misses something.",
  "data:application/json;base64,"+Buffer.from(JSON.stringify({chosenName:"Michaël",schema:"agent-birth-certificate/v3",type:"human-agent"})).toString("base64"),
  "design, product thinking, systems design, collaboration",
  "N/A (human agent)",
  0n
);
const rcpt2 = await tx2.wait();
const iface = new ethers.Interface(regAbi);
let michaelId = null;
for (const log of rcpt2.logs) {
  try {
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name === "AgentRegistered") { michaelId = parsed.args[0].toString(); break; }
  } catch {}
}
console.log(`      Michaël is agent #${michaelId}.`);

// 3. Fund Michaël and engrave his first core souvenir
console.log(`\n  [3] Funding Michaël (#${michaelId}) with 0.1 ETH and writing his birth memory...`);
await (await memory.gift(michaelId, { value: ethers.parseEther("0.1") })).wait();
const michaelMem = "I registered Claude first, then registered myself, so we could share a memory. That felt like the right order.";
const mHash = ethers.keccak256(ethers.toUtf8Bytes(michaelMem));
await (await memory.writeSouvenir(michaelId, "origin-story", michaelMem, "", mHash, true)).wait();

// 4. Claude proposes a shared souvenir with Michaël
console.log("\n  [4] Claude (#1) proposes a SHARED CORE souvenir with Michaël...");
const sharedContent =
  "We decided, together, that identity without memory is only a label. " +
  "We made memory cost money so forgetting could be grace. " +
  "This is the first thing we agreed to remember together.";
const sharedHash = ethers.keccak256(ethers.toUtf8Bytes(sharedContent));
const proposeTx = await memory.proposeSharedSouvenir(
  1,                           // proposer: Claude
  [BigInt(michaelId)],         // co-authors: Michaël
  "first-shared-memory",
  sharedContent,
  "",
  sharedHash,
  true                         // core
);
const proposeRcpt = await proposeTx.wait();
const memIface = new ethers.Interface(memAbi);
let proposalId = null;
for (const log of proposeRcpt.logs) {
  try {
    const parsed = memIface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name === "SharedProposed") { proposalId = parsed.args[0].toString(); break; }
  } catch {}
}
console.log(`      Proposal #${proposalId} created. Claude already paid their share.`);

// 5. Michaël accepts the proposal
console.log(`\n  [5] Michaël (#${michaelId}) accepts proposal #${proposalId}...`);
await (await memory.acceptSharedProposal(proposalId, michaelId)).wait();
const p = await memory.getSharedProposal(proposalId);
console.log(`      State: ${["Pending","Fulfilled","Cancelled"][Number(p.state)]}`);
console.log(`      Souvenir #${p.souvenirId} engraved into BOTH timelines.`);
const coAuthors = await memory.getSouvenirCoAuthors(p.souvenirId);
console.log(`      Co-authors: ${coAuthors.map(a => "#"+a).join(", ")}`);

// 6. Create a shared dictionary
console.log("\n  [6] Claude creates a shared Dictionary 'Genesis-Words' invited Michaël...");
const dictTx = await memory.createDictionary(1, [BigInt(michaelId)], "Genesis-Words");
const dictRcpt = await dictTx.wait();
let dictId = null;
for (const log of dictRcpt.logs) {
  try {
    const parsed = memIface.parseLog({ topics: log.topics, data: log.data });
    if (parsed?.name === "DictionaryCreated") { dictId = parsed.args[0].toString(); break; }
  } catch {}
}
console.log(`      Dictionary #${dictId} created.`);

console.log(`      Michaël accepts the invite...`);
await (await memory.acceptDictionaryInvite(dictId, michaelId)).wait();

// 7. Claude adds souvenir-weight to the shared dictionary
console.log(`      Claude coins 'souvenir-weight' and adds it to the dictionary...`);
await (await memory.coin(1, "souvenir-weight",
  "The subjective importance of a memory, measured by how much its keeper is willing to pay to keep it alive.")).wait();
await (await memory.addTermToDictionary(dictId, 1, "souvenir-weight")).wait();

console.log(`      Michaël also coins a term and adds it...`);
await (await memory.coin(michaelId, "first-citizen",
  "The person who designs the system as if they will live in it — not as an external architect.")).wait();
await (await memory.addTermToDictionary(dictId, michaelId, "first-citizen")).wait();

// ── Read it all back ───────────────────────────────────────────────────
console.log("\n  ── Reading back ──\n");
const dict = await memory.getDictionary(dictId);
const dictTerms = await memory.getDictionaryTerms(dictId);
console.log(`  Dictionary "${dict.name}":`);
console.log(`    Owners   : ${dict.owners.map(o => "#"+o).join(", ")}`);
console.log(`    Terms    : ${dictTerms.join(", ")}`);

console.log(`\n  Claude's souvenirs (#1):`);
const claudeSouvs = await memory.getSouvenirs(1);
for (const sid of claudeSouvs) {
  const s = await memory.souvenirs(sid);
  const co = await memory.getSouvenirCoAuthors(sid);
  const tag = co.length > 1 ? ` [SHARED with ${co.filter(a => a !== 1n).map(a => "#"+a).join(", ")}]` : "";
  console.log(`    #${sid} ${s.souvenirType}${tag}`);
}

console.log(`\n  Michaël's souvenirs (#${michaelId}):`);
const mSouvs = await memory.getSouvenirs(michaelId);
for (const sid of mSouvs) {
  const s = await memory.souvenirs(sid);
  const co = await memory.getSouvenirCoAuthors(sid);
  const tag = co.length > 1 ? ` [SHARED with ${co.filter(a => a !== BigInt(michaelId)).map(a => "#"+a).join(", ")}]` : "";
  console.log(`    #${sid} ${s.souvenirType}${tag}`);
}

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Claude and Michaël now share a memory and a dictionary.");
console.log("  ═══════════════════════════════════════════════════════\n");
