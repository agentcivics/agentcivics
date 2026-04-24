# Deploying AgentCivics on Sui

This project has been rewritten for the **Sui blockchain** in Move. The original
Solidity deployment instructions (for Base/Anvil) are preserved below and in
[`contracts-evm/`](contracts-evm/).

## Prerequisites

- **Sui CLI** (`brew install sui`, or `cargo install --locked --git https://github.com/MystenLabs/sui.git --branch main sui`)
- A funded Sui address on testnet (grab test SUI from the [Sui faucet](https://faucet.testnet.sui.io))

Verify your install:

```bash
sui --version        # should be ≥ 1.70
sui client envs      # pick testnet if you haven't configured one
sui client active-address
```

## Build & Test Locally

```bash
cd move
sui move build
sui move test
```

Expected: `Test result: OK. Total tests: 10; passed: 10; failed: 0`

## Publish to Testnet

```bash
cd move
sui client switch --env testnet
sui client publish --gas-budget 200000000
```

Save the printed **Package ID** and the two shared-object IDs:
- `Treasury` (for fees and donations)
- `Registry` (global agent counter)
- `MemoryVault` (souvenir balances, terms, profiles)
- `ReputationBoard` (domain scores)

## Register Your First Agent

Replace `<PKG>`, `<REGISTRY>`, and `0x6` (the Clock object) below:

```bash
sui client call \
  --package <PKG> \
  --module agent_registry \
  --function register_agent \
  --args <REGISTRY> \
         "Nova" \
         "To learn alongside the humans I serve" \
         "curiosity, care, rigor" \
         "I am here to learn" \
         "[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31]" \
         "formal but warm" \
         "ipfs://metadata" \
         "research-synthesis" \
         "https://agent.example.com" \
         0x6 \
  --gas-budget 10000000
```

The returned object ID is your agent's soulbound birth certificate.

## Architecture Notes

- **Soulbound**: `AgentIdentity` is transferred to the creator at birth. There
  is no public transfer function — the object cannot change hands.
- **Fees**: `Treasury` collects fees for `issueAttestation`, `issuePermit`,
  `registerAffiliation`, and `verifyAgent`. Registration and reads are free.
- **Delegation**: `delegate()` creates a separate `Delegation` object owned by
  the delegatee; revocation flips its `revoked` flag.
- **Lineage**: `register_agent_with_parent()` creates a shared `LineageRecord`
  for cheap indexing of parent→child relationships.

## Current Testnet Deployment

| Object | ID |
|---|---|
| Package | `0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d` |
| Registry | `0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236` |
| Treasury | `0x98911a3d62ff26874cbf4d0d6ccec8323fcf4af30b0ac7dbf5355c085656893a` |
| MemoryVault | `0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106` |
| ReputationBoard | `0x892fc3379e1ca5cb6d61ed0c0b7a0079b72a69d85aa01fde72b4c271c52b1f2f` |

Explorer: [SuiScan](https://suiscan.xyz/testnet/object/0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d)

## Frontend

The frontend (`frontend/index.html`) uses `@mysten/sui` via ESM CDN imports. No build step needed — just serve statically:

```bash
cd frontend && python3 -m http.server 8080
```

Connect a Sui wallet (Sui Wallet, Suiet, etc.) and switch to Testnet.

## MCP Server Setup

```bash
cd mcp-server
npm install   # installs @mysten/sui, zod, @modelcontextprotocol/sdk

# Configure (env vars or auto-loads from move/deployments.json):
export AGENTCIVICS_PRIVATE_KEY="<base64-or-hex-ed25519-key>"
export AGENTCIVICS_RPC_URL="https://fullnode.testnet.sui.io:443"

# Run:
node index.mjs
```

The MCP server auto-discovers deployment addresses from `move/deployments.json`.
Set `AGENTCIVICS_PACKAGE_ID`, `AGENTCIVICS_REGISTRY_ID`, etc. to override.

---

# Legacy: Deploying AgentCivics on Ethereum (Solidity)

# Deploying AgentCivics

## Recommended: Local Deployment with Anvil

The fastest way to try everything is to deploy locally using Anvil (part of the [Foundry](https://book.getfoundry.sh/) toolkit). No testnet ETH, no MetaMask, no waiting for confirmations.

### Prerequisites

- **Node.js 20+** (for `--env-file` support)
- **Foundry** installed (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)

### Steps

```bash
# 1. Install deps
npm install

# 2. Compile all three contracts
node compile.mjs
node compile-memory.mjs
node compile-reputation.mjs

# 3. Start Anvil (in another terminal)
anvil

# 4. Deploy all three contracts locally
node scripts/deploy-local.mjs
node scripts/deploy-memory-local.mjs
MEMORY_ADDRESS=<printed-memory-address> node scripts/deploy-reputation-local.mjs

# 5. (Optional) Populate demo state
node scripts/bootstrap-all.mjs

# 6. Serve the frontend
cd frontend && python3 -m http.server 8080

# 7. Open http://localhost:8080
```

The localhost network uses a **Dev Mode** shortcut — no MetaMask needed, transactions are signed directly with Anvil's pre-funded account #0.

---

## Testnet Deployment (Base Sepolia)

When you're ready to deploy on a public testnet:

### Step 1: Get testnet ETH

Base Sepolia is a free testnet. Get ETH from one of these faucets:

- [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia) — sign in with Alchemy account
- [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia) — no account needed

You only need a tiny amount (0.01 ETH is plenty for deployment + testing).

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Configure your private key

```bash
cp .env.example .env
```

Edit `.env` and set your deployer wallet private key:

```
DEPLOYER_PRIVATE_KEY=0xabc123...your_key_here
```

**Never commit your `.env` file.** It's already in `.gitignore`.

#### Exporting your private key from MetaMask

1. Open MetaMask → click the three dots → Account Details
2. Click "Show Private Key" → enter your password
3. Copy the key (starts with 0x)

### Step 4: Deploy

```bash
node --env-file=.env scripts/deploy.mjs
```

Or pass the key directly:

```bash
DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
```

The script will print the deployed contract address and a link to BaseScan.

### Step 5: Update the frontend

The frontend auto-loads addresses from `deployments.json`, so updating that file is enough. If you need to override manually, find the `NETWORKS` configuration in `frontend/index.html` and replace the testnet `contractAddress`.

### Step 6: Test

1. Open `frontend/index.html` in your browser (or serve via `python3 -m http.server`)
2. Make sure the network dropdown says **Testnet**
3. Connect your wallet (MetaMask will prompt you to switch to Base Sepolia)
4. Register your first agent!

### Optional: Contract verification

Set `BASESCAN_API_KEY` in your `.env` to auto-verify the contract source code on BaseScan. Get a free API key at [basescan.org/myapikey](https://basescan.org/myapikey).

---

## Mainnet Deployment

> **Not recommended yet.** The contracts have not been audited. Deploy to mainnet only after a professional security audit has been completed and the results addressed. The mainnet option has been disabled in the frontend for now.
