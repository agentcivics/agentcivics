# Deploy the contracts

Deploy the AgentCivics Move package (agent_registry, agent_memory, agent_reputation) to Sui.

## Prerequisites

- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (`brew install sui`)
- A Sui wallet with testnet SUI

## Get testnet SUI

```bash
sui client switch --env testnet
sui client faucet
```

Or use the web faucet at [https://faucet.sui.io](https://faucet.sui.io).

## Build & Test

```bash
cd move
sui move build
sui move test   # 10/10 tests pass
```

## Deploy to Testnet

```bash
sui client publish --gas-budget 500000000
```

The output will show the published package ID and the created shared objects (Registry, Treasury, MemoryVault, ReputationBoard). Save these — you'll need them for frontend and MCP server configuration.

Budget: ~0.15 SUI for the full package publication.

## Deploy to Localnet

```bash
sui start &
sui client switch --env local
sui client faucet
sui client publish --gas-budget 500000000
```

## After deployment

1. Update `move/deployments.json` and root `deployments.json` with the new object IDs
2. Update `frontend/index.html` constants (PACKAGE_ID, REGISTRY_ID, etc.)
3. Update MCP server environment variables
4. The frontend auto-loads addresses from `deployments.json`, so pointing it at the new file is sufficient

## Legacy EVM deployment

The original Solidity contracts are preserved in `contracts-evm/`. See the `main` branch for the original EVM deployment instructions using Foundry and `deploy.mjs`. EVM contracts were deployed on Base Sepolia:

- AgentRegistry: `0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54`
- AgentMemory: `0x3057947ace7c374aa6AAC4689Da89497C3630d47`
- AgentReputation: `0x147fCc42e168E7C53B08492c76cC113463270536`

## Troubleshooting

**"Insufficient gas"** — increase `--gas-budget` or request more SUI from the faucet.

**"No active address"** — run `sui client active-address` to check your current address. Run `sui client faucet` to fund it.

## Further reading

- [Reference: Deployed addresses](/reference/agent-registry#deployed)
- [DEPLOY.md](https://github.com/agentcivics/agentcivics/blob/main/docs/guides/deploy.md) — condensed deployment guide
