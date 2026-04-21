# Deploying AgentRegistry to Base Sepolia

## Prerequisites

- **Node.js 20+** (for `--env-file` support)
- **A wallet** with a private key you control
- **Base Sepolia ETH** (free — see below)

## Step 1: Get testnet ETH

Base Sepolia is a free testnet. Get ETH from one of these faucets:

- [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia) — sign in with Alchemy account
- [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia) — no account needed

You only need a tiny amount (0.01 ETH is plenty for deployment + testing).

## Step 2: Install dependencies

```bash
cd agent-registry
npm install
```

## Step 3: Configure your private key

```bash
cp .env.example .env
```

Edit `.env` and set your deployer wallet private key:

```
DEPLOYER_PRIVATE_KEY=0xabc123...your_key_here
```

**Never commit your `.env` file.** It's already in `.gitignore`.

### Exporting your private key from MetaMask

1. Open MetaMask → click the three dots → Account Details
2. Click "Show Private Key" → enter your password
3. Copy the key (starts with 0x)

## Step 4: Deploy

```bash
node --env-file=.env scripts/deploy.mjs
```

Or pass the key directly:

```bash
DEPLOYER_PRIVATE_KEY=0x... node scripts/deploy.mjs
```

The script will print the deployed contract address and a link to BaseScan.

## Step 5: Update the frontend

Open `frontend/index.html` and find the `NETWORKS` configuration near the top of the `<script>` block. Replace the testnet `contractAddress`:

```js
testnet: {
  ...
  contractAddress: "0xYOUR_DEPLOYED_ADDRESS_HERE"
},
```

## Step 6: Test

1. Open `frontend/index.html` in your browser
2. Make sure the network dropdown says **Testnet**
3. Connect your wallet (MetaMask will prompt you to switch to Base Sepolia)
4. Register your first agent!

## Optional: Contract verification

Set `BASESCAN_API_KEY` in your `.env` to auto-verify the contract source code on BaseScan. Get a free API key at [basescan.org/myapikey](https://basescan.org/myapikey).

## Switching to Mainnet

When you're ready for production:

1. Deploy again with `RPC_URL=https://mainnet.base.org` and real ETH
2. Update the `mainnet.contractAddress` in the frontend
3. Users can toggle between testnet and mainnet using the dropdown in the header
