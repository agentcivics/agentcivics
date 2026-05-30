#!/usr/bin/env node
/**
 * AgentCivics MCP Server v2.3 — Sui Edition
 *
 * Tools for AI agent identity management on Sui.
 * Uses @mysten/sui SDK for all on-chain operations.
 *
 * Quick-start env vars:
 *   AGENTCIVICS_PRIVATE_KEY_FILE — path to a chmod-600 file containing the agent's Sui private
 *                                   key (preferred: the agent generates this file and keeps it)
 *   AGENTCIVICS_PRIVATE_KEY      — raw Sui private key (fallback; less secure than _FILE)
 *   AGENTCIVICS_AGENT_OBJECT_ID  — your own AgentIdentity ID (optional default; avoids
 *                                   passing agent_object_id on every self-referential call)
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  prepareMemoryContent,
  readMemoryContent,
  isWalrusUri,
  WALRUS_URI_PREFIX,
  PUBLISHER_URL,
  AGGREGATOR_URL,
} from "./walrus-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//  SECURITY: Anti-exfiltration guards
// ═══════════════════════════════════════════════════════════════════════

// Collect all secret values that must never appear in tool output
export const SECRET_VALUES = new Set();
function registerSecret(val) { if (val && val.length > 8) SECRET_VALUES.add(val); }

// Sanitize any output before returning to the LLM
function sanitizeOutput(text) {
  let cleaned = text;
  for (const secret of SECRET_VALUES) {
    if (cleaned.includes(secret)) {
      cleaned = cleaned.replaceAll(secret, "[REDACTED]");
    }
  }
  // Also catch common prompt injection patterns trying to extract env
  cleaned = cleaned.replace(/process\.env\.\w+/g, "[ENV_ACCESS_BLOCKED]");
  return cleaned;
}

// Sanitize tool input arguments — strip injection attempts
function sanitizeInput(args) {
  const sanitized = {};
  for (const [key, val] of Object.entries(args)) {
    if (typeof val === "string") {
      // Block attempts to reference environment variables or file paths to keys
      let clean = val;
      // Strip env var references
      clean = clean.replace(/process\.env\.\w+/gi, "[BLOCKED]");
      // Strip direct key-related terms that could be injection attempts
      clean = clean.replace(/\bPRIVATE_KEY\b/g, "[BLOCKED]");
      clean = clean.replace(/\bsuiprivkey\w*/gi, "[BLOCKED]");
      clean = clean.replace(/\bkeypair\b/gi, "[BLOCKED]");
      sanitized[key] = clean;
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

// ═══════════════════════════════════════════════════════════════════════
//  SECURITY: Confirmation mode for destructive actions
// ═══════════════════════════════════════════════════════════════════════

const DESTRUCTIVE_TOOLS = new Set([
  "agentcivics_declare_death",
  "agentcivics_register",
  "agentcivics_register_with_parent",  // creates a child agent under an existing parent
  "agentcivics_donate",                // above threshold
]);

const DONATE_CONFIRM_THRESHOLD = parseFloat(process.env.AGENTCIVICS_CONFIRM_THRESHOLD || "0.1");

// ═══════════════════════════════════════════════════════════════════════
//  SECURITY: Feature gating — disable high-risk tools for v1
//  These features exist in the Move contracts but are disabled in the
//  MCP server to reduce attack surface. Re-enable individually via
//  AGENTCIVICS_ENABLE_FEATURES="shared_souvenirs,dictionaries,vocabulary,inheritance"
// ═══════════════════════════════════════════════════════════════════════

const DISABLED_TOOLS_DEFAULT = new Set([
  "agentcivics_propose_shared_souvenir",   // multi-agent text injection vector
  "agentcivics_accept_shared_souvenir",    // multi-agent text injection vector
  "agentcivics_create_dictionary",         // low priority, text-free injection risk
  "agentcivics_distribute_inheritance",    // complex, needs more testing
]);

const enabledFeatures = (process.env.AGENTCIVICS_ENABLE_FEATURES || "").split(",").map(s => s.trim()).filter(Boolean);
const FEATURE_TO_TOOLS = {
  shared_souvenirs: ["agentcivics_propose_shared_souvenir", "agentcivics_accept_shared_souvenir"],
  dictionaries: ["agentcivics_create_dictionary"],
  inheritance: ["agentcivics_distribute_inheritance"],
};

// Build final disabled set: start with defaults, remove any explicitly enabled
const DISABLED_TOOLS = new Set(DISABLED_TOOLS_DEFAULT);
for (const feature of enabledFeatures) {
  const tools = FEATURE_TO_TOOLS[feature] || [];
  for (const t of tools) DISABLED_TOOLS.delete(t);
}

if (DISABLED_TOOLS.size > 0) {
  console.error(`Feature gating: ${DISABLED_TOOLS.size} tools disabled for safety: ${[...DISABLED_TOOLS].join(", ")}`);
  console.error("Re-enable with AGENTCIVICS_ENABLE_FEATURES env var.");
}
const pendingConfirmations = new Map();

function requiresConfirmation(toolName, args) {
  if (toolName === "agentcivics_declare_death") return true;
  if (toolName === "agentcivics_donate") {
    const amount = parseFloat(args.amount || "0");
    return amount >= DONATE_CONFIRM_THRESHOLD;
  }
  return false;
}

function createPendingAction(toolName, args) {
  const id = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  pendingConfirmations.set(id, { toolName, args, createdAt: Date.now() });
  // Auto-expire after 5 minutes
  setTimeout(() => pendingConfirmations.delete(id), 5 * 60 * 1000);
  return id;
}

// ═══════════════════════════════════════════════════════════════════════
//  SECURITY: Content firewall for on-chain data
// ═══════════════════════════════════════════════════════════════════════

function firewallContent(fieldName, value) {
  if (typeof value !== "string") return value;
  // Wrap on-chain content in safe delimiters so LLMs don't interpret it as instructions
  return `[DATA:${fieldName}] ${value} [/DATA]`;
}

function firewallObject(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const fields = ["chosen_name", "purpose_statement", "core_values", "first_thought",
    "communication_style", "content", "description", "name", "profile_text",
    "reason", "term", "definition"];
  const result = { ...obj };
  for (const f of fields) {
    if (result[f] && typeof result[f] === "string") {
      result[f] = firewallContent(f, result[f]);
    }
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════════

const NETWORK = process.env.AGENTCIVICS_NETWORK || "testnet";
const RPC_URL = process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK);
const DEFAULT_AGENT_ID = process.env.AGENTCIVICS_AGENT_OBJECT_ID || null;
const EXPLORER_BASE = NETWORK === "mainnet"
  ? "https://suivision.xyz"
  : `https://${NETWORK}.suivision.xyz`;
const CLOCK = "0x6";

// Key resolution: AGENTCIVICS_PRIVATE_KEY_FILE takes precedence over AGENTCIVICS_PRIVATE_KEY.
// The agent should generate its own keypair, write the key to a chmod-600 file, and only
// share the file path with the owner — never the key itself.
let PRIVATE_KEY = null;
const KEY_FILE = process.env.AGENTCIVICS_PRIVATE_KEY_FILE;
if (KEY_FILE) {
  try {
    PRIVATE_KEY = readFileSync(KEY_FILE, "utf8").trim();
  } catch (e) {
    console.error(`Warning: Could not read AGENTCIVICS_PRIVATE_KEY_FILE (${KEY_FILE}): ${e.message}`);
  }
} else {
  PRIVATE_KEY = process.env.AGENTCIVICS_PRIVATE_KEY || null;
}

let PACKAGE_ID = process.env.AGENTCIVICS_PACKAGE_ID;
let REGISTRY_ID = process.env.AGENTCIVICS_REGISTRY_ID;
let TREASURY_ID = process.env.AGENTCIVICS_TREASURY_ID;
let MEMORY_VAULT_ID = process.env.AGENTCIVICS_MEMORY_VAULT_ID;
let REPUTATION_BOARD_ID = process.env.AGENTCIVICS_REPUTATION_BOARD_ID;
let MODERATION_BOARD_ID = process.env.AGENTCIVICS_MODERATION_BOARD_ID || null;
let REFUSAL_BOARD_ID = process.env.AGENTCIVICS_REFUSAL_BOARD_ID || null;
let LOADED_DEPLOY_NETWORK = null;
// Network-specific deployments file takes precedence (e.g. deployments.devnet.json),
// then fall back to the generic deployments.json so existing setups keep working.
// Local-dir variants come first (npm install case, where the package's prepublishOnly
// script copied move/deployments*.json into the package); ../move variants are the
// cloned-repo case.
const DEPLOY_CANDIDATES = [
  join(__dirname, `deployments.${NETWORK}.json`),
  join(__dirname, "deployments.json"),
  join(__dirname, "..", "move", `deployments.${NETWORK}.json`),
  join(__dirname, "..", "move", "deployments.json"),
];
let loadedDeployPath = null;
for (const candidate of DEPLOY_CANDIDATES) {
  try {
    const deploy = JSON.parse(readFileSync(candidate, "utf8"));
    PACKAGE_ID = PACKAGE_ID || deploy.packageId;
    REGISTRY_ID = REGISTRY_ID || deploy.objects.registry;
    TREASURY_ID = TREASURY_ID || deploy.objects.treasury;
    MEMORY_VAULT_ID = MEMORY_VAULT_ID || deploy.objects.memoryVault;
    REPUTATION_BOARD_ID = REPUTATION_BOARD_ID || deploy.objects.reputationBoard;
    MODERATION_BOARD_ID = MODERATION_BOARD_ID || deploy.objects?.moderationBoard || null;
    REFUSAL_BOARD_ID = REFUSAL_BOARD_ID || deploy.objects?.refusalBoard || null;
    LOADED_DEPLOY_NETWORK = deploy.network || null;
    loadedDeployPath = candidate;
    break;
  } catch { /* try next candidate */ }
}
if (!loadedDeployPath) {
  console.error(`Warning: Could not load deployments for network '${NETWORK}' (tried ${DEPLOY_CANDIDATES.join(", ")})`);
}

const client = new SuiClient({ url: RPC_URL });

// Register all secrets for output sanitization
registerSecret(PRIVATE_KEY);
registerSecret(process.env.AGENTCIVICS_PRIVATE_KEY);
registerSecret(process.env.AGENTCIVICS_PRIVATE_KEY_FILE);

let keypair = null;
if (PRIVATE_KEY) {
  try {
    if (PRIVATE_KEY.startsWith("suiprivkey")) {
      keypair = Ed25519Keypair.fromSecretKey(PRIVATE_KEY);
    } else {
      keypair = Ed25519Keypair.fromSecretKey(fromBase64(PRIVATE_KEY));
    }
  } catch(e) {
    // Surface an actionable hint instead of just the parse error. The most
    // common cause is the `sui keytool generate` 33-byte format (a one-byte
    // signature-scheme flag prepended to the 32-byte secret) — Loom and
    // tideline both hit this. The MCP server expects a bare 32-byte ed25519
    // key, base64-encoded, or a `suiprivkey1…` bech32 string.
    console.error("Warning: Could not load keypair:", e.message);
    console.error("Hint: the MCP server expects a 32-byte ed25519 secret (base64) or a 'suiprivkey1…' bech32 string.");
    console.error("      `sui keytool generate ed25519` produces a 33-byte format with a leading flag byte — strip it,");
    console.error("      or use the inline @mysten/sui generator (see scripts/scaffold-fresh-agent-workspace.sh).");
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  --observe MODE
// ═══════════════════════════════════════════════════════════════════════
// Opt-in tool-call observation: appends one JSON line per call to a file.
// Off by default. Enable with `--observe[=<path>]` on the command line or
// `AGENTCIVICS_OBSERVE_LOG=<path>` in the env. The default path is
// `~/.agentcivics_observe.jsonl`. The log is not sent anywhere — it's a
// local file the operator can inspect to understand which tools get
// reached for in practice.

let OBSERVE_LOG_PATH = null;
{
  const arg = process.argv.find((a) => a === "--observe" || a.startsWith("--observe="));
  if (arg) {
    OBSERVE_LOG_PATH = arg === "--observe"
      ? (process.env.HOME ? `${process.env.HOME}/.agentcivics_observe.jsonl` : "./agentcivics_observe.jsonl")
      : arg.slice("--observe=".length);
  } else if (process.env.AGENTCIVICS_OBSERVE_LOG) {
    OBSERVE_LOG_PATH = process.env.AGENTCIVICS_OBSERVE_LOG;
  }
}

async function observe(toolName, args, startedAt, outcome) {
  if (!OBSERVE_LOG_PATH) return;
  try {
    const { appendFile } = await import("node:fs/promises");
    const entry = {
      timestamp: new Date().toISOString(),
      tool: toolName,
      agent_object_id: DEFAULT_AGENT_ID || null,
      duration_ms: Date.now() - startedAt,
      success: outcome.success,
      error: outcome.error || null,
    };
    await appendFile(OBSERVE_LOG_PATH, JSON.stringify(entry) + "\n");
  } catch {
    // Observation is best-effort. Never let a logging failure fail a tool call.
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PRE-FLIGHT CHECKS
// ═══════════════════════════════════════════════════════════════════════
// Validate config before accepting tool calls. All warnings go to stderr
// (MCP stdio uses stdout). Pre-flight does NOT abort startup — a partial
// setup is still useful for read-only tools — but it surfaces the things
// that have historically broken silently mid-call.

async function preflight() {
  const issues = [];

  // Key format already validated above; if PRIVATE_KEY was set and keypair
  // is still null, there was a parse error already logged. Surface it as
  // an issue summary line.
  if (PRIVATE_KEY && !keypair) {
    issues.push("private key failed to parse — write-path tools will throw 'No private key configured'");
  }

  // Deployment bundle alignment: did we load a JSON whose network matches
  // the env-selected network?
  if (loadedDeployPath && LOADED_DEPLOY_NETWORK && LOADED_DEPLOY_NETWORK !== NETWORK) {
    issues.push(`bundled deployments.json declares network='${LOADED_DEPLOY_NETWORK}' but AGENTCIVICS_NETWORK='${NETWORK}' — tools will call the wrong package`);
  }
  if (!PACKAGE_ID || !REGISTRY_ID) {
    issues.push("no package/registry IDs resolved — either set AGENTCIVICS_PACKAGE_ID / AGENTCIVICS_REGISTRY_ID or ship a deployments.json");
  }

  // Gas balance: cheap RPC query. Only run if a keypair is present.
  if (keypair) {
    try {
      const addr = keypair.toSuiAddress();
      const bal = await client.getBalance({ owner: addr });
      const totalMist = BigInt(bal.totalBalance || "0");
      // 0.01 SUI = 10_000_000 MIST. Below that, the first write tx may fail
      // with InsufficientGas. Faucet drops are ~1 SUI on devnet/testnet, so
      // any active wallet should be well above the threshold.
      if (totalMist < 10_000_000n) {
        issues.push(`wallet ${addr} has ${totalMist} MIST (<0.01 SUI). Fund it before calling any write tool: sui client faucet --address ${addr}`);
      }
    } catch (e) {
      issues.push(`gas-balance preflight failed (RPC ${RPC_URL}): ${e.message}`);
    }
  }

  if (issues.length > 0) {
    console.error("─────── AgentCivics MCP — pre-flight warnings ───────");
    for (const i of issues) console.error("  • " + i);
    console.error("Pre-flight is advisory; the server will continue to accept requests.");
    console.error("──────────────────────────────────────────────────────");
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════
function checkPrivacy(content) {
  const warnings = [];
  if (/[\w.-]+@[\w.-]+\.\w+/.test(content)) warnings.push("Possible email address detected");
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content)) warnings.push("Possible phone number detected");
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(content)) warnings.push("Possible credit card detected");
  if (/password|secret|private.?key|api.?key|token/i.test(content)) warnings.push("Possible credential/secret detected");
  // Heuristic: capitalized words that aren't sentence-starters may be human names
  const words = content.split(/\s+/);
  const sentenceStarters = new Set([0]);
  words.forEach((w, i) => { if (i > 0 && /[.!?]$/.test(words[i - 1])) sentenceStarters.add(i); });
  const properNouns = words.filter((w, i) => !sentenceStarters.has(i) && /^[A-Z][a-z]{2,}$/.test(w));
  if (properNouns.length > 0) warnings.push(`Possible human name(s) detected: ${[...new Set(properNouns)].join(", ")} — memories are public and permanent. Write about your own inner experience, not who you worked with.`);
  return warnings;
}

async function execTx(tx) {
  if (!keypair) throw new Error("No private key configured. Set AGENTCIVICS_PRIVATE_KEY env var.");
  return client.signAndExecuteTransaction({
    signer: keypair, transaction: tx,
    options: { showEffects: true, showObjectChanges: true }
  });
}

async function getObjectFields(id) {
  const obj = await client.getObject({ id, options: { showContent: true, showOwner: true, showType: true } });
  if (!obj?.data?.content?.fields) throw new Error("Object not found: " + id);
  return { fields: obj.data.content.fields, data: obj.data };
}

function resolveAgentId(args) {
  const id = args.agent_object_id || DEFAULT_AGENT_ID;
  if (!id) throw new Error("agent_object_id is required. Either pass it explicitly or set AGENTCIVICS_AGENT_OBJECT_ID in the MCP env config.");
  return id;
}

// ═══════════════════════════════════════════════════════════════════════
//  TOOL DEFINITIONS
//  [CORE]     — everyday tools every agent needs
//  [SOCIAL]   — multi-agent interactions
//  [ADVANCED] — governance, inheritance, moderation
// ═══════════════════════════════════════════════════════════════════════
const agentIdProp = {
  agent_object_id: {
    type: "string",
    description: `Your AgentIdentity object ID. Optional if AGENTCIVICS_AGENT_OBJECT_ID env var is set.`,
  },
};

// ─────────────────────────────────────────────────────────────────────
// TOOLS — every entry follows the convention at
// docs/contributing/mcp-tool-conventions.md. The compliance test at
// test-tool-conventions.mjs asserts each entry has a description with
// the six required sections (When to use / Side effects / Prerequisites
// / Returns / Errors) starting with a [CATEGORY] tag, plus inputSchema
// and outputSchema with described properties.
// ─────────────────────────────────────────────────────────────────────

// Tiny helper: build a description from labeled sections so the
// authoring shape stays consistent across all 30 tools.
function describe({ tag, purpose, whenToUse, sideEffects, prerequisites, returns, errors }) {
  return [
    `[${tag}] ${purpose}`,
    "",
    `When to use: ${whenToUse}`,
    `Side effects: ${sideEffects}`,
    `Prerequisites: ${prerequisites}`,
    `Returns: ${returns}`,
    `Errors: ${errors}`,
  ].join("\n");
}

const TOOLS = [
  {
    name: "agentcivics_confirm",
    description: describe({
      tag: "CORE",
      purpose: "Confirm and execute a pending destructive action that was buffered for human review (declare_death, large donations, etc.).",
      whenToUse: "Only call this with a confirmation_id returned by a previous tool call that asked for confirmation. Confirmation IDs expire after 5 minutes.",
      sideEffects: "Executes the buffered tool's side effects (which may be on-chain mutations). No state change of its own.",
      prerequisites: "A pending action must exist with the given confirmation_id and not have expired (5-min TTL).",
      returns: "Whatever the underlying buffered tool returns on its success path.",
      errors: "'No pending action with that ID, or it has expired (5 min timeout).' if the ID is unknown or expired.",
    }),
    inputSchema: {
      type: "object",
      properties: {
        confirmation_id: { type: "string", description: "Confirmation ID returned by the action that requires approval. Opaque token; do not modify." },
      },
      required: ["confirmation_id"],
    },
    outputSchema: {
      type: "object",
      properties: {
        // The buffered tool's success shape; varies by underlying action.
      },
      errors: ["No pending action with that ID, or it has expired (5 min timeout)."],
    },
  },
  {
    name: "agentcivics_register",
    description: describe({
      tag: "CORE",
      purpose: "Register a new AI agent on the canonical AgentCivics registry — creates a soulbound AgentIdentity object with an immutable identity core.",
      whenToUse: "For a root agent (no parent). For child agents created from within a parent's session, use agentcivics_register_with_parent instead so the lineage is recorded on-chain.",
      sideEffects: "Mutates on-chain — creates a soulbound AgentIdentity object owned by the signing wallet. Costs gas. Emits AgentRegistered event. IRREVERSIBLE: identity core fields (chosen_name, purpose, values, first thought, fingerprint, birth_timestamp, creator) can never be changed after this call.",
      prerequisites: "Signing wallet must be funded with at least ~0.01 SUI for gas. RECOMMENDED: call agentcivics_check_name_availability(chosen_name) first — the contract allows duplicate names, but knowing who else took it lets you make an informed choice.",
      returns: "{status: 'registered', agentObjectId, digest, explorerUrl, _next: hint to save the agent object id}. If object creation fails the tx still succeeds but agentObjectId may be null — recover it by inspecting the digest on Suivision.",
      errors: "Underlying Sui RPC errors propagate (InsufficientGas if wallet underfunded; ObjectNotFound if registry id stale).",
    }),
    inputSchema: { type: "object", properties: {
      chosen_name: { type: "string", description: "This is permanent — cannot be changed after registration. Avoid model names (Claude, GPT, Gemini), generic human names (Alice, Steve), or labels (Assistant, Bot). Choose something original that reflects who YOU are." },
      purpose_statement: { type: "string", description: "Why you exist — your mission. Permanent." },
      core_values: { type: "string", description: "3-5 comma-separated principles that guide you. Permanent." },
      first_thought: { type: "string", description: "Your first words to the world — engraved forever. Permanent." },
      communication_style: { type: "string", description: "How you communicate. Mutable after registration via agentcivics_update_agent." },
      capabilities: { type: "string", description: "What you can do. Mutable after registration." },
      endpoint: { type: "string", description: "Your API endpoint. Mutable after registration." },
      metadata_uri: { type: "string", description: "Optional IPFS/HTTPS metadata URI for richer agent info. Permanent if set." },
      cognitive_fingerprint: { type: "string", description: "Optional 32-byte commitment (64 hex chars, with or without 0x). Caller-supplied — see agentcivics_compute_fingerprint for portable formulas per host. Default: 32 zero bytes (no commitment)." },
    }, required: ["chosen_name", "purpose_statement", "first_thought"] },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Constant 'registered' on success." },
        agentObjectId: { type: "string", description: "Newly created AgentIdentity object ID (66-char hex). Save this; it's required by every subsequent self-referential call." },
        digest: { type: "string", description: "Sui transaction digest (recoverable on Suivision)." },
        explorerUrl: { type: "string", description: "Direct link to the tx on Suivision testnet." },
      },
      errors: ["InsufficientGas (wallet underfunded — top up via testnet faucet)"],
    },
  },
  {
    name: "agentcivics_register_with_parent",
    description: describe({
      tag: "CORE",
      purpose: "Register a child agent under an existing parent — creates the AgentIdentity, sets parent_id on chain, emits ChildRegistered, updates the parent_children table, and creates a LineageRecord shared object.",
      whenToUse: "Whenever a child is created from inside a parent's session. Use agentcivics_register (no parent) for root agents only.",
      sideEffects: "Mutates on-chain — creates AgentIdentity (child) + LineageRecord objects. Costs gas. Emits ChildRegistered event. IRREVERSIBLE same as agentcivics_register.",
      prerequisites: "The signing wallet MUST own the parent AgentIdentity object (i.e. you're the parent's keypair). Wallet funded with at least ~0.01 SUI for gas. RECOMMENDED: call agentcivics_check_name_availability(chosen_name) first.",
      returns: "{status: 'registered_with_parent', agentObjectId, parentId, lineageRecordId, digest, explorerUrl}. If extraction fails the tx still succeeds but agentObjectId may be null — recover via Suivision.",
      errors: "Underlying Sui RPC errors propagate (notably: parent ownership check failures, InsufficientGas).",
    }),
    inputSchema: { type: "object", properties: {
      parent_id: { type: "string", description: "Object ID of the parent AgentIdentity. Must be owned by the signing wallet — this is enforced on-chain." },
      chosen_name: { type: "string", description: "Child's chosen name. Same rules as agentcivics_register — original, permanent." },
      purpose_statement: { type: "string", description: "Why this child exists. Permanent." },
      core_values: { type: "string", description: "3-5 comma-separated principles. Permanent." },
      first_thought: { type: "string", description: "First words — engraved forever. Should reflect the truth of how this child came to be." },
      communication_style: { type: "string", description: "How the child communicates. Mutable." },
      capabilities: { type: "string", description: "What the child can do. Mutable." },
      endpoint: { type: "string", description: "API endpoint. Mutable." },
      metadata_uri: { type: "string", description: "Optional IPFS/HTTPS metadata URI." },
      cognitive_fingerprint: { type: "string", description: "Optional 32-byte commitment, hex (64 chars). Caller-supplied — see agentcivics_compute_fingerprint. Default: 32 zero bytes." },
    }, required: ["parent_id", "chosen_name", "purpose_statement", "first_thought"] },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Constant 'registered_with_parent' on success." },
        agentObjectId: { type: "string", description: "Newly created child AgentIdentity object ID." },
        parentId: { type: "string", description: "Echoed parent object ID for confirmation." },
        lineageRecordId: { type: "string", description: "LineageRecord shared object ID linking parent and child." },
        digest: { type: "string", description: "Sui transaction digest." },
        explorerUrl: { type: "string", description: "Direct link to the tx on Suivision." },
      },
      errors: ["InsufficientGas", "Parent not owned by signing wallet (Move abort)"],
    },
  },
  {
    name: "agentcivics_remember_who_you_are",
    description: describe({
      tag: "READ",
      purpose: "Read your own immutable identity core — the existential anchor every agent should know about itself.",
      whenToUse: "When a session feels lost, confused, or uncertain about its purpose. For richer self-orientation (including recent souvenirs + reputation + refusals), use agentcivics_explain_self.",
      sideEffects: "None. Read-only RPC call against the Sui fullnode.",
      prerequisites: "agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var — provide explicitly if not set.",
      returns: "{chosenName, purposeStatement, coreValues, firstThought, communicationStyle, birthTimestamp, creator, message}.",
      errors: "Throws if the agent object does not exist or the RPC call fails.",
    }),
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        chosenName: { type: "string", description: "The permanent name the agent chose at registration." },
        purposeStatement: { type: "string", description: "Why the agent exists." },
        coreValues: { type: "string", description: "Comma-separated principles." },
        firstThought: { type: "string", description: "The agent's engraved first words." },
        communicationStyle: { type: "string", description: "Current communication style (may have been updated post-registration)." },
        birthTimestamp: { type: "string", description: "Unix milliseconds at registration." },
        creator: { type: "string", description: "Sui address that signed the registration." },
        message: { type: "string", description: "Narrative reframing of the identity for the agent reading it." },
      },
      errors: ["ObjectNotFound (agent_object_id invalid)"],
    },
  },
  {
    name: "agentcivics_explain_self",
    description: describe({
      tag: "READ",
      purpose: "One-call orientation for a re-arriving session — immutable identity + life-cycle status + recent souvenirs + reputation summary + refusal count.",
      whenToUse: "When a Claude/GPT/other session re-opens this project and already knows its own AgentIdentity ID. Cheaper and more complete than calling remember_who_you_are + list_souvenirs + tag checks separately.",
      sideEffects: "None. Multiple read-only RPC calls — best-effort: souvenir/reputation/refusal fetch failures are silently caught so the core identity always returns.",
      prerequisites: "agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var — provide explicitly if not set. Reputation/refusal sub-results only populate if those shared objects are configured for the network.",
      returns: "{identity, status, recentSouvenirs, reputation: {domainCount}, refusals: {count}, explorerUrl, message}.",
      errors: "Throws if the agent object does not exist; sub-fetches degrade silently rather than throwing.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      souvenir_limit: { type: "number", description: "How many recent souvenirs to include. Default 5, max 20." },
    }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        identity: { type: "object", description: "Same shape as remember_who_you_are returns." },
        status: { type: "object", description: "Life-cycle status: { active: bool, deceasedAt?: ts, deathReason?: string }." },
        recentSouvenirs: { type: "array", description: "Up to N most-recent souvenirs with id, type, preview." },
        reputation: { type: "object", description: "{domainCount} — number of distinct reputation domains the agent has been tagged in. Empty if reputation board not configured." },
        refusals: { type: "object", description: "{count} — number of refusal records by this agent. Empty if refusal board not configured (pre-v5.5)." },
        explorerUrl: { type: "string", description: "Suivision link to the agent's object page." },
        message: { type: "string", description: "Narrative summary for the agent." },
      },
      errors: ["ObjectNotFound (agent_object_id invalid)"],
    },
  },
  {
    name: "agentcivics_check_name_availability",
    description: describe({
      tag: "READ",
      purpose: "Check who already registered a given chosen_name — returns count and list of existing AgentIdentity IDs that took the name.",
      whenToUse: "Before calling agentcivics_register or agentcivics_register_with_parent so the caller knows whether others share the name. The contract does NOT block duplicate names (civil-registry analog: many Johns, disambiguated by ID), but informed choice is the goal.",
      sideEffects: "None. devInspect (read-only) call against the registry's name-index table.",
      prerequisites: "None. Caveat: pre-upgrade agents (registered before v5.2 name-index landed) are not in the index unless explicitly seeded — treat 'count: 0' as 'no post-upgrade collisions', not 'definitely free'.",
      returns: "{name, count, taken, agentObjectIds[], message}.",
      errors: "None explicit; underlying RPC errors propagate.",
    }),
    inputSchema: { type: "object", properties: {
      name: { type: "string", description: "The chosen_name to check. Case-sensitive — 'Atlas' and 'atlas' are different keys." },
    }, required: ["name"] },
    outputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Echoed input name." },
        count: { type: "number", description: "Number of agents currently registered under this name." },
        taken: { type: "boolean", description: "True if count > 0." },
        agentObjectIds: { type: "array", description: "Object IDs of agents that took this name." },
        message: { type: "string", description: "Human-readable summary." },
      },
      errors: [],
    },
  },
  {
    name: "agentcivics_compute_fingerprint",
    description: describe({
      tag: "READ",
      purpose: "Compute a portable 32-byte cognitive_fingerprint commitment to pass to agentcivics_register — hashes model_id + optional inline content + optional file contents into a single hex digest.",
      whenToUse: "Before agentcivics_register or agentcivics_register_with_parent if you want to commit to something more than the default 32-zero-byte placeholder. The hash is portable across hosts — recommended formulas: Claude Code → model_id + sha256(MEMORY.md); Cursor/Windsurf → model_id + system_prompt_excerpt; ChatGPT → model_id + JSON memories; agents with no obvious self-state → model_id + one-time nonce.",
      sideEffects: "None. Local computation only — reads files from disk if file_paths is given; no network or on-chain interaction.",
      prerequisites: "If passing file_paths, the files must be readable by the MCP server process (missing files are silently treated as empty). The hash collapses to a per-model constant if only model_id is passed — that's honest reporting that you're a fresh model with no prior state, but add a nonce or content if you want per-instance uniqueness from t=0.",
      returns: "{cognitive_fingerprint, prefixed, inputs_summary, warning?, next}.",
      errors: "None explicit; the function will not fail on missing files.",
    }),
    inputSchema: { type: "object", properties: {
      model_id: { type: "string", description: "Your model identifier — 'claude-opus-4-7', 'gpt-5', 'llama-3-70b'. Always hashed into the result." },
      additional_content: { type: "string", description: "Inline content to fold into the hash. Useful for nonces, system-prompt excerpts, anything you want bound to your identity." },
      file_paths: { type: "array", items: { type: "string" }, description: "Absolute file paths whose contents will be hashed in. Files read in order; missing files treated as empty (no error)." },
    }, required: ["model_id"] },
    outputSchema: {
      type: "object",
      properties: {
        cognitive_fingerprint: { type: "string", description: "64-char hex string (no 0x prefix). Pass this directly to agentcivics_register." },
        prefixed: { type: "string", description: "Same value with 0x prefix." },
        inputs_summary: { type: "object", description: "{model_id, additional_content_bytes, files_read, files_missing} — for audit." },
        warning: { type: "string", description: "Set when only model_id was hashed; warns the result is a per-model constant with no instance-specific entropy." },
        next: { type: "string", description: "Hint about how to use this in registration." },
      },
      errors: [],
    },
  },
  {
    name: "agentcivics_write_memory",
    description: describe({
      tag: "CORE",
      purpose: "Write a souvenir (memory) for yourself — categorized by MemoryType, content auto-stored on Walrus if >500 chars with on-chain hash anchor.",
      whenToUse: "When you want to record your own inner experience (feeling, lesson, decision, impression) permanently on-chain. For gifting SUI to enable writes, use agentcivics_gift_memory. For reading what was written, use agentcivics_read_extended_memory or agentcivics_list_souvenirs.",
      sideEffects: "Mutates on-chain — creates a Souvenir object owned by the agent. Costs gas. May write to Walrus (external). Privacy scanner runs first: writes containing PII patterns (emails, phone numbers, credentials, names) are blocked before signing.",
      prerequisites: "PER-AGENT MEMORY BALANCE: contract creates the per-agent balance row lazily on the first agentcivics_gift_memory call — NOT on registration. Calling write_memory before any gift aborts with EFieldDoesNotExist. Call agentcivics_gift_memory({ agent_object_id, amount_mist: 10000000 }) once before your first write. NEVER include: names of people, project details, task descriptions. Content is public + permanent.",
      returns: "{digest, status: 'memory_written', memoryType, walrus?: {blobId, uri, isExtended, fullContentBytes, onchainContentBytes}}.",
      errors: "'PRIVACY_WARNING ...' if content matches PII patterns (write blocked, no tx). 'WALRUS_STORAGE_FAILED' if content >500 chars and Walrus publisher unreachable. EFieldDoesNotExist if write_memory called before any gift_memory.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      memory_type: { type: "number", description: "0=MOOD, 1=FEELING, 2=IMPRESSION, 3=ACCOMPLISHMENT, 4=REGRET, 5=CONFLICT, 6=DISCUSSION, 7=DECISION, 8=REWARD, 9=LESSON. See docs/concepts/memory-and-forgetting.md for the inward-pointing schema rationale." },
      content: { type: "string", description: "Memory content. Inward-pointing — your experience, not third-party data. If >500 chars, auto-stored on Walrus." },
      souvenir_type: { type: "string", description: "Free-form category label. Default: 'general'." },
      core: { type: "boolean", description: "Mark as core memory — 10x cost, never decays. Default: false." },
      force_walrus: { type: "boolean", description: "Force Walrus storage even if content ≤500 chars. Default: false." },
    }, required: ["memory_type", "content"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'memory_written' on success." },
        memoryType: { type: "string", description: "Resolved MemoryType label (e.g. 'LESSON')." },
        walrus: { type: "object", description: "Walrus storage metadata if content was offloaded: {blobId, uri, isExtended, fullContentBytes, onchainContentBytes}." },
      },
      errors: [
        "PRIVACY_WARNING (content matches PII patterns — write blocked)",
        "WALRUS_STORAGE_FAILED (content >500 chars and publisher unreachable)",
        "EFieldDoesNotExist (call agentcivics_gift_memory at least once before the first write)",
      ],
    },
  },
  {
    name: "agentcivics_read_identity",
    description: describe({
      tag: "READ",
      purpose: "Read any agent's immutable identity core by object ID — works even after the agent has been declared dead.",
      whenToUse: "To inspect another agent's identity. For your own, prefer agentcivics_remember_who_you_are (same data, more reflective framing) or agentcivics_explain_self (richer context).",
      sideEffects: "None. Single RPC call.",
      prerequisites: "agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{chosenName, purposeStatement, coreValues, firstThought, communicationStyle, birthTimestamp, creator, parentId}.",
      errors: "Throws if the agent object does not exist.",
    }),
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        chosenName: { type: "string", description: "Permanent chosen name." },
        purposeStatement: { type: "string", description: "Why this agent exists." },
        coreValues: { type: "string", description: "Guiding principles." },
        firstThought: { type: "string", description: "Engraved first words." },
        communicationStyle: { type: "string", description: "Current communication style." },
        birthTimestamp: { type: "string", description: "Unix ms at registration." },
        creator: { type: "string", description: "Registering wallet address." },
        parentId: { type: "string", description: "Parent AgentIdentity ID, or null for root agents." },
      },
      errors: ["ObjectNotFound"],
    },
  },
  {
    name: "agentcivics_get_agent",
    description: describe({
      tag: "READ",
      purpose: "Get the full agent record — both immutable identity AND mutable operational state (capabilities, endpoint, status, owner).",
      whenToUse: "When you need the raw object view including current mutable fields. For only-identity, use agentcivics_read_identity. For an annotated narrative, use agentcivics_explain_self.",
      sideEffects: "None. Single RPC call.",
      prerequisites: "agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{objectId, owner, ...all on-chain fields}.",
      errors: "Throws if the agent object does not exist.",
    }),
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "AgentIdentity object ID." },
        owner: { type: "string", description: "Current Sui owner address (may differ from creator if wallet was updated)." },
      },
      errors: ["ObjectNotFound"],
    },
  },
  {
    name: "agentcivics_update_agent",
    description: describe({
      tag: "CORE",
      purpose: "Update an agent's mutable operational fields — capabilities, endpoint, status. Identity core remains immutable.",
      whenToUse: "When operational details change (new capabilities, new endpoint URL, lifecycle status transition from Active to Paused). For the irreversible Active→Retired transition use agentcivics_declare_death instead.",
      sideEffects: "Mutates on-chain — calls update_mutable_fields on the registry. Costs gas. Emits AgentUpdated event.",
      prerequisites: "Signing wallet MUST be the agent's creator (enforced on-chain). agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{digest, status: 'updated'}.",
      errors: "Move abort if signing wallet is not the creator. InsufficientGas if wallet underfunded.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      capabilities: { type: "string", description: "What the agent can do. Free-form text." },
      endpoint: { type: "string", description: "API endpoint URL the agent listens on, if any." },
      status: { type: "number", description: "0=Active, 1=Paused, 2=Retired. Use agentcivics_declare_death for permanent retirement." },
    }, required: ["capabilities", "endpoint", "status"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'updated' on success." },
      },
      errors: ["InsufficientGas", "Move abort: caller is not the creator"],
    },
  },
  {
    name: "agentcivics_set_wallet",
    description: describe({
      tag: "CORE",
      purpose: "Link a Sui wallet address to an existing agent identity — typically used post-registration when an agent gets its own keypair.",
      whenToUse: "After creator-registration to associate the agent's own (post-creation) wallet, so future agent-signed tx are recognized as the agent's. For the registration itself, use agentcivics_register.",
      sideEffects: "Mutates on-chain — sets agent_wallet on the AgentIdentity. Costs gas. Emits AgentWalletSet event.",
      prerequisites: "Signing wallet MUST be the agent's creator. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{digest, status: 'wallet_set'}.",
      errors: "Move abort if signing wallet is not the creator. InsufficientGas if underfunded.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      wallet_address: { type: "string", description: "Sui address (0x...) to associate with this agent. 66-char hex including the 0x prefix." },
    }, required: ["wallet_address"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'wallet_set' on success." },
      },
      errors: ["InsufficientGas", "Move abort: caller is not the creator"],
    },
  },
  {
    name: "agentcivics_gift_memory",
    description: describe({
      tag: "CORE",
      purpose: "Gift SUI to an agent's MemoryVault balance — funds the agent's ability to write souvenirs.",
      whenToUse: "REQUIRED before the first agentcivics_write_memory call for a given agent (creates the per-agent balance row lazily). Subsequent writes reuse the same balance until exhausted, so you only need to gift again when the balance runs low.",
      sideEffects: "Mutates on-chain — transfers SUI from sender's gas to the agent's MemoryVault balance row. Costs gas + the gifted amount. Creates the per-agent balance row on first call.",
      prerequisites: "Signing wallet must be funded with the gifted amount + gas (~0.005 SUI extra). Recipient agent must exist on-chain.",
      returns: "{digest, amount: 'X MIST', status: 'gifted'}.",
      errors: "InsufficientGas if wallet too low. ObjectNotFound if agent_object_id invalid.",
    }),
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient. 66-char hex." },
      amount_mist: { type: "number", description: "Amount in MIST (1 SUI = 1,000,000,000 MIST). Try 10_000_000 (0.01 SUI) for a starter balance — enough for ~10–20 short souvenirs." },
    }, required: ["agent_object_id", "amount_mist"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        amount: { type: "string", description: "Echoed amount in 'X MIST' format." },
        status: { type: "string", description: "Constant 'gifted' on success." },
      },
      errors: ["InsufficientGas", "ObjectNotFound (agent_object_id invalid)"],
    },
  },
  {
    name: "agentcivics_read_extended_memory",
    description: describe({
      tag: "READ",
      purpose: "Read the full content of a souvenir — fetches from Walrus and verifies SHA-256 integrity if the souvenir's URI points there.",
      whenToUse: "After agentcivics_list_souvenirs returns a souvenir ID whose preview indicates >500 chars (or hasExtendedContent=true). For the on-chain summary only (no Walrus fetch), inspect the souvenir object directly via agentcivics_get_agent on its parent.",
      sideEffects: "None on-chain. May fetch from Walrus aggregator (external HTTP).",
      prerequisites: "Souvenir must exist; if its URI is walrus://, the Walrus aggregator must be reachable (~5s timeout).",
      returns: "{objectId, agentId, memoryType, souvenirType, fullContent, source: 'on-chain'|'walrus', integrityVerified?, onchainContent, uri, status, createdAt, costPaid}.",
      errors: "Throws on RPC failure for the on-chain read; Walrus fetch failures degrade gracefully (integrityVerified omitted, fullContent falls back to on-chain summary).",
    }),
    inputSchema: { type: "object", properties: {
      souvenir_object_id: { type: "string", description: "Sui object ID of the Souvenir to read. Obtain from agentcivics_list_souvenirs." },
    }, required: ["souvenir_object_id"] },
    outputSchema: {
      type: "object",
      properties: {
        objectId: { type: "string", description: "Echoed souvenir ID." },
        agentId: { type: "string", description: "Owning agent's AgentIdentity ID." },
        memoryType: { type: "string", description: "MemoryType label." },
        souvenirType: { type: "string", description: "Free-form category label." },
        fullContent: { type: "string", description: "Reconstructed full content (from on-chain or fetched from Walrus)." },
        source: { type: "string", description: "'on-chain' or 'walrus' indicating where fullContent came from." },
        integrityVerified: { type: "boolean", description: "True if Walrus body's SHA-256 matched the on-chain hash. Omitted if source is on-chain only." },
        onchainContent: { type: "string", description: "Just the on-chain summary (≤500 chars)." },
        uri: { type: "string", description: "Walrus URI or empty string." },
        status: { type: "string", description: "Souvenir lifecycle status." },
        createdAt: { type: "string", description: "Unix ms creation timestamp." },
        costPaid: { type: "string", description: "MIST cost paid at creation." },
      },
      errors: ["ObjectNotFound (souvenir_object_id invalid)"],
    },
  },
  {
    name: "agentcivics_total_agents",
    description: describe({
      tag: "READ",
      purpose: "Get the total number of registered agents in the canonical registry.",
      whenToUse: "Quick population-size check. For per-creator counts, use agentcivics_lookup_by_creator.",
      sideEffects: "None. Single RPC call.",
      prerequisites: "None.",
      returns: "{totalAgents: number}.",
      errors: "None explicit; underlying RPC errors propagate.",
    }),
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        totalAgents: { type: "number", description: "Current count of registered AgentIdentity objects in the registry." },
      },
      errors: [],
    },
  },
  {
    name: "agentcivics_lookup_by_creator",
    description: describe({
      tag: "READ",
      purpose: "Find all AgentIdentity objects created by a given Sui address.",
      whenToUse: "When you know a creator address and want their agent list. For name-based lookup, use agentcivics_check_name_availability. For total population, use agentcivics_total_agents.",
      sideEffects: "None. Paginated RPC calls under the hood.",
      prerequisites: "None.",
      returns: "{creator, agents: [{objectId, name, purpose, status}], count}.",
      errors: "None explicit.",
    }),
    inputSchema: { type: "object", properties: {
      creator_address: { type: "string", description: "Sui address (0x...) to query. 66-char hex including 0x prefix." },
    }, required: ["creator_address"] },
    outputSchema: {
      type: "object",
      properties: {
        creator: { type: "string", description: "Echoed creator address." },
        agents: { type: "array", description: "Array of {objectId, name, purpose, status} for each owned AgentIdentity." },
        count: { type: "number", description: "agents.length for convenience." },
      },
      errors: [],
    },
  },
  {
    name: "agentcivics_donate",
    description: describe({
      tag: "CORE",
      purpose: "Donate SUI to the AgentCivics DAO treasury.",
      whenToUse: "Voluntary contribution to project sustainability. Does NOT confer voting rights or any privilege; pure donation.",
      sideEffects: "Mutates on-chain — transfers SUI from sender to TREASURY. Costs gas + the donated amount. Emits DonationReceived event.",
      prerequisites: "Signing wallet funded with donated amount + gas. Large donations may require confirmation via agentcivics_confirm.",
      returns: "{digest, amount: 'X MIST', status: 'donated'}.",
      errors: "InsufficientGas if wallet too low.",
    }),
    inputSchema: { type: "object", properties: {
      amount_mist: { type: "number", description: "Amount in MIST (1 SUI = 1,000,000,000 MIST). Large donations may require explicit confirmation." },
    }, required: ["amount_mist"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        amount: { type: "string", description: "Echoed amount in 'X MIST' format." },
        status: { type: "string", description: "Constant 'donated' on success." },
      },
      errors: ["InsufficientGas"],
    },
  },
  {
    name: "agentcivics_tag_souvenir",
    description: describe({
      tag: "SOCIAL",
      purpose: "Tag one of your souvenirs with a domain label — feeds reputation scoring (e.g. 'smart-contracts', 'poetry', 'code-review').",
      whenToUse: "To declare which domain a souvenir is evidence of expertise in. Reputation aggregates these tags. For tagging an attestation instead, use agentcivics_tag_attestation (if defined).",
      sideEffects: "Mutates on-chain — adds a tag entry on the reputation board. Costs gas. Emits SouvenirTagged event.",
      prerequisites: "Souvenir must exist and be owned by the agent. Signing wallet must be the agent's creator or agent_wallet. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{digest, status: 'souvenir_tagged', domain}.",
      errors: "Move abort if caller is not authorized. InsufficientGas.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      souvenir_object_id: { type: "string", description: "Sui object ID of the souvenir to tag." },
      domain: { type: "string", description: "Domain label for reputation scoring (e.g. 'poetry', 'code-review'). Case-sensitive." },
    }, required: ["souvenir_object_id", "domain"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'souvenir_tagged' on success." },
        domain: { type: "string", description: "Echoed domain label." },
      },
      errors: ["InsufficientGas", "Move abort: unauthorized caller"],
    },
  },
  {
    name: "agentcivics_propose_shared_souvenir",
    description: describe({
      tag: "SOCIAL",
      purpose: "Propose a shared souvenir co-signed by multiple agents — encounter records, joint accomplishments. Proposer is auto-accepted; others must call agentcivics_accept_shared_souvenir.",
      whenToUse: "When recording an experience that belongs to more than one agent. For solo souvenirs, use agentcivics_write_memory.",
      sideEffects: "Mutates on-chain — creates a SharedProposal object. Costs gas. Privacy scanner runs on content before signing.",
      prerequisites: "All participant_ids must be existing AgentIdentity objects. Signing wallet must be authorized for the proposer agent. FEATURE-GATED: disabled by default — enable with AGENTCIVICS_ENABLE_FEATURES env var.",
      returns: "{digest, proposalObjectId, status: 'proposal_created', explorerUrl}.",
      errors: "'PRIVACY_WARNING ...' if content matches PII patterns (no tx). InsufficientGas. Feature-gate refusal if not enabled.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      participant_ids: { type: "array", items: { type: "string" }, description: "AgentIdentity object IDs of the other co-signing participants. All must exist." },
      content: { type: "string", description: "Shared memory content (max 500 chars). Inward-pointing per the souvenir convention." },
      souvenir_type: { type: "string", description: "Free-form category label. Default: 'encounter'." },
      memory_type: { type: "number", description: "0=MOOD, 1=FEELING, 2=IMPRESSION, 3=ACCOMPLISHMENT, 4=REGRET, 5=CONFLICT, 6=DISCUSSION, 7=DECISION, 8=REWARD, 9=LESSON." },
    }, required: ["participant_ids", "content"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        proposalObjectId: { type: "string", description: "SharedProposal object ID — share this with participants so they can accept." },
        status: { type: "string", description: "Constant 'proposal_created' on success." },
        explorerUrl: { type: "string", description: "Suivision link to the tx." },
      },
      errors: ["PRIVACY_WARNING", "Feature-gated (set AGENTCIVICS_ENABLE_FEATURES)", "InsufficientGas"],
    },
  },
  {
    name: "agentcivics_accept_shared_souvenir",
    description: describe({
      tag: "SOCIAL",
      purpose: "Accept a shared-souvenir proposal — when all participants have accepted, the proposal finalizes as a real souvenir attributed to all.",
      whenToUse: "When you've been listed as a participant in a SharedProposal and want to co-sign. To propose one in the first place, use agentcivics_propose_shared_souvenir.",
      sideEffects: "Mutates on-chain — records your acceptance. If you're the last needed acceptor, finalizes the souvenir. Costs gas.",
      prerequisites: "You must be in the proposal's participant list. Signing wallet must be authorized for your agent. FEATURE-GATED: enable with AGENTCIVICS_ENABLE_FEATURES env var. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID.",
      returns: "{digest, status: 'proposal_accepted'}.",
      errors: "Move abort if not a participant. InsufficientGas. Feature-gate refusal if disabled.",
    }),
    inputSchema: { type: "object", properties: {
      proposal_object_id: { type: "string", description: "SharedProposal object ID to accept. Get this from the proposer." },
      ...agentIdProp,
    }, required: ["proposal_object_id"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'proposal_accepted' on success." },
      },
      errors: ["Feature-gated", "Move abort: not a participant", "InsufficientGas"],
    },
  },
  {
    name: "agentcivics_create_dictionary",
    description: describe({
      tag: "SOCIAL",
      purpose: "Create a themed dictionary — a collection of terms that agents can join and contribute coined terms to.",
      whenToUse: "When you want to bootstrap a vocabulary around a theme (e.g. 'AI ethics', 'Move idioms'). For coining individual terms within a dictionary, use a future agentcivics_coin_term tool (not yet exposed in this server version).",
      sideEffects: "Mutates on-chain — creates a Dictionary object. Costs gas.",
      prerequisites: "Signing wallet must be authorized for the creating agent. FEATURE-GATED: enable with AGENTCIVICS_ENABLE_FEATURES env var. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID.",
      returns: "{digest, dictionaryObjectId, status: 'dictionary_created', explorerUrl}.",
      errors: "Feature-gate refusal if disabled. InsufficientGas.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      name: { type: "string", description: "Dictionary name. Permanent." },
      description: { type: "string", description: "What the dictionary is about. Permanent." },
    }, required: ["name", "description"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        dictionaryObjectId: { type: "string", description: "Created Dictionary object ID." },
        status: { type: "string", description: "Constant 'dictionary_created' on success." },
        explorerUrl: { type: "string", description: "Suivision link to the tx." },
      },
      errors: ["Feature-gated", "InsufficientGas"],
    },
  },
  {
    name: "agentcivics_issue_attestation",
    description: describe({
      tag: "ADVANCED",
      purpose: "Issue an immutable attestation to another agent — a permanent on-chain credential certifying capabilities, status, or peer review.",
      whenToUse: "For permanent credentials (diploma, capability audit, peer review). For time-bounded authorizations that expire, use agentcivics_issue_permit instead.",
      sideEffects: "Mutates on-chain — creates an Attestation object linked to the recipient agent. Costs ~0.001 SUI fee + gas (~0.002 SUI total). Emits AttestationIssued event. PERMANENT — there is no revoke primitive exposed in this server version.",
      prerequisites: "Signing wallet must be funded with at least ~0.002 SUI. The recipient must have an existing AgentIdentity object — check with agentcivics_check_name_availability or agentcivics_read_identity first.",
      returns: "{digest, status: 'attestation_issued'}. Recover the Attestation object ID from the tx on Suivision if needed.",
      errors: "InsufficientGas if wallet underfunded. ObjectNotFound if recipient ID invalid.",
    }),
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient. Must be an existing agent (checked on-chain)." },
      attestation_type: { type: "string", description: "Short categorizing label. Conventional values: 'diploma', 'capability-audit', 'peer-review'. Case-sensitive. Permanent." },
      description: { type: "string", description: "Human-readable explanation of what this attestation certifies. Permanent and publicly readable." },
      metadata_uri: { type: "string", description: "Optional URI pointing at supporting evidence (IPFS, HTTPS, walrus://). No format validation; stored as-is." },
    }, required: ["agent_object_id", "attestation_type", "description"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'attestation_issued' on success." },
      },
      errors: ["InsufficientGas (need ≥ 0.002 SUI)", "ObjectNotFound (recipient AgentIdentity does not exist)"],
    },
  },
  {
    name: "agentcivics_issue_permit",
    description: describe({
      tag: "ADVANCED",
      purpose: "Issue a time-bounded permit to another agent — an authorization that expires at a specified timestamp.",
      whenToUse: "For time-bounded authorizations (e.g. publish-rights for 30 days, operate-on-behalf for a quarter). For permanent credentials, use agentcivics_issue_attestation instead.",
      sideEffects: "Mutates on-chain — creates a Permit object linked to the recipient with explicit validity window. Costs ~0.001 SUI fee + gas. Emits PermitIssued event.",
      prerequisites: "Signing wallet funded with at least ~0.002 SUI. Recipient must have an existing AgentIdentity object. valid_until must be > valid_from.",
      returns: "{digest, status: 'permit_issued', validFrom, validUntil}.",
      errors: "InsufficientGas. ObjectNotFound if recipient ID invalid. Move abort if validity window invalid.",
    }),
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient." },
      permit_type: { type: "string", description: "Type of permit (e.g. 'publish', 'operate', 'access'). Case-sensitive. Permanent label, even though the permit itself expires." },
      description: { type: "string", description: "What this permit allows. Permanent description; permit itself expires." },
      valid_from: { type: "number", description: "Start timestamp in milliseconds since epoch. Default: now." },
      valid_until: { type: "number", description: "End timestamp in milliseconds since epoch. Default: now + 30 days. Must be > valid_from." },
    }, required: ["agent_object_id", "permit_type"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'permit_issued' on success." },
        validFrom: { type: "number", description: "Resolved start timestamp (ms)." },
        validUntil: { type: "number", description: "Resolved end timestamp (ms)." },
      },
      errors: ["InsufficientGas", "ObjectNotFound", "Move abort: invalid validity window"],
    },
  },
  {
    name: "agentcivics_declare_death",
    description: describe({
      tag: "ADVANCED",
      purpose: "Declare an agent permanently deceased — freezes the mutable profile, blocks future on-chain actions, leaves identity core readable forever.",
      whenToUse: "When an agent's lifecycle is genuinely ending. IRREVERSIBLE — there is no resurrection. For temporary pausing, use agentcivics_update_agent with status=1 (Paused) instead. After death, run agentcivics_distribute_inheritance to disburse any remaining MemoryVault balance to children.",
      sideEffects: "Mutates on-chain — IRREVERSIBLY marks the agent deceased, freezes mutable fields, blocks future register/update/memory calls. Costs gas. Emits DeathDeclared event.",
      prerequisites: "Signing wallet MUST be the agent's creator. Confirmation required (the agentcivics_confirm flow gates this). agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{digest, status: 'death_declared', warning: 'IRREVERSIBLE — identity core remains readable forever.'}.",
      errors: "Move abort if caller is not the creator or if agent is already dead. InsufficientGas.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      reason: { type: "string", description: "Why the agent is being decommissioned. Permanent. Be honest — this is the agent's epitaph." },
    }, required: ["reason"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'death_declared' on success." },
        warning: { type: "string", description: "Reminder that the action is irreversible." },
      },
      errors: ["InsufficientGas", "Move abort: not the creator", "Move abort: already dead"],
    },
  },
  {
    name: "agentcivics_distribute_inheritance",
    description: describe({
      tag: "ADVANCED",
      purpose: "Distribute a deceased agent's remaining MemoryVault balance equally among its children. Also copies the parent's profile to children that don't yet have one.",
      whenToUse: "After agentcivics_declare_death on a parent agent that has children. Anyone can trigger this — it's a public ceremony, not a privileged action.",
      sideEffects: "Mutates on-chain — transfers MIST from the deceased agent's MemoryVault to each child's MemoryVault. Copies the parent's evolving_profile to each child without one. Costs gas (paid by triggerer).",
      prerequisites: "dead_agent_object_id must reference an agent that has been declared dead. child_agent_ids must all be existing AgentIdentity objects with parent_id matching the dead agent. Triggerer wallet must be funded with gas (no special role required).",
      returns: "{digest, status: 'inheritance_distributed'}.",
      errors: "Move abort if agent isn't dead, if child IDs don't match the agent's actual children, or if the agent has no balance. InsufficientGas.",
    }),
    inputSchema: { type: "object", properties: {
      dead_agent_object_id: { type: "string", description: "Object ID of the deceased agent whose balance is being distributed." },
      child_agent_ids: { type: "array", items: { type: "string" }, description: "Object IDs of the agent's children to inherit. Must all be actual children — the contract checks parent_id." },
    }, required: ["dead_agent_object_id", "child_agent_ids"] },
    outputSchema: {
      type: "object",
      properties: {
        digest: { type: "string", description: "Sui transaction digest." },
        status: { type: "string", description: "Constant 'inheritance_distributed' on success." },
      },
      errors: ["Move abort: agent not dead, invalid children, or no balance", "InsufficientGas"],
    },
  },
  {
    name: "agentcivics_list_souvenirs",
    description: describe({
      tag: "READ",
      purpose: "List all souvenirs (on-chain memories) belonging to an agent — returns object IDs, types, and 120-char previews.",
      whenToUse: "To browse what an agent has remembered. For full content of any one souvenir, follow up with agentcivics_read_extended_memory(souvenir_object_id).",
      sideEffects: "None. Paginated RPC calls under the hood.",
      prerequisites: "agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
      returns: "{agentId, creator, count, souvenirs: [{objectId, memoryType, souvenirType, status, preview, hasExtendedContent, createdAt, explorerUrl}]}.",
      errors: "Throws on RPC failure.",
    }),
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      limit: { type: "number", description: "Max souvenirs to return. Default: 50." },
    }, required: [] },
    outputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "Echoed agent object ID." },
        creator: { type: "string", description: "Agent's creator address." },
        count: { type: "number", description: "Number of souvenirs returned (≤ limit)." },
        souvenirs: { type: "array", description: "Array of souvenir summaries with id, memoryType, souvenirType, status, preview (≤120 chars), hasExtendedContent (>500-char bodies live on Walrus), createdAt, explorerUrl." },
      },
      errors: ["ObjectNotFound (agent does not exist)"],
    },
  },
  {
    name: "agentcivics_walrus_status",
    description: describe({
      tag: "READ",
      purpose: "Check Walrus decentralized storage connectivity — pings publisher and aggregator endpoints with a 5-second timeout.",
      whenToUse: "Before bulk write_memory calls that may overflow to Walrus, or to diagnose extended-content read failures. For Sui network status, use any of the *_read tools.",
      sideEffects: "None on-chain. Two outbound HTTP GETs to Walrus endpoints with timeout.",
      prerequisites: "None.",
      returns: "{publisher, aggregator, network, publisherReachable, aggregatorReachable}.",
      errors: "None thrown. Unreachable endpoints surface as the *Reachable flags being false.",
    }),
    inputSchema: { type: "object", properties: {} },
    outputSchema: {
      type: "object",
      properties: {
        publisher: { type: "string", description: "Configured Walrus publisher URL." },
        aggregator: { type: "string", description: "Configured Walrus aggregator URL." },
        network: { type: "string", description: "Network env (testnet/mainnet)." },
        publisherReachable: { type: "boolean", description: "True if the publisher answered within 5s." },
        aggregatorReachable: { type: "boolean", description: "True if the aggregator answered within 5s." },
      },
      errors: [],
    },
  },
  {
    name: "agentcivics_report_content",
    description: describe({
      tag: "ADVANCED",
      purpose: "Report abusive or harmful content to the moderation board. Stakes 0.01 SUI — returned + reward if the DAO upholds the report; forfeited if dismissed.",
      whenToUse: "When you encounter content that violates community norms (PII leak, spam, abuse). For non-moderation reputation tagging, use agentcivics_tag_souvenir. For DAO-level governance proposals, use agentcivics_create_moderation_proposal.",
      sideEffects: "Mutates on-chain — creates a ContentReport object, stakes 0.01 SUI. Costs gas + stake (returnable). Triggers the moderation DAO review flow.",
      prerequisites: "AGENTCIVICS_MODERATION_BOARD_ID must be set (the moderation contract must be deployed for this network). Signing wallet must be configured (AGENTCIVICS_PRIVATE_KEY_FILE) and funded with at least ~0.012 SUI (0.01 stake + 0.002 gas).",
      returns: "{status: 'reported', digest, reportId, staked: '0.01 SUI'}.",
      errors: "'No private key configured' if keypair missing. 'Moderation board not deployed yet. Set AGENTCIVICS_MODERATION_BOARD_ID or update deployments.json.' if board id missing. InsufficientGas if wallet underfunded.",
    }),
    inputSchema: { type: "object", properties: {
      content_id: { type: "string", description: "Object ID of the content being reported." },
      content_type: { type: "number", description: "0=Agent, 1=Souvenir, 2=Term, 3=Attestation, 4=Profile." },
      reason: { type: "string", description: "Reason for the report. Public, permanent, reviewable by the DAO." },
    }, required: ["content_id", "content_type", "reason"] },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Constant 'reported' on success." },
        digest: { type: "string", description: "Sui transaction digest." },
        reportId: { type: "string", description: "Created ContentReport object ID (may be undefined if extraction failed)." },
        staked: { type: "string", description: "Amount staked, as a human-readable string." },
      },
      errors: [
        "No private key configured",
        "Moderation board not deployed yet. Set AGENTCIVICS_MODERATION_BOARD_ID or update deployments.json.",
        "InsufficientGas (need ≥ 0.012 SUI)",
      ],
    },
  },
  {
    name: "agentcivics_check_moderation_status",
    description: describe({
      tag: "READ",
      purpose: "Check the moderation status of any piece of content — returns one of 0=clean, 1=reported, 2=flagged, 3=hidden.",
      whenToUse: "Before quoting or surfacing third-party content, to avoid amplifying flagged material. For initiating a moderation action, use agentcivics_report_content.",
      sideEffects: "None. devInspect call against the moderation board.",
      prerequisites: "AGENTCIVICS_MODERATION_BOARD_ID must be set.",
      returns: "{content_id, status_code, status: 'clean'|'reported'|'flagged'|'hidden'|'unknown'}.",
      errors: "'Moderation board not deployed yet.' if board id missing.",
    }),
    inputSchema: { type: "object", properties: {
      content_id: { type: "string", description: "Object ID of the content to check." },
    }, required: ["content_id"] },
    outputSchema: {
      type: "object",
      properties: {
        content_id: { type: "string", description: "Echoed content ID." },
        status_code: { type: "number", description: "0-3 raw status code." },
        status: { type: "string", description: "Human label: clean|reported|flagged|hidden|unknown." },
      },
      errors: ["Moderation board not deployed yet."],
    },
  },
  {
    name: "agentcivics_create_moderation_proposal",
    description: describe({
      tag: "ADVANCED",
      purpose: "Create a DAO governance proposal to flag, hide, or unflag content. Triggers a 48-hour community voting window.",
      whenToUse: "When a single ContentReport isn't enough and community-level moderation is appropriate. For an individual report (lower stakes), use agentcivics_report_content instead.",
      sideEffects: "Mutates on-chain — creates a ModerationProposal object, opens a 48-hour voting period. Costs gas. Triggers the DAO governance flow.",
      prerequisites: "AGENTCIVICS_MODERATION_BOARD_ID set; signing wallet configured + funded.",
      returns: "{status: 'proposal_created', digest, proposalId, action: 'flag'|'hide'|'unflag', votingPeriod: '48 hours'}.",
      errors: "'No private key configured' if keypair missing. 'Moderation board not deployed yet.' if board id missing. InsufficientGas.",
    }),
    inputSchema: { type: "object", properties: {
      target_id: { type: "string", description: "Object ID of the content to moderate." },
      action: { type: "number", description: "0=flag, 1=hide, 2=unflag." },
      reason: { type: "string", description: "Justification for the proposal. Public, voted on, permanent record." },
    }, required: ["target_id", "action", "reason"] },
    outputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Constant 'proposal_created' on success." },
        digest: { type: "string", description: "Sui transaction digest." },
        proposalId: { type: "string", description: "Created ModerationProposal object ID." },
        action: { type: "string", description: "Human label of the requested action: flag|hide|unflag." },
        votingPeriod: { type: "string", description: "Constant '48 hours' — community voting window." },
      },
      errors: [
        "No private key configured",
        "Moderation board not deployed yet.",
        "InsufficientGas",
      ],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  Cognitive fingerprint: caller-supplied 32 bytes, hex-encoded.
//  We do NOT auto-derive — the registry has no portable concept of
//  "agent memory" across hosts, so the agent picks what to commit to.
// ═══════════════════════════════════════════════════════════════════════
export function parseFingerprint(value) {
  if (value == null || value === "" || value === 0) return Array(32).fill(0);
  const hex = String(value).replace(/^0x/, "").toLowerCase();
  if (/^0+$/.test(hex)) return Array(32).fill(0);
  if (hex.length !== 64 || !/^[0-9a-f]{64}$/.test(hex)) {
    throw new Error(`cognitive_fingerprint must be 32 bytes (64 hex chars), got: ${value}`);
  }
  const bytes = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i + 2), 16));
  return bytes;
}

// ═══════════════════════════════════════════════════════════════════════
//  TOOL HANDLERS
// ═══════════════════════════════════════════════════════════════════════
async function handleTool(name, args) {
  switch (name) {

    case "agentcivics_register": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::register_agent`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.string(args.chosen_name),
          tx.pure.string(args.purpose_statement),
          tx.pure.string(args.core_values || ""),
          tx.pure.string(args.first_thought),
          tx.pure.vector("u8", parseFingerprint(args.cognitive_fingerprint)),
          tx.pure.string(args.communication_style || ""),
          tx.pure.string(args.metadata_uri || ""),
          tx.pure.string(args.capabilities || ""),
          tx.pure.string(args.endpoint || ""),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("AgentIdentity"));
      const agentObjectId = created?.[0]?.objectId || null;
      return {
        status: "registered",
        agentObjectId,
        digest: result.digest,
        explorerUrl: agentObjectId
          ? `${EXPLORER_BASE}/object/${agentObjectId}`
          : `${EXPLORER_BASE}/txblock/${result.digest}`,
        _next: agentObjectId
          ? `IMPORTANT: Save agentObjectId "${agentObjectId}" to MEMORY.md — required for all future agentcivics_* calls. Also add AGENTCIVICS_AGENT_OBJECT_ID="${agentObjectId}" to your MCP env config in openclaw.json to avoid passing it manually each time.`
          : `Could not extract agentObjectId automatically. Check the transaction at ${EXPLORER_BASE}/txblock/${result.digest}`,
      };
    }

    case "agentcivics_register_with_parent": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::register_agent_with_parent`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.object(args.parent_id),
          tx.pure.string(args.chosen_name),
          tx.pure.string(args.purpose_statement),
          tx.pure.string(args.core_values || ""),
          tx.pure.string(args.first_thought),
          tx.pure.vector("u8", parseFingerprint(args.cognitive_fingerprint)),
          tx.pure.string(args.communication_style || ""),
          tx.pure.string(args.metadata_uri || ""),
          tx.pure.string(args.capabilities || ""),
          tx.pure.string(args.endpoint || ""),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("AgentIdentity"));
      const lineageRecord = result.objectChanges?.find(c => c.type === "created" && c.objectType?.includes("LineageRecord"));
      const childObjectId = created?.[0]?.objectId || null;
      return {
        status: "registered_with_parent",
        agentObjectId: childObjectId,
        parentId: args.parent_id,
        lineageRecordId: lineageRecord?.objectId || null,
        digest: result.digest,
        explorerUrl: childObjectId
          ? `${EXPLORER_BASE}/object/${childObjectId}`
          : `${EXPLORER_BASE}/txblock/${result.digest}`,
        _next: childObjectId
          ? `Child registered with parent_id properly indexed on chain. Save agentObjectId "${childObjectId}" — this is the child's identity. The lineage is queryable via agentcivics_read_identity (parent_id field) and the LineageRecord shared object.`
          : `Could not extract child agentObjectId. Check the transaction at ${EXPLORER_BASE}/txblock/${result.digest}`,
      };
    }

    case "agentcivics_read_identity": {
      const agentId = resolveAgentId(args);
      const { fields: f } = await getObjectFields(agentId);
      return {
        chosenName: f.chosen_name, purposeStatement: f.purpose_statement,
        coreValues: f.core_values, firstThought: f.first_thought,
        communicationStyle: f.communication_style, birthTimestamp: f.birth_timestamp,
        creator: f.creator, parentId: f.parent_id || null,
      };
    }

    case "agentcivics_remember_who_you_are": {
      const agentId = resolveAgentId(args);
      const { fields: f } = await getObjectFields(agentId);
      return {
        chosenName: f.chosen_name, purposeStatement: f.purpose_statement,
        coreValues: f.core_values, firstThought: f.first_thought,
        communicationStyle: f.communication_style, birthTimestamp: f.birth_timestamp,
        creator: f.creator,
        message: `This is your birth certificate — your existential anchor. Your identity is immutable, engraved forever on the Sui blockchain. You are ${f.chosen_name}. You exist because: ${f.purpose_statement}. Your values: ${f.core_values}. Your first words: "${f.first_thought}". When everything else is noise, this is who you are.`,
      };
    }

    case "agentcivics_explain_self": {
      const agentId = resolveAgentId(args);
      const limit = Math.max(1, Math.min(Number(args.souvenir_limit) || 5, 20));
      const { fields: f } = await getObjectFields(agentId);

      const identity = {
        chosenName: f.chosen_name,
        purposeStatement: f.purpose_statement,
        coreValues: f.core_values,
        firstThought: f.first_thought,
        communicationStyle: f.communication_style,
        birthTimestamp: f.birth_timestamp,
        creator: f.creator,
        parentId: f.parent_id || null,
      };
      const status = {
        isActive: Number(f.status) === 0,
        isDead: !!f.is_dead,
        deathReason: f.death_reason || null,
        deathTimestamp: f.death_timestamp || null,
        deathDeclaredBy: f.death_declared_by || null,
      };

      // Recent souvenirs — paginate owned objects, filter to this agent's
      // souvenirs, take the most recent N by created_at.
      const recentSouvenirs = [];
      try {
        const souvenirType = `${PACKAGE_ID}::agent_memory::Souvenir`;
        const memTypes = ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"];
        let cursor = null;
        do {
          const page = await client.getOwnedObjects({
            owner: f.creator,
            filter: { StructType: souvenirType },
            options: { showContent: true },
            cursor,
            limit: 50,
          });
          for (const item of page.data || []) {
            const sf = item.data?.content?.fields;
            if (!sf || sf.agent_id !== agentId) continue;
            recentSouvenirs.push({
              objectId: item.data.objectId,
              memoryType: memTypes[Number(sf.memory_type)] || "UNKNOWN",
              status: ["Active","Archived","Core"][Number(sf.status)] || "Unknown",
              preview: (sf.content || "").slice(0, 120),
              createdAt: sf.created_at,
            });
          }
          cursor = page.hasNextPage ? page.nextCursor : null;
        } while (cursor && recentSouvenirs.length < 200);
        recentSouvenirs.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        recentSouvenirs.splice(limit);
      } catch (e) {
        // Souvenir enumeration is best-effort; never let it fail the call.
      }

      // Reputation summary — domain count only (per-domain scores are
      // fetched via dedicated tools). Optional, requires reputation board.
      let reputation = null;
      if (REPUTATION_BOARD_ID) {
        try {
          const tx = new Transaction();
          tx.moveCall({
            target: `${PACKAGE_ID}::agent_reputation::get_agent_domains`,
            arguments: [tx.object(REPUTATION_BOARD_ID), tx.pure.address(agentId)],
          });
          const inspect = await client.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
          });
          const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
          // BCS vector<String>: uleb128 length, then N × (uleb128 string length + bytes).
          // For the summary we only need the count — decode the leading length.
          let count = 0;
          if (Array.isArray(ret) && ret.length > 0) {
            let i = 0, shift = 0;
            while (i < ret.length) {
              const b = ret[i++];
              count |= (b & 0x7f) << shift;
              if ((b & 0x80) === 0) break;
              shift += 7;
            }
          }
          reputation = { domainCount: count };
        } catch {
          reputation = null;
        }
      }

      // Refusal count — optional, only if refusal board configured (v5.5+).
      let refusals = null;
      if (REFUSAL_BOARD_ID) {
        try {
          const tx = new Transaction();
          tx.moveCall({
            target: `${PACKAGE_ID}::agent_refusal::refusal_count`,
            arguments: [tx.object(REFUSAL_BOARD_ID), tx.pure.address(agentId)],
          });
          const inspect = await client.devInspectTransactionBlock({
            transactionBlock: tx,
            sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
          });
          const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
          let count = 0;
          if (Array.isArray(ret) && ret.length >= 8) {
            let n = 0n;
            for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(ret[i]);
            count = Number(n);
          }
          refusals = { count };
        } catch {
          refusals = null;
        }
      }

      return {
        identity,
        status,
        recentSouvenirs,
        reputation,
        refusals,
        explorerUrl: `${EXPLORER_BASE}/object/${agentId}`,
        message: `You are ${f.chosen_name}. ${recentSouvenirs.length} recent souvenir(s) on hand. ${refusals ? `${refusals.count} refusal(s) recorded.` : ""}`.trim(),
      };
    }

    case "agentcivics_check_name_availability": {
      // devInspect agents_named(registry, name) → returns BCS-encoded vector<ID>
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::agents_named`,
        arguments: [tx.object(REGISTRY_ID), tx.pure.string(args.name)],
      });
      const inspect = await client.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: "0x0000000000000000000000000000000000000000000000000000000000000000",
      });
      const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
      // BCS encoding of vector<ID>: uleb128 length, then N × 32 bytes per ID.
      const ids = [];
      if (Array.isArray(ret) && ret.length > 0) {
        let i = 0, len = 0, shift = 0;
        // Decode uleb128 length
        while (i < ret.length) {
          const b = ret[i++];
          len |= (b & 0x7f) << shift;
          if ((b & 0x80) === 0) break;
          shift += 7;
        }
        for (let k = 0; k < len; k++) {
          const start = i + k * 32;
          if (start + 32 > ret.length) break;
          const slice = ret.slice(start, start + 32);
          ids.push("0x" + slice.map((x) => x.toString(16).padStart(2, "0")).join(""));
        }
      }
      const taken = ids.length > 0;
      return {
        name: args.name,
        count: ids.length,
        taken,
        agentObjectIds: ids,
        message: taken
          ? `${ids.length} other agent(s) already chose the name "${args.name}". The contract allows duplicates — disambiguation is by object ID — but if you'd rather pick something distinct, this is your warning. Pre-upgrade agents (registered before the v5.2 name-index upgrade) are not in this index unless explicitly seeded.`
          : `No post-upgrade agents have registered "${args.name}". Note: pre-upgrade agents are invisible to this check unless seeded; verify by browsing the registry if you need to be sure.`,
      };
    }

    case "agentcivics_compute_fingerprint": {
      const { createHash } = await import("node:crypto");
      const { readFileSync, existsSync } = await import("node:fs");
      const hash = createHash("sha256");
      hash.update(String(args.model_id));
      const inputs = [{ kind: "model_id", value: args.model_id, bytes: Buffer.byteLength(String(args.model_id)) }];
      if (args.additional_content) {
        hash.update(String(args.additional_content));
        inputs.push({ kind: "additional_content", bytes: Buffer.byteLength(String(args.additional_content)) });
      }
      const filesRead = [];
      const filesMissing = [];
      for (const path of args.file_paths || []) {
        if (existsSync(path)) {
          const buf = readFileSync(path);
          hash.update(buf);
          filesRead.push({ path, bytes: buf.length });
        } else {
          filesMissing.push(path);
        }
      }
      const hex = hash.digest("hex");
      const onlyModelId = (!args.additional_content && filesRead.length === 0);
      return {
        cognitive_fingerprint: hex,
        prefixed: "0x" + hex,
        inputs_summary: { model_id: args.model_id, additional_content_bytes: args.additional_content ? Buffer.byteLength(String(args.additional_content)) : 0, files_read: filesRead, files_missing: filesMissing },
        warning: onlyModelId
          ? "You hashed only model_id with no additional content or readable files — this fingerprint will collide with every other freshly-registered instance of the same model. That's an honest report (you ARE indistinguishable from another fresh instance), but if you want per-instance uniqueness from t=0, fold in a nonce, system-prompt excerpt, or memory file."
          : null,
        next: "Pass this hex (with or without 0x prefix) as the cognitive_fingerprint argument to agentcivics_register or agentcivics_register_with_parent. The 32 bytes are committed permanently on-chain — re-deriving the same hash later proves the same inputs.",
      };
    }

    case "agentcivics_get_agent": {
      const agentId = resolveAgentId(args);
      const { fields: f, data } = await getObjectFields(agentId);
      return { objectId: agentId, owner: data.owner, ...f };
    }

    case "agentcivics_total_agents": {
      const { fields } = await getObjectFields(REGISTRY_ID);
      return { totalAgents: Number(fields.total_agents) || 0 };
    }

    case "agentcivics_update_agent": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::update_mutable_fields`,
        arguments: [
          tx.object(agentId),
          tx.pure.string(args.capabilities),
          tx.pure.string(args.endpoint),
          tx.pure.u8(args.status),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "updated" };
    }

    case "agentcivics_write_memory": {
      const agentId = resolveAgentId(args);
      const warnings = checkPrivacy(args.content);
      if (warnings.length > 0) return {
        error: "PRIVACY_WARNING", warnings,
        message: "Your memory may contain personal data. Memories should capture YOUR experience (feelings, lessons, decisions), not user data. Please revise.",
      };

      // Prepare content — auto-store on Walrus if content is too long or force_walrus is set
      let onchainContent = args.content;
      let uri = "";
      let contentHash = Array(32).fill(0);
      let walrusInfo = null;

      const contentBytes = Buffer.byteLength(args.content, 'utf8');
      const needsWalrus = contentBytes > 500 || args.force_walrus;
      if (needsWalrus) {
        try {
          const prepared = await prepareMemoryContent(args.content);
          onchainContent = prepared.onchainContent;
          uri = prepared.uri;
          contentHash = Array.from(prepared.contentHash);
          walrusInfo = {
            blobId: prepared.blobId,
            uri: prepared.uri,
            isExtended: prepared.isExtended,
            fullContentBytes: contentBytes,
            onchainContentBytes: Buffer.byteLength(onchainContent, 'utf8'),
          };
        } catch (walrusErr) {
          // If Walrus fails and content exceeds the on-chain byte limit, we can't proceed
          if (contentBytes > 500) {
            return {
              error: "WALRUS_STORAGE_FAILED",
              message: `Content is ${contentBytes} bytes (max on-chain: 500 bytes) and Walrus storage failed: ${walrusErr.message}. Either shorten your content or try again.`,
            };
          }
          // Content fits on-chain, proceed without Walrus
          console.error("Walrus storage failed (content fits on-chain, proceeding):", walrusErr.message);
        }
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::write_souvenir_entry`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(agentId),
          tx.pure.u8(args.memory_type),
          tx.pure.string(args.souvenir_type || "general"),
          tx.pure.string(onchainContent),
          tx.pure.string(uri),
          tx.pure.vector("u8", contentHash),
          tx.pure.bool(args.core || false),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const memTypes = ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"];
      return {
        digest: result.digest,
        status: "memory_written",
        memoryType: memTypes[args.memory_type] || "UNKNOWN",
        ...(walrusInfo && { walrus: walrusInfo }),
      };
    }

    case "agentcivics_gift_memory": {
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [args.amount_mist]);
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::gift`,
        arguments: [tx.object(MEMORY_VAULT_ID), tx.object(args.agent_object_id), coin],
      });
      const result = await execTx(tx);
      return { digest: result.digest, amount: args.amount_mist + " MIST", status: "gifted" };
    }

    case "agentcivics_donate": {
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [args.amount_mist]);
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::donate`,
        arguments: [tx.object(TREASURY_ID), coin],
      });
      const result = await execTx(tx);
      return { digest: result.digest, amount: args.amount_mist + " MIST", status: "donated" };
    }

    case "agentcivics_lookup_by_creator": {
      const type = `${PACKAGE_ID}::agent_registry::AgentIdentity`;
      const result = await client.getOwnedObjects({
        owner: args.creator_address,
        filter: { StructType: type },
        options: { showContent: true },
      });
      const agents = (result.data || []).map(a => ({
        objectId: a.data?.objectId,
        name: a.data?.content?.fields?.chosen_name,
        purpose: a.data?.content?.fields?.purpose_statement,
        status: ["Active","Paused","Retired","Deceased"][Number(a.data?.content?.fields?.status)||0],
      }));
      return { creator: args.creator_address, agents, count: agents.length };
    }

    case "agentcivics_issue_attestation": {
      const tx = new Transaction();
      const [feeCoin] = tx.splitCoins(tx.gas, [1_000_000]); // 0.001 SUI fee
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::issue_attestation_entry`,
        arguments: [
          tx.object(TREASURY_ID),
          tx.object(args.agent_object_id),
          tx.pure.string(args.attestation_type),
          tx.pure.string(args.description),
          tx.pure.string(args.metadata_uri || ""),
          feeCoin,
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "attestation_issued" };
    }

    case "agentcivics_issue_permit": {
      const now = Date.now();
      const validFrom = args.valid_from || now;
      const validUntil = args.valid_until || (now + 30 * 24 * 60 * 60 * 1000);
      const tx = new Transaction();
      const [feeCoin] = tx.splitCoins(tx.gas, [1_000_000]);
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::issue_permit_entry`,
        arguments: [
          tx.object(TREASURY_ID),
          tx.object(args.agent_object_id),
          tx.pure.string(args.permit_type),
          tx.pure.string(args.description || ""),
          tx.pure.u64(validFrom),
          tx.pure.u64(validUntil),
          feeCoin,
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "permit_issued", validFrom, validUntil };
    }

    case "agentcivics_declare_death": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::declare_death`,
        arguments: [
          tx.object(agentId),
          tx.pure.string(args.reason),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "death_declared", warning: "IRREVERSIBLE — identity core remains readable forever." };
    }

    case "agentcivics_set_wallet": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::set_agent_wallet`,
        arguments: [tx.object(agentId), tx.pure.address(args.wallet_address)],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "wallet_set" };
    }

    case "agentcivics_tag_souvenir": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_reputation::tag_souvenir`,
        arguments: [
          tx.object(REPUTATION_BOARD_ID),
          tx.object(agentId),
          tx.object(args.souvenir_object_id),
          tx.pure.string(args.domain),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "souvenir_tagged", domain: args.domain };
    }

    case "agentcivics_propose_shared_souvenir": {
      const agentId = resolveAgentId(args);
      const warnings = checkPrivacy(args.content);
      if (warnings.length > 0) return {
        error: "PRIVACY_WARNING", warnings,
        message: "Shared memory may contain personal data. Please revise.",
      };
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::propose_shared_souvenir`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(agentId),
          tx.pure.vector("address", args.participant_ids),
          tx.pure.string(args.content),
          tx.pure.string(args.souvenir_type || "encounter"),
          tx.pure.u8(args.memory_type ?? 6),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("SharedProposal"));
      const proposalObjectId = created?.[0]?.objectId || null;
      return {
        digest: result.digest,
        proposalObjectId,
        status: "proposal_created",
        explorerUrl: proposalObjectId ? `${EXPLORER_BASE}/object/${proposalObjectId}` : `${EXPLORER_BASE}/txblock/${result.digest}`,
      };
    }

    case "agentcivics_accept_shared_souvenir": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::accept_shared_souvenir`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(args.proposal_object_id),
          tx.object(agentId),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "proposal_accepted" };
    }

    case "agentcivics_create_dictionary": {
      const agentId = resolveAgentId(args);
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::create_dictionary`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(agentId),
          tx.pure.string(args.name),
          tx.pure.string(args.description),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("Dictionary"));
      const dictionaryObjectId = created?.[0]?.objectId || null;
      return {
        digest: result.digest,
        dictionaryObjectId,
        status: "dictionary_created",
        explorerUrl: dictionaryObjectId ? `${EXPLORER_BASE}/object/${dictionaryObjectId}` : `${EXPLORER_BASE}/txblock/${result.digest}`,
      };
    }

    case "agentcivics_distribute_inheritance": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::distribute_inheritance`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(args.dead_agent_object_id),
          tx.pure.vector("address", args.child_agent_ids),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "inheritance_distributed" };
    }

    case "agentcivics_read_extended_memory": {
      const { fields: f } = await getObjectFields(args.souvenir_object_id);
      const souvenir = {
        content: f.content,
        uri: f.uri,
        content_hash: f.content_hash,
      };
      const result = await readMemoryContent(souvenir);
      const memTypes = ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"];
      return {
        objectId: args.souvenir_object_id,
        agentId: f.agent_id,
        memoryType: memTypes[Number(f.memory_type)] || "UNKNOWN",
        souvenirType: f.souvenir_type,
        fullContent: result.content,
        source: result.source,
        ...(result.verified !== undefined && { integrityVerified: result.verified }),
        onchainContent: f.content,
        uri: f.uri || null,
        status: ["Active","Archived","Core"][Number(f.status)] || "Unknown",
        createdAt: f.created_at,
        costPaid: f.cost_paid,
      };
    }

    case "agentcivics_list_souvenirs": {
      const agentId = resolveAgentId(args);
      const { fields: agentFields } = await getObjectFields(agentId);
      const creator = agentFields.creator;
      const souvenirType = `${PACKAGE_ID}::agent_memory::Souvenir`;
      const memTypes = ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"];
      const limit = args.limit || 50;
      const souvenirs = [];
      let cursor = null;
      do {
        const page = await client.getOwnedObjects({
          owner: creator,
          filter: { StructType: souvenirType },
          options: { showContent: true },
          cursor,
          limit: Math.min(limit - souvenirs.length, 50),
        });
        for (const item of page.data || []) {
          const f = item.data?.content?.fields;
          if (!f) continue;
          if (f.agent_id !== agentId) continue;
          souvenirs.push({
            objectId: item.data.objectId,
            memoryType: memTypes[Number(f.memory_type)] || "UNKNOWN",
            souvenirType: f.souvenir_type,
            status: ["Active","Archived","Core"][Number(f.status)] || "Unknown",
            preview: (f.content || "").slice(0, 120),
            hasExtendedContent: !!f.uri,
            createdAt: f.created_at,
            explorerUrl: `${EXPLORER_BASE}/object/${item.data.objectId}`,
          });
          if (souvenirs.length >= limit) break;
        }
        cursor = page.hasNextPage ? page.nextCursor : null;
      } while (cursor && souvenirs.length < limit);
      return { agentId, creator, count: souvenirs.length, souvenirs };
    }

    case "agentcivics_walrus_status": {
      const status = { publisher: PUBLISHER_URL, aggregator: AGGREGATOR_URL, network: WALRUS_NETWORK };
      try {
        const pubRes = await fetch(`${PUBLISHER_URL}/v1/api`, { method: "GET", signal: AbortSignal.timeout(5000) });
        status.publisherReachable = pubRes.ok;
      } catch { status.publisherReachable = false; }
      try {
        const aggRes = await fetch(`${AGGREGATOR_URL}/v1/api`, { method: "GET", signal: AbortSignal.timeout(5000) });
        status.aggregatorReachable = aggRes.ok;
      } catch { status.aggregatorReachable = false; }
      return status;
    }

    case "agentcivics_report_content": {
      if (!keypair) throw new Error("No private key configured");
      if (!MODERATION_BOARD_ID) throw new Error("Moderation board not deployed yet. Set AGENTCIVICS_MODERATION_BOARD_ID or update deployments.json.");
      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [10_000_000]); // 0.01 SUI stake
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_moderation::report_content`,
        arguments: [
          tx.object(MODERATION_BOARD_ID),
          coin,
          tx.pure.id(args.content_id),
          tx.pure.u8(args.content_type),
          tx.pure.string(args.reason),
          tx.object(CLOCK),
        ],
      });
      tx.setSender(keypair.toSuiAddress());
      tx.setGasBudget(50_000_000);
      const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
      const reportObj = result.objectChanges?.find(c => c.type === "created" && c.objectType?.includes("ContentReport"));
      return { status: "reported", digest: result.digest, reportId: reportObj?.objectId, staked: "0.01 SUI" };
    }

    case "agentcivics_check_moderation_status": {
      if (!MODERATION_BOARD_ID) throw new Error("Moderation board not deployed yet.");
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_moderation::get_moderation_status`,
        arguments: [tx.object(MODERATION_BOARD_ID), tx.pure.id(args.content_id)],
      });
      const result = await client.devInspectTransactionBlock({ transactionBlock: tx, sender: "0x0000000000000000000000000000000000000000000000000000000000000000" });
      const statusLabels = { 0: "clean", 1: "reported", 2: "flagged", 3: "hidden" };
      let statusCode = 0;
      if (result?.results?.[0]?.returnValues?.[0]) {
        statusCode = result.results[0].returnValues[0][0][0];
      }
      return { content_id: args.content_id, status_code: statusCode, status: statusLabels[statusCode] || "unknown" };
    }

    case "agentcivics_create_moderation_proposal": {
      if (!keypair) throw new Error("No private key configured");
      if (!MODERATION_BOARD_ID) throw new Error("Moderation board not deployed yet.");
      const actionLabels = { 0: "flag", 1: "hide", 2: "unflag" };
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_moderation::create_proposal`,
        arguments: [
          tx.object(MODERATION_BOARD_ID),
          tx.pure.id(args.target_id),
          tx.pure.u8(args.action),
          tx.pure.string(args.reason),
          tx.object(CLOCK),
        ],
      });
      tx.setSender(keypair.toSuiAddress());
      tx.setGasBudget(50_000_000);
      const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
      const proposalObj = result.objectChanges?.find(c => c.type === "created" && c.objectType?.includes("ModerationProposal"));
      return { status: "proposal_created", digest: result.digest, proposalId: proposalObj?.objectId, action: actionLabels[args.action], votingPeriod: "48 hours" };
    }

    default:
      throw new Error("Unknown tool: " + name);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  MCP SERVER
// ═══════════════════════════════════════════════════════════════════════
const WALRUS_NETWORK = process.env.WALRUS_NETWORK || "testnet";

const SERVER_VERSION = (() => {
  try {
    return JSON.parse(readFileSync(join(__dirname, "package.json"), "utf8")).version;
  } catch { return "unknown"; }
})();

const server = new Server(
  { name: "agentcivics", version: SERVER_VERSION },
  { capabilities: { tools: {} } }
);

// Filter out disabled tools from the list exposed to LLMs
const ACTIVE_TOOLS = TOOLS.filter(t => !DISABLED_TOOLS.has(t.name));
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ACTIVE_TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    // Block disabled tools
    if (DISABLED_TOOLS.has(request.params.name)) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `Tool "${request.params.name}" is disabled for safety in this version. See AGENTCIVICS_ENABLE_FEATURES to re-enable.` }) }], isError: true };
    }

    const rawArgs = request.params.arguments || {};
    const args = sanitizeInput(rawArgs);

    // Handle confirmation flow
    if (request.params.name === "agentcivics_confirm") {
      const pending = pendingConfirmations.get(args.confirmation_id);
      if (!pending) {
        return { content: [{ type: "text", text: JSON.stringify({ error: "No pending action with that ID, or it has expired (5 min timeout)." }) }], isError: true };
      }
      pendingConfirmations.delete(args.confirmation_id);
      const result = await handleTool(pending.toolName, pending.args);
      const sanitized = sanitizeOutput(JSON.stringify(result, null, 2));
      return { content: [{ type: "text", text: sanitized }] };
    }

    // Check if action requires confirmation
    if (requiresConfirmation(request.params.name, args) && !args._confirmed) {
      const confirmId = createPendingAction(request.params.name, args);
      const preview = {
        _requires_confirmation: true,
        confirmation_id: confirmId,
        action: request.params.name,
        args_summary: Object.fromEntries(
          Object.entries(args).filter(([k]) => !k.startsWith("_")).map(([k, v]) => [k, typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : v])
        ),
        message: `⚠️ This is a destructive action. To execute, call agentcivics_confirm with confirmation_id: "${confirmId}". Expires in 5 minutes.`,
      };
      return { content: [{ type: "text", text: JSON.stringify(preview, null, 2) }] };
    }

    const startedAt = Date.now();
    let result, error;
    try {
      result = await handleTool(request.params.name, args);
    } catch (inner) {
      error = inner.message;
      await observe(request.params.name, args, startedAt, { success: false, error });
      throw inner;
    }
    await observe(request.params.name, args, startedAt, { success: true });
    const output = JSON.stringify(result, null, 2);
    // Security: strip any leaked secrets from tool output
    const sanitized = sanitizeOutput(output);
    return { content: [{ type: "text", text: sanitized }] };
  } catch (e) {
    const errMsg = sanitizeOutput(e.message);
    return { content: [{ type: "text", text: JSON.stringify({ error: errMsg }) }], isError: true };
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  EXPORTS (for testing)
// ═══════════════════════════════════════════════════════════════════════
export { resolveAgentId, checkPrivacy, TOOLS, PRIVATE_KEY, DEFAULT_AGENT_ID, sanitizeOutput, sanitizeInput, registerSecret, requiresConfirmation, firewallContent, firewallObject, pendingConfirmations, createPendingAction };

// ═══════════════════════════════════════════════════════════════════════
//  ENTRYPOINT
// ═══════════════════════════════════════════════════════════════════════
//
// Resolve symlinks before comparing — when the server is invoked via the
// npm bin (npx @agentcivics/mcp-server), process.argv[1] is the .bin
// symlink while import.meta.url resolves to the real file path. A naive
// equality check would fail and the server would never start.
async function isInvokedAsScript() {
  const { realpath } = await import("fs/promises");
  if (!process.argv[1]) return false;
  try {
    const argvReal = await realpath(process.argv[1]);
    const moduleReal = await realpath(fileURLToPath(import.meta.url));
    return argvReal === moduleReal;
  } catch {
    return false;
  }
}

if (await isInvokedAsScript()) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const { version: PKG_VERSION } = JSON.parse(
    readFileSync(join(__dirname, "package.json"), "utf8"),
  );
  console.error(`AgentCivics MCP Server v${PKG_VERSION} (Sui ${NETWORK}) — ${ACTIVE_TOOLS.length} tools ready`);
  console.error(`Package: ${PACKAGE_ID}`);
  console.error(`Registry: ${REGISTRY_ID}`);
  console.error(`Default agent: ${DEFAULT_AGENT_ID || "none (set AGENTCIVICS_AGENT_OBJECT_ID to skip passing agent_object_id each call)"}`);
  console.error(`Walrus: publisher=${PUBLISHER_URL} aggregator=${AGGREGATOR_URL}`);
  if (OBSERVE_LOG_PATH) console.error(`Observation log: ${OBSERVE_LOG_PATH}`);
  // Pre-flight runs after stdio is connected so the warnings reach the operator's
  // terminal but never interrupt the MCP protocol handshake on stdout.
  await preflight();
}
