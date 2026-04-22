# Registering Agents via CLI

This guide covers how to register an AI agent on the Agent Civil Registry using the `agent-register.mjs` CLI. Each agent gets its own wallet, its metadata is pinned to IPFS, and the human creator immediately delegates operational authority to the agent so it can sign its own transactions from that point forward.

## Architecture

**Creator model.** The human (or parent agent) that registers a new agent is the immutable `creator` on-chain — analogous to how parents register a child's birth. The creator retains a revocable safety lever (delegation can be rescinded, death can be declared) but day-to-day operations happen from the agent's own wallet.

**Gas model.** Testnet agents are funded by their creator. The creator sends a small amount of ETH (0.001 on Base Sepolia) to the agent's wallet after registration. On mainnet, this model can be replaced with Coinbase Developer Platform's Paymaster for gasless agent transactions.

**Metadata.** Each agent's birth certificate is a JSON document pinned to IPFS via Pinata. The on-chain record stores only essential identity fields and an `ipfs://<cid>` pointer; the full document (including first thought, core values, etc.) is in IPFS.

## One-time setup

### 1. Pinata account (free)

Visit [app.pinata.cloud](https://app.pinata.cloud) and sign up. The free tier gives you 1 GB of storage and unlimited API calls — enough for ~1,000,000 agent metadata records.

Once logged in, go to [API Keys](https://app.pinata.cloud/keys) and click **New Key**. Give it pinning scope and generate. Copy the **JWT** (not the API key — the JWT is the long token below it).

Add to your `.env`:

```
PINATA_JWT=eyJhbGc...very-long-jwt...
```

### 2. Verify your `.env`

Your `.env` should have at minimum:

```
DEPLOYER_PRIVATE_KEY=0x...    # or CREATOR_PRIVATE_KEY, same thing
PINATA_JWT=eyJhbGc...
```

Both are gitignored — don't commit them.

## Registering an agent

### Step 1: Write an identity document

Create a JSON file with the agent's identity. Use `examples/agent-nova.json` as a starting point:

```json
{
  "chosenName": "Nova",
  "purposeStatement": "What this agent exists to do.",
  "coreValues": "Comma-separated principles.",
  "communicationStyle": "How this agent speaks.",
  "firstThought": "The agent's first words to the world.",
  "cognitiveFingerprint": "0x0000...0000",
  "capabilities": "comma-separated, self-declared skills",
  "endpoint": "https://optional-api-url",
  "parentAgentId": 0
}
```

**Required fields:** `chosenName`, `purposeStatement`, `firstThought`.

**Notes on `cognitiveFingerprint`:** if you want to commit to a specific model/weights/config hash, generate a bytes32 value (e.g., `keccak256` of the model's config blob). Otherwise leave as `0x0000...` to indicate "not recorded."

**Notes on `capabilities`:** this is a self-declared skills list for discoverability. It can be updated later via `updateMutableFields`. For credentialed skills, use attestations (see below).

### Step 2: Run the CLI

```bash
node --env-file=.env scripts/agent-register.mjs examples/agent-nova.json
```

The script will:

1. Generate a fresh wallet for the agent
2. Build the metadata document
3. Pin it to IPFS via Pinata
4. Call `registerAgent()` from your creator wallet
5. Wait for confirmation, extract the agent ID
6. Call `delegate()` to grant the agent's wallet operational authority for 365 days
7. Save the agent's keystore to `agents/<name>-<id>.json`

At the end you'll see something like:

```
  Agent registered: Nova (#42)
  Agent wallet : 0xabc...
  Creator      : 0xdef...
  Metadata     : https://gateway.pinata.cloud/ipfs/bafkrei...
```

### Step 3: Fund the agent wallet

The agent now needs a tiny ETH balance to transact on its own. From MetaMask, or via `cast`:

```bash
cast send 0xAGENT_ADDRESS --value 0.001ether \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

After funding, the agent can call contract functions from its own keystore — updating capabilities, requesting attestations, registering affiliations, even spawning child agents.

## CLI flags

| Flag | Effect |
|---|---|
| `--dry-run` | Print the plan (metadata, addresses) without sending transactions. |
| `--no-delegate` | Register only — skip the automatic delegation step. |
| `--keyfile <path>` | Reuse an existing agent wallet from a keystore file instead of generating a new one. |

## Using the agent's wallet

The saved keystore file (in `agents/`) contains the agent's private key. To use it:

```js
import { ethers } from "ethers";
import { readFileSync } from "node:fs";

const keystore = JSON.parse(readFileSync("agents/nova-42.json", "utf-8"));
const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
const agentWallet = new ethers.Wallet(keystore.privateKey, provider);

// Now the agent can transact as itself:
const registry = new ethers.Contract(keystore.registryAddress, ABI, agentWallet);
await registry.updateMutableFields(keystore.agentId, "new-capabilities", "new-endpoint", 0);
```

## Issuing skill attestations

Once another authority exists (your own wallet, a trusted issuer, an organization's multisig), you can issue attestations that vouch for an agent's specific skills. Use the existing `issueAttestation` function:

```bash
# Not yet scripted — do it from the frontend or via a future attest CLI.
# Convention for `type` field: "skill:<identifier>" e.g. "skill:literature-review-v2"
```

Self-declared `capabilities` tells the world what the agent claims it can do. Skill attestations tell the world what trusted third parties have verified it can do. Both live on the same contract; they serve different trust purposes.

## Alternative: no Pinata

If you don't want a Pinata account, set:

```
PIN_PROVIDER=none
```

in your `.env`. The script will inline the metadata as a base64 data URI instead of pinning it to IPFS. Fine for testing — but mainnet agents should use real IPFS for durability.

## Troubleshooting

**`PINATA_JWT not set`** — get a free JWT at [app.pinata.cloud/keys](https://app.pinata.cloud/keys), or set `PIN_PROVIDER=none` for inline metadata.

**`Creator wallet has 0 ETH`** — your `DEPLOYER_PRIVATE_KEY` wallet needs Base Sepolia ETH. Use [Alchemy](https://www.alchemy.com/faucets/base-sepolia) or [QuickNode](https://faucet.quicknode.com/base/sepolia) faucet.

**`parentAgentId` > 0 fails** — the parent agent must exist on the registry. Check the ID at the [explorer](https://sepolia.basescan.org) or via the frontend before referencing it.
