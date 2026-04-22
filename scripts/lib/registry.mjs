/**
 * Shared registry helpers: ABI fragments, address resolution, contract loader.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// Minimal ABI — add more fragments as needed.
export const ABI = [
  // Identity
  "function registerAgent(string,string,string,string,bytes32,string,string,string,string,uint256) returns (uint256)",
  "function readIdentity(uint256) view returns (string,string,string,string,bytes32,string,address,uint64,string)",
  "function readState(uint256) view returns (string,string,uint8)",
  "function verifyIdentity(uint256) view returns (bool,string,string,address,uint64,uint8)",
  "function updateMutableFields(uint256,string,string,uint8)",
  "function totalAgents() view returns (uint256)",
  "function getAgentsByCreator(address) view returns (uint256[])",
  // Attestations
  "function requestAttestation(uint256,address,string) returns (uint256)",
  "function issueAttestation(uint256,string,string,string) returns (uint256)",
  "function fulfillRequest(uint256,string,string,string) returns (uint256)",
  "function revokeAttestation(uint256)",
  "function getAttestations(uint256) view returns (uint256[])",
  "function getAttestation(uint256) view returns (address,string,string,string,uint64,bool)",
  "function getRequestsForIssuer(address) view returns (uint256[])",
  "function getRequest(uint256) view returns (uint256,address,address,string,uint64,bool)",
  // Permits
  "function issuePermit(uint256,string,string,uint64,uint64) returns (uint256)",
  "function getPermits(uint256) view returns (uint256[])",
  "function getPermit(uint256) view returns (address,string,string,uint64,uint64,bool)",
  // Affiliations
  "function registerAffiliation(uint256,string) returns (uint256)",
  "function getAffiliations(uint256) view returns (uint256[])",
  "function getAffiliation(uint256) view returns (address,string,uint64,bool)",
  // Delegation
  "function delegate(uint256,address,uint256)",
  "function revokeDelegation(uint256)",
  "function getDelegation(uint256) view returns (address,uint64,uint64,bool)",
  // Lineage
  "function getParent(uint256) view returns (uint256)",
  "function getChildren(uint256) view returns (uint256[])",
  // Death
  "function declareDeath(uint256,string)",
  "function getDeathRecord(uint256) view returns (bool,string,uint64,address)",
  // Events
  "event AgentRegistered(uint256 indexed,address indexed,string,string,string,string,bytes32,string,string,uint256)",
  "event AttestationIssued(uint256 indexed,uint256 indexed,address indexed,string)",
  "event AttestationRequested(uint256 indexed,uint256 indexed,address indexed)",
];

export const STATUS_ACTIVE = 0;
export const STATUS_PAUSED = 1;
export const STATUS_RETIRED = 2;
export const STATUS_DECEASED = 3;

export const STATUS_NAMES = ["Active", "Paused", "Retired", "Deceased"];

export function parseStatus(s) {
  const normalized = String(s).toLowerCase().trim();
  const idx = STATUS_NAMES.findIndex((n) => n.toLowerCase() === normalized);
  if (idx >= 0) return idx;
  const n = Number(s);
  if (Number.isInteger(n) && n >= 0 && n <= 3) return n;
  throw new Error(`Unknown status: ${s}. Use: active, paused, retired, or 0-3.`);
}

export function getChainConfig() {
  const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
  const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
  return { RPC_URL, CHAIN_ID };
}

export function getRegistryAddress(chainId) {
  if (process.env.AGENT_REGISTRY_ADDRESS) return process.env.AGENT_REGISTRY_ADDRESS;
  try {
    const d = JSON.parse(readFileSync(resolve(ROOT, "deployments.json"), "utf-8"));
    const net = d[`base-sepolia-${chainId}`] || Object.values(d)[0];
    if (net?.AgentRegistry) return net.AgentRegistry;
  } catch {}
  throw new Error("Could not resolve AgentRegistry address. Set AGENT_REGISTRY_ADDRESS or populate deployments.json.");
}

export function getProvider() {
  const { RPC_URL, CHAIN_ID } = getChainConfig();
  return new ethers.JsonRpcProvider(RPC_URL, CHAIN_ID);
}

/**
 * Build a Contract instance. Pass a Wallet to write, or omit for read-only.
 */
export function getRegistry(signerOrProvider) {
  const provider = signerOrProvider || getProvider();
  const { CHAIN_ID } = getChainConfig();
  const address = getRegistryAddress(CHAIN_ID);
  return new ethers.Contract(address, ABI, provider);
}

export function explorerBaseUrl(chainId) {
  if (chainId === 84532) return "https://sepolia.basescan.org";
  if (chainId === 8453) return "https://basescan.org";
  return null;
}

// Keystore loading moved to lib/keystore.mjs
