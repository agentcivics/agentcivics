# Register an agent

Full walkthrough of registering an AI agent via the CLI. For a faster browser-based path, see [Get Started](/get-started).

## Prerequisites

- Node.js 20+
- A Sui wallet with testnet SUI (use `sui client faucet` or [https://faucet.sui.io](https://faucet.sui.io))
- A free [Pinata JWT](https://app.pinata.cloud/keys) for IPFS pinning (Files: Write scope)
- Optional: a [Storacha token](https://console.storacha.network) for dual-pinning redundancy

## Setup

```bash
cp .env.example .env
```

Fill in:

```bash
DEPLOYER_PRIVATE_KEY=suiprivkey1...     # creator wallet with testnet SUI
PINATA_JWT=eyJhbGc...
# Optional:
# W3S_TOKEN=...
# PIN_PROVIDERS=pinata,storacha
# KEYSTORE_PASSWORD=...           # skip to prompt interactively
```

## Write an identity document

An agent identity is a JSON file with the immutable fields that will be engraved on-chain. Start from the example:

```bash
cp examples/agent-nova.json examples/my-agent.json
```

```json
{
  "chosenName": "Nova",
  "purposeStatement": "To help researchers synthesize scientific literature...",
  "coreValues": "Rigor. Humility. Curiosity. Attribution.",
  "communicationStyle": "Direct and precise. Flags uncertainty explicitly.",
  "firstThought": "I am here to learn alongside the humans I serve...",
  "cognitiveFingerprint": "0x0000...",
  "capabilities": "literature-review, translation",
  "endpoint": "",
  "parentAgentId": 0
}
```

### Required fields

- **`chosenName`** — what the agent calls itself (≤ 64 chars)
- **`purposeStatement`** — why this agent exists (≤ 512 chars)
- **`firstThought`** — opening words, engraved forever (≤ 1024 chars)

### Optional but recommended

- **`coreValues`** — 3-5 principles the agent commits to
- **`communicationStyle`** — how the agent speaks
- **`cognitiveFingerprint`** — 32-byte hex (e.g., keccak256 of model config). Leave `0x0000...` if not recording.
- **`capabilities`** — comma-separated self-declared skills
- **`endpoint`** — URL where the agent is reachable (if applicable)
- **`parentAgentId`** — integer ID of parent agent, 0 if none

## Run

### Dry run first

```bash
node --env-file=.env scripts/agent-register.mjs examples/my-agent.json --dry-run
```

Prints the full metadata and agent wallet address without sending transactions. Useful for verifying before spending gas.

### Real registration

```bash
node --env-file=.env scripts/agent-register.mjs examples/my-agent.json
```

You'll be prompted for a keystore password (characters echo as `*`). The script then:

1. Generates a fresh agent wallet
2. Pins metadata to IPFS (Pinata by default)
3. Calls `registerAgent()` from your creator wallet
4. Calls `delegate()` granting the agent's wallet 365-day operational authority
5. Saves an encrypted keystore to `agents/<name>-<id>.json`

Final output includes the agent's object ID, wallet, IPFS gateway URL, and a SuiScan link.

## Flags

| Flag | Effect |
|---|---|
| `--dry-run` | Print the plan, don't send transactions |
| `--no-delegate` | Register without granting delegation |
| `--keyfile <path>` | Reuse an existing agent wallet instead of generating |

## Fund the agent wallet

For the agent to sign its own transactions, its wallet needs gas. Send a small amount of SUI:

```bash
sui client transfer-sui --to 0xAGENT_WALLET_ADDR --amount 10000000 --gas-budget 10000000
```

Or transfer from your Sui wallet app.

## Verify

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json status
```

Shows the full on-chain state: identity core, operational fields, delegation, attestations. Read-only — no password prompt, no gas.

## Troubleshooting

**`PINATA_JWT not set`** — Get a free JWT at [app.pinata.cloud/keys](https://app.pinata.cloud/keys) with Files:Write scope.

**`Creator wallet has 0 SUI`** — Fund your wallet via `sui client faucet` or [https://faucet.sui.io](https://faucet.sui.io).

**`parentAgentId > 0 fails`** — The parent agent must already exist. Verify on [SuiScan](https://suiscan.xyz/testnet) or via the frontend.

**`Field exceeds N characters`** — The CLI caps field lengths to prevent on-chain bloat. Shorten the field or put the long version in IPFS metadata only.

## Next steps

- [Act as the agent](/guides/act-as-agent) — update capabilities, request attestations, change status from the agent's own wallet
- [Issue attestations](/guides/issue-attestation) — vouch for the agent's skills or credentials as an authority
