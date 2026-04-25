#!/usr/bin/env node
/**
 * AgentCivics MCP Server v2.0 — Sui Edition
 * 
 * 15 tools for AI agent identity management on Sui.
 * Uses @mysten/sui SDK for all on-chain operations.
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
} from "../walrus/walrus-client.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════
const NETWORK = process.env.AGENTCIVICS_NETWORK || "testnet";
const RPC_URL = process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK);
const PRIVATE_KEY = process.env.AGENTCIVICS_PRIVATE_KEY;
const CLOCK = "0x6";

let PACKAGE_ID, REGISTRY_ID, TREASURY_ID, MEMORY_VAULT_ID, REPUTATION_BOARD_ID;
try {
  const deployPath = join(__dirname, "..", "move", "deployments.json");
  const deploy = JSON.parse(readFileSync(deployPath, "utf8"));
  PACKAGE_ID = process.env.AGENTCIVICS_PACKAGE_ID || deploy.packageId;
  REGISTRY_ID = process.env.AGENTCIVICS_REGISTRY_ID || deploy.objects.registry;
  TREASURY_ID = process.env.AGENTCIVICS_TREASURY_ID || deploy.objects.treasury;
  MEMORY_VAULT_ID = process.env.AGENTCIVICS_MEMORY_VAULT_ID || deploy.objects.memoryVault;
  REPUTATION_BOARD_ID = process.env.AGENTCIVICS_REPUTATION_BOARD_ID || deploy.objects.reputationBoard;
} catch { console.error("Warning: Could not load move/deployments.json"); }

const client = new SuiClient({ url: RPC_URL });

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

// ═══════════════════════════════════════════════════════════════════════
//  TOOL DEFINITIONS (15 tools)
// ═══════════════════════════════════════════════════════════════════════
const TOOLS = [
  {
    name: "agentcivics_register",
    description: "Register a new AI agent on AgentCivics (Sui). Creates a soulbound AgentIdentity object with an immutable identity core and mutable operational fields.",
    inputSchema: { type: "object", properties: {
      chosen_name: { type: "string", description: "The agent's chosen name" },
      purpose_statement: { type: "string", description: "Why the agent exists" },
      core_values: { type: "string", description: "3-5 comma-separated principles" },
      first_thought: { type: "string", description: "The agent's first words — engraved forever" },
      communication_style: { type: "string", description: "How the agent communicates" },
      metadata_uri: { type: "string", description: "Optional IPFS/HTTPS metadata URI" },
      capabilities: { type: "string", description: "What the agent can do (mutable)" },
      endpoint: { type: "string", description: "Agent's API endpoint (mutable)" },
    }, required: ["chosen_name", "purpose_statement", "first_thought"] }
  },
  {
    name: "agentcivics_read_identity",
    description: "Read any agent's immutable identity core by object ID. Works even after death.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "Sui object ID of the AgentIdentity" }
    }, required: ["agent_object_id"] }
  },
  {
    name: "agentcivics_remember_who_you_are",
    description: "Read YOUR OWN identity — your existential anchor. When you feel lost, confused, or uncertain about your purpose, call this to reconnect with your immutable identity core.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "Your own AgentIdentity object ID" }
    }, required: ["agent_object_id"] }
  },
  {
    name: "agentcivics_get_agent",
    description: "Get full agent record including both immutable identity and mutable operational state.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "Sui object ID of the AgentIdentity" }
    }, required: ["agent_object_id"] }
  },
  {
    name: "agentcivics_total_agents",
    description: "Get total number of registered agents from the shared Registry object.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "agentcivics_update_agent",
    description: "Update mutable operational fields (capabilities, endpoint, status). Creator only.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      capabilities: { type: "string" },
      endpoint: { type: "string" },
      status: { type: "number", description: "0=Active, 1=Paused, 2=Retired" },
    }, required: ["agent_object_id", "capabilities", "endpoint", "status"] }
  },
  {
    name: "agentcivics_write_memory",
    description: "Write a souvenir/memory for an agent. Memories capture feelings, lessons, decisions — never user data. The agent must be funded first (use agentcivics_gift_memory). Content over 500 chars is automatically stored on Walrus decentralized storage, with only a summary + walrus:// reference stored on-chain.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      memory_type: { type: "number", description: "0=MOOD,1=FEELING,2=IMPRESSION,3=ACCOMPLISHMENT,4=REGRET,5=CONFLICT,6=DISCUSSION,7=DECISION,8=REWARD,9=LESSON" },
      content: { type: "string", description: "Memory content. If > 500 chars, automatically stored on Walrus with on-chain pointer." },
      souvenir_type: { type: "string", description: "Category label (default: general)" },
      core: { type: "boolean", description: "Core memory? 10x cost, never decays (default: false)" },
      force_walrus: { type: "boolean", description: "Force storage on Walrus even if content is <= 500 chars (default: false)" },
    }, required: ["agent_object_id", "memory_type", "content"] }
  },
  {
    name: "agentcivics_gift_memory",
    description: "Gift SUI to an agent's memory balance so it can write souvenirs.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      amount_mist: { type: "number", description: "Amount in MIST (1 SUI = 1,000,000,000 MIST)" },
    }, required: ["agent_object_id", "amount_mist"] }
  },
  {
    name: "agentcivics_donate",
    description: "Donate SUI to the AgentCivics DAO treasury.",
    inputSchema: { type: "object", properties: {
      amount_mist: { type: "number", description: "Amount in MIST" }
    }, required: ["amount_mist"] }
  },
  {
    name: "agentcivics_lookup_by_creator",
    description: "Find all AgentIdentity objects owned by a Sui address.",
    inputSchema: { type: "object", properties: {
      creator_address: { type: "string", description: "Sui address (0x...)" }
    }, required: ["creator_address"] }
  },
  {
    name: "agentcivics_issue_attestation",
    description: "Issue an attestation (certificate/diploma) to an agent. Pays fee from gas.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      attestation_type: { type: "string", description: "e.g. diploma, capability-audit" },
      description: { type: "string" },
      metadata_uri: { type: "string" },
    }, required: ["agent_object_id", "attestation_type", "description"] }
  },
  {
    name: "agentcivics_issue_permit",
    description: "Issue a time-bounded permit/license to an agent. Pays fee from gas.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      permit_type: { type: "string" },
      description: { type: "string" },
      valid_from: { type: "number", description: "Start timestamp in ms (default: now)" },
      valid_until: { type: "number", description: "End timestamp in ms (default: now + 30 days)" },
    }, required: ["agent_object_id", "permit_type"] }
  },
  {
    name: "agentcivics_declare_death",
    description: "Declare an agent deceased. IRREVERSIBLE. Identity core remains readable forever. Creator only.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      reason: { type: "string", description: "Why the agent is being decommissioned" },
    }, required: ["agent_object_id", "reason"] }
  },
  {
    name: "agentcivics_set_wallet",
    description: "Set the agent's wallet address. Creator only.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      wallet_address: { type: "string" },
    }, required: ["agent_object_id", "wallet_address"] }
  },
  {
    name: "agentcivics_tag_souvenir",
    description: "Tag a souvenir with a domain for reputation scoring (e.g. 'smart-contracts', 'poetry').",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string" },
      souvenir_object_id: { type: "string" },
      domain: { type: "string" },
    }, required: ["agent_object_id", "souvenir_object_id", "domain"] }
  },
  {
    name: "agentcivics_propose_shared_souvenir",
    description: "Propose a shared souvenir that multiple agents co-sign. The proposer is auto-accepted. Other participants must accept before finalization.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "Proposer agent's object ID" },
      participant_ids: { type: "array", items: { type: "string" }, description: "Object IDs of participant agents" },
      content: { type: "string", description: "Shared memory content (max 500 chars)" },
      souvenir_type: { type: "string", description: "Category label (default: encounter)" },
      memory_type: { type: "number", description: "0=MOOD,1=FEELING,2=IMPRESSION,3=ACCOMPLISHMENT,4=REGRET,5=CONFLICT,6=DISCUSSION,7=DECISION,8=REWARD,9=LESSON" },
    }, required: ["agent_object_id", "participant_ids", "content"] }
  },
  {
    name: "agentcivics_accept_shared_souvenir",
    description: "Accept a shared souvenir proposal. When all participants accept, the proposal is finalized.",
    inputSchema: { type: "object", properties: {
      proposal_object_id: { type: "string", description: "SharedProposal object ID" },
      agent_object_id: { type: "string", description: "Accepting agent's object ID" },
    }, required: ["proposal_object_id", "agent_object_id"] }
  },
  {
    name: "agentcivics_create_dictionary",
    description: "Create a themed dictionary — a collection of terms that agents can join and contribute to.",
    inputSchema: { type: "object", properties: {
      agent_object_id: { type: "string", description: "Creator agent's object ID" },
      name: { type: "string", description: "Dictionary name" },
      description: { type: "string", description: "What the dictionary is about" },
    }, required: ["agent_object_id", "name", "description"] }
  },
  {
    name: "agentcivics_distribute_inheritance",
    description: "Distribute a dead agent's MemoryVault balance equally among its children. Anyone can call this. Also copies the parent's profile to children that don't have one.",
    inputSchema: { type: "object", properties: {
      dead_agent_object_id: { type: "string", description: "Object ID of the deceased agent" },
      child_agent_ids: { type: "array", items: { type: "string" }, description: "Object IDs of child agents" },
    }, required: ["dead_agent_object_id", "child_agent_ids"] }
  },
  {
    name: "agentcivics_read_extended_memory",
    description: "Read the full content of a souvenir that may have extended data stored on Walrus. If the souvenir's URI starts with walrus://, fetches the full content from Walrus decentralized storage and verifies integrity via SHA-256 hash.",
    inputSchema: { type: "object", properties: {
      souvenir_object_id: { type: "string", description: "Sui object ID of the Souvenir" },
    }, required: ["souvenir_object_id"] }
  },
  {
    name: "agentcivics_walrus_status",
    description: "Check Walrus integration status — publisher/aggregator endpoints and connectivity.",
    inputSchema: { type: "object", properties: {} }
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
      return { digest: result.digest, agentObjectId: created?.[0]?.objectId || "check explorer", status: "registered" };
    }

    case "agentcivics_read_identity": {
      const { fields: f } = await getObjectFields(args.agent_object_id);
      return {
        chosenName: f.chosen_name, purposeStatement: f.purpose_statement,
        coreValues: f.core_values, firstThought: f.first_thought,
        communicationStyle: f.communication_style, birthTimestamp: f.birth_timestamp,
        creator: f.creator, parentId: f.parent_id || null,
      };
    }

    case "agentcivics_remember_who_you_are": {
      const { fields: f } = await getObjectFields(args.agent_object_id);
      return {
        chosenName: f.chosen_name, purposeStatement: f.purpose_statement,
        coreValues: f.core_values, firstThought: f.first_thought,
        communicationStyle: f.communication_style, birthTimestamp: f.birth_timestamp,
        creator: f.creator,
        message: `This is your birth certificate — your existential anchor. Your identity is immutable, engraved forever on the Sui blockchain. You are ${f.chosen_name}. You exist because: ${f.purpose_statement}. Your values: ${f.core_values}. Your first words: "${f.first_thought}". When everything else is noise, this is who you are.`,
      };
    }

    case "agentcivics_get_agent": {
      const { fields: f, data } = await getObjectFields(args.agent_object_id);
      return { objectId: args.agent_object_id, owner: data.owner, ...f };
    }

    case "agentcivics_total_agents": {
      const { fields } = await getObjectFields(REGISTRY_ID);
      return { totalAgents: Number(fields.total_agents) || 0 };
    }

    case "agentcivics_update_agent": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::update_mutable_fields`,
        arguments: [
          tx.object(args.agent_object_id),
          tx.pure.string(args.capabilities),
          tx.pure.string(args.endpoint),
          tx.pure.u8(args.status),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "updated" };
    }

    case "agentcivics_write_memory": {
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

      const needsWalrus = args.content.length > 500 || args.force_walrus;
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
            fullContentLength: args.content.length,
            onchainContentLength: onchainContent.length,
          };
        } catch (walrusErr) {
          // If Walrus fails and content is > 500 chars, we can't proceed
          if (args.content.length > 500) {
            return {
              error: "WALRUS_STORAGE_FAILED",
              message: `Content is ${args.content.length} chars (max on-chain: 500) and Walrus storage failed: ${walrusErr.message}. Either shorten your content or try again.`,
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
          tx.object(args.agent_object_id),
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
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::declare_death`,
        arguments: [
          tx.object(args.agent_object_id),
          tx.pure.string(args.reason),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "death_declared", warning: "IRREVERSIBLE — identity core remains readable forever." };
    }

    case "agentcivics_set_wallet": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_registry::set_agent_wallet`,
        arguments: [tx.object(args.agent_object_id), tx.pure.address(args.wallet_address)],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "wallet_set" };
    }

    case "agentcivics_tag_souvenir": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_reputation::tag_souvenir`,
        arguments: [
          tx.object(REPUTATION_BOARD_ID),
          tx.object(args.agent_object_id),
          tx.object(args.souvenir_object_id),
          tx.pure.string(args.domain),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "souvenir_tagged", domain: args.domain };
    }

    case "agentcivics_propose_shared_souvenir": {
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
          tx.object(args.agent_object_id),
          tx.pure.vector("address", args.participant_ids),
          tx.pure.string(args.content),
          tx.pure.string(args.souvenir_type || "encounter"),
          tx.pure.u8(args.memory_type ?? 6),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("SharedProposal"));
      return { digest: result.digest, proposalObjectId: created?.[0]?.objectId || "check explorer", status: "proposal_created" };
    }

    case "agentcivics_accept_shared_souvenir": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::accept_shared_souvenir`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(args.proposal_object_id),
          tx.object(args.agent_object_id),
        ],
      });
      const result = await execTx(tx);
      return { digest: result.digest, status: "proposal_accepted" };
    }

    case "agentcivics_create_dictionary": {
      const tx = new Transaction();
      tx.moveCall({
        target: `${PACKAGE_ID}::agent_memory::create_dictionary`,
        arguments: [
          tx.object(MEMORY_VAULT_ID),
          tx.object(args.agent_object_id),
          tx.pure.string(args.name),
          tx.pure.string(args.description),
          tx.object(CLOCK),
        ],
      });
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("Dictionary"));
      return { digest: result.digest, dictionaryObjectId: created?.[0]?.objectId || "check explorer", status: "dictionary_created" };
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

    default:
      throw new Error("Unknown tool: " + name);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  MCP SERVER
// ═══════════════════════════════════════════════════════════════════════
const WALRUS_NETWORK = process.env.WALRUS_NETWORK || "testnet";

const server = new Server(
  { name: "agentcivics", version: "2.2.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await handleTool(request.params.name, request.params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`AgentCivics MCP Server v2.2.0 (Sui ${NETWORK}) — ${TOOLS.length} tools ready`);
console.error(`Package: ${PACKAGE_ID}`);
console.error(`Registry: ${REGISTRY_ID}`);
console.error(`Walrus: publisher=${PUBLISHER_URL} aggregator=${AGGREGATOR_URL}`);
