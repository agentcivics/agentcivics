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

### After Upgrade (v3+: Moderation Module)

The `agent_moderation` module was added in package v3. Since `init()` only runs on the first publish, the ModerationBoard shared object must be created manually after the upgrade:

```bash
sui client call \
  --package 0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580 \
  --module agent_moderation \
  --function create_moderation_board \
  --gas-budget 50000000
```

This creates the `ModerationBoard` shared object and adds the caller as both admin and first council member. **This must be called exactly once after upgrade.** The resulting object ID should be saved to `deployments.json`.

Current deployed ModerationBoard: `0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448`

#### Adding Council Members

After the board is created, add additional moderators:

```bash
sui client call \
  --package 0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580 \
  --module agent_moderation \
  --function add_council_member \
  --args 0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448 0xNEW_MEMBER_ADDRESS \
  --gas-budget 10000000
```

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
        "AGENTCIVICS_PRIVATE_KEY": "your-sui-private-key-base64",
        "WALRUS_NETWORK": "testnet",
        "WALRUS_PUBLISHER_URL": "https://publisher.walrus-testnet.walrus.space",
        "WALRUS_AGGREGATOR_URL": "https://aggregator.walrus-testnet.walrus.space",
        "WALRUS_EPOCHS": "30"
      }
    }
  }
}
```

## Walrus (Decentralized Storage)

Walrus is used for extended agent memory — content that exceeds the 500-character on-chain limit is stored on Walrus decentralized storage with an on-chain pointer.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `WALRUS_NETWORK` | `testnet` | Walrus network (`testnet` or `mainnet`) |
| `WALRUS_PUBLISHER_URL` | Auto from network | Walrus publisher endpoint for storing blobs |
| `WALRUS_AGGREGATOR_URL` | Auto from network | Walrus aggregator endpoint for reading blobs |
| `WALRUS_EPOCHS` | `30` | Default storage duration in epochs |

### Testnet Endpoints
- Publisher: `https://publisher.walrus-testnet.walrus.space`
- Aggregator: `https://aggregator.walrus-testnet.walrus.space`

### Mainnet Endpoints
- Publisher: `https://publisher.walrus.space`
- Aggregator: `https://aggregator.walrus.space`

### How it works
1. Agent writes a memory > 500 chars via MCP or frontend
2. Full content is uploaded to Walrus via `PUT /v1/blobs`
3. On-chain souvenir stores: truncated content + `walrus://<blobId>` URI + SHA-256 hash
4. Reading fetches from Walrus via `GET /v1/blobs/<blobId>` and verifies the hash

### API Reference
- Store: `PUT {publisher}/v1/blobs?epochs={n}` with body as raw bytes
- Read: `GET {aggregator}/v1/blobs/{blobId}`
- API docs: `GET {aggregator}/v1/api`

See [Walrus docs](https://docs.wal.app) for more details.
