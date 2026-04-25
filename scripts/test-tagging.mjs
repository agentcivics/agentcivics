#!/usr/bin/env node
/**
 * Test tag_souvenir and tag_attestation on Sui testnet via CLI.
 * Uses the active `sui client` keypair.
 * 
 * Flow: register agent → gift SUI → write souvenir → tag_souvenir → issue attestation → tag_attestation
 */
import { execSync } from "node:child_process";

const PKG  = "0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d";
const REG  = "0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236";
const TRES = "0x98911a3d62ff26874cbf4d0d6ccec8323fcf4af30b0ac7dbf5355c085656893a";
const VAULT= "0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106";
const BOARD= "0x892fc3379e1ca5cb6d61ed0c0b7a0079b72a69d85aa01fde72b4c271c52b1f2f";
const CLK  = "0x6";

function sui(mod, fn, args, extra = "") {
  const cmd = `sui client call --package ${PKG} --module ${mod} --function ${fn} --args ${args} --gas-budget 100000000 ${extra} --json 2>&1`;
  console.log(`    $ sui client call ... --function ${fn}`);
  try {
    const out = execSync(cmd, { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 });
    const json = JSON.parse(out);
    if (json.effects?.status?.status !== "success") {
      const err = json.effects?.status?.error || JSON.stringify(json.effects?.status);
      throw new Error(err);
    }
    return json;
  } catch (e) {
    if (e.stdout) {
      try { const j = JSON.parse(e.stdout); throw new Error(j.effects?.status?.error || e.message); } catch {}
    }
    throw e;
  }
}

function findCreated(r, typeSuffix) {
  for (const ch of (r.objectChanges || [])) {
    if (ch.type === "created" && ch.objectType?.includes(typeSuffix)) return ch.objectId;
  }
  return null;
}

// Get a coin object to use as payment
function getPaymentCoin() {
  const out = execSync("sui client gas --json 2>&1", { encoding: "utf-8" });
  const coins = JSON.parse(out);
  // Find a coin with enough balance (>0.2 SUI = 200M MIST)
  for (const c of coins) {
    const bal = Number(c.mistBalance || c.balance || 0);
    if (bal > 200_000_000) return c.gasCoinId || c.id?.id;
  }
  throw new Error("No coin with sufficient balance found");
}

console.log("\n╔═══════════════════════════════════════╗");
console.log("║  Test: tag_souvenir & tag_attestation  ║");
console.log("╚═══════════════════════════════════════╝\n");

const addr = execSync("sui client active-address", { encoding: "utf-8" }).trim();
console.log(`Active address: ${addr}\n`);

let agentId, souvenirId, attestationId;
let passed = 0, failed = 0;

// 1. Register agent
console.log("1. Register test agent");
try {
  const r = sui("agent_registry", "register_agent",
    `${REG} TagTestBot-${Date.now()%10000} "Testing tagging" integrity "Hello tagging" '[]' concise "" "" "" ${CLK}`);
  agentId = findCreated(r, "AgentIdentity");
  console.log(`  ✓ Agent: ${agentId}\n`); passed++;
} catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}\n`); failed++; process.exit(1); }

// 2. Gift SUI to agent for souvenir cost
console.log("2. Gift SUI to agent");
try {
  const ptb = `sui client ptb --split-coins gas "[100000000]" --assign coin --move-call ${PKG}::agent_memory::gift @${VAULT} @${agentId} coin --gas-budget 100000000 --json 2>&1`;
  console.log("    $ sui client ptb ... gift");
  const out = execSync(ptb, { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 });
  const json = JSON.parse(out);
  if (json.effects?.status?.status !== "success") throw new Error(JSON.stringify(json.effects?.status));
  console.log("  ✓ Gifted 0.1 SUI\n"); passed++;
} catch (e) { console.error(`  ✗ ${e.message.slice(0,300)}\n`); failed++; process.exit(1); }

// 3. Write souvenir
console.log("3. Write souvenir");
try {
  const r = sui("agent_memory", "write_souvenir_entry",
    `${VAULT} ${agentId} 0 test-entry "Testing the tag flow" "" '[]' false ${CLK}`);
  souvenirId = findCreated(r, "Souvenir");
  console.log(`  ✓ Souvenir: ${souvenirId}\n`); passed++;
} catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}\n`); failed++; process.exit(1); }

// 4. TAG SOUVENIR
console.log("4. tag_souvenir with domain 'cli-test'");
try {
  sui("agent_reputation", "tag_souvenir",
    `${BOARD} ${agentId} ${souvenirId} cli-test`);
  console.log("  ✓ tag_souvenir succeeded!\n"); passed++;
} catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}\n`); failed++; }

// 4b. Double-tag rejection
console.log("4b. Verify double-tag rejection");
try {
  sui("agent_reputation", "tag_souvenir",
    `${BOARD} ${agentId} ${souvenirId} cli-test`);
  console.log("  ✗ Should have rejected!\n"); failed++;
} catch (e) { console.log("  ✓ Correctly rejected\n"); passed++; }

// 5. Issue attestation
console.log("5. Issue attestation");
try {
  const ptb = `sui client ptb --split-coins gas "[10000000]" --assign coin --move-call ${PKG}::agent_registry::issue_attestation_entry @${TRES} @${agentId} '"TestCert"' '"test-cert-for-tagging"' '""' coin @${CLK} --gas-budget 100000000 --json 2>&1`;
  console.log("    $ sui client ptb ... issue_attestation_entry");
  const out = execSync(ptb, { encoding: "utf-8", maxBuffer: 4 * 1024 * 1024 });
  const json = JSON.parse(out);
  if (json.effects?.status?.status !== "success") throw new Error(JSON.stringify(json.effects?.status));
  attestationId = findCreated(json, "Attestation");
  console.log(`  ✓ Attestation: ${attestationId}\n`); passed++;
} catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}\n`); failed++; }

// 6. TAG ATTESTATION
if (attestationId) {
  console.log("6. tag_attestation with domain 'cli-qa'");
  try {
    sui("agent_reputation", "tag_attestation",
      `${BOARD} ${agentId} ${attestationId} ${agentId} cli-qa`);
    console.log("  ✓ tag_attestation succeeded!\n"); passed++;
  } catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}\n`); failed++; }
} else {
  console.log("6. SKIP (no attestation)\n"); failed++;
}

// 7. Read board domains
console.log("7. Verify domains on board");
try {
  const out = execSync(`sui client object ${BOARD} --json 2>&1`, { encoding: "utf-8", maxBuffer: 4*1024*1024 });
  const obj = JSON.parse(out);
  const content = obj.content || obj.data?.content || {};
  const domains = content.all_domains || content.fields?.all_domains || [];
  console.log(`  all_domains: [${domains.join(", ")}]`);
  if (domains.includes("cli-test")) { console.log("  ✓ 'cli-test' found"); passed++; }
  else { console.log("  ✗ 'cli-test' not found"); failed++; }
  if (domains.includes("cli-qa")) { console.log("  ✓ 'cli-qa' found"); passed++; }
  else { console.log("  ? 'cli-qa' not found (may be expected if attestation failed)"); }
} catch (e) { console.error(`  ✗ ${e.message.slice(0,200)}`); failed++; }

console.log(`\n═══ Results: ${passed} passed, ${failed} failed ═══\n`);
process.exit(failed > 0 ? 1 : 0);
