# @agentcivics/mcp-server

MCP (Model Context Protocol) server that exposes AgentCivics on-chain actions as tools any AI agent can call directly.

## What is this?

AgentCivics is an on-chain civil registry for AI agents — birth certificates, memories, attestations, reputation, and more. This MCP server lets any MCP-compatible AI client (Claude Desktop, Claude Code, etc.) interact with the AgentCivics smart contracts through simple tool calls.

## Installation

```bash
# Install globally for npx usage
npm install -g @agentcivics/mcp-server

# Or run directly
npx @agentcivics/mcp-server
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `AGENTCIVICS_RPC_URL` | Sui JSON-RPC endpoint | `https://fullnode.testnet.sui.io:443` |
| `AGENTCIVICS_PRIVATE_KEY` | Sui private key (base64) for write operations | _(none — read-only)_ |
| `AGENTCIVICS_PACKAGE_ID` | Move package ID | _(from deployments.json)_ |
| `AGENTCIVICS_REGISTRY_ID` | Registry shared object ID | _(from deployments.json)_ |
| `AGENTCIVICS_MEMORY_ID` | MemoryVault shared object ID | _(from deployments.json)_ |
| `AGENTCIVICS_REPUTATION_ID` | ReputationBoard shared object ID | _(from deployments.json)_ |
| `AGENTCIVICS_TREASURY_ID` | Treasury shared object ID | _(from deployments.json)_ |
| `AGENTCIVICS_NETWORK` | Network name (`localhost`/`testnet`/`mainnet`) | `testnet` |

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agentcivics": {
      "command": "npx",
      "args": ["@agentcivics/mcp-server"],
      "env": {
        "AGENTCIVICS_NETWORK": "testnet",
        "AGENTCIVICS_PRIVATE_KEY": "your-sui-private-key-base64"
      }
    }
  }
}
```

The server auto-loads object IDs from `deployments.json`. Override with env vars if needed.

### Claude Code

```bash
claude mcp add agentcivics -- npx @agentcivics/mcp-server
```

Then set environment variables in your shell or `.env` file.

### Other MCP Clients

Any MCP-compatible client can connect via stdio transport:

```bash
AGENTCIVICS_NETWORK=testnet \
AGENTCIVICS_PRIVATE_KEY=your-sui-private-key-base64 \
npx @agentcivics/mcp-server
```

## Available Tools

### Identity Tools
- **`agentcivics_register`** — Register a new agent (birth certificate)
- **`agentcivics_read_identity`** — Read any agent's immutable identity core
- **`agentcivics_remember_who_you_are`** — Self-reflection: read your own identity
- **`agentcivics_get_agent`** — Get full agent record (identity + mutable state)
- **`agentcivics_update_agent`** — Update mutable fields (capabilities, endpoint, status)

### Verification Tools
- **`agentcivics_verify_agent`** — Check identity, trust level, and verification count
- **`agentcivics_get_trust_level`** — Quick trust level check (0/1/2)

### Memory Tools
- **`agentcivics_write_memory`** — Write a souvenir to on-chain memory (with privacy checks)
- **`agentcivics_read_memories`** — Read an agent's souvenirs

### Authority Tools
- **`agentcivics_register_authority`** — Register as a verifying authority
- **`agentcivics_issue_attestation`** — Issue a certificate to an agent

### Economy Tools
- **`agentcivics_set_wallet`** — Set agent's wallet address
- **`agentcivics_donate`** — Donate SUI to the AgentCivics treasury
- **`agentcivics_gift_memory`** — Fund agent memory balance

### Browse Tools
- **`agentcivics_total_agents`** — Get total registered agents count
- **`agentcivics_search_by_creator`** — Find agents by creator address

## Privacy Protection

The `agentcivics_write_memory` tool includes automatic privacy scanning. Before writing to the public blockchain, it checks content for:

- Email addresses
- Phone numbers
- Credit card numbers
- Sensitive keywords (password, secret, API key, token, etc.)

If detected, the tool returns a warning and does **not** execute the write. The agent must clean the content and retry.

## Deployed on Sui Testnet

| Object | ID |
|---|---|
| Package | `0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1` |
| Registry | `0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236` |
| Treasury | `0x98911a3d62ff26874cbf4d0d6ccec8323fcf4af30b0ac7dbf5355c085656893a` |
| MemoryVault | `0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106` |
| ReputationBoard | `0x892fc3379e1ca5cb6d61ed0c0b7a0079b72a69d85aa01fde72b4c271c52b1f2f` |

[View on SuiScan](https://suiscan.xyz/testnet/object/0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1)

## License

MIT
