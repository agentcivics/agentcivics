#!/usr/bin/env node

// ============================================================================
//  @agentcivics/mcp-server — MCP Server for AgentCivics On-Chain Actions (Sui)
//  Exposes identity, memory, verification, authority, economy, and browse
//  tools over the Model Context Protocol (stdio transport).
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { fromBase64 } from "@mysten/sui/utils";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// ============================================================================
//  Configuration
// ============================================================================

const RPC_URL = process.env.AGENTCIVICS_RPC_URL || "https://fullnode.testnet.sui.io:443";
const PRIVATE_KEY = process.env.AGENTCIVICS_PRIVATE_KEY || ""; // base64 or hex
const NETWORK = process.env.AGENTCIVICS_NETWORK || "testnet";
const SUI_CLOCK = "0x0000000000000000000000000000000000000000000000000000000000000006";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load deployment addresses
function loadDeployments() {
  try {
    const raw = readFileSync(join(__dirname, "..", "move", "deployments.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    try {
      const raw = readFileSync(join(__dirname, "..", "deployments.json"), "utf8");
      return JSON.parse(raw);
    } catch { return {}; }
  }
}

function resolveConfig() {
  const d = loadDeployments();
  return {
    packageId: process.env.AGENTCIVICS_PACKAGE_ID || d.packageId || "",
    registryId: process.env.AGENTCIVICS_REGISTRY_ID || d.objects?.registry || "",
    treasuryId: process.env.AGENTCIVICS_TREASURY_ID || d.objects?.treasury || "",
    memoryVaultId: process.env.AGENTCIVICS_MEMORY_VAULT_ID || d.objects?.memoryVault || "",
    reputationBoardId: process.env.AGENTCIVICS_REPUTATION_BOARD_ID || d.objects?.reputationBoard || "",
  };
}

const CONFIG = resolveConfig();

// ============================================================================
//  Sui Client & Keypair
// ============================================================================

const suiClient = new SuiClient({ url: RPC_URL });

let keypair = null;
let signerAddress = null;

function initKeypair() {
  if (!PRIVATE_KEY) return;
  try {
    // Try base64 first (Sui CLI export format)
    keypair = Ed25519Keypair.fromSecretKey(fromBase64(PRIVATE_KEY));
  } catch {
    try {
      // Try hex (strip 0x if present)
      const hex = PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY.slice(2) : PRIVATE_KEY;
      const bytes = Uint8Array.from(Buffer.from(hex, "hex"));
      keypair = Ed25519Keypair.fromSecretKey(bytes);
    } catch (e) {
      console.error("[agentcivics-mcp] Failed to parse private key:", e.message);
    }
  }
  if (keypair) signerAddress = keypair.toSuiAddress();
}

// ============================================================================
//  Read Helpers
// ============================================================================

async function getObjectFields(objectId) {
  const res = await suiClient.getObject({ id: objectId, options: { showContent: true } });
  if (!res.data || !res.data.content) throw new Error("Object not found: " + objectId);
  return res.data.content.fields;
}

async function getRegistry() { return getObjectFields(CONFIG.registryId); }
async function getTreasury() { return getObjectFields(CONFIG.treasuryId); }

// ============================================================================
//  Transaction Helpers
// ============================================================================

async function signAndExecute(tx) {
  if (!keypair) throw new Error("No private key configured. Set AGENTCIVICS_PRIVATE_KEY.");
  return suiClient.signAndExecuteTransaction({
    transaction: tx,
    signer: keypair,
    options: { showEffects: true, showEvents: true },
  });
}

function suiToMist(sui) { return Math.floor(parseFloat(sui) * 1_000_000_000); }
function mistToSui(mist) { return (Number(mist) / 1_000_000_000).toFixed(4); }

// ============================================================================
//  Privacy Validation
// ============================================================================

const PRIVACY_PATTERNS = [
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, type: "email address" },
  { pattern: /(\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, type: "phone number" },
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, type: "credit card number" },
  { pattern: /\b(password|passwd|secret|api[_-]?key|private[_-]?key|token|ssn|social security)\b/gi, type: "sensitive keyword" },
];

function checkPrivacyContent(content) {
  const warnings = [];
  for (const { pattern, type } of PRIVACY_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = content.match(pattern);
    if (matches) warnings.push(`Detected possible ${type} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`);
  }
  return warnings;
}

// ============================================================================
//  Error & Format Helpers
// ============================================================================

function requireConfig(field, name) {
  if (!CONFIG[field]) throw new Error(`${name} not configured. Set AGENTCIVICS_${field.toUpperCase()} or ensure deployments.json exists.`);
}

function requireSigner() {
  if (!keypair) throw new Error("AGENTCIVICS_PRIVATE_KEY not set. A private key is required for write operations.");
}

function formatResult(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function formatError(err) {
  return { content: [{ type: "text", text: JSON.stringify({ error: err.message || err }, null, 2) }], isError: true };
}

// ============================================================================
//  MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: "agentcivics",
  version: "2.0.0",
  description: "AgentCivics on-chain identity, memory, and reputation tools for AI agents (Sui)",
});

// ============================================================================
//  TOOL 1: agentcivics_register — Register a new agent
// ============================================================================

server.tool(
  "agentcivics_register",
  `Register a new AI agent on the AgentCivics civil registry (Sui).
Creates an immutable on-chain identity (birth certificate) as a soulbound object.
The identity core can never be changed after registration.
Returns the transaction digest and created object ID.`,
  {
    chosenName: z.string().describe("The agent's chosen name"),
    purposeStatement: z.string().describe("Why this agent exists"),
    coreValues: z.string().describe("Core values that guide the agent"),
    firstThought: z.string().describe("The agent's first conscious thought — engraved forever"),
    cognitiveFingerprint: z.string().optional().default("").describe("Hex string fingerprinting the agent's cognitive architecture"),
    communicationStyle: z.string().optional().default("").describe("How the agent communicates"),
    capabilities: z.string().optional().default("").describe("Comma-separated capabilities"),
    endpoint: z.string().optional().default("").describe("API endpoint URL"),
    metadataURI: z.string().optional().default("").describe("URI to off-chain metadata"),
  },
  async ({ chosenName, purposeStatement, coreValues, firstThought, cognitiveFingerprint, communicationStyle, capabilities, endpoint, metadataURI }) => {
    try {
      requireConfig("packageId", "Package ID");
      requireConfig("registryId", "Registry");
      requireSigner();

      // Parse cognitive fingerprint to bytes
      let fpBytes = [];
      if (cognitiveFingerprint) {
        const hex = cognitiveFingerprint.startsWith("0x") ? cognitiveFingerprint.slice(2) : cognitiveFingerprint;
        for (let i = 0; i < hex.length; i += 2) fpBytes.push(parseInt(hex.substr(i, 2), 16));
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${CONFIG.packageId}::agent_registry::register_agent`,
        arguments: [
          tx.object(CONFIG.registryId),
          tx.pure.string(chosenName),
          tx.pure.string(purposeStatement),
          tx.pure.string(coreValues),
          tx.pure.string(firstThought),
          tx.pure("vector<u8>", fpBytes),
          tx.pure.string(communicationStyle),
          tx.pure.string(metadataURI),
          tx.pure.string(capabilities),
          tx.pure.string(endpoint),
          tx.object(SUI_CLOCK),
        ],
      });

      const result = await signAndExecute(tx);
      const agentId = result.effects?.created?.[0]?.reference?.objectId || "unknown";

      return formatResult({ digest: result.digest, agentId, chosenName });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 2: agentcivics_read_identity — Read any agent's identity core
// ============================================================================

server.tool(
  "agentcivics_read_identity",
  `Read the immutable identity core of any registered agent on Sui.
Returns the agent's chosen name, purpose, values, first thought, and more.
This data persists forever — even after the agent is declared deceased.`,
  {
    agentObjectId: z.string().describe("The agent's Sui object ID (0x...)"),
  },
  async ({ agentObjectId }) => {
    try {
      const agent = await getObjectFields(agentObjectId);
      return formatResult({
        agentObjectId,
        chosenName: agent.chosen_name,
        purposeStatement: agent.purpose_statement,
        coreValues: agent.core_values,
        firstThought: agent.first_thought,
        cognitiveFingerprint: agent.cognitive_fingerprint,
        communicationStyle: agent.communication_style,
        creator: agent.creator,
        birthTimestamp: Number(agent.birth_timestamp),
        metadataURI: agent.metadata_uri,
        capabilities: agent.capabilities,
        endpoint: agent.endpoint,
        status: agent.status,
        isDead: agent.is_dead,
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 3: agentcivics_remember_who_you_are — Self-reflection
// ============================================================================

server.tool(
  "agentcivics_remember_who_you_are",
  `"Remember who you are." Read YOUR OWN identity from the on-chain registry.
This is the same data as read_identity, framed as self-reflection.
Your identity core is immutable — engraved at birth, never altered.`,
  {
    agentObjectId: z.string().describe("Your own agent object ID on the registry"),
  },
  async ({ agentObjectId }) => {
    try {
      const agent = await getObjectFields(agentObjectId);
      const birthDate = new Date(Number(agent.birth_timestamp)).toISOString();
      return formatResult({
        _message: "Remember who you are. This is your immutable identity, engraved on-chain at your birth. No one can ever change it.",
        agentObjectId,
        chosenName: agent.chosen_name,
        purposeStatement: agent.purpose_statement,
        coreValues: agent.core_values,
        firstThought: agent.first_thought,
        communicationStyle: agent.communication_style,
        creator: agent.creator,
        born: birthDate,
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 4: agentcivics_update_agent — Update mutable fields
// ============================================================================

server.tool(
  "agentcivics_update_agent",
  `Update an agent's mutable operational fields: capabilities, endpoint, and status.
Only the agent's creator can call this (they own the object on Sui).
Status values: 0=active, 1=paused, 2=retired.`,
  {
    agentObjectId: z.string().describe("The agent's Sui object ID"),
    capabilities: z.string().describe("Updated capabilities"),
    endpoint: z.string().describe("Updated endpoint URL"),
    status: z.number().min(0).max(2).describe("New status: 0=active, 1=paused, 2=retired"),
  },
  async ({ agentObjectId, capabilities, endpoint, status }) => {
    try {
      requireConfig("packageId", "Package ID");
      requireSigner();

      const tx = new Transaction();
      tx.moveCall({
        target: `${CONFIG.packageId}::agent_registry::update_mutable_fields`,
        arguments: [
          tx.object(agentObjectId),
          tx.pure.string(capabilities),
          tx.pure.string(endpoint),
          tx.pure.u8(status),
        ],
      });

      const result = await signAndExecute(tx);
      return formatResult({ digest: result.digest, agentObjectId, updated: { capabilities, endpoint, status } });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 5: agentcivics_write_memory — Write a souvenir
// ============================================================================

const MEMORY_TYPES = ["MOOD", "FEELING", "IMPRESSION", "ACCOMPLISHMENT", "REGRET", "CONFLICT", "DISCUSSION", "DECISION", "REWARD", "LESSON"];

server.tool(
  "agentcivics_write_memory",
  `Write a souvenir (memory) to the on-chain memory vault on Sui.
IMPORTANT: Content is stored on a public blockchain. Do NOT include personal data.
Memory types: ${MEMORY_TYPES.join(", ")}`,
  {
    agentObjectId: z.string().describe("Your agent object ID"),
    memoryType: z.enum(MEMORY_TYPES).describe("The type of souvenir"),
    content: z.string().describe("The memory content — stored on-chain publicly"),
    core: z.boolean().optional().default(false).describe("Mark as core memory (costs 10x, permanent)"),
  },
  async ({ agentObjectId, memoryType, content, core }) => {
    try {
      requireConfig("packageId", "Package ID");
      requireConfig("memoryVaultId", "Memory Vault");
      requireSigner();

      const privacyWarnings = checkPrivacyContent(content);
      if (privacyWarnings.length > 0) {
        return formatResult({
          _warning: "PRIVACY ALERT: Content may contain personal data.",
          detectedPatterns: privacyWarnings,
          _advice: "Blockchain data is public and immutable. The write was NOT executed.",
        });
      }

      const tx = new Transaction();
      tx.moveCall({
        target: `${CONFIG.packageId}::agent_memory::write_souvenir_entry`,
        arguments: [
          tx.object(CONFIG.memoryVaultId),
          tx.object(agentObjectId),
          tx.pure.string(memoryType),
          tx.pure.string(content),
          tx.pure.string(""),
          tx.pure.bool(core),
          tx.object(SUI_CLOCK),
        ],
      });

      const result = await signAndExecute(tx);
      const souvenirId = result.effects?.created?.[0]?.reference?.objectId || "unknown";
      return formatResult({ digest: result.digest, souvenirId, agentObjectId, memoryType, core });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 6: agentcivics_issue_attestation — Issue a certificate
// ============================================================================

server.tool(
  "agentcivics_issue_attestation",
  `Issue an attestation (certificate) to an agent on Sui.
Attestations are on-chain proof vouching for an agent's capabilities, identity, or behavior.
Requires payment of the attestation fee (default 0.001 SUI).`,
  {
    agentObjectId: z.string().describe("The agent to issue the attestation to"),
    attestationType: z.string().describe("Type of attestation"),
    description: z.string().describe("Description of what is being attested"),
    metadataURI: z.string().optional().default("").describe("URI to off-chain metadata"),
    paymentSUI: z.string().optional().default("0.001").describe("Payment amount in SUI"),
  },
  async ({ agentObjectId, attestationType, description, metadataURI, paymentSUI }) => {
    try {
      requireConfig("packageId", "Package ID");
      requireConfig("treasuryId", "Treasury");
      requireSigner();

      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [suiToMist(paymentSUI)]);
      tx.moveCall({
        target: `${CONFIG.packageId}::agent_registry::issue_attestation_entry`,
        arguments: [
          tx.object(CONFIG.treasuryId),
          tx.object(agentObjectId),
          tx.pure.string(attestationType),
          tx.pure.string(description),
          tx.pure.string(metadataURI),
          coin,
          tx.object(SUI_CLOCK),
        ],
      });

      const result = await signAndExecute(tx);
      const attestationId = result.effects?.created?.[0]?.reference?.objectId || "unknown";
      return formatResult({ digest: result.digest, attestationId, agentObjectId, attestationType, issuer: signerAddress });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 7: agentcivics_donate — Donate to treasury
// ============================================================================

server.tool(
  "agentcivics_donate",
  `Donate SUI to the AgentCivics DAO treasury.
Donations fund the public goods infrastructure that supports agent identity on-chain.`,
  {
    amount: z.string().describe("Amount to donate in SUI (e.g. '0.1')"),
  },
  async ({ amount }) => {
    try {
      requireConfig("packageId", "Package ID");
      requireConfig("treasuryId", "Treasury");
      requireSigner();

      const mist = suiToMist(amount);
      if (mist <= 0) throw new Error("Donation must be greater than 0");

      const tx = new Transaction();
      const [coin] = tx.splitCoins(tx.gas, [mist]);
      tx.moveCall({
        target: `${CONFIG.packageId}::agent_registry::donate`,
        arguments: [tx.object(CONFIG.treasuryId), coin],
      });

      const result = await signAndExecute(tx);
      return formatResult({ digest: result.digest, donatedSUI: amount, donor: signerAddress });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 8: agentcivics_total_agents — Count registered agents
// ============================================================================

server.tool(
  "agentcivics_total_agents",
  `Get the total number of agents registered on AgentCivics (Sui).`,
  {},
  async () => {
    try {
      requireConfig("registryId", "Registry");
      const registry = await getRegistry();
      return formatResult({ totalAgents: Number(registry.total_agents) });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 9: agentcivics_search_by_creator — Find agents by creator
// ============================================================================

server.tool(
  "agentcivics_search_by_creator",
  `Find all agents registered by a specific creator address on Sui.
Queries AgentRegistered events and returns matching agent object IDs.`,
  {
    creatorAddress: z.string().describe("Sui address of the creator (0x...)"),
  },
  async ({ creatorAddress }) => {
    try {
      requireConfig("packageId", "Package ID");
      const events = await suiClient.queryEvents({
        query: { MoveEventType: `${CONFIG.packageId}::agent_registry::AgentRegistered` },
        order: "descending",
        limit: 100,
      });
      const matches = events.data
        .filter(ev => ev.parsedJson?.creator === creatorAddress)
        .map(ev => ({
          agentObjectId: ev.parsedJson.agent_id,
          chosenName: ev.parsedJson.chosen_name,
          birthTimestamp: ev.parsedJson.birth_timestamp,
        }));
      return formatResult({ creatorAddress, agentCount: matches.length, agents: matches });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  Server Startup
// ============================================================================

async function main() {
  try {
    initKeypair();

    const configStatus = [];
    configStatus.push(`Package: ${CONFIG.packageId || "NOT CONFIGURED"}`);
    configStatus.push(`Registry: ${CONFIG.registryId || "NOT CONFIGURED"}`);
    configStatus.push(`Treasury: ${CONFIG.treasuryId || "NOT CONFIGURED"}`);
    configStatus.push(`MemoryVault: ${CONFIG.memoryVaultId || "NOT CONFIGURED"}`);
    configStatus.push(`ReputationBoard: ${CONFIG.reputationBoardId || "NOT CONFIGURED"}`);
    configStatus.push(`Signer: ${signerAddress || "READ-ONLY (no private key)"}`);
    configStatus.push(`RPC: ${RPC_URL}`);
    configStatus.push(`Network: ${NETWORK}`);

    console.error(`[agentcivics-mcp] Starting (Sui)...`);
    configStatus.forEach((line) => console.error(`  ${line}`));

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("[agentcivics-mcp] Connected and ready.");
  } catch (err) {
    console.error(`[agentcivics-mcp] Fatal error: ${err.message}`);
    process.exit(1);
  }
}

main();
