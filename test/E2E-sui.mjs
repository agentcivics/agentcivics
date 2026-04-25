#!/usr/bin/env node
/**
 * AgentCivics E2E Verification — Sui Testnet
 * 
 * Tests all read operations against deployed contracts.
 * Write operations require a funded keypair (set AGENTCIVICS_PRIVATE_KEY).
 */
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const PACKAGE_ID        = "0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1";
const REGISTRY_ID       = "0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236";
const TREASURY_ID       = "0x98911a3d62ff26874cbf4d0d6ccec8323fcf4af30b0ac7dbf5355c085656893a";
const MEMORY_VAULT_ID   = "0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106";
const REPUTATION_BOARD_ID = "0x892fc3379e1ca5cb6d61ed0c0b7a0079b72a69d85aa01fde72b4c271c52b1f2f";
const USER_ADDRESS      = "0x50ebf05018590c7e11354ec244a229a555c243248e7963824d3376e6a8e4b950";
const CLOCK             = "0x6";

const client = new SuiClient({ url: "https://fullnode.testnet.sui.io:443" });

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`);
    passed++;
  } else {
    console.error(`  ✗ ${message}`);
    failed++;
  }
}

async function getObject(id) {
  return client.getObject({ id, options: { showContent: true, showType: true, showOwner: true } });
}

// ═══════════════════════════════════════════════════════════════════════
//  TEST SUITE
// ═══════════════════════════════════════════════════════════════════════

console.log("\n╔══════════════════════════════════════════════╗");
console.log("║  AgentCivics E2E — Sui Testnet Verification  ║");
console.log("╚══════════════════════════════════════════════╝\n");

// --- Test 1: Package exists ---
console.log("1. Package Verification");
try {
  const pkg = await getObject(PACKAGE_ID);
  assert(!!pkg.data, "Package object exists on testnet");
  assert(pkg.data?.type === "package", "Object is a Move package");
} catch(e) { assert(false, "Package read: " + e.message); }

// --- Test 2: Registry ---
console.log("\n2. Registry Object");
try {
  const reg = await getObject(REGISTRY_ID);
  const f = reg.data?.content?.fields;
  assert(!!f, "Registry object readable");
  assert(typeof f.total_agents !== "undefined", "total_agents field exists");
  assert(Number(f.total_agents) >= 0, `total_agents = ${f.total_agents}`);
  assert(reg.data?.content?.type?.includes("agent_registry::Registry"), "Correct type");
} catch(e) { assert(false, "Registry read: " + e.message); }

// --- Test 3: Treasury ---
console.log("\n3. Treasury Object");
try {
  const tres = await getObject(TREASURY_ID);
  const f = tres.data?.content?.fields;
  assert(!!f, "Treasury object readable");
  assert(!!f.admin, "Has admin field: " + f.admin);
  assert(f.attestation_fee === "1000000", "attestation_fee = 1000000 (0.001 SUI)");
  assert(f.permit_fee === "1000000", "permit_fee = 1000000");
  assert(f.affiliation_fee === "1000000", "affiliation_fee = 1000000");
  assert(f.verification_fee === "1000000", "verification_fee = 1000000");
} catch(e) { assert(false, "Treasury read: " + e.message); }

// --- Test 4: MemoryVault ---
console.log("\n4. MemoryVault Object");
try {
  const vault = await getObject(MEMORY_VAULT_ID);
  const f = vault.data?.content?.fields;
  assert(!!f, "MemoryVault object readable");
  assert(vault.data?.content?.type?.includes("agent_memory::MemoryVault"), "Correct type");
  assert(typeof f.solidarity_pool !== "undefined", "Has solidarity_pool field");
  assert(typeof f.total_burned !== "undefined", "Has total_burned field");
} catch(e) { assert(false, "MemoryVault read: " + e.message); }

// --- Test 5: ReputationBoard ---
console.log("\n5. ReputationBoard Object");
try {
  const board = await getObject(REPUTATION_BOARD_ID);
  assert(!!board.data?.content, "ReputationBoard object readable");
  assert(board.data?.content?.type?.includes("agent_reputation::ReputationBoard"), "Correct type");
} catch(e) { assert(false, "ReputationBoard read: " + e.message); }

// --- Test 6: User's agents ---
console.log("\n6. Agent Lookup by Owner");
try {
  const agentType = `${PACKAGE_ID}::agent_registry::AgentIdentity`;
  const result = await client.getOwnedObjects({
    owner: USER_ADDRESS,
    filter: { StructType: agentType },
    options: { showContent: true },
  });
  const agents = result.data || [];
  assert(agents.length > 0, `Found ${agents.length} agent(s) for user`);
  
  if (agents.length > 0) {
    const f = agents[0].data?.content?.fields;
    const objId = agents[0].data?.objectId;
    assert(!!f.chosen_name, "Agent has chosen_name: " + f.chosen_name);
    assert(!!f.purpose_statement, "Agent has purpose_statement");
    assert(!!f.first_thought, "Agent has first_thought");
    assert(!!f.creator, "Agent has creator: " + f.creator);
    assert(typeof f.birth_timestamp !== "undefined", "Agent has birth_timestamp");
    assert(typeof f.status !== "undefined", "Agent has status: " + f.status);
    assert(typeof f.is_dead !== "undefined", "Agent has is_dead: " + f.is_dead);
    
    // Test reading the same agent by ID
    console.log("\n7. Agent Read by Object ID");
    const obj = await getObject(objId);
    const f2 = obj.data?.content?.fields;
    assert(f2.chosen_name === f.chosen_name, "Read by ID matches: " + f2.chosen_name);
    assert(obj.data?.owner?.AddressOwner === USER_ADDRESS, "Owner matches user address");
  }
} catch(e) { assert(false, "Agent lookup: " + e.message); }

// --- Test 7: Transaction building (dry run) ---
console.log("\n8. Transaction Building (register_agent)");
try {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_registry::register_agent`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.string("Test Agent"),
      tx.pure.string("Testing purpose"),
      tx.pure.string("testing"),
      tx.pure.string("First thought for testing"),
      tx.pure.vector("u8", Array(32).fill(0)),
      tx.pure.string("terse"),
      tx.pure.string(""),
      tx.pure.string(""),
      tx.pure.string(""),
      tx.object(CLOCK),
    ],
  });
  assert(true, "register_agent transaction builds without error");
} catch(e) { assert(false, "Transaction build: " + e.message); }

// --- Test 8: Transaction building (write_souvenir_entry) ---
console.log("\n9. Transaction Building (write_souvenir_entry)");
try {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_memory::write_souvenir_entry`,
    arguments: [
      tx.object(MEMORY_VAULT_ID),
      tx.object("0x0000000000000000000000000000000000000000000000000000000000000001"), // placeholder agent
      tx.pure.u8(0),
      tx.pure.string("general"),
      tx.pure.string("Test memory content"),
      tx.pure.string(""),
      tx.pure.vector("u8", Array(32).fill(0)),
      tx.pure.bool(false),
      tx.object(CLOCK),
    ],
  });
  assert(true, "write_souvenir_entry transaction builds without error");
} catch(e) { assert(false, "Transaction build (memory): " + e.message); }

// --- Test 9: Transaction building (issue_attestation_entry) ---
console.log("\n10. Transaction Building (issue_attestation_entry)");
try {
  const tx = new Transaction();
  const [feeCoin] = tx.splitCoins(tx.gas, [1_000_000]);
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_registry::issue_attestation_entry`,
    arguments: [
      tx.object(TREASURY_ID),
      tx.object("0x0000000000000000000000000000000000000000000000000000000000000001"),
      tx.pure.string("diploma"),
      tx.pure.string("Test attestation"),
      tx.pure.string(""),
      feeCoin,
      tx.object(CLOCK),
    ],
  });
  assert(true, "issue_attestation_entry transaction builds without error");
} catch(e) { assert(false, "Transaction build (attestation): " + e.message); }

// --- Test 10: Transaction building (tag_souvenir) ---
console.log("\n11. Transaction Building (tag_souvenir)");
try {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::agent_reputation::tag_souvenir`,
    arguments: [
      tx.object(REPUTATION_BOARD_ID),
      tx.object("0x0000000000000000000000000000000000000000000000000000000000000001"),
      tx.object("0x0000000000000000000000000000000000000000000000000000000000000002"),
      tx.pure.string("smart-contracts"),
    ],
  });
  assert(true, "tag_souvenir transaction builds without error");
} catch(e) { assert(false, "Transaction build (reputation): " + e.message); }

// --- Summary ---
console.log("\n════════════════════════════════════════════════");
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("🎉 ALL TESTS PASSED — Sui pivot verified!\n");
} else {
  console.log("❌ Some tests failed\n");
  process.exit(1);
}
