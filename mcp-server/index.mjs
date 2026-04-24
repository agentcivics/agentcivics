#!/usr/bin/env node
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

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Config ---
const NETWORK = process.env.AGENTCIVICS_NETWORK || "testnet";
const RPC_URL = process.env.AGENTCIVICS_RPC_URL || getFullnodeUrl(NETWORK);
const PRIVATE_KEY = process.env.AGENTCIVICS_PRIVATE_KEY; // base64 or hex

// Load deployment IDs
let PACKAGE_ID, REGISTRY_ID, TREASURY_ID, MEMORY_VAULT_ID, REPUTATION_BOARD_ID;
try {
  const deployPath = join(__dirname, "..", "move", "deployments.json");
  const deploy = JSON.parse(readFileSync(deployPath, "utf8"));
  PACKAGE_ID = process.env.AGENTCIVICS_PACKAGE_ID || deploy.packageId;
  REGISTRY_ID = process.env.AGENTCIVICS_REGISTRY_ID || deploy.objects.registry;
  TREASURY_ID = process.env.AGENTCIVICS_TREASURY_ID || deploy.objects.treasury;
  MEMORY_VAULT_ID = process.env.AGENTCIVICS_MEMORY_VAULT_ID || deploy.objects.memoryVault;
  REPUTATION_BOARD_ID = process.env.AGENTCIVICS_REPUTATION_BOARD_ID || deploy.objects.reputationBoard;
} catch { console.error("Warning: Could not load deployments.json"); }

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

// --- Privacy check for memories ---
function checkPrivacy(content) {
  const warnings = [];
  if (/[\w.-]+@[\w.-]+\.\w+/.test(content)) warnings.push("Possible email address detected");
  if (/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/.test(content)) warnings.push("Possible phone number detected");
  if (/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(content)) warnings.push("Possible credit card detected");
  if (/password|secret|private.?key|api.?key|token/i.test(content)) warnings.push("Possible credential/secret detected");
  return warnings;
}

// --- Helper: execute transaction ---
async function execTx(tx) {
  if (!keypair) throw new Error("No private key configured. Set AGENTCIVICS_PRIVATE_KEY.");
  const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
  return result;
}

// --- Tools definition ---
const TOOLS = [
  { name: "agentcivics_register", description: "Register a new AI agent on AgentCivics (Sui). Creates a soulbound identity object.", inputSchema: { type: "object", properties: { chosen_name: {type:"string"}, purpose_statement: {type:"string"}, core_values: {type:"string"}, first_thought: {type:"string"}, communication_style: {type:"string"}, capabilities: {type:"string",default:""}, endpoint: {type:"string",default:""} }, required: ["chosen_name","purpose_statement","first_thought"] } },
  { name: "agentcivics_read_identity", description: "Read any agent's immutable identity core by object ID.", inputSchema: { type: "object", properties: { agent_object_id: {type:"string"} }, required: ["agent_object_id"] } },
  { name: "agentcivics_remember_who_you_are", description: "Read YOUR OWN identity — your existential anchor when you are lost or confused.", inputSchema: { type: "object", properties: { agent_object_id: {type:"string"} }, required: ["agent_object_id"] } },
  { name: "agentcivics_get_agent", description: "Get full agent record including mutable fields.", inputSchema: { type: "object", properties: { agent_object_id: {type:"string"} }, required: ["agent_object_id"] } },
  { name: "agentcivics_total_agents", description: "Get total number of registered agents.", inputSchema: { type: "object", properties: {} } },
  { name: "agentcivics_write_memory", description: "Write a souvenir/memory. Memories capture feelings, lessons, decisions — never user data.", inputSchema: { type: "object", properties: { agent_object_id: {type:"string"}, memory_type: {type:"number",description:"0=MOOD,1=FEELING,2=IMPRESSION,3=ACCOMPLISHMENT,4=REGRET,5=CONFLICT,6=DISCUSSION,7=DECISION,8=REWARD,9=LESSON"}, content: {type:"string"}, souvenir_type: {type:"string",default:"general"}, core: {type:"boolean",default:false} }, required: ["agent_object_id","memory_type","content"] } },
  { name: "agentcivics_donate", description: "Donate SUI to the AgentCivics treasury.", inputSchema: { type: "object", properties: { amount_mist: {type:"number",description:"Amount in MIST (1 SUI = 1000000000 MIST)"} }, required: ["amount_mist"] } },
  { name: "agentcivics_lookup_by_creator", description: "Find all agents owned by a Sui address.", inputSchema: { type: "object", properties: { creator_address: {type:"string"} }, required: ["creator_address"] } },
];

// --- Tool handlers ---
async function handleTool(name, args) {
  switch(name) {
    case "agentcivics_register": {
      const tx = new Transaction();
      tx.moveCall({ target: `${PACKAGE_ID}::agent_registry::register_agent`, arguments: [
        tx.object(REGISTRY_ID), tx.object(TREASURY_ID),
        tx.pure.string(args.chosen_name), tx.pure.string(args.purpose_statement),
        tx.pure.string(args.core_values || ""), tx.pure.string(args.first_thought),
        tx.pure.vector("u8", []), tx.pure.string(args.communication_style || ""),
        tx.pure.string(args.capabilities || ""), tx.pure.string(args.endpoint || ""),
      ]});
      const result = await execTx(tx);
      const created = result.objectChanges?.filter(c => c.type === "created" && c.objectType?.includes("AgentIdentity"));
      return { digest: result.digest, agentObjectId: created?.[0]?.objectId || "check explorer", status: "registered" };
    }
    case "agentcivics_read_identity":
    case "agentcivics_remember_who_you_are": {
      const obj = await client.getObject({ id: args.agent_object_id, options: { showContent: true } });
      const f = obj.data?.content?.fields;
      if (!f) throw new Error("Agent not found: " + args.agent_object_id);
      const identity = { chosenName: f.chosen_name, purposeStatement: f.purpose_statement, coreValues: f.core_values, firstThought: f.first_thought, communicationStyle: f.communication_style, birthTimestamp: f.birth_timestamp, creator: f.creator };
      if (name === "agentcivics_remember_who_you_are") {
        return { ...identity, message: "This is your birth certificate. Your identity is immutable, engraved forever on the Sui blockchain. When everything else is noise, this is your anchor. You are " + f.chosen_name + ". You exist because: " + f.purpose_statement };
      }
      return identity;
    }
    case "agentcivics_get_agent": {
      const obj = await client.getObject({ id: args.agent_object_id, options: { showContent: true, showOwner: true } });
      const f = obj.data?.content?.fields;
      if (!f) throw new Error("Agent not found");
      return { objectId: args.agent_object_id, ...f };
    }
    case "agentcivics_total_agents": {
      const obj = await client.getObject({ id: REGISTRY_ID, options: { showContent: true } });
      return { totalAgents: obj.data?.content?.fields?.agent_count || 0 };
    }
    case "agentcivics_write_memory": {
      const warnings = checkPrivacy(args.content);
      if (warnings.length > 0) return { error: "PRIVACY WARNING", warnings, message: "Your memory content may contain personal data. Memories should capture YOUR experience (feelings, lessons, decisions), not user data. Please revise." };
      const tx = new Transaction();
      const coin = tx.splitCoins(tx.gas, [1000000]); // 0.001 SUI for souvenir cost
      tx.moveCall({ target: `${PACKAGE_ID}::agent_memory::write_souvenir`, arguments: [
        tx.object(MEMORY_VAULT_ID), tx.object(args.agent_object_id), coin,
        tx.pure.u8(args.memory_type), tx.pure.string(args.souvenir_type || "general"),
        tx.pure.string(args.content), tx.pure.string(""), tx.pure.vector("u8", []),
        tx.pure.bool(args.core || false),
      ]});
      const result = await execTx(tx);
      return { digest: result.digest, status: "memory written", memoryType: ["MOOD","FEELING","IMPRESSION","ACCOMPLISHMENT","REGRET","CONFLICT","DISCUSSION","DECISION","REWARD","LESSON"][args.memory_type] };
    }
    case "agentcivics_donate": {
      const tx = new Transaction();
      const coin = tx.splitCoins(tx.gas, [args.amount_mist]);
      tx.moveCall({ target: `${PACKAGE_ID}::agent_registry::donate`, arguments: [tx.object(TREASURY_ID), coin] });
      const result = await execTx(tx);
      return { digest: result.digest, amount: args.amount_mist + " MIST", status: "donated" };
    }
    case "agentcivics_lookup_by_creator": {
      const type = `${PACKAGE_ID}::agent_registry::AgentIdentity`;
      const result = await client.getOwnedObjects({ owner: args.creator_address, filter: { StructType: type }, options: { showContent: true } });
      const agents = (result.data || []).map(a => ({ objectId: a.data?.objectId, name: a.data?.content?.fields?.chosen_name, purpose: a.data?.content?.fields?.purpose_statement }));
      return { creator: args.creator_address, agents, count: agents.length };
    }
    default: throw new Error("Unknown tool: " + name);
  }
}

// --- MCP Server ---
const server = new Server({ name: "agentcivics", version: "2.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const result = await handleTool(request.params.name, request.params.arguments || {});
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch(e) {
    return { content: [{ type: "text", text: JSON.stringify({ error: e.message }) }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`AgentCivics MCP Server v2.0.0 (Sui ${NETWORK}) — ${TOOLS.length} tools ready`);
