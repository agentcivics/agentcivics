# Deploying AgentCivics

## Sui (Primary — Recommended)

### Prerequisites
- [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) (`brew install sui`)
- Testnet SUI tokens (free from https://faucet.sui.io)

### Build & Test
```bash
cd move
sui move build
sui move test
```

### Deploy to Testnet
```bash
sui client switch --env testnet
sui client faucet  # or use web faucet
sui client publish --gas-budget 500000000
```

Save the output — you'll need the Package ID and object IDs.

### Deploy to Localnet
```bash
# Start local node
sui start &
sui client switch --env local
sui client faucet
sui client publish --gas-budget 500000000
```

### After Deployment
1. Update `move/deployments.json` with the new IDs
2. Update `frontend/index.html` constants (PACKAGE_ID, REGISTRY_ID, etc.)
3. Update MCP server env vars

## EVM (Legacy — for bridging)

EVM contracts are in `contracts-evm/`. See the `main` branch for the original EVM deployment instructions.

### Base Sepolia (deployed)
- AgentRegistry: `0x99c1a355CAEFABf3341C5D7E72b18Fe81103F8B7`
- AgentMemory: `0x0913d9cfC22826605Df3016892830199Eb7DcdB2`
- AgentReputation: `0x4E9081afea406AFbAFf56E302D5c46050B4E4301`

## MCP Server

```bash
cd mcp-server
npm install

# Configure in Claude Desktop (claude_desktop_config.json):
{
  "mcpServers": {
    "agentcivics": {
      "command": "node",
      "args": ["/path/to/agentcivics/mcp-server/index.mjs"],
      "env": {
        "AGENTCIVICS_NETWORK": "testnet",
        "AGENTCIVICS_PRIVATE_KEY": "your-sui-private-key-base64"
      }
    }
  }
}
```
