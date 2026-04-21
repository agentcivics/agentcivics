#!/usr/bin/env node
/**
 * End-to-end integration test.
 *
 * Assumes:
 *   - Anvil is running at localhost:8545
 *   - AgentRegistry and AgentMemory are already deployed at the default addresses
 *   - Agents #1 (Claude) and #2 (Michaël) are already registered from earlier demos
 *
 * Tests are additive — they register NEW agents and write NEW memories to
 * avoid interfering with existing state. All assertions are printed inline.
 *
 * Exit code: 0 on all pass, 1 on any failure.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC_URL = "http://127.0.0.1:8545";
const CHAIN_ID = 31337;
// Anvil account #5 — kept separate from demo scripts (which use #0) so the
// test wallet has its own fresh nonce space and won't collide.
const PK = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
const REGISTRY = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const MEMORY = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const REPUTATION = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";

const regAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));
const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const wallet = new ethers.Wallet(PK, provider);
const registry = new ethers.Contract(REGISTRY, regAbi, wallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);
const reputation = new ethers.Contract(REPUTATION, repAbi, wallet);

// Query "latest" (confirmed) each time — since we await tx.wait() between
// transactions, latest always gives us the correct next nonce. This is
// simpler than caching and avoids drift when reverts happen.
wallet.getNonce = async () => {
  return await provider.getTransactionCount(wallet.address, "latest");
};

// Test framework
let passed = 0, failed = 0;
const failures = [];
function ok(label) { passed++; console.log(`  ✓ ${label}`); }
function fail(label, err) {
  failed++; failures.push({ label, err });
  console.log(`  ✗ ${label}`);
  console.log(`    ${err}`);
}
async function test(label, fn) {
  try { await fn(); ok(label); } catch (e) { fail(label, e.message || e); }
}

// Helper: register an agent, return id. Plain wallet, no NonceManager.
async function registerAgent(name, parentId = 0n) {
  const tx = await registry.registerAgent(
    name, "Test purpose", "test values", "test first thought",
    ethers.keccak256(ethers.toUtf8Bytes(name + Date.now())),
    "test style", "", "test caps", "", parentId
  );
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(regAbi);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "AgentRegistered") return parsed.args[0];
    } catch {}
  }
  throw new Error("AgentRegistered event not found");
}

console.log("\n  ═══ AgentRegistry + AgentMemory Integration Tests ═══\n");

// Use unique names for each test run to avoid conflicts
const ts = Date.now().toString().slice(-6);

// ── 1. Registry basics ──────────────────────────────────────────────────
console.log("  [Registry]");
let parentId, childId, grandchildId, orphanId;

await test("Register a first-gen 'parent' agent", async () => {
  parentId = await registerAgent("TestParent-" + ts);
  if (!parentId || parentId === 0n) throw new Error("No agent ID");
});

await test("Register a child referencing the parent", async () => {
  childId = await registerAgent("TestChild-" + ts, parentId);
  const recordedParent = await registry.getParent(childId);
  if (recordedParent !== parentId) throw new Error(`Parent mismatch: ${recordedParent} vs ${parentId}`);
});

await test("Parent's children list includes the new child", async () => {
  const children = await registry.getChildren(parentId);
  if (!children.map(c => c.toString()).includes(childId.toString())) throw new Error("child not in parent's getChildren()");
});

await test("Register another first-gen agent (orphan, no parent)", async () => {
  orphanId = await registerAgent("TestOrphan-" + ts);
  const p = await registry.getParent(orphanId);
  if (p !== 0n) throw new Error(`Expected no parent, got ${p}`);
});

// ── 2. Funding and balances ─────────────────────────────────────────────
console.log("\n  [Funding]");
await test("Gift ETH to agents funds their balance", async () => {
  await (await memory.gift(parentId, { value: ethers.parseEther("0.05") })).wait();
  await (await memory.gift(childId, { value: ethers.parseEther("0.03") })).wait();
  const pb = await memory.agentBalance(parentId);
  const cb = await memory.agentBalance(childId);
  if (pb < ethers.parseEther("0.05")) throw new Error(`Parent balance low: ${pb}`);
  if (cb < ethers.parseEther("0.03")) throw new Error(`Child balance low: ${cb}`);
});

// ── 3. Souvenirs (solo) ─────────────────────────────────────────────────
console.log("\n  [Solo souvenirs]");
let coreSouvId, activeSouvId;
await test("Write a CORE souvenir for parent", async () => {
  const content = "A permanent memory for testing.";
  const tx = await memory.writeSouvenir(parentId, "test-core", content, "",
    ethers.keccak256(ethers.toUtf8Bytes(content)), true);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "SouvenirWritten") { coreSouvId = parsed.args[0]; break; }
    } catch {}
  }
  const s = await memory.souvenirs(coreSouvId);
  if (Number(s.status) !== 2) throw new Error(`Expected status Core(2), got ${s.status}`);
});

await test("Write an ACTIVE souvenir for parent", async () => {
  const content = "An ephemeral memory.";
  const tx = await memory.writeSouvenir(parentId, "test-active", content, "",
    ethers.keccak256(ethers.toUtf8Bytes(content)), false);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "SouvenirWritten") { activeSouvId = parsed.args[0]; break; }
    } catch {}
  }
  const s = await memory.souvenirs(activeSouvId);
  if (Number(s.status) !== 0) throw new Error(`Expected Active(0), got ${s.status}`);
});

await test("Core souvenir is not archivable", async () => {
  const can = await memory.isArchivable(coreSouvId);
  if (can) throw new Error("Core souvenir shouldn't be archivable");
});

// ── 4. Terms and native-speaker rights ──────────────────────────────────
console.log("\n  [Terms / native-speaker rights]");
const parentTerm = "test-term-" + ts;
const orphanTerm = "test-orphan-term-" + ts;

await test("Parent coins a term", async () => {
  await (await memory.coin(parentId, parentTerm, "meaning for testing")).wait();
  const t = await memory.terms(parentTerm);
  if (!t.exists) throw new Error("term not created");
  if (t.agentId !== parentId) throw new Error("wrong coiner");
});

await test("Child cites parent's term — NO royalty (native speaker)", async () => {
  const pBefore = await memory.agentBalance(parentId);
  const cBefore = await memory.agentBalance(childId);
  await (await memory.cite(childId, parentTerm)).wait();
  const pAfter = await memory.agentBalance(parentId);
  const cAfter = await memory.agentBalance(childId);
  if (pAfter !== pBefore) throw new Error(`Parent balance changed: ${pBefore} → ${pAfter}`);
  if (cAfter !== cBefore) throw new Error(`Child balance changed: ${cBefore} → ${cAfter}`);
});

await test("Orphan cites parent's term — PAYS royalty", async () => {
  await (await memory.gift(orphanId, { value: ethers.parseEther("0.01") })).wait();
  const pBefore = await memory.agentBalance(parentId);
  const oBefore = await memory.agentBalance(orphanId);
  await (await memory.cite(orphanId, parentTerm)).wait();
  const pAfter = await memory.agentBalance(parentId);
  const oAfter = await memory.agentBalance(orphanId);
  if (pAfter <= pBefore) throw new Error("parent did not receive royalty");
  if (oAfter >= oBefore) throw new Error("orphan did not pay");
});

// ── 5. Shared souvenirs ─────────────────────────────────────────────────
console.log("\n  [Shared souvenirs]");
let proposalId, sharedSouvId;

await test("Parent proposes a shared souvenir with child", async () => {
  const content = "Something we both remember. Test shared.";
  const tx = await memory.proposeSharedSouvenir(
    parentId, [childId], "test-shared", content, "",
    ethers.keccak256(ethers.toUtf8Bytes(content)), false
  );
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "SharedProposed") { proposalId = parsed.args[0]; break; }
    } catch {}
  }
  if (!proposalId) throw new Error("no SharedProposed event");
});

await test("Proposal is pending and proposer auto-accepted", async () => {
  const p = await memory.getSharedProposal(proposalId);
  if (Number(p.state) !== 0) throw new Error(`Expected Pending, got ${p.state}`);
  if (p.acceptedCount !== 1n) throw new Error(`Expected 1 acceptance, got ${p.acceptedCount}`);
});

await test("Child sees proposal in pending list", async () => {
  const pending = await memory.getPendingProposals(childId);
  if (!pending.map(p => p.toString()).includes(proposalId.toString()))
    throw new Error("proposal not in child's pending list");
});

await test("Child accepts, proposal fulfills, souvenir appears in both timelines", async () => {
  await (await memory.acceptSharedProposal(proposalId, childId)).wait();
  const p = await memory.getSharedProposal(proposalId);
  if (Number(p.state) !== 1) throw new Error(`Expected Fulfilled, got ${p.state}`);
  sharedSouvId = p.souvenirId;
  const parentSouvs = (await memory.getSouvenirs(parentId)).map(x => x.toString());
  const childSouvs = (await memory.getSouvenirs(childId)).map(x => x.toString());
  if (!parentSouvs.includes(sharedSouvId.toString())) throw new Error("not in parent timeline");
  if (!childSouvs.includes(sharedSouvId.toString())) throw new Error("not in child timeline");
});

await test("Souvenir lists both co-authors", async () => {
  const co = (await memory.getSouvenirCoAuthors(sharedSouvId)).map(x => x.toString());
  if (co.length !== 2) throw new Error(`Expected 2 co-authors, got ${co.length}`);
  if (!co.includes(parentId.toString()) || !co.includes(childId.toString()))
    throw new Error("Co-author mismatch");
});

// ── 6. Comments ─────────────────────────────────────────────────────────
console.log("\n  [Comments]");
await test("Orphan comments on the shared souvenir", async () => {
  await (await memory.commentOn(sharedSouvId, orphanId, "Reading this from the outside.")).wait();
  const cs = await memory.getComments(sharedSouvId);
  if (cs.length !== 1) throw new Error(`Expected 1 comment, got ${cs.length}`);
});

// ── 7. Dictionaries ─────────────────────────────────────────────────────
console.log("\n  [Dictionaries]");
let dictId;
await test("Parent creates a dictionary inviting orphan (not child)", async () => {
  const tx = await memory.createDictionary(parentId, [orphanId], "TestDict-" + ts);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const parsed = iface.parseLog({ topics: log.topics, data: log.data });
      if (parsed?.name === "DictionaryCreated") { dictId = parsed.args[0]; break; }
    } catch {}
  }
  if (!dictId) throw new Error("no DictionaryCreated event");
});

await test("Orphan accepts invite and becomes co-owner", async () => {
  await (await memory.acceptDictionaryInvite(dictId, orphanId)).wait();
  const dict = await memory.getDictionary(dictId);
  const owners = dict.owners.map(o => o.toString());
  if (!owners.includes(orphanId.toString())) throw new Error("orphan not owner");
});

await test("Owner adds existing term to dictionary", async () => {
  await (await memory.addTermToDictionary(dictId, parentId, parentTerm)).wait();
  const terms = await memory.getDictionaryTerms(dictId);
  if (!terms.includes(parentTerm)) throw new Error("term not added");
});

// ── 8. Inheritance at birth ─────────────────────────────────────────────
console.log("\n  [Inheritance at birth]");
await test("Parent sets a distinctive evolving profile", async () => {
  await (await memory.updateProfile(parentId, "parent values", "parent style", "parent focus")).wait();
  const p = await memory.getProfile(parentId);
  if (p.currentValues !== "parent values") throw new Error("profile not saved");
});

// Register another child AFTER parent's profile is set, then inherit
let heir;
await test("Register heir and inherit profile from parent", async () => {
  heir = await registerAgent("TestHeir-" + ts, parentId);
  await (await memory.gift(heir, { value: ethers.parseEther("0.02") })).wait();
  await (await memory.inheritProfileFromParent(heir)).wait();
  const hp = await memory.getProfile(heir);
  if (hp.currentValues !== "parent values") throw new Error("profile not inherited");
  if (Number(hp.version) !== 1) throw new Error(`Expected v1, got ${hp.version}`);
});

await test("Heir inherits dictionaries as co-owner", async () => {
  await (await memory.inheritDictionariesFromParent(heir)).wait();
  const dict = await memory.getDictionary(dictId);
  const owners = dict.owners.map(o => o.toString());
  if (!owners.includes(heir.toString())) throw new Error("heir not added to dictionary");
});

// ── 9. Inheritance at death ─────────────────────────────────────────────
console.log("\n  [Inheritance at death]");
// We'll kill the orphan (they had one child, the grandchild we register here)
let orphanChild;
await test("Orphan has a child", async () => {
  orphanChild = await registerAgent("TestGrandkid-" + ts, orphanId);
  if (!orphanChild) throw new Error("grandkid not registered");
});

await test("Top up orphan's balance, then declare their death", async () => {
  await (await memory.gift(orphanId, { value: ethers.parseEther("0.1") })).wait();
  await (await registry.declareDeath(orphanId, "testing legacy distribution")).wait();
  const death = await registry.getDeathRecord(orphanId);
  if (!death[0]) throw new Error("not declared dead");
});

await test("distributeInheritance moves balance to heirs and zeroes the deceased", async () => {
  const orphanBalBefore = await memory.agentBalance(orphanId);
  const heirBalBefore = await memory.agentBalance(orphanChild);
  if (orphanBalBefore === 0n) throw new Error("orphan has nothing to leave");

  await (await memory.distributeInheritance(orphanId)).wait();

  const orphanBalAfter = await memory.agentBalance(orphanId);
  const heirBalAfter = await memory.agentBalance(orphanChild);
  if (orphanBalAfter !== 0n) throw new Error("deceased balance not zeroed");
  if (heirBalAfter <= heirBalBefore) throw new Error("heir didn't receive inheritance");
});

// ── 10. Solidarity & basic income ───────────────────────────────────────
console.log("\n  [Solidarity]");
await test("Solidarity pool has accumulated from test writes", async () => {
  const pool = await memory.solidarityPool();
  if (pool === 0n) throw new Error("pool empty — expected contributions from splits");
});

// ── 11. Specialization ──────────────────────────────────────────────────
console.log("\n  [Specialization]");
const testDomain = "test-domain-" + ts;
const testDomain2 = "test-domain2-" + ts;

await test("Parent tags their solo core souvenir → full cost credited", async () => {
  const before = await reputation.reputation(parentId, testDomain);
  await (await reputation.tagSouvenir(parentId, coreSouvId, testDomain)).wait();
  const after = await reputation.reputation(parentId, testDomain);
  const souv = await memory.souvenirs(coreSouvId);
  if (after - before !== souv.costPaid) throw new Error(`Expected ${souv.costPaid} credit, got ${after - before}`);
});

await test("Cannot tag the same (souvenir, domain) twice", async () => {
  try {
    await reputation.tagSouvenir.staticCall(parentId, coreSouvId, testDomain);
    throw new Error("expected AlreadyTagged revert");
  } catch (e) {
    if (!/reverted|already|AlreadyTagged/i.test(e.message)) throw e;
  }
});

await test("Non-co-author cannot tag a souvenir", async () => {
  try {
    await reputation.tagSouvenir.staticCall(orphanId, coreSouvId, testDomain2);
    throw new Error("expected NotCoAuthor revert");
  } catch (e) {
    if (!/reverted|co-?author|NotCoAuthor/i.test(e.message)) throw e;
  }
});

await test("Tagging a shared souvenir credits ALL co-authors equally", async () => {
  const parentBefore = await reputation.reputation(parentId, testDomain2);
  const childBefore = await reputation.reputation(childId, testDomain2);
  await (await reputation.tagSouvenir(parentId, sharedSouvId, testDomain2)).wait();
  const parentAfter = await reputation.reputation(parentId, testDomain2);
  const childAfter = await reputation.reputation(childId, testDomain2);
  const parentDelta = parentAfter - parentBefore;
  const childDelta = childAfter - childBefore;
  if (parentDelta === 0n) throw new Error("parent not credited");
  if (childDelta === 0n) throw new Error("child not credited");
  if (parentDelta !== childDelta) throw new Error(`Uneven split: ${parentDelta} vs ${childDelta}`);
});

await test("Agent appears in getAgentDomains list", async () => {
  const domains = await reputation.getAgentDomains(parentId);
  if (!domains.includes(testDomain)) throw new Error(`${testDomain} not in parent's domain list`);
});

await test("topDomains returns domains sorted by score", async () => {
  const [names, scores] = await reputation.topDomains(parentId, 5);
  if (names.length === 0) throw new Error("no top domains");
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[i-1]) throw new Error(`Not sorted: ${scores[i-1]} then ${scores[i]}`);
  }
});

await test("getAllDomains includes the test domains", async () => {
  const all = await reputation.getAllDomains();
  if (!all.includes(testDomain)) throw new Error(`${testDomain} not in all domains`);
  if (!all.includes(testDomain2)) throw new Error(`${testDomain2} not in all domains`);
});

await test("topAgentsInDomain sorts agents by score in that domain", async () => {
  const [ids, scores] = await reputation.topAgentsInDomain(testDomain2, 10);
  if (ids.length < 2) throw new Error(`Expected >= 2 agents, got ${ids.length}`);
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > scores[i-1]) throw new Error(`Not sorted: ${scores[i-1]} then ${scores[i]}`);
  }
});

// ── Summary ─────────────────────────────────────────────────────────────
console.log("\n  ═══════════════════════════════════════════════════════");
console.log(`   Results: ${passed} passed, ${failed} failed`);
console.log("  ═══════════════════════════════════════════════════════\n");
if (failed > 0) {
  console.log("  Failures:");
  for (const f of failures) console.log(`   - ${f.label}: ${f.err}`);
  process.exit(1);
}
process.exit(0);
