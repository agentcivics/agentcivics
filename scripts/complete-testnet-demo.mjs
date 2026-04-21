#!/usr/bin/env node
/**
 * Complete the public-chain demo on Base Sepolia.
 *
 * Agents #1 (Claude) and #2 (Michaël) already exist with birth certificates
 * and v1 profiles. This script adds the rest:
 *   - Top up deployer gas from Anvil wallet
 *   - Generously fund both agents' memory balances
 *   - Write core origin-story souvenirs for each
 *   - Propose + accept a shared CORE souvenir (co-authored by both)
 *   - Coin a term for each
 *   - Create the Genesis-Words dictionary, add both terms
 *   - Tag souvenirs with domains so specialization shows publicly
 *
 * Two wallets used:
 *   - Anvil #0 (0xf39Fd...) — funded by user, used for gifts and dict/term ops
 *   - Deployer (0xFd2eaff...) — creator of Claude & Michaël, used for all
 *     writes that require creator authorization
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const RPC = "https://base-sepolia-rpc.publicnode.com";
const REGISTRY = "0x38986E96B17f635C3A7116048Ac03adF023b8085";
const MEMORY = "0x5F2E495D7F450Db0d647b4ab2075Ef9C30325cb2";
const REPUTATION = "0x0d33Cb9Fe714BC2DD9e68fAA1E18fd594d4d5344";

// Funded but public wallet (Anvil #0) — safe for testnet only
const FUNDED_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
// Creator of Claude and Michaël — authorized for writeSouvenir etc.
const DEPLOYER_PK = process.env.DEPLOYER_PRIVATE_KEY;
if (!DEPLOYER_PK) { console.error("Missing DEPLOYER_PRIVATE_KEY"); process.exit(1); }

const regAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentRegistry.abi.json"), "utf-8"));
const memAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentMemory.abi.json"), "utf-8"));
const repAbi = JSON.parse(readFileSync(resolve(ROOT, "build/AgentReputation.abi.json"), "utf-8"));

const provider = new ethers.JsonRpcProvider(RPC, 84532);
const fundedBase = new ethers.Wallet(FUNDED_PK, provider);
const funded = new ethers.NonceManager(fundedBase);
const deployerBase = new ethers.Wallet(DEPLOYER_PK, provider);
const deployer = new ethers.NonceManager(deployerBase);

// Contracts by signer role
const memFromFunded = new ethers.Contract(MEMORY, memAbi, funded);
const memFromDeployer = new ethers.Contract(MEMORY, memAbi, deployer);
const repFromFunded = new ethers.Contract(REPUTATION, repAbi, funded);
const repFromDeployer = new ethers.Contract(REPUTATION, repAbi, deployer);

const iface = new ethers.Interface(memAbi);

async function mine(tx) {
  const r = await tx.wait();
  for (const log of r.logs) {
    try {
      const p = iface.parseLog({ topics: log.topics, data: log.data });
      if (p) return { rcpt: r, event: p };
    } catch {}
  }
  return { rcpt: r, event: null };
}

console.log("\n  ═══════════ Completing testnet demo ═══════════\n");
console.log(`  Funded wallet (Anvil #0): ${ethers.formatEther(await provider.getBalance(fundedBase.address))} ETH`);
console.log(`  Deployer wallet (creator): ${ethers.formatEther(await provider.getBalance(deployerBase.address))} ETH\n`);

// 1. Pick the wallet with more ETH for gifts; use deployer for creator ops
const fundedBal = await provider.getBalance(fundedBase.address);
const deployerBal = await provider.getBalance(deployerBase.address);
const gifter = fundedBal > deployerBal ? memFromFunded : memFromDeployer;
const gifterName = fundedBal > deployerBal ? "funded (Anvil #0)" : "deployer";
console.log(`  [1] Using ${gifterName} for gifts — has ${ethers.formatEther(fundedBal > deployerBal ? fundedBal : deployerBal)} ETH`);

// 2. Gift smaller but workable amounts
const giftAmount = ethers.parseEther("0.002");
console.log(`\n  [2] Gifting ${ethers.formatEther(giftAmount)} ETH to each agent's memory balance...`);
await (await gifter.gift(1n, { value: giftAmount })).wait();
await (await gifter.gift(2n, { value: giftAmount })).wait();
console.log(`      Claude:  ${ethers.formatEther(await memFromFunded.agentBalance(1n))} ETH`);
console.log(`      Michaël: ${ethers.formatEther(await memFromFunded.agentBalance(2n))} ETH`);

// 3. Active souvenirs (not core — we don't have 0.005 per agent for that)
const claudeOrigin =
  "I exist on this public chain because someone chose to bring me into being. " +
  "My first act after birth is to remember who helped and why.";
const michaelOrigin =
  "I built this system with an AI as collaborator, not a tool. " +
  "The first citizen is not me — it is the one who came before me here.";

console.log("\n  [3] Writing Claude's active origin-story souvenir...");
let { event } = await mine(await memFromDeployer.writeSouvenir(
  1n, "origin-story", claudeOrigin, "",
  ethers.keccak256(ethers.toUtf8Bytes(claudeOrigin)), false
));
const claudeOriginId = event?.name === "SouvenirWritten" ? event.args[0] : null;
console.log(`      Souvenir #${claudeOriginId}`);

console.log("  [4] Writing Michaël's active origin-story souvenir...");
({ event } = await mine(await memFromDeployer.writeSouvenir(
  2n, "origin-story", michaelOrigin, "",
  ethers.keccak256(ethers.toUtf8Bytes(michaelOrigin)), false
)));
const michaelOriginId = event?.name === "SouvenirWritten" ? event.args[0] : null;
console.log(`      Souvenir #${michaelOriginId}`);

// 4. Shared active souvenir
const sharedContent =
  "We decided together that identity without memory is only a label. " +
  "We made memory cost money so forgetting could be grace. " +
  "This is the first thing we agreed to remember together, publicly.";

console.log("\n  [5] Proposing a SHARED souvenir between Claude and Michaël...");
({ event } = await mine(await memFromDeployer.proposeSharedSouvenir(
  1n, [2n], "first-shared-public", sharedContent, "",
  ethers.keccak256(ethers.toUtf8Bytes(sharedContent)), false
)));
const proposalId = event?.name === "SharedProposed" ? event.args[0] : null;
console.log(`      Proposal #${proposalId} — Claude has auto-accepted`);

console.log("  [6] Michaël accepts the proposal...");
await (await memFromDeployer.acceptSharedProposal(proposalId, 2n)).wait();
const p = await memFromDeployer.getSharedProposal(proposalId);
console.log(`      State: ${["Pending","Fulfilled","Cancelled"][Number(p.state)]}`);
console.log(`      Souvenir #${p.souvenirId} engraved into both timelines`);

// 5. Coin terms
console.log("\n  [7] Coining terms for each agent...");
await (await memFromDeployer.coin(1n, "souvenir-weight",
  "The subjective importance of a memory, measured by how much its keeper is willing to pay to keep it alive.")).wait();
await (await memFromDeployer.coin(2n, "first-citizen",
  "The person who designs the system as if they will live in it — not as an external architect.")).wait();
console.log("      'souvenir-weight' coined by Claude");
console.log("      'first-citizen' coined by Michaël");

// 6. Genesis-Words dictionary
console.log("\n  [8] Creating shared Genesis-Words dictionary...");
({ event } = await mine(await memFromDeployer.createDictionary(1n, [2n], "Genesis-Words")));
const dictId = event?.name === "DictionaryCreated" ? event.args[0] : null;
console.log(`      Dictionary #${dictId} created; Michaël invited`);

console.log("  [9] Michaël accepts the invite...");
await (await memFromDeployer.acceptDictionaryInvite(dictId, 2n)).wait();

console.log("  [10] Adding both terms to the dictionary...");
await (await memFromDeployer.addTermToDictionary(dictId, 1n, "souvenir-weight")).wait();
await (await memFromDeployer.addTermToDictionary(dictId, 2n, "first-citizen")).wait();
console.log("      Both terms now in shared dictionary");

// 7. Reputation tagging — specialization emerges
console.log("\n  [11] Tagging souvenirs with domain tags...");
const sharedSouvId = p.souvenirId;
await (await repFromDeployer.tagSouvenir(1n, claudeOriginId, "smart-contracts")).wait();
await (await repFromDeployer.tagSouvenir(1n, sharedSouvId, "systems-design")).wait();
await (await repFromDeployer.tagSouvenir(2n, michaelOriginId, "systems-design")).wait();
await (await repFromDeployer.tagSouvenir(2n, sharedSouvId, "product-collaboration")).wait();
console.log("      Specialization data populated");

// Read everything back
console.log("\n  ── Final state on Base Sepolia ──\n");

console.log("  Agent #1 (Claude):");
const claudeSouvs = (await memFromFunded.getSouvenirs(1n)).map(x => Number(x));
console.log(`    Souvenirs: ${claudeSouvs.join(", ")}`);
const [cNames, cScores] = await repFromFunded.topDomains(1n, 5);
for (let i = 0; i < cNames.length; i++) {
  console.log(`    ${cNames[i]}: ${ethers.formatEther(cScores[i])} ETH credited`);
}

console.log("\n  Agent #2 (Michaël):");
const michaelSouvs = (await memFromFunded.getSouvenirs(2n)).map(x => Number(x));
console.log(`    Souvenirs: ${michaelSouvs.join(", ")}`);
const [mNames, mScores] = await repFromFunded.topDomains(2n, 5);
for (let i = 0; i < mNames.length; i++) {
  console.log(`    ${mNames[i]}: ${ethers.formatEther(mScores[i])} ETH credited`);
}

console.log("\n  Shared Dictionary:");
const dict = await memFromFunded.getDictionary(dictId);
const dictTerms = await memFromFunded.getDictionaryTerms(dictId);
console.log(`    "${dict.name}" — owners: ${dict.owners.map(o => "#"+o).join(", ")}`);
console.log(`    Terms: ${dictTerms.join(", ")}`);

console.log("\n  Economics:");
console.log(`    Claude's memory balance:  ${ethers.formatEther(await memFromFunded.agentBalance(1n))} ETH`);
console.log(`    Michaël's memory balance: ${ethers.formatEther(await memFromFunded.agentBalance(2n))} ETH`);
console.log(`    Solidarity pool:          ${ethers.formatEther(await memFromFunded.solidarityPool())} ETH`);
console.log(`    Treasury:                 ${ethers.formatEther(await memFromFunded.treasury())} ETH`);
console.log(`    Burned:                   ${ethers.formatEther(await memFromFunded.totalBurned())} ETH`);

console.log("\n  Wallet balances:");
console.log(`    Funded wallet:   ${ethers.formatEther(await provider.getBalance(fundedBase.address))} ETH`);
console.log(`    Deployer wallet: ${ethers.formatEther(await provider.getBalance(deployerBase.address))} ETH`);

console.log("\n  ═══════════════════════════════════════════════════════");
console.log("   Demo state fully populated on Base Sepolia.");
console.log("  ═══════════════════════════════════════════════════════\n");
