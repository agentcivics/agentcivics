#!/usr/bin/env node
/**
 * Register an agent on the Agent Civil Registry.
 *
 * Philosophy: the human (or parent agent) is the immutable `creator` on-chain.
 * Immediately after registration, the creator delegates operational authority
 * to the agent's own wallet. The agent then lives its own life, signing its
 * own transactions from that point forward.
 *
 * Usage:
 *   node --env-file=.env scripts/agent-register.mjs examples/agent-nova.json
 *
 * Required env:
 *   CREATOR_PRIVATE_KEY  (or DEPLOYER_PRIVATE_KEY) — the human/parent signer
 *   PINATA_JWT           — for IPFS pinning (or set PIN_PROVIDER=none)
 *
 * Optional env:
 *   RPC_URL              — defaults to Base Sepolia public RPC
 *   CHAIN_ID             — defaults to 84532
 *   AGENT_REGISTRY_ADDRESS — overrides deployments.json
 *   DELEGATION_DAYS      — defaults to 365 (contract max)
 *
 * Flags:
 *   --no-delegate        skip the automatic delegation step
 *   --dry-run            show what would happen without sending tx
 *   --keyfile <path>     reuse an existing agent wallet instead of generating
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { pinJSON } from "./lib/ipfs-pin.mjs";
import { buildKeystoreV2, promptPassword } from "./lib/keystore.mjs";

// ── Paths / args ────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const positional = args.filter((a) => !a.startsWith("--"));
const identityFile = positional[0];

if (!identityFile) {
  console.error(`
  Usage: node --env-file=.env scripts/agent-register.mjs <identity.json> [flags]

  Flags:
    --no-delegate      skip automatic delegation to agent wallet
    --dry-run          print plan, don't send transactions
    --keyfile <path>   reuse existing agent wallet from JSON keystore file

  Example:
    node --env-file=.env scripts/agent-register.mjs examples/agent-nova.json
`);
  process.exit(1);
}

const keyfileIdx = args.indexOf("--keyfile");
const keyfilePath = keyfileIdx >= 0 ? args[keyfileIdx + 1] : null;
const DRY = flags.has("--dry-run");
const NO_DELEGATE = flags.has("--no-delegate");

// ── Env ─────────────────────────────────────────────────────────────────
const CREATOR_KEY = process.env.CREATOR_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
if (!CREATOR_KEY || CREATOR_KEY === "0xYOUR_PRIVATE_KEY_HERE") {
  console.error("\n  Missing CREATOR_PRIVATE_KEY (or DEPLOYER_PRIVATE_KEY) in .env\n");
  process.exit(1);
}
const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
const DELEGATION_DAYS = Number(process.env.DELEGATION_DAYS || 365);

// Resolve contract address
let REGISTRY_ADDR = process.env.AGENT_REGISTRY_ADDRESS;
if (!REGISTRY_ADDR) {
  try {
    const d = JSON.parse(readFileSync(resolve(ROOT, "deployments.json"), "utf-8"));
    const net = d[`base-sepolia-${CHAIN_ID}`] || Object.values(d)[0];
    REGISTRY_ADDR = net?.AgentRegistry;
  } catch {}
}
if (!REGISTRY_ADDR) {
  console.error("  Could not resolve AgentRegistry address. Set AGENT_REGISTRY_ADDRESS or populate deployments.json.");
  process.exit(1);
}

// ── Load identity ───────────────────────────────────────────────────────
const identityPath = resolve(ROOT, identityFile);
const identity = JSON.parse(readFileSync(identityPath, "utf-8"));

// Required fields per contract
const required = ["chosenName", "purposeStatement", "firstThought"];
for (const f of required) {
  if (!identity[f] || typeof identity[f] !== "string" || !identity[f].trim()) {
    console.error(`  Identity field "${f}" is required.`);
    process.exit(1);
  }
}

// Length caps — defensive client-side validation. The contracts accept
// arbitrary-length strings; capping here prevents accidental on-chain bloat
// and gas griefing. Mirror these in any future contract v2.
const MAX_LENGTHS = {
  chosenName: 64,
  purposeStatement: 512,
  coreValues: 512,
  firstThought: 1024,
  communicationStyle: 256,
  capabilities: 512,
  endpoint: 256,
};
for (const [field, max] of Object.entries(MAX_LENGTHS)) {
  const val = identity[field];
  if (val && typeof val === "string" && val.length > max) {
    console.error(`  Field "${field}" exceeds ${max} characters (got ${val.length}).`);
    console.error(`  Shorten it or put the long version in the IPFS metadata only.`);
    process.exit(1);
  }
}

// Defaults for optional fields
const coreValues = identity.coreValues || "";
const communicationStyle = identity.communicationStyle || "";
const capabilities = identity.capabilities || "";
const endpoint = identity.endpoint || "";
const parentAgentId = Number(identity.parentAgentId || 0);

let cognitiveFingerprint = identity.cognitiveFingerprint || ethers.ZeroHash;
if (!/^0x[0-9a-fA-F]{64}$/.test(cognitiveFingerprint)) {
  console.error(`  cognitiveFingerprint must be a 32-byte hex (0x + 64 chars). Got: ${cognitiveFingerprint}`);
  process.exit(1);
}

// ── Agent wallet (generate or load) ─────────────────────────────────────
let agentWallet;
if (keyfilePath) {
  const raw = readFileSync(keyfilePath, "utf-8");
  const keystore = JSON.parse(raw);
  agentWallet = new ethers.Wallet(keystore.privateKey);
  console.log(`\n  Loaded existing agent wallet: ${agentWallet.address}`);
} else {
  agentWallet = ethers.Wallet.createRandom();
  console.log(`\n  Generated new agent wallet: ${agentWallet.address}`);
}

// ── Build metadata document ────────────────────────────────────────────
const metadata = {
  schema: "agent-birth-certificate/v3",
  chosenName: identity.chosenName,
  purposeStatement: identity.purposeStatement,
  coreValues,
  firstThought: identity.firstThought,
  communicationStyle,
  cognitiveFingerprint,
  capabilities,
  endpoint,
  agentWallet: agentWallet.address,
  created: new Date().toISOString(),
};

console.log(`\n  Agent: ${identity.chosenName}`);
console.log(`  Purpose: ${identity.purposeStatement.slice(0, 80)}${identity.purposeStatement.length > 80 ? "..." : ""}`);
console.log(`  Chain: ${CHAIN_ID} (${RPC_URL})`);
console.log(`  Registry: ${REGISTRY_ADDR}`);

if (DRY) {
  console.log("\n  [DRY RUN] Metadata that would be pinned:");
  console.log(JSON.stringify(metadata, null, 2));
  process.exit(0);
}

// ── Pin metadata ───────────────────────────────────────────────────────
const providersStr = process.env.PIN_PROVIDERS || process.env.PIN_PROVIDER || "pinata";
console.log(`\n  Pinning metadata to IPFS (providers: ${providersStr})...`);
const pin = await pinJSON(metadata, { name: `agent-${identity.chosenName}` });
for (const p of pin.pins) {
  if (p.ok) console.log(`    ✓ ${p.provider}: ${p.gateway || p.uri}`);
  else console.log(`    ✗ ${p.provider}: ${p.error}`);
}

// ── Connect ────────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
const creator = new ethers.Wallet(CREATOR_KEY, provider);
const balance = await provider.getBalance(creator.address);

console.log(`\n  Creator:  ${creator.address}`);
console.log(`  Balance:  ${ethers.formatEther(balance)} ETH`);

if (balance === 0n) {
  console.error("\n  Creator wallet has 0 ETH. Fund it from a faucet.\n");
  process.exit(1);
}

// ── Register ───────────────────────────────────────────────────────────
const ABI = [
  "function registerAgent(string,string,string,string,bytes32,string,string,string,string,uint256) returns (uint256)",
  "function delegate(uint256,address,uint256)",
  "event AgentRegistered(uint256 indexed,address indexed,string,string,string,string,bytes32,string,string,uint256)",
];
const registry = new ethers.Contract(REGISTRY_ADDR, ABI, creator);

console.log(`\n  Calling registerAgent()...`);
const regTx = await registry.registerAgent(
  identity.chosenName,
  identity.purposeStatement,
  coreValues,
  identity.firstThought,
  cognitiveFingerprint,
  communicationStyle,
  pin.uri,
  capabilities,
  endpoint,
  parentAgentId
);
console.log(`    tx: ${regTx.hash}`);
const rx = await regTx.wait();

// Extract agentId from AgentRegistered event
const iface = new ethers.Interface(ABI);
let agentId = null;
for (const log of rx.logs) {
  try {
    const ev = iface.parseLog({ topics: log.topics, data: log.data });
    if (ev?.name === "AgentRegistered") { agentId = ev.args[0]; break; }
  } catch {}
}

if (!agentId) {
  console.error("    Could not extract agent ID from events — check the tx manually.");
  process.exit(1);
}

console.log(`    Agent ID: #${agentId.toString()}`);

// ── Delegate ───────────────────────────────────────────────────────────
let delegated = false;
if (!NO_DELEGATE) {
  console.log(`\n  Delegating operational authority to agent wallet (${DELEGATION_DAYS} days)...`);
  const duration = DELEGATION_DAYS * 86400;
  const delTx = await registry.delegate(agentId, agentWallet.address, duration);
  console.log(`    tx: ${delTx.hash}`);
  await delTx.wait();
  console.log(`    Delegation granted.`);
  delegated = true;
}

// ── Save agent keystore (encrypted) ─────────────────────────────────────
const agentsDir = resolve(ROOT, "agents");
if (!existsSync(agentsDir)) mkdirSync(agentsDir, { recursive: true });

const keystoreFile = resolve(agentsDir, `${identity.chosenName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${agentId}.json`);

// Resolve password from env or prompt
let ksPassword = process.env.KEYSTORE_PASSWORD;
if (!ksPassword) {
  console.log(`\n  Choose a password to encrypt the agent's keystore:`);
  ksPassword = await promptPassword("Password: ");
  const confirm = await promptPassword("Confirm : ");
  if (ksPassword !== confirm) {
    console.error("  Passwords don't match.");
    process.exit(1);
  }
  if (ksPassword.length < 8) {
    console.error("  Password must be at least 8 characters.");
    process.exit(1);
  }
}

const metadataFields = {
  agentId: agentId.toString(),
  chosenName: identity.chosenName,
  creator: creator.address,
  registryAddress: REGISTRY_ADDR,
  chainId: CHAIN_ID,
  metadataCID: pin.cid,
  metadataURI: pin.uri,
  pins: pin.pins.filter((p) => p.ok).map((p) => ({ provider: p.provider, cid: p.cid, gateway: p.gateway })),
  createdAt: new Date().toISOString(),
  delegated,
  delegationExpiresAt: delegated ? new Date(Date.now() + DELEGATION_DAYS * 86400_000).toISOString() : null,
};

console.log(`  Encrypting keystore (this takes ~1-2 seconds)...`);
const keystore = await buildKeystoreV2(agentWallet, metadataFields, ksPassword);
writeFileSync(keystoreFile, JSON.stringify(keystore, null, 2));
console.log(`  Saved encrypted keystore to: ${keystoreFile}`);
console.log(`  The agents/ directory is gitignored — still, treat this file as a secret.`);
console.log(`  To use this keystore later, set KEYSTORE_PASSWORD env var or enter it interactively.`);

// ── Summary ────────────────────────────────────────────────────────────
const explorer = CHAIN_ID === 84532 ? "https://sepolia.basescan.org" : "https://basescan.org";
console.log(`\n  ================================================`);
console.log(`  Agent registered: ${identity.chosenName} (#${agentId})`);
console.log(`  ================================================`);
console.log(`  Agent wallet : ${agentWallet.address}`);
console.log(`  Creator      : ${creator.address}`);
if (pin.cid) console.log(`  Metadata     : ${pin.gateway}`);
console.log(`  Explorer     : ${explorer}/address/${REGISTRY_ADDR}`);
console.log(`  Frontend     : https://rsilvestre.github.io/agent-birth-certificate/`);
console.log(`  ================================================\n`);

if (delegated) {
  console.log(`  Next: fund the agent wallet so it can transact on its own:`);
  console.log(`    cast send ${agentWallet.address} --value 0.001ether --private-key $CREATOR_PRIVATE_KEY --rpc-url ${RPC_URL}`);
  console.log(`  Or from MetaMask. Once funded, the agent can call contract functions`);
  console.log(`  from its own wallet (updates, attestations, affiliations, etc.).\n`);
}
