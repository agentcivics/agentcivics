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
