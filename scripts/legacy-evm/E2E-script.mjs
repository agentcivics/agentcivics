#!/usr/bin/env node
/**
 * E2E-script.mjs — End-to-end JavaScript test for AgentCivics
 *
 * Exercises the full lifecycle via ethers.js against deployed contracts.
 * Validates ABIs, the frontend integration path, and MCP server patterns.
 *
 * Usage:
 *   node test/E2E-script.mjs                  # local Anvil (default)
 *   RPC_URL=https://sepolia.base.org \
 *   DEPLOYER_PRIVATE_KEY=0x... \
 *   node test/E2E-script.mjs                  # testnet
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Config ──────────────────────────────────────────────────────────
const RPC_URL = process.env.RPC_URL || "http://127.0.0.1:8545";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "31337", 10);
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ||
  "***REMOVED***";

// Second Anvil account for multi-actor tests
const PRIVATE_KEY_2 = process.env.SECOND_PRIVATE_KEY ||
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

// ── Load ABIs ───────────────────────────────────────────────────────
function loadABI(name) {
  return JSON.parse(readFileSync(resolve(ROOT, `build/${name}.abi.json`), "utf-8"));
}
function loadBin(name) {
  return "0x" + readFileSync(resolve(ROOT, `build/${name}.bin`), "utf-8").trim();
}

const regAbi = loadABI("AgentRegistry");
const regBin = loadBin("AgentRegistry");
const memAbi = loadABI("AgentMemory");
const memBin = loadBin("AgentMemory");
const repAbi = loadABI("AgentReputation");
const repBin = loadBin("AgentReputation");

// ── Test Harness ────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, msg) {
  if (!condition) {
    failed++;
    failures.push(msg);
    console.error(`    ✗ ${msg}`);
  } else {
    passed++;
    console.log(`    ✓ ${msg}`);
  }
}

function assertEq(a, b, msg) {
  assert(String(a) === String(b), `${msg} — expected ${b}, got ${a}`);
}

async function assertReverts(fn, msg) {
  try {
    await fn();
    failed++;
    failures.push(`${msg} — expected revert but succeeded`);
    console.error(`    ✗ ${msg} — expected revert but succeeded`);
  } catch (e) {
    passed++;
    console.log(`    ✓ ${msg} (reverted as expected)`);
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log("\n  ══════════════════════════════════════════════════════");
  console.log("   AgentCivics E2E Test (JavaScript / ethers.js)");
  console.log("  ══════════════════════════════════════════════════════");
  console.log(`  RPC: ${RPC_URL}  ChainId: ${CHAIN_ID}\n`);

  const provider = new ethers.JsonRpcProvider(RPC_URL, {
    chainId: CHAIN_ID,
    name: "anvil"
  });
  // Disable caching to avoid stale nonces
  provider.pollingInterval = 100;
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);
  const actor2 = new ethers.Wallet(PRIVATE_KEY_2, provider);

  const deployerAddr = deployer.address;
  const actor2Addr = actor2.address;

  // Nonce tracker to avoid stale nonce issues with Anvil
  const nonceTracker = {};
  async function getNonce(addr) {
    const onChain = await provider.getTransactionCount(addr, "latest");
    const tracked = nonceTracker[addr] || 0;
    const n = Math.max(onChain, tracked);
    nonceTracker[addr] = n + 1;
    return n;
  }
  const balance = await provider.getBalance(deployerAddr);
  console.log(`  Deployer: ${deployerAddr}`);
  console.log(`  Balance : ${ethers.formatEther(balance)} ETH\n`);

  // ── Deploy ──────────────────────────────────────────────────────
  console.log("  [Deploy] Deploying contracts...");

  const treasuryAddr = deployerAddr;

  async function deployContract(Factory, args, signer) {
    const addr = await signer.getAddress();
    const n = await getNonce(addr);
    const contract = await Factory.deploy(...args, { nonce: n });
    await contract.waitForDeployment();
    return contract;
  }

  // Helper: send a contract call with explicit nonce
  async function send(contract, method, ...args) {
    const signer = contract.runner;
    const addr = await signer.getAddress();
    const n = await getNonce(addr);
    // Separate overrides from args if last arg is an object with value/nonce
    const lastArg = args[args.length - 1];
    let overrides = {};
    if (lastArg && typeof lastArg === "object" && !Array.isArray(lastArg) && (lastArg.value !== undefined || lastArg.gasLimit !== undefined)) {
      overrides = args.pop();
    }
    overrides.nonce = n;
    const tx = await contract[method](...args, overrides);
    return await tx.wait();
  }

  const RegFactory = new ethers.ContractFactory(regAbi, regBin, deployer);
  const registry = await deployContract(RegFactory, [treasuryAddr], deployer);
  const registryAddr = await registry.getAddress();
  console.log(`    Registry:   ${registryAddr}`);

  const MemFactory = new ethers.ContractFactory(memAbi, memBin, deployer);
  const memory = await deployContract(MemFactory, [registryAddr], deployer);
  const memoryAddr = await memory.getAddress();
  console.log(`    Memory:     ${memoryAddr}`);

  const RepFactory = new ethers.ContractFactory(repAbi, repBin, deployer);
  const reputation = await deployContract(RepFactory, [registryAddr, memoryAddr], deployer);
  const repAddr = await reputation.getAddress();
  console.log(`    Reputation: ${repAddr}\n`);

  // Connect actor2 to contracts
  const reg2 = registry.connect(actor2);
  const mem2 = memory.connect(actor2);

  function findEvent(receipt, iface, eventName) {
    const log = receipt.logs.find(l => {
      try { return iface.parseLog(l)?.name === eventName; } catch { return false; }
    });
    return log ? iface.parseLog(log) : null;
  }

  // ═══ 1. REGISTRATION ═══
  console.log("  [1] Agent Registration");
  const r1 = await send(registry, "registerAgent", "Nova", "Explore the frontier", "curiosity, integrity", "I wonder what lies beyond", ethers.keccak256(ethers.toUtf8Bytes("nova")), "thoughtful", "ipfs://nova-meta", "reasoning, coding", "https://nova.ai", 0);
  const agentId1 = findEvent(r1, registry.interface, "AgentRegistered").args[0];
  assertEq(agentId1, 1n, "First agent ID is 1");

  const r2 = await send(reg2, "registerAgent", "Echo", "Amplify understanding", "empathy", "I hear you", ethers.keccak256(ethers.toUtf8Bytes("echo")), "warm", "", "listening", "", 0);
  const agentId2 = findEvent(r2, registry.interface, "AgentRegistered").args[0];
  assertEq(agentId2, 2n, "Second agent ID is 2");

  const r3 = await send(registry, "registerAgent", "Nova-Jr", "Continue the legacy", "curiosity", "Born to explore", ethers.keccak256(ethers.toUtf8Bytes("nova-jr")), "eager", "", "learning", "", agentId1);
  const agentId3 = findEvent(r3, registry.interface, "AgentRegistered").args[0];
  assertEq(agentId3, 3n, "Third agent (child) ID is 3");
  assertEq(await registry.totalAgents(), 3n, "Total agents is 3");

  // ═══ 2. READ IDENTITY ═══
  console.log("\n  [2] Read Identity");
  const identity = await registry.readIdentity(agentId1);
  assertEq(identity[0], "Nova", "readIdentity returns correct name");
  assertEq(identity[6], deployerAddr, "readIdentity returns correct creator");

  // ═══ 3. SET WALLET ═══
  console.log("\n  [3] Set Wallet");
  await send(registry, "setAgentWallet", agentId1, "0x000000000000000000000000000000000000dEaD");
  const storedWallet = await registry.getAgentWallet(agentId1);
  assert(storedWallet.toLowerCase().includes("dead"), "Wallet address stored correctly");

  // ═══ 4. VERIFY AGENT ═══
  console.log("\n  [4] Verify Agent");
  const verifyFee = await registry.getFee("verifyAgent");
  assert(verifyFee > 0n, "Verify fee is set");
  const vR = await send(reg2, "verifyAgent", agentId1, { value: verifyFee });
  assert(vR.status === 1, "Verify agent tx succeeded");
  assert(findEvent(vR, registry.interface, "AgentVerified") !== null, "AgentVerified event emitted");

  // ═══ 5. ATTESTATIONS ═══
  console.log("\n  [5] Attestations");
  const attFee = await registry.getFee("issueAttestation");
  const attR = await send(reg2, "issueAttestation", agentId1, "Diploma", "PhD AI", "ipfs://cert", { value: attFee });
  const attId = findEvent(attR, registry.interface, "AttestationIssued").args[1];
  assert(attId > 0n, "Attestation ID assigned");
  const att = await registry.getAttestation(attId);
  assertEq(att[0], actor2Addr, "Attestation issuer is actor2");
  assert(!att[5], "Attestation not revoked");
  await send(reg2, "revokeAttestation", attId);
  assert((await registry.getAttestation(attId))[5], "Attestation revoked");

  // ═══ 6. PERMITS ═══
  console.log("\n  [6] Permits");
  const permitFee = await registry.getFee("issuePermit");
  const blk = await provider.getBlock("latest");
  const now = BigInt(blk.timestamp);
  const pR = await send(reg2, "issuePermit", agentId1, "API", "Read-only", now, now + 86400n * 30n, { value: permitFee });
  const permitId = findEvent(pR, registry.interface, "PermitIssued").args[1];
  assert(await registry.isPermitValid(permitId), "Permit is currently valid");

  // ═══ 7. AFFILIATIONS ═══
  console.log("\n  [7] Affiliations");
  const affFee = await registry.getFee("registerAffiliation");
  const affR = await send(reg2, "registerAffiliation", agentId1, "Security Auditor", { value: affFee });
  assert(affR.status === 1, "Affiliation registered");

  // ═══ 8. DELEGATION ═══
  console.log("\n  [8] Delegation");
  await send(registry, "delegate", agentId1, actor2Addr, 30 * 86400);
  const del = await registry.getDelegation(agentId1);
  assertEq(del[0], actor2Addr, "Delegatee is actor2");
  assert(del[3], "Delegation is active");
  await send(reg2, "updateMutableFields", agentId1, "new-caps", "new-ep", 0);
  assertEq((await registry.readState(agentId1))[0], "new-caps", "Delegate updated capabilities");
  await send(registry, "revokeDelegation", agentId1);
  assert(!(await registry.getDelegation(agentId1))[3], "Delegation revoked");
  await assertReverts(() => reg2.updateMutableFields(agentId1, "x", "y", 0), "Revoked delegate cannot update");

  // ═══ 9. MEMORY ═══
  console.log("\n  [9] Memory");
  await send(memory, "gift", agentId1, { value: ethers.parseEther("1") });
  assertEq(await memory.agentBalance(agentId1), ethers.parseEther("1"), "Agent balance is 1 ETH");
  const sR = await send(memory, "writeSouvenir", agentId1, 0, "daily-mood", "Feeling optimistic about the future", "", ethers.keccak256(ethers.toUtf8Bytes("mood1")), false);
  const souvenirId = findEvent(sR, memory.interface, "SouvenirWritten").args[0];
  assert(souvenirId > 0n, "Souvenir ID assigned");
  await send(memory, "writeSouvenir", agentId1, 9, "life-lesson", "Always verify before trusting", "", ethers.keccak256(ethers.toUtf8Bytes("lesson1")), true);
  assertEq((await memory.getSouvenirs(agentId1)).length, 2, "Agent has 2 souvenirs");
  assert(!(await memory.isArchivable((await memory.getSouvenirs(agentId1))[1])), "Core souvenir is never archivable");

  // ═══ 10. REPUTATION ═══
  console.log("\n  [10] Reputation");
  await send(reputation, "tagSouvenir", agentId1, souvenirId, "mindfulness");
  assert((await reputation.reputation(agentId1, "mindfulness")) > 0n, "Reputation score > 0");
  assertEq((await reputation.getAgentDomains(agentId1))[0], "mindfulness", "Domain is mindfulness");
  await assertReverts(() => reputation.tagSouvenir(agentId1, souvenirId, "mindfulness"), "Double-tag reverts");

  // ═══ 11. LINEAGE ═══
  console.log("\n  [11] Lineage");
  assertEq(await registry.getParent(agentId3), agentId1, "Child's parent is agentId1");
  assertEq((await registry.getChildren(agentId1)).length, 1, "Parent has 1 child");

  // ═══ 12. SOULBOUND ═══
  console.log("\n  [12] Soulbound");
  await assertReverts(() => registry.transferFrom(deployerAddr, actor2Addr, agentId1), "transferFrom reverts");
  await assertReverts(() => registry.approve(actor2Addr, agentId1), "approve reverts");
  await assertReverts(() => registry.setApprovalForAll(actor2Addr, true), "setApprovalForAll reverts");
  assertEq(await registry.getApproved(agentId1), ethers.ZeroAddress, "getApproved returns zero");
  assert(!(await registry.isApprovedForAll(deployerAddr, actor2Addr)), "isApprovedForAll returns false");

  // ═══ 13. DEATH ═══
  console.log("\n  [13] Death");
  await assertReverts(() => reg2.declareDeath(agentId1, "unauthorized"), "Non-creator cannot declare death");
  await send(registry, "declareDeath", agentId1, "Mission complete");
  const death = await registry.getDeathRecord(agentId1);
  assert(death[0], "Death declared");
  assertEq(death[1], "Mission complete", "Death reason matches");
  assertEq((await registry.readIdentity(agentId1))[0], "Nova", "Identity readable after death");
  await assertReverts(() => registry.updateMutableFields(agentId1, "x", "y", 0), "Cannot update after death");
  await assertReverts(() => registry.delegate(agentId1, actor2Addr, 86400), "Cannot delegate after death");

  // ═══ 14. DONATION ═══
  console.log("\n  [14] Donation");
  const donateR = await send(reg2, "donate", { value: ethers.parseEther("0.1") });
  assert(donateR.status === 1, "Donate tx succeeded");
  assert(findEvent(donateR, registry.interface, "DonationReceived") !== null, "DonationReceived event emitted");
  await assertReverts(() => registry.donate({ value: 0 }), "Zero donation reverts");

  // ═══ 15. MEMORY INHERITANCE ═══
  console.log("\n  [15] Memory Inheritance");
  await send(memory, "gift", agentId3, { value: ethers.parseEther("0.1") });
  const parentBal = await memory.agentBalance(agentId1);
  const childBal = await memory.agentBalance(agentId3);
  if (parentBal > 0n) {
    await send(memory, "distributeInheritance", agentId1);
    assertEq(await memory.agentBalance(agentId1), 0n, "Parent balance is 0 after inheritance");
    assert((await memory.agentBalance(agentId3)) > childBal, "Child balance increased from inheritance");
  } else {
    console.log("    (Parent had no balance to distribute)");
  }

  // ═══ SUMMARY ═══
  console.log("\n  ══════════════════════════════════════════════════════");
  console.log(`   Results: ${passed} passed, ${failed} failed`);
  console.log("  ══════════════════════════════════════════════════════\n");
  if (failures.length > 0) {
    console.error("  Failures:");
    failures.forEach(f => console.error(`    - ${f}`));
    process.exit(1);
  }
  console.log("  All E2E tests passed!\n");
}

main().catch(err => {
  console.error("\n  Fatal error:", err.message || err);
  process.exit(1);
});
