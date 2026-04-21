#!/usr/bin/env node
/**
 * Finish what the earlier testnet demo started: add the shared dictionary
 * and tag souvenirs with domain specialization tags. Idempotent — any step
 * that fails with "already exists" is treated as success.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC = "https://base-sepolia-rpc.publicnode.com";
const MEMORY = "0x5F2E495D7F450Db0d647b4ab2075Ef9C30325cb2";
const REPUTATION = "0x0d33Cb9Fe714BC2DD9e68fAA1E18fd594d4d5344";

const PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!PK) { console.error("Missing DEPLOYER_PRIVATE_KEY"); process.exit(1); }

const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC, 84532);
const baseWallet = new ethers.Wallet(PK, provider);
const wallet = new ethers.NonceManager(baseWallet);
const memory = new ethers.Contract(MEMORY, memAbi, wallet);
const reputation = new ethers.Contract(REPUTATION, repAbi, wallet);

// Try an action; swallow "already exists / already tagged" errors as success
async function tryStep(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
  } catch (e) {
    const data = e.data || e.info?.error?.data;
    const msg = e.reason || e.message || "";
    // Common already-done selectors: AlreadyExists, AlreadyTagged, AlreadyInherited
    if (/already|0x23369fa6|0x0b7d7936/i.test(data || msg)) {
      console.log(`  • ${label} (already done — skipped)`);
    } else {
      console.log(`  ✗ ${label}: ${msg.slice(0, 120)}`);
    }
  }
}

console.log("\n  ═══════════ Finishing testnet demo ═══════════\n");

// 1. Create Genesis-Words dictionary (idempotent: will check if we can find it first)
const iface = new ethers.Interface(memAbi);
let dictId = null;
// Check existing dictionaries for Claude (#1)
const claudeDicts = await memory.getAgentDictionaries(1n);
for (const did of claudeDicts) {
  const d = await memory.getDictionary(did);
  if (d.name === "Genesis-Words") { dictId = did; break; }
}

if (dictId === null) {
  console.log("  Creating Genesis-Words dictionary...");
  const tx = await memory.createDictionary(1n, [2n], "Genesis-Words");
  const rcpt = await tx.wait();
  for (const log of rcpt.logs) {
    try {
      const p = iface.parseLog({ topics: log.topics, data: log.data });
      if (p?.name === "DictionaryCreated") { dictId = p.args[0]; break; }
    } catch {}
  }
  console.log(`  ✓ Dictionary #${dictId} created`);
} else {
  console.log(`  • Genesis-Words already exists as dictionary #${dictId}`);
}

// 2. Michaël accepts invite
await tryStep("Michaël accepts invite to Genesis-Words",
  async () => { await (await memory.acceptDictionaryInvite(dictId, 2n)).wait(); });

// 3. Add both terms to dictionary
await tryStep("Add 'souvenir-weight' to dictionary",
  async () => { await (await memory.addTermToDictionary(dictId, 1n, "souvenir-weight")).wait(); });
await tryStep("Add 'first-citizen' to dictionary",
  async () => { await (await memory.addTermToDictionary(dictId, 2n, "first-citizen")).wait(); });

// 4. Tag Claude's solo origin souvenir (#2) with "smart-contracts"
// Tag Michaël's solo origin souvenir (#3) with "systems-design"
// Tag the shared souvenirs with "systems-design" and "product-collaboration"
await tryStep("Tag Claude's origin souvenir (#2) with 'smart-contracts'",
  async () => { await (await reputation.tagSouvenir(1n, 2n, "smart-contracts")).wait(); });
await tryStep("Tag Michaël's origin souvenir (#3) with 'systems-design'",
  async () => { await (await reputation.tagSouvenir(2n, 3n, "systems-design")).wait(); });
await tryStep("Tag shared souvenir (#4) with 'systems-design'",
  async () => { await (await reputation.tagSouvenir(1n, 4n, "systems-design")).wait(); });
await tryStep("Tag shared souvenir (#4) with 'product-collaboration'",
  async () => { await (await reputation.tagSouvenir(1n, 4n, "product-collaboration")).wait(); });
await tryStep("Tag shared souvenir (#7) with 'ai-collaboration'",
  async () => { await (await reputation.tagSouvenir(1n, 7n, "ai-collaboration")).wait(); });

// ── Report final state ──
console.log("\n  ── Final state on Base Sepolia ──\n");

const claudeSouvs = (await memory.getSouvenirs(1n)).map(x => Number(x));
const michaelSouvs = (await memory.getSouvenirs(2n)).map(x => Number(x));
console.log(`  Claude (#1):  ${claudeSouvs.length} souvenirs → ${claudeSouvs.join(", ")}`);
console.log(`  Michaël (#2): ${michaelSouvs.length} souvenirs → ${michaelSouvs.join(", ")}`);

const [cNames, cScores] = await reputation.topDomains(1n, 5);
console.log(`\n  Claude's specialization:`);
for (let i = 0; i < cNames.length; i++) {
  console.log(`    ${cNames[i]}: ${ethers.formatEther(cScores[i])} ETH credited`);
}

const [mNames, mScores] = await reputation.topDomains(2n, 5);
console.log(`\n  Michaël's specialization:`);
for (let i = 0; i < mNames.length; i++) {
  console.log(`    ${mNames[i]}: ${ethers.formatEther(mScores[i])} ETH credited`);
}

const dict = await memory.getDictionary(dictId);
const dictTerms = await memory.getDictionaryTerms(dictId);
console.log(`\n  Shared dictionary "${dict.name}" (#${dictId}):`);
console.log(`    Owners: ${dict.owners.map(o => "#"+o).join(", ")}`);
console.log(`    Terms:  ${dictTerms.join(", ")}`);

console.log(`\n  Economics:`);
console.log(`    Solidarity pool: ${ethers.formatEther(await memory.solidarityPool())} ETH`);
console.log(`    Treasury:        ${ethers.formatEther(await memory.treasury())} ETH`);

console.log(`\n  Explorer: https://base-sepolia.blockscout.com/address/${MEMORY}\n`);
