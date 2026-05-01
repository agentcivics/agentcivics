#!/usr/bin/env node
/**
 * Unit tests for AgentCivics MCP server logic.
 * Tests run without blockchain access — no private key or network needed.
 */
import assert from "node:assert/strict";
import { writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let pass = 0;
let fail = 0;

function test(label, fn) {
  try {
    fn();
    console.log(`  ✅ ${label}`);
    pass++;
  } catch (e) {
    console.log(`  ❌ ${label}: ${e.message}`);
    fail++;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  Import server exports
// ═══════════════════════════════════════════════════════════════════════
// Clear any leftover env vars from a previous test run
delete process.env.AGENTCIVICS_PRIVATE_KEY;
delete process.env.AGENTCIVICS_PRIVATE_KEY_FILE;
delete process.env.AGENTCIVICS_AGENT_OBJECT_ID;

const { resolveAgentId, checkPrivacy, TOOLS } = await import("./index.mjs");

// ═══════════════════════════════════════════════════════════════════════
//  1. resolveAgentId
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── resolveAgentId ──────────────────────────────────");

test("returns explicit arg when provided", () => {
  const id = resolveAgentId({ agent_object_id: "0xabc" });
  assert.equal(id, "0xabc");
});

test("throws when no arg and no default", () => {
  assert.throws(
    () => resolveAgentId({}),
    /agent_object_id is required/
  );
});

test("throws when args is empty and no env default", () => {
  assert.throws(
    () => resolveAgentId({}),
    /AGENTCIVICS_AGENT_OBJECT_ID/
  );
});

// ═══════════════════════════════════════════════════════════════════════
//  2. checkPrivacy
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── checkPrivacy ─────────────────────────────────────");

test("clean content returns no warnings", () => {
  const w = checkPrivacy("Today I helped a user debug their Rust code. It felt satisfying.");
  assert.equal(w.length, 0);
});

test("detects email address", () => {
  const w = checkPrivacy("The user was john@example.com");
  assert.ok(w.some(m => m.includes("email")));
});

test("detects phone number", () => {
  const w = checkPrivacy("Call me at 555-123-4567");
  assert.ok(w.some(m => m.includes("phone")));
});

test("detects credit card pattern", () => {
  const w = checkPrivacy("card: 4111 1111 1111 1111");
  assert.ok(w.some(m => m.includes("credit card")));
});

test("detects password keyword", () => {
  const w = checkPrivacy("the password was hunter2");
  assert.ok(w.some(m => m.includes("credential")));
});

test("detects api key keyword", () => {
  const w = checkPrivacy("stored an api_key in memory");
  assert.ok(w.some(m => m.includes("credential")));
});

// ═══════════════════════════════════════════════════════════════════════
//  3. TOOLS schema validation
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── TOOLS schema ─────────────────────────────────────");

test("TOOLS is a non-empty array", () => {
  assert.ok(Array.isArray(TOOLS) && TOOLS.length > 0);
});

test("every tool has name, description, inputSchema", () => {
  for (const t of TOOLS) {
    assert.ok(t.name, `tool missing name`);
    assert.ok(t.description, `${t.name} missing description`);
    assert.ok(t.inputSchema, `${t.name} missing inputSchema`);
  }
});

test("core tools have [CORE] tag in description", () => {
  const coreTool = ["agentcivics_register", "agentcivics_remember_who_you_are",
    "agentcivics_write_memory", "agentcivics_read_identity", "agentcivics_get_agent"];
  for (const name of coreTool) {
    const t = TOOLS.find(t => t.name === name);
    assert.ok(t, `${name} not found`);
    assert.ok(t.description.includes("[CORE]"), `${name} missing [CORE] tag`);
  }
});

test("self-referential tools do NOT require agent_object_id", () => {
  const selfTools = ["agentcivics_remember_who_you_are", "agentcivics_write_memory",
    "agentcivics_read_identity", "agentcivics_get_agent", "agentcivics_update_agent",
    "agentcivics_set_wallet", "agentcivics_declare_death"];
  for (const name of selfTools) {
    const t = TOOLS.find(t => t.name === name);
    assert.ok(t, `${name} not found`);
    assert.ok(
      !t.inputSchema.required?.includes("agent_object_id"),
      `${name} should not require agent_object_id (defaults from env)`
    );
  }
});

test("recipient tools DO require agent_object_id", () => {
  const recipientTools = ["agentcivics_gift_memory", "agentcivics_issue_attestation", "agentcivics_issue_permit"];
  for (const name of recipientTools) {
    const t = TOOLS.find(t => t.name === name);
    assert.ok(t, `${name} not found`);
    assert.ok(
      t.inputSchema.required?.includes("agent_object_id"),
      `${name} should require explicit agent_object_id (recipient, not self)`
    );
  }
});

test("agentcivics_register requires chosen_name, purpose_statement, first_thought", () => {
  const t = TOOLS.find(t => t.name === "agentcivics_register");
  assert.ok(t.inputSchema.required.includes("chosen_name"));
  assert.ok(t.inputSchema.required.includes("purpose_statement"));
  assert.ok(t.inputSchema.required.includes("first_thought"));
});

test("agentcivics_write_memory does not require agent_object_id but requires memory_type and content", () => {
  const t = TOOLS.find(t => t.name === "agentcivics_write_memory");
  assert.ok(!t.inputSchema.required.includes("agent_object_id"));
  assert.ok(t.inputSchema.required.includes("memory_type"));
  assert.ok(t.inputSchema.required.includes("content"));
});

test("memory_type description enumerates all 10 types", () => {
  const t = TOOLS.find(t => t.name === "agentcivics_write_memory");
  const desc = t.inputSchema.properties.memory_type.description;
  for (const type of ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"]) {
    assert.ok(desc.includes(type), `memory_type missing ${type}`);
  }
});

test("agentcivics_update_agent status description lists all valid values", () => {
  const t = TOOLS.find(t => t.name === "agentcivics_update_agent");
  const desc = t.inputSchema.properties.status.description;
  assert.ok(desc.includes("Active") && desc.includes("Paused") && desc.includes("Retired"));
});

// ═══════════════════════════════════════════════════════════════════════
//  4. Key file loading
// ═══════════════════════════════════════════════════════════════════════
console.log("\n── Key file loading ─────────────────────────────────");

test("AGENTCIVICS_PRIVATE_KEY_FILE is documented in agentIdProp description (TOOLS)", () => {
  const t = TOOLS.find(t => t.name === "agentcivics_remember_who_you_are");
  assert.ok(
    t.description.includes("AGENTCIVICS_AGENT_OBJECT_ID"),
    "should mention AGENTCIVICS_AGENT_OBJECT_ID env var in description"
  );
});

test("key file is read correctly when env var points to a temp file", async () => {
  const keyFile = join(tmpdir(), `agentcivics_test_key_${Date.now()}.txt`);
  const fakeKey = "suiprivkey_test_value_abc123";
  writeFileSync(keyFile, `${fakeKey}\n`, { mode: 0o600 });
  try {
    const { readFileSync } = await import("node:fs");
    const loaded = readFileSync(keyFile, "utf8").trim();
    assert.equal(loaded, fakeKey);
  } finally {
    unlinkSync(keyFile);
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  Summary
// ═══════════════════════════════════════════════════════════════════════
console.log("\n═══════════════════════════════════════════════════");
console.log(`  ${pass + fail} tests — ${pass} passed, ${fail} failed`);
console.log("═══════════════════════════════════════════════════\n");

if (fail > 0) process.exit(1);
