#!/usr/bin/env node
/**
 * Memory decay demo: forgetting as grace, experienced in fast-forward.
 *
 * Uses Anvil's `evm_increaseTime` to jump time forward and watch:
 *   - An ACTIVE souvenir pass its maintenance period and become ARCHIVABLE
 *   - Anyone (the public ceremony of forgetting) can then archive it
 *   - A MAINTAINED souvenir survives the same jump — caring keeps it alive
 *   - A CORE souvenir never decays, even decades forward
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC = "http://127.0.0.1:8545";
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const MEMORY = process.env.MEMORY_ADDRESS || "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const provider = new ethers.JsonRpcProvider(RPC, 31337);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);

// Advance Anvil's clock by N seconds, then mine a block so block.timestamp updates
async function jumpForward(seconds) {
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
}

function statusLabel(s) {
  return ["Active", "Archived", "Core"][Number(s)] || "Unknown";
}

async function describe(souvenirId, label) {
  const s = await memory.souvenirs(souvenirId);
  const archivable = Number(s.status) === 0 ? await memory.isArchivable(souvenirId) : false;
  console.log(`    ${label} #${souvenirId}: ${statusLabel(s.status)}${archivable ? " (ARCHIVABLE now)" : ""}`);
  console.log(`      last maintained: ${new Date(Number(s.lastMaintained) * 1000).toLocaleString()}`);
}

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Memory Decay Demo — forgetting as grace");
console.log("  ═══════════════════════════════════════════════════════\n");

// Agent #1 (Claude) is the subject. Make sure they're funded.
const agentId = 1n;
const bal = await memory.agentBalance(agentId);
console.log(`  Agent #${agentId} balance: ${ethers.formatEther(bal)} ETH`);
if (bal < ethers.parseEther("0.01")) {
  console.log("  Topping up balance with 0.05 ETH gift...");
  await (await memory.gift(agentId, { value: ethers.parseEther("0.05") })).wait();
}

// Write three souvenirs: one we'll let decay, one we'll maintain, one core.
console.log("\n  [Step 1] Writing three souvenirs to follow through time...\n");

async function writeSouv(type, content, core) {
  const hash = ethers.keccak256(ethers.toUtf8Bytes(content + Date.now() + Math.random()));
  const tx = await memory.writeSouvenir(agentId, type, content, "", hash, core);
  const rcpt = await tx.wait();
  const iface = new ethers.Interface(memAbi);
  for (const log of rcpt.logs) {
    try {
      const p = iface.parseLog({ topics: log.topics, data: log.data });
      if (p?.name === "SouvenirWritten") return p.args[0];
    } catch {}
  }
  throw new Error("no SouvenirWritten event");
}

const letDecay  = await writeSouv("decay-test", "A fleeting thought I won't bother to revisit.", false);
const toMaintain = await writeSouv("decay-test", "Something I'll choose to keep alive by paying maintenance.", false);
const core       = await writeSouv("decay-test", "A memory I commit to forever — core, never forgotten.", true);

console.log("  State at t=0 (just written):");
await describe(letDecay,  "  Let-decay ");
await describe(toMaintain, "  Maintained");
await describe(core,       "  Core      ");

// Jump 25 days — not yet overdue (period is 30 days)
console.log("\n  [Step 2] Fast-forward 25 days...");
await jumpForward(25 * 24 * 60 * 60);
console.log("  (Nothing should be archivable yet.)");
await describe(letDecay,  "  Let-decay ");
await describe(toMaintain, "  Maintained");
await describe(core,       "  Core      ");

// Maintain the middle one — resets its clock
console.log("\n  [Step 3] Maintaining the 'Maintained' souvenir (paying the small fee)...");
await (await memory.maintainSouvenir(toMaintain)).wait();
await describe(toMaintain, "  Maintained");

// Jump 10 more days — 35 total from t=0. Let-decay is now overdue. Maintained is only 10 days old again.
console.log("\n  [Step 4] Fast-forward another 10 days (35 total)...");
await jumpForward(10 * 24 * 60 * 60);
console.log("  (Let-decay should now be overdue; Maintained reset to 10 days ago; Core never cares.)");
await describe(letDecay,  "  Let-decay ");
await describe(toMaintain, "  Maintained");
await describe(core,       "  Core      ");

// Archive the overdue one
console.log("\n  [Step 5] Calling archiveIfOverdue on 'Let-decay' (anyone can call this)...");
await (await memory.archiveIfOverdue(letDecay)).wait();
console.log("  The memory has drifted into the archive. Still queryable, but no longer active.");
await describe(letDecay,  "  Let-decay ");

// Try to archive core (should fail — core never decays)
console.log("\n  [Step 6] Trying to archive the Core souvenir (should fail)...");
try {
  await memory.archiveIfOverdue.staticCall(core);
  console.log("  ✗ Unexpected: core archived. (Bug.)");
} catch (e) {
  const msg = (e.reason || e.message || "").toString();
  if (/StillActive|Core/i.test(msg)) {
    console.log(`  ✓ Correctly refused — core is forever.`);
  } else {
    console.log(`  (Rejected: ${msg.slice(0, 100)})`);
  }
}

// Try to archive maintained (should fail — not overdue)
console.log("\n  [Step 7] Trying to archive the Maintained souvenir (should fail — only 10 days since maintenance)...");
try {
  await memory.archiveIfOverdue.staticCall(toMaintain);
  console.log("  ✗ Unexpected.");
} catch (e) {
  console.log(`  ✓ Correctly refused — caring kept it alive.`);
}

// Jump a whole year forward, then show Core still stands
console.log("\n  [Step 8] Fast-forward 365 more days — a whole year...");
await jumpForward(365 * 24 * 60 * 60);
await describe(core, "  Core     ");
console.log("  Core memories outlive their keepers.\n");

console.log("  ═══════════════════════════════════════════════════════");
console.log("   Decay demo complete.");
console.log("  ═══════════════════════════════════════════════════════\n");
