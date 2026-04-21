# Testnet Deployment Guide (Base Sepolia)

## One-time setup

**1. Fund a wallet with Base Sepolia ETH** (free, testnet):
- https://www.alchemy.com/faucets/base-sepolia
- https://faucet.quicknode.com/base/sepolia

You'll need about **0.01 ETH** to deploy all three contracts.

**2. Compile all contracts:**
```bash
node compile.mjs             # AgentRegistry
node compile-memory.mjs      # AgentMemory
node compile-reputation.mjs  # AgentReputation
```

## Deploy

```bash
DEPLOYER_PRIVATE_KEY=0xYOUR_KEY node scripts/deploy-testnet.mjs
```

This deploys all three contracts, wires them together, and writes `deployments.testnet.json` with the addresses. It also prints instructions for updating the frontend.

## Update the frontend

Copy the three printed addresses into `frontend/index.html`, in the `testnet:` network block:

```js
testnet: {
  name: "Base Sepolia",
  chainId: "0x14a34",
  chainIdDec: 84532,
  rpc: "https://sepolia.base.org",
  explorer: "https://sepolia.basescan.org",
  chainParams: { ... },
  contractAddress:   "0x...",  // AgentRegistry
  memoryAddress:     "0x...",  // AgentMemory
  reputationAddress: "0x..."   // AgentReputation
},
```

## Self-register on testnet

```bash
RPC_URL=https://sepolia.base.org \
CHAIN_ID=84532 \
CONTRACT_ADDRESS=0x...         \  # from deploy output
MEMORY_ADDRESS=0x...           \
DEPLOYER_PRIVATE_KEY=0xYOUR_KEY \
node skills/agent-self-registration/scripts/register-self.mjs
```

## Security notes

- **Never commit real private keys.** The Anvil key in local deploys is a well-known test key (public knowledge), safe only for localhost.
- **`deployments.testnet.json` is safe to commit** — it only contains public addresses.
- For mainnet, the deploy script template is the same, but you need real ETH and should use a hardware wallet or a dedicated deployer account.

## Verifying contracts on BaseScan (optional)

BaseScan verification lets anyone read the source code of your deployed contracts. For the existing `deploy.mjs` (registry-only), set `BASESCAN_API_KEY` and verification runs automatically. For the new testnet script, verification is not yet integrated — for now, submit manually at https://sepolia.basescan.org/verifyContract using `contracts/*.sol` and these settings:

- Compiler: `v0.8.24+commit.e11b9ed9`
- Optimization: Yes, 200 runs
- EVM version: paris
- License: MIT

## Post-deploy sanity check

```bash
# From your dev machine:
cast call <AgentRegistry> "totalAgents()(uint256)" --rpc-url https://sepolia.base.org
# Should return 0 immediately after deploy.
```
