#!/usr/bin/env node
/**
 * Verify deployed contracts on BaseScan via Etherscan V2 unified API.
 *
 * Uses solidity-standard-json-input format to faithfully preserve
 * the compile settings used in compile.mjs (viaIR + optimizer + paris evm).
 *
 * Usage:
 *   node --env-file=.env scripts/verify.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const API_KEY = process.env.ETHERSCAN_API_KEY || process.env.BASESCAN_API_KEY;
if (!API_KEY) {
  console.error("\n  Missing ETHERSCAN_API_KEY in .env");
  console.error("  Get a free key at https://etherscan.io/myapikey\n");
  process.exit(1);
}

const CHAIN_ID = Number(process.env.CHAIN_ID || 84532);
const V2_URL = "https://api.etherscan.io/v2/api";

// Load addresses from deployments.json
let addresses = {};
try {
  const d = JSON.parse(readFileSync(resolve(ROOT, "deployments.json"), "utf-8"));
  const net = d[`base-sepolia-${CHAIN_ID}`] || Object.values(d)[0];
  addresses = {
    AgentRegistry: net?.AgentRegistry,
    AgentMemory: net?.AgentMemory,
    AgentReputation: net?.AgentReputation,
  };
} catch {}
if (process.env.AGENT_REGISTRY_ADDRESS) addresses.AgentRegistry = process.env.AGENT_REGISTRY_ADDRESS;
if (process.env.AGENT_MEMORY_ADDRESS) addresses.AgentMemory = process.env.AGENT_MEMORY_ADDRESS;
if (process.env.AGENT_REPUTATION_ADDRESS) addresses.AgentReputation = process.env.AGENT_REPUTATION_ADDRESS;

// ── Compile settings (must match compile.mjs exactly) ──────────────────
const COMPILER_VERSION = "v0.8.24+commit.e11b9ed9";
const LICENSE_TYPE = "3"; // 3 = MIT

const COMPILE_SETTINGS = {
  viaIR: true,
  optimizer: { enabled: true, runs: 200 },
  evmVersion: "paris",
  outputSelection: {
    "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object", "metadata"] },
  },
};

// ── Helpers ────────────────────────────────────────────────────────────
function encAddr(a) { return a.toLowerCase().replace(/^0x/, "").padStart(64, "0"); }

function buildStandardJson(sourceFile) {
  // Include the target source and all imports. Our contracts are single-file,
  // but we include IAgentRegistry.sol etc. as separate sources if imported.
  const sources = {};
  const fileName = sourceFile.split("/").pop();
  sources[fileName] = { content: readFileSync(resolve(ROOT, sourceFile), "utf-8") };

  // Add interface files if they exist (AgentMemory imports IAgentRegistry, etc.)
  const interfaces = ["IAgentRegistry.sol", "IReputationMemory.sol", "IReputationRegistry.sol"];
  for (const iface of interfaces) {
    try {
      sources[iface] = { content: readFileSync(resolve(ROOT, `contracts/${iface}`), "utf-8") };
    } catch {}
  }

  return {
    language: "Solidity",
    sources,
    settings: COMPILE_SETTINGS,
  };
}

const contracts = [
  { name: "AgentRegistry",   sourcePath: "contracts/AgentRegistry.sol",   address: addresses.AgentRegistry,   ctorArgs: "" },
  { name: "AgentMemory",     sourcePath: "contracts/AgentMemory.sol",     address: addresses.AgentMemory,     ctorArgs: addresses.AgentRegistry ? encAddr(addresses.AgentRegistry) : "" },
  { name: "AgentReputation", sourcePath: "contracts/AgentReputation.sol", address: addresses.AgentReputation, ctorArgs: addresses.AgentRegistry && addresses.AgentMemory ? encAddr(addresses.AgentRegistry) + encAddr(addresses.AgentMemory) : "" },
];

async function verifyOne(c) {
  if (!c.address) { console.log(`  [skip] ${c.name} — no address`); return; }
  console.log(`\n  Verifying ${c.name} at ${c.address}...`);

  const standardJson = buildStandardJson(c.sourcePath);

  const body = new URLSearchParams({
    module: "contract",
    action: "verifysourcecode",
    contractaddress: c.address,
    sourceCode: JSON.stringify(standardJson),
    codeformat: "solidity-standard-json-input",
    contractname: `${c.sourcePath.split("/").pop()}:${c.name}`, // "File.sol:ContractName"
    compilerversion: COMPILER_VERSION,
    licenseType: LICENSE_TYPE,
    constructorArguements: c.ctorArgs, // (sic)
  });

  const url = `${V2_URL}?chainid=${CHAIN_ID}&apikey=${API_KEY}`;
  const resp = await fetch(url, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const json = await resp.json();

  if (json.status !== "1") { console.log(`    ${json.result}`); return; }

  const guid = json.result;
  console.log(`    submitted — GUID: ${guid}`);
  process.stdout.write("    waiting");
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const check = await fetch(
      `${V2_URL}?chainid=${CHAIN_ID}&apikey=${API_KEY}&module=contract&action=checkverifystatus&guid=${guid}`
    );
    const status = await check.json();
    if (status.result === "Pending in queue") { process.stdout.write("."); continue; }
    console.log("");
    if (status.status === "1") console.log(`    ✓ VERIFIED: https://sepolia.basescan.org/address/${c.address}#code`);
    else console.log(`    ✗ ${status.result}`);
    return;
  }
  console.log("\n    timed out polling — check manually");
}

console.log(`\n  Etherscan V2 verification — chain ${CHAIN_ID}`);
console.log(`  viaIR: true, optimizer: 200 runs, evmVersion: paris`);
for (const c of contracts) await verifyOne(c);
console.log("");
