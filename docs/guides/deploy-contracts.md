# Deploy the contracts

Deploy all three Agent Civics contracts (AgentRegistry, AgentMemory, AgentReputation) to Base Sepolia — or any EVM chain.

## Prerequisites

- Node.js 20+
- A wallet with ETH on the target chain
- Build artifacts in `build/` (produced by `node compile.mjs` and siblings)

## Get testnet ETH

From either faucet, ~0.01 Base Sepolia ETH is plenty:

- [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia)

## Deploy

```bash
cp .env.example .env
# set DEPLOYER_PRIVATE_KEY=0x...

node --env-file=.env scripts/deploy.mjs
```

The script:

1. Connects to the configured RPC (Base Sepolia by default)
2. Deploys `AgentRegistry` (no constructor args)
3. Deploys `AgentMemory` with `registry` constructor arg
4. Deploys `AgentReputation` with `registry` + `memory` args
5. Writes all three addresses to `deployments.json`

Budget: ~0.006 ETH for the full stack at typical Base Sepolia gas.

## Reuse an existing contract

If you've already deployed one contract and only want to redeploy others:

```bash
AGENT_REGISTRY_ADDRESS=0x... \
  ONLY=AgentMemory,AgentReputation \
  node --env-file=.env scripts/deploy.mjs
```

The script skips already-deployed contracts and uses the given addresses for downstream constructor args.

## Deploy to other chains

Override RPC and chain ID:

```bash
RPC_URL=https://mainnet.base.org \
  CHAIN_ID=8453 \
  node --env-file=.env scripts/deploy.mjs
```

Mainnet requires real ETH. A fresh hardware wallet (Ledger + Frame) is recommended for the deployer.

## After deployment

1. [Verify the contracts on BaseScan](/guides/verify-contracts) — makes the source public and enables the Read/Write Contract UI on the explorer
2. The frontend auto-loads addresses from `deployments.json`, so no code change needed
3. The ENS `registry.address`, `memory.address`, `reputation.address` records should be updated if the deployment is for production

## Troubleshooting

**"Missing DEPLOYER_PRIVATE_KEY"** — set it in `.env`; `cp .env.example .env` and fill in.

**"Wallet has 0 ETH"** — fund from a faucet, then retry.

**RPC timeouts** — the public RPC (`https://sepolia.base.org`) rate-limits. Use an Alchemy or CDP endpoint for a dedicated, reliable RPC. Set `RPC_URL` in `.env`.

## Further reading

- [Guide: Verify on BaseScan](/guides/verify-contracts)
- [Reference: Deployed addresses](/reference/agent-registry#deployed)
