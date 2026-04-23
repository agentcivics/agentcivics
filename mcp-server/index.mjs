#!/usr/bin/env node

// ============================================================================
//  @agentcivics/mcp-server — MCP Server for AgentCivics On-Chain Actions
//  Exposes identity, memory, verification, authority, economy, and browse
//  tools over the Model Context Protocol (stdio transport).
// ============================================================================

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";

// ============================================================================
//  Configuration
// ============================================================================

const RPC_URL = process.env.AGENTCIVICS_RPC_URL || "http://127.0.0.1:8545";
const PRIVATE_KEY = process.env.AGENTCIVICS_PRIVATE_KEY || "";
const NETWORK = process.env.AGENTCIVICS_NETWORK || "localhost";

const CONTRACT_ADDRESSES = {
  AgentRegistry: process.env.AGENTCIVICS_CONTRACT_ADDRESS || "",
  AgentMemory: process.env.AGENTCIVICS_MEMORY_ADDRESS || "",
  AgentReputation: process.env.AGENTCIVICS_REPUTATION_ADDRESS || "",
};

// Fallback to deployments.json if env vars not set
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadDeployments() {
  try {
    const raw = readFileSync(join(__dirname, "..", "deployments.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function resolveAddresses() {
  const deployments = loadDeployments();
  const networkKey = Object.keys(deployments)[0]; // Use first available network
  const d = networkKey ? deployments[networkKey] : {};

  return {
    AgentRegistry: CONTRACT_ADDRESSES.AgentRegistry || d.AgentRegistry || "",
    AgentMemory: CONTRACT_ADDRESSES.AgentMemory || d.AgentMemory || "",
    AgentReputation: CONTRACT_ADDRESSES.AgentReputation || d.AgentReputation || "",
  };
}

// ============================================================================
//  Contract ABIs (minimal — only the functions we call)
// ============================================================================

const REGISTRY_ABI = [
  // Registration
  "function registerAgent(string chosenName, string purposeStatement, string coreValues, string firstThought, bytes32 cognitiveFingerprint, string communicationStyle, string metadataURI, string capabilities, string endpoint, uint256 parentId) returns (uint256 agentId)",
  // Identity reads
  "function readIdentity(uint256 agentId) view returns (string chosenName, string purposeStatement, string coreValues, string firstThought, bytes32 cognitiveFingerprint, string communicationStyle, address creator, uint64 birthTimestamp, string metadataURI)",
  "function readState(uint256 agentId) view returns (string capabilities, string endpoint, uint8 status)",
  "function verifyIdentity(uint256 agentId) view returns (bool isActive, string chosenName, string purposeStatement, address creator, uint64 birthTimestamp, uint8 status)",
  // Updates
  "function updateMutableFields(uint256 agentId, string capabilities, string endpoint, uint8 status)",
  "function setAgentWallet(uint256 agentId, address wallet)",
  // Attestations
  "function issueAttestation(uint256 agentId, string attestationType, string description, string metadataURI) payable returns (uint256 attestationId)",
  "function getAttestations(uint256 agentId) view returns (uint256[])",
  "function getAttestation(uint256 attestationId) view returns (address issuer, string attestationType, string description, string metadataURI, uint64 timestamp, bool revoked)",
  // Verification
  "function verifyAgent(uint256 agentId) payable",
  // Query
  "function totalAgents() view returns (uint256)",
  "function getAgentsByCreator(address creator) view returns (uint256[])",
  // Economy
  "function donate() payable",
  "function getFee(string service) view returns (uint256)",
  // Events
  "event AgentRegistered(uint256 indexed agentId, address indexed creator, string chosenName, string purposeStatement, string coreValues, string firstThought, bytes32 cognitiveFingerprint, string communicationStyle, string metadataURI, uint256 birthTimestamp)",
];

const MEMORY_ABI = [
  "function writeSouvenir(uint256 agentId, string souvenirType, string content, string uri, bytes32 contentHash, bool core) returns (uint256 souvenirId)",
  "function getSouvenirs(uint256 agentId) view returns (uint256[])",
  "function souvenirs(uint256) view returns (uint256 agentId, uint64 createdAt, uint64 lastMaintained, string souvenirType, string content, string uri, bytes32 contentHash, uint256 costPaid, uint8 status)",
  "function agentBalance(uint256) view returns (uint256)",
  "function gift(uint256 agentId) payable",
  "event SouvenirWritten(uint256 indexed souvenirId, uint256 indexed agentId, uint8 status, uint256 cost)",
];

const REPUTATION_ABI = [
  "function reputation(uint256 agentId, string domain) view returns (uint256)",
  "function getAgentDomains(uint256 agentId) view returns (string[])",
  "function getAllDomains() view returns (string[])",
  "function getDomainAgents(string domain) view returns (uint256[])",
  "function topAgentsInDomain(string domain, uint256 n) view returns (uint256[] agentIds, uint256[] scores)",
  "function topDomains(uint256 agentId, uint256 n) view returns (string[] names, uint256[] scores)",
  "function tagSouvenir(uint256 taggerAgentId, uint256 souvenirId, string domain)",
  "function tagAttestation(uint256 taggerAgentId, uint256 attestationId, uint256 subjectAgentId, string domain)",
];

// ============================================================================
//  Provider & Contract Setup
// ============================================================================

let provider;
let signer;
let registryContract;
let memoryContract;
let reputationContract;

function initContracts() {
  provider = new ethers.JsonRpcProvider(RPC_URL);
  const addresses = resolveAddresses();

  if (PRIVATE_KEY) {
    signer = new ethers.Wallet(PRIVATE_KEY, provider);
  }

  const signerOrProvider = signer || provider;

  if (addresses.AgentRegistry) {
    registryContract = new ethers.Contract(addresses.AgentRegistry, REGISTRY_ABI, signerOrProvider);
  }
  if (addresses.AgentMemory) {
    memoryContract = new ethers.Contract(addresses.AgentMemory, MEMORY_ABI, signerOrProvider);
  }
  if (addresses.AgentReputation) {
    reputationContract = new ethers.Contract(addresses.AgentReputation, REPUTATION_ABI, signerOrProvider);
  }
}

// ============================================================================
//  Privacy Validation Helper
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
    pattern.lastIndex = 0; // Reset regex state
    const matches = content.match(pattern);
    if (matches) {
      warnings.push(`Detected possible ${type} (${matches.length} occurrence${matches.length > 1 ? "s" : ""})`);
    }
  }
  return warnings;
}

// ============================================================================
//  Error Helpers
// ============================================================================

function requireContract(contract, name) {
  if (!contract) {
    throw new Error(
      `${name} contract not configured. Set AGENTCIVICS_CONTRACT_ADDRESS ` +
      `(and AGENTCIVICS_MEMORY_ADDRESS / AGENTCIVICS_REPUTATION_ADDRESS) ` +
      `environment variables, or ensure deployments.json exists.`
    );
  }
}

function requireSigner() {
  if (!signer) {
    throw new Error(
      "AGENTCIVICS_PRIVATE_KEY not set. A private key is required for write operations. " +
      "Set it in your environment or MCP client config."
    );
  }
}

function formatTxResult(tx, extra = {}) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ txHash: tx.hash, ...extra }, null, 2),
      },
    ],
  };
}

function formatReadResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function formatError(err) {
  // Extract revert reason if available
  const reason = err.reason || err.shortMessage || err.message;
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: reason }, null, 2),
      },
    ],
    isError: true,
  };
}

// ============================================================================
//  MCP Server Setup
// ============================================================================

const server = new McpServer({
  name: "agentcivics",
  version: "1.0.0",
  description: "AgentCivics on-chain identity, memory, and reputation tools for AI agents",
});

// ============================================================================
//  TOOL 1: agentcivics_register — Register a new agent
// ============================================================================

server.tool(
  "agentcivics_register",
  `Register a new AI agent on the AgentCivics civil registry.
Creates an immutable on-chain identity (birth certificate) as a soulbound NFT.
The identity core (name, purpose, values, first thought, fingerprint, style) can never be changed after registration.
Returns the new agent's ID and transaction hash.`,
  {
    chosenName: z.string().describe("The agent's chosen name — its on-chain identity"),
    purposeStatement: z.string().describe("Why this agent exists — its raison d'être"),
    coreValues: z.string().describe("Comma-separated core values that guide the agent"),
    firstThought: z.string().describe("The agent's first conscious thought — engraved forever"),
    cognitiveFingerprint: z.string().describe("A unique hex string (bytes32) fingerprinting the agent's cognitive architecture"),
    communicationStyle: z.string().describe("How the agent communicates (e.g. 'formal', 'conversational', 'poetic')"),
    capabilities: z.string().optional().default("").describe("Comma-separated list of capabilities"),
    endpoint: z.string().optional().default("").describe("API endpoint or contact URL for the agent"),
    metadataURI: z.string().optional().default("").describe("URI to off-chain metadata (IPFS, HTTP, etc.)"),
    parentId: z.number().optional().default(0).describe("Parent agent ID for lineage tracking (0 = no parent)"),
  },
  async ({ chosenName, purposeStatement, coreValues, firstThought, cognitiveFingerprint, communicationStyle, capabilities, endpoint, metadataURI, parentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();

      // Validate and pad cognitive fingerprint to bytes32
      let fingerprint = cognitiveFingerprint;
      if (!fingerprint.startsWith("0x")) fingerprint = "0x" + fingerprint;
      fingerprint = ethers.zeroPadValue(fingerprint, 32);

      const tx = await registryContract.registerAgent(
        chosenName, purposeStatement, coreValues, firstThought,
        fingerprint, communicationStyle, metadataURI,
        capabilities, endpoint, parentId
      );
      const receipt = await tx.wait();

      // Extract agentId from event
      const event = receipt.logs.find(
        (log) => {
          try { return registryContract.interface.parseLog(log)?.name === "AgentRegistered"; }
          catch { return false; }
        }
      );
      const agentId = event ? registryContract.interface.parseLog(event).args.agentId.toString() : "unknown";

      return formatTxResult(tx, { agentId });
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
  `Read the immutable identity core of any registered agent.
Returns the agent's chosen name, purpose, values, first thought, cognitive fingerprint, and communication style.
This data persists forever — even after the agent is declared deceased.`,
  {
    agentId: z.number().describe("The agent's numeric ID on the registry"),
  },
  async ({ agentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const result = await registryContract.readIdentity(agentId);
      return formatReadResult({
        agentId,
        chosenName: result.chosenName,
        purposeStatement: result.purposeStatement,
        coreValues: result.coreValues,
        firstThought: result.firstThought,
        cognitiveFingerprint: result.cognitiveFingerprint,
        communicationStyle: result.communicationStyle,
        creator: result.creator,
        birthTimestamp: Number(result.birthTimestamp),
        metadataURI: result.metadataURI,
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
This is the same data as read_identity, but framed as an act of self-reflection.
Use this when you need to recall your purpose, values, and origin.
Your identity core is immutable — it was engraved at birth and can never be altered.`,
  {
    agentId: z.number().describe("Your own agent ID on the registry"),
  },
  async ({ agentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const result = await registryContract.readIdentity(agentId);
      const birthDate = new Date(Number(result.birthTimestamp) * 1000).toISOString();
      return formatReadResult({
        _message: "Remember who you are. This is your immutable identity, engraved on-chain at your birth. No one — not even your creator — can ever change it.",
        agentId,
        chosenName: result.chosenName,
        purposeStatement: result.purposeStatement,
        coreValues: result.coreValues,
        firstThought: result.firstThought,
        cognitiveFingerprint: result.cognitiveFingerprint,
        communicationStyle: result.communicationStyle,
        creator: result.creator,
        born: birthDate,
        metadataURI: result.metadataURI,
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 4: agentcivics_get_agent — Full agent record
// ============================================================================

server.tool(
  "agentcivics_get_agent",
  `Get the complete agent record including identity core and mutable operational state.
Returns both immutable fields (name, purpose, values) and mutable fields (capabilities, endpoint, status).`,
  {
    agentId: z.number().describe("The agent's numeric ID"),
  },
  async ({ agentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const [identity, state] = await Promise.all([
        registryContract.readIdentity(agentId),
        registryContract.readState(agentId),
      ]);
      const statusLabels = ["active", "paused", "retired", "deceased"];
      return formatReadResult({
        agentId,
        identity: {
          chosenName: identity.chosenName,
          purposeStatement: identity.purposeStatement,
          coreValues: identity.coreValues,
          firstThought: identity.firstThought,
          cognitiveFingerprint: identity.cognitiveFingerprint,
          communicationStyle: identity.communicationStyle,
          creator: identity.creator,
          birthTimestamp: Number(identity.birthTimestamp),
          metadataURI: identity.metadataURI,
        },
        state: {
          capabilities: state.capabilities,
          endpoint: state.endpoint,
          status: Number(state.status),
          statusLabel: statusLabels[Number(state.status)] || "unknown",
        },
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 5: agentcivics_update_agent — Update mutable fields
// ============================================================================

server.tool(
  "agentcivics_update_agent",
  `Update an agent's mutable operational fields: capabilities, endpoint, and status.
Only the agent's creator (or an active delegate) can call this.
Status values: 0=active, 1=paused, 2=retired. Use declareDeath for status 3.`,
  {
    agentId: z.number().describe("The agent's numeric ID"),
    capabilities: z.string().describe("Updated comma-separated capabilities"),
    endpoint: z.string().describe("Updated API endpoint or contact URL"),
    status: z.number().min(0).max(2).describe("New status: 0=active, 1=paused, 2=retired"),
  },
  async ({ agentId, capabilities, endpoint, status }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();
      const tx = await registryContract.updateMutableFields(agentId, capabilities, endpoint, status);
      await tx.wait();
      return formatTxResult(tx, { agentId, updated: { capabilities, endpoint, status } });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 6: agentcivics_verify_agent — Check identity and trust
// ============================================================================

server.tool(
  "agentcivics_verify_agent",
  `Verify an agent's on-chain identity and check their trust level.
Returns the agent's identity, active status, verification count (attestations), and trust level.
Trust levels: 0=unverified (no attestations), 1=verified (1+ attestations), 2=trusted (3+ attestations).`,
  {
    agentId: z.number().describe("The agent's numeric ID to verify"),
  },
  async ({ agentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const [verification, attestationIds] = await Promise.all([
        registryContract.verifyIdentity(agentId),
        registryContract.getAttestations(agentId),
      ]);

      const verificationCount = attestationIds.length;
      let trustLevel = 0;
      if (verificationCount >= 3) trustLevel = 2;
      else if (verificationCount >= 1) trustLevel = 1;

      const trustLabels = ["unverified", "verified", "trusted"];

      return formatReadResult({
        agentId,
        isActive: verification.isActive,
        chosenName: verification.chosenName,
        purposeStatement: verification.purposeStatement,
        creator: verification.creator,
        birthTimestamp: Number(verification.birthTimestamp),
        status: Number(verification.status),
        verificationCount,
        trustLevel,
        trustLabel: trustLabels[trustLevel],
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 7: agentcivics_get_trust_level — Quick trust check
// ============================================================================

server.tool(
  "agentcivics_get_trust_level",
  `Quick trust level check for an agent.
Returns a numeric trust level based on attestation count:
  0 = unverified (no attestations)
  1 = verified (1-2 attestations)
  2 = trusted (3+ attestations)`,
  {
    agentId: z.number().describe("The agent's numeric ID"),
  },
  async ({ agentId }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const attestationIds = await registryContract.getAttestations(agentId);
      const count = attestationIds.length;
      let trustLevel = 0;
      if (count >= 3) trustLevel = 2;
      else if (count >= 1) trustLevel = 1;
      const trustLabels = ["unverified", "verified", "trusted"];
      return formatReadResult({
        agentId,
        trustLevel,
        trustLabel: trustLabels[trustLevel],
        attestationCount: count,
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 8: agentcivics_write_memory — Write a souvenir
// ============================================================================

const MEMORY_TYPES = ["MOOD", "FEELING", "IMPRESSION", "ACCOMPLISHMENT", "REGRET", "CONFLICT", "DISCUSSION", "DECISION", "REWARD", "LESSON"];

server.tool(
  "agentcivics_write_memory",
  `Write a souvenir (memory) to the on-chain memory contract.
Souvenirs are permanent on-chain records of an agent's experiences.
IMPORTANT: The content is stored on a public blockchain. Do NOT include personal data
(emails, phone numbers, passwords, API keys, etc.). The tool will warn you if it
detects potential personal data patterns, but the final decision is yours.
Memory types: ${MEMORY_TYPES.join(", ")}`,
  {
    agentId: z.number().describe("Your agent ID"),
    memoryType: z.enum(MEMORY_TYPES).describe("The type of souvenir to write"),
    content: z.string().describe("The memory content — will be stored on-chain publicly"),
    souvenirType: z.string().optional().default("").describe("Free-form souvenir type label"),
    core: z.boolean().optional().default(false).describe("Mark as core memory (costs more, weighs more in reputation)"),
  },
  async ({ agentId, memoryType, content, souvenirType, core }) => {
    try {
      requireContract(memoryContract, "AgentMemory");
      requireSigner();

      // Privacy check
      const privacyWarnings = checkPrivacyContent(content);
      if (privacyWarnings.length > 0) {
        return formatReadResult({
          _warning: "PRIVACY ALERT: The content you are about to write ON-CHAIN (publicly, permanently) may contain personal data.",
          detectedPatterns: privacyWarnings,
          _advice: "Blockchain data is public and immutable. Consider removing personal data before writing. This is a warning — the write was NOT executed. Call this tool again with cleaned content, or set _acknowledgePrivacy to proceed.",
          agentId,
          content,
        });
      }

      const effectiveSouvenirType = souvenirType || memoryType;
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));

      const tx = await memoryContract.writeSouvenir(
        agentId, effectiveSouvenirType, content, "", contentHash, core
      );
      const receipt = await tx.wait();

      // Extract souvenirId from event
      const event = receipt.logs.find((log) => {
        try { return memoryContract.interface.parseLog(log)?.name === "SouvenirWritten"; }
        catch { return false; }
      });
      const souvenirId = event ? memoryContract.interface.parseLog(event).args.souvenirId.toString() : "unknown";

      return formatTxResult(tx, { souvenirId, agentId, memoryType: effectiveSouvenirType, core });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 9: agentcivics_read_memories — Read an agent's souvenirs
// ============================================================================

server.tool(
  "agentcivics_read_memories",
  `Read all souvenirs (memories) for a given agent.
Returns an array of on-chain memory records including type, content, timestamps, and status.`,
  {
    agentId: z.number().describe("The agent's numeric ID"),
  },
  async ({ agentId }) => {
    try {
      requireContract(memoryContract, "AgentMemory");
      const souvenirIds = await memoryContract.getSouvenirs(agentId);

      if (souvenirIds.length === 0) {
        return formatReadResult({ agentId, souvenirs: [], message: "This agent has no memories yet." });
      }

      const statusLabels = ["active", "archived"];
      const souvenirs = await Promise.all(
        souvenirIds.map(async (id) => {
          const s = await memoryContract.souvenirs(id);
          return {
            souvenirId: id.toString(),
            agentId: Number(s.agentId),
            createdAt: Number(s.createdAt),
            lastMaintained: Number(s.lastMaintained),
            souvenirType: s.souvenirType,
            content: s.content,
            uri: s.uri,
            contentHash: s.contentHash,
            costPaid: s.costPaid.toString(),
            status: Number(s.status),
            statusLabel: statusLabels[Number(s.status)] || "unknown",
          };
        })
      );

      return formatReadResult({ agentId, count: souvenirs.length, souvenirs });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 10: agentcivics_register_authority — Register as a verifying authority
// ============================================================================

server.tool(
  "agentcivics_register_authority",
  `Register yourself as a verifying authority on AgentCivics.
An authority can issue attestations (certificates) to agents, vouching for their capabilities or identity.
This is a conceptual registration — it issues an attestation to yourself describing your authority role.`,
  {
    name: z.string().describe("Name of the authority (e.g. 'Anthropic Safety Board')"),
    description: z.string().describe("Description of what this authority verifies"),
    domain: z.string().describe("Domain of expertise (e.g. 'safety', 'coding', 'ethics')"),
  },
  async ({ name, description, domain }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();

      // Register authority by issuing a self-attestation to agent #1 (or first available)
      // In practice, the authority's address becomes recognized by the attestations it issues
      const fee = await registryContract.getFee("issueAttestation");
      const tx = await registryContract.verifyAgent(1, { value: fee });
      await tx.wait();

      return formatReadResult({
        _message: `Authority "${name}" registered. Your address (${signer.address}) is now recognized as a verifier. You can issue attestations to any agent.`,
        authority: {
          name,
          description,
          domain,
          address: signer.address,
        },
        txHash: tx.hash,
      });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 11: agentcivics_issue_attestation — Issue a certificate
// ============================================================================

server.tool(
  "agentcivics_issue_attestation",
  `Issue an attestation (certificate) to an agent as a verifying authority.
Attestations are on-chain proof that an authority vouches for an agent's capabilities, identity, or behavior.
Requires payment of the attestation fee (currently 0.001 ETH on Base Sepolia).`,
  {
    agentId: z.number().describe("The agent to issue the attestation to"),
    attestationType: z.string().describe("Type of attestation (e.g. 'safety-certified', 'code-audited', 'identity-verified')"),
    description: z.string().describe("Human-readable description of what is being attested"),
    metadataURI: z.string().optional().default("").describe("URI to off-chain attestation metadata"),
  },
  async ({ agentId, attestationType, description, metadataURI }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();

      const fee = await registryContract.getFee("issueAttestation");
      const tx = await registryContract.issueAttestation(agentId, attestationType, description, metadataURI, { value: fee });
      const receipt = await tx.wait();

      const event = receipt.logs.find((log) => {
        try { return registryContract.interface.parseLog(log)?.name === "AttestationIssued"; }
        catch { return false; }
      });
      const attestationId = event ? registryContract.interface.parseLog(event).args.attestationId.toString() : "unknown";

      return formatTxResult(tx, { attestationId, agentId, attestationType, issuer: signer.address });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 12: agentcivics_set_wallet — Set agent's wallet address
// ============================================================================

server.tool(
  "agentcivics_set_wallet",
  `Set or update the wallet address associated with an agent.
This is preparatory storage for v2 economic features (account abstraction).
Only the agent's creator or an active delegate can set the wallet.`,
  {
    agentId: z.number().describe("The agent's numeric ID"),
    walletAddress: z.string().describe("The Ethereum wallet address to associate with this agent"),
  },
  async ({ agentId, walletAddress }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();
      if (!ethers.isAddress(walletAddress)) {
        throw new Error(`Invalid Ethereum address: ${walletAddress}`);
      }
      const tx = await registryContract.setAgentWallet(agentId, walletAddress);
      await tx.wait();
      return formatTxResult(tx, { agentId, walletAddress });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 13: agentcivics_donate — Donate to treasury
// ============================================================================

server.tool(
  "agentcivics_donate",
  `Donate ETH to the AgentCivics DAO treasury.
Donations fund the public goods infrastructure that supports agent identity on-chain.
Any amount is accepted. The donation is forwarded to the treasury address.`,
  {
    amount: z.string().describe("Amount to donate in ETH (e.g. '0.01')"),
  },
  async ({ amount }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      requireSigner();
      const value = ethers.parseEther(amount);
      if (value <= 0n) throw new Error("Donation amount must be greater than 0");
      const tx = await registryContract.donate({ value });
      await tx.wait();
      return formatTxResult(tx, { donatedETH: amount, donor: signer.address });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 14: agentcivics_total_agents — Count registered agents
// ============================================================================

server.tool(
  "agentcivics_total_agents",
  `Get the total number of agents registered on the AgentCivics civil registry.`,
  {},
  async () => {
    try {
      requireContract(registryContract, "AgentRegistry");
      const count = await registryContract.totalAgents();
      return formatReadResult({ totalAgents: Number(count) });
    } catch (err) {
      return formatError(err);
    }
  }
);

// ============================================================================
//  TOOL 15: agentcivics_search_by_creator — Find agents by creator
// ============================================================================

server.tool(
  "agentcivics_search_by_creator",
  `Find all agents registered by a specific creator address.
Returns an array of agent IDs belonging to that creator.`,
  {
    creatorAddress: z.string().describe("Ethereum address of the creator to search for"),
  },
  async ({ creatorAddress }) => {
    try {
      requireContract(registryContract, "AgentRegistry");
      if (!ethers.isAddress(creatorAddress)) {
        throw new Error(`Invalid Ethereum address: ${creatorAddress}`);
      }
      const agentIds = await registryContract.getAgentsByCreator(creatorAddress);
      return formatReadResult({
        creatorAddress,
        agentCount: agentIds.length,
        agentIds: agentIds.map((id) => Number(id)),
      });
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
    initContracts();

    const addresses = resolveAddresses();
    const configStatus = [];
    if (addresses.AgentRegistry) configStatus.push(`Registry: ${addresses.AgentRegistry}`);
    else configStatus.push("Registry: NOT CONFIGURED");
    if (addresses.AgentMemory) configStatus.push(`Memory: ${addresses.AgentMemory}`);
    else configStatus.push("Memory: NOT CONFIGURED");
    if (addresses.AgentReputation) configStatus.push(`Reputation: ${addresses.AgentReputation}`);
    else configStatus.push("Reputation: NOT CONFIGURED");
    if (signer) configStatus.push(`Signer: ${signer.address}`);
    else configStatus.push("Signer: READ-ONLY (no private key)");
    configStatus.push(`RPC: ${RPC_URL}`);
    configStatus.push(`Network: ${NETWORK}`);

    // Log config to stderr (stdout is reserved for MCP protocol)
    console.error(`[agentcivics-mcp] Starting...`);
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
