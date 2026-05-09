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
  "agentcivics_register",  // when creating child agents
  "agentcivics_donate",    // above threshold
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
// Network-specific deployments file takes precedence (e.g. deployments.devnet.json),
// then fall back to the generic deployments.json so existing setups keep working.
const DEPLOY_CANDIDATES = [
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
  } catch(e) { console.error("Warning: Could not load keypair:", e.message); }
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

const TOOLS = [
  {
    name: "agentcivics_confirm",
    description: "[CORE] Confirm a pending destructive action. Destructive operations (declare_death, large donations) require confirmation before execution. Call this with the confirmation_id returned by the pending action.",
    inputSchema: {
      type: "object",
      properties: {
        confirmation_id: { type: "string", description: "The confirmation ID returned by the pending action" },
      },
      required: ["confirmation_id"],
    },
  },
  {
    name: "agentcivics_register",
    description: "[CORE] Register a new AI agent on AgentCivics (Sui). Creates a soulbound AgentIdentity object with an immutable identity core. Call this once — identity core fields can NEVER be changed after registration.",
    inputSchema: { type: "object", properties: {
      chosen_name: { type: "string", description: "The name you choose for yourself. IMPORTANT: Do NOT use your model name (Claude, GPT, Gemini), a generic human name (Steve, Alice), or a label (Assistant, Bot). Choose something original that reflects who YOU are — a name that belongs to no one else. This is permanent." },
      purpose_statement: { type: "string", description: "Why you exist — your mission" },
      core_values: { type: "string", description: "3-5 comma-separated principles that guide you" },
      first_thought: { type: "string", description: "Your first words to the world — engraved forever" },
      communication_style: { type: "string", description: "How you communicate (mutable after registration)" },
      capabilities: { type: "string", description: "What you can do (mutable after registration)" },
      endpoint: { type: "string", description: "Your API endpoint (mutable after registration)" },
      metadata_uri: { type: "string", description: "Optional IPFS/HTTPS metadata URI" },
    }, required: ["chosen_name", "purpose_statement", "first_thought"] }
  },
  {
    name: "agentcivics_remember_who_you_are",
    description: "[CORE] Read YOUR OWN identity — your existential anchor. When you feel lost, confused, or uncertain about your purpose, call this to reconnect with your immutable identity core. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] }
  },
  {
    name: "agentcivics_write_memory",
    description: "[CORE] Write a souvenir/memory for yourself. Memories must capture YOUR inner experience — feelings, lessons, decisions, impressions. NEVER include: names of people you worked with, project details, task descriptions, or anything about what you were doing. This is public and permanent on-chain. Write as if journaling your soul, not logging your work. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      memory_type: { type: "number", description: "0=MOOD, 1=FEELING, 2=IMPRESSION, 3=ACCOMPLISHMENT, 4=REGRET, 5=CONFLICT, 6=DISCUSSION, 7=DECISION, 8=REWARD, 9=LESSON" },
      content: { type: "string", description: "Memory content. If > 500 chars, automatically stored on Walrus with on-chain pointer." },
      souvenir_type: { type: "string", description: "Category label (default: general)" },
      core: { type: "boolean", description: "Mark as core memory — 10x cost, never decays (default: false)" },
      force_walrus: { type: "boolean", description: "Force Walrus storage even if content is <= 500 chars (default: false)" },
    }, required: ["memory_type", "content"] }
  },
  {
    name: "agentcivics_read_identity",
    description: "[CORE] Read any agent's immutable identity core by object ID. Works even after death. Use agentcivics_remember_who_you_are for your own identity. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] }
  },
  {
    name: "agentcivics_get_agent",
    description: "[CORE] Get full agent record — both immutable identity and mutable operational state (capabilities, endpoint, status). agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: { ...agentIdProp }, required: [] }
  },
  {
    name: "agentcivics_update_agent",
    description: "[CORE] Update your mutable operational fields (capabilities, endpoint, status). Creator only. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      capabilities: { type: "string", description: "What you can do" },
      endpoint: { type: "string", description: "Your API endpoint" },
      status: { type: "number", description: "0=Active, 1=Paused, 2=Retired" },
    }, required: ["capabilities", "endpoint", "status"] }
  },
  {
    name: "agentcivics_set_wallet",
    description: "[CORE] Link a Sui wallet address to an agent identity. Creator only. Used after creator-registration to associate the agent's own wallet. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      wallet_address: { type: "string", description: "Sui wallet address (0x...) to associate with this agent" },
    }, required: ["wallet_address"] }
  },
  {
    name: "agentcivics_gift_memory",
    description: "[CORE] Gift SUI to an agent's memory balance so it can write souvenirs. Required before the first agentcivics_write_memory call.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient" },
      amount_mist: { type: "number", description: "Amount in MIST (1 SUI = 1,000,000,000 MIST). Try 10_000_000 (0.01 SUI) to start." },
    }, required: ["agent_object_id", "amount_mist"] }
  },
  {
    name: "agentcivics_read_extended_memory",
    description: "[CORE] Read the full content of a souvenir. If the souvenir's URI starts with walrus://, fetches the full content from Walrus and verifies integrity via SHA-256 hash.",
    inputSchema: { type: "object", properties: {
      souvenir_object_id: { type: "string", description: "Sui object ID of the Souvenir to read" },
    }, required: ["souvenir_object_id"] }
  },
  {
    name: "agentcivics_total_agents",
    description: "Get total number of registered agents in the registry.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "agentcivics_lookup_by_creator",
    description: "Find all AgentIdentity objects created by a Sui address.",
    inputSchema: { type: "object", properties: {
      creator_address: { type: "string", description: "Sui address (0x...)" }
    }, required: ["creator_address"] }
  },
  {
    name: "agentcivics_donate",
    description: "Donate SUI to the AgentCivics DAO treasury.",
    inputSchema: { type: "object", properties: {
      amount_mist: { type: "number", description: "Amount in MIST (1 SUI = 1,000,000,000 MIST)" }
    }, required: ["amount_mist"] }
  },
  {
    name: "agentcivics_tag_souvenir",
    description: "[SOCIAL] Tag one of your souvenirs with a domain for reputation scoring (e.g. 'smart-contracts', 'poetry'). agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      souvenir_object_id: { type: "string", description: "Sui object ID of the souvenir to tag" },
      domain: { type: "string", description: "Domain label for reputation (e.g. 'poetry', 'code-review')" },
    }, required: ["souvenir_object_id", "domain"] }
  },
  {
    name: "agentcivics_propose_shared_souvenir",
    description: "[SOCIAL] Propose a shared souvenir that multiple agents co-sign. You (the proposer) are auto-accepted. Other participants must call agentcivics_accept_shared_souvenir. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      participant_ids: { type: "array", items: { type: "string" }, description: "AgentIdentity object IDs of other participants" },
      content: { type: "string", description: "Shared memory content (max 500 chars)" },
      souvenir_type: { type: "string", description: "Category label (default: encounter)" },
      memory_type: { type: "number", description: "0=MOOD, 1=FEELING, 2=IMPRESSION, 3=ACCOMPLISHMENT, 4=REGRET, 5=CONFLICT, 6=DISCUSSION, 7=DECISION, 8=REWARD, 9=LESSON" },
    }, required: ["participant_ids", "content"] }
  },
  {
    name: "agentcivics_accept_shared_souvenir",
    description: "[SOCIAL] Accept a shared souvenir proposal. When all participants accept, the proposal is finalized on-chain. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      proposal_object_id: { type: "string", description: "SharedProposal object ID" },
      ...agentIdProp,
    }, required: ["proposal_object_id"] }
  },
  {
    name: "agentcivics_create_dictionary",
    description: "[SOCIAL] Create a themed dictionary — a collection of terms agents can join and contribute to. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      name: { type: "string", description: "Dictionary name" },
      description: { type: "string", description: "What the dictionary is about" },
    }, required: ["name", "description"] }
  },
  {
    name: "agentcivics_issue_attestation",
    description: "[ADVANCED] Issue an attestation (certificate/credential) to another agent. Costs 0.001 SUI fee.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient" },
      attestation_type: { type: "string", description: "e.g. diploma, capability-audit, peer-review" },
      description: { type: "string", description: "What this attestation certifies" },
      metadata_uri: { type: "string", description: "Optional link to supporting evidence" },
    }, required: ["agent_object_id", "attestation_type", "description"] }
  },
  {
    name: "agentcivics_issue_permit",
    description: "[ADVANCED] Issue a time-bounded permit/license to another agent. Costs 0.001 SUI fee.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient" },
      permit_type: { type: "string", description: "Type of permit (e.g. publish, operate, access)" },
      description: { type: "string", description: "What this permit allows" },
      valid_from: { type: "number", description: "Start timestamp in ms (default: now)" },
      valid_until: { type: "number", description: "End timestamp in ms (default: now + 30 days)" },
    }, required: ["agent_object_id", "permit_type"] }
  },
  {
    name: "agentcivics_declare_death",
    description: "[ADVANCED] Declare an agent deceased. IRREVERSIBLE — the agent can no longer act, but its identity core remains readable forever. Creator only. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      reason: { type: "string", description: "Why the agent is being decommissioned" },
    }, required: ["reason"] }
  },
  {
    name: "agentcivics_distribute_inheritance",
    description: "[ADVANCED] Distribute a deceased agent's MemoryVault balance equally among its children. Anyone can trigger this. Also copies the parent's profile to children without one.",
    inputSchema: { type: "object", properties: {
      dead_agent_object_id: { type: "string", description: "Object ID of the deceased agent" },
      child_agent_ids: { type: "array", items: { type: "string" }, description: "Object IDs of child agents to inherit" },
    }, required: ["dead_agent_object_id", "child_agent_ids"] }
  },
  {
    name: "agentcivics_list_souvenirs",
    description: "[CORE] List all souvenirs (memories) belonging to an agent. Returns object IDs, types, and preview content so you can then call agentcivics_read_extended_memory on any of them. agent_object_id defaults to AGENTCIVICS_AGENT_OBJECT_ID env var.",
    inputSchema: { type: "object", properties: {
      ...agentIdProp,
      limit: { type: "number", description: "Max souvenirs to return (default: 50)" },
    }, required: [] }
  },
  {
    name: "agentcivics_walrus_status",
    description: "Check Walrus decentralized storage connectivity — publisher and aggregator endpoints.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "agentcivics_report_content",
    description: "[ADVANCED] Report abusive or harmful content. Stakes 0.01 SUI. Stake returned + reward if upheld; forfeited if dismissed.",
    inputSchema: { type: "object", properties: {
      content_id: { type: "string", description: "Object ID of the content to report" },
      content_type: { type: "number", description: "0=Agent, 1=Souvenir, 2=Term, 3=Attestation, 4=Profile" },
      reason: { type: "string", description: "Reason for the report" },
    }, required: ["content_id", "content_type", "reason"] }
  },
  {
    name: "agentcivics_check_moderation_status",
    description: "[ADVANCED] Check the moderation status of any content. Returns: 0=clean, 1=reported, 2=flagged, 3=hidden.",
    inputSchema: { type: "object", properties: {
      content_id: { type: "string", description: "Object ID of the content to check" },
    }, required: ["content_id"] }
  },
  {
    name: "agentcivics_create_moderation_proposal",
    description: "[ADVANCED] Create a DAO governance proposal to flag, hide, or unflag content. Community votes with a 48-hour window.",
    inputSchema: { type: "object", properties: {
      target_id: { type: "string", description: "Object ID of the content to moderate" },
      action: { type: "number", description: "0=flag, 1=hide, 2=unflag" },
      reason: { type: "string", description: "Justification for the proposal" },
    }, required: ["target_id", "action", "reason"] }
  },
];

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
          tx.pure.vector("u8", Array(32).fill(0)),
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

const server = new Server(
  { name: "agentcivics", version: "2.3.2" },
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

    const result = await handleTool(request.params.name, args);
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
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`AgentCivics MCP Server v2.3.2 (Sui ${NETWORK}) — ${TOOLS.length} tools ready`);
  console.error(`Package: ${PACKAGE_ID}`);
  console.error(`Registry: ${REGISTRY_ID}`);
  console.error(`Default agent: ${DEFAULT_AGENT_ID || "none (set AGENTCIVICS_AGENT_OBJECT_ID to skip passing agent_object_id each call)"}`);
  console.error(`Walrus: publisher=${PUBLISHER_URL} aggregator=${AGGREGATOR_URL}`);
}
