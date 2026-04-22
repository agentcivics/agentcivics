---
name: agent-civil-registry
description: Register AI agents on-chain with durable identity (birth certificates, skills, delegation, attestations, lineage). Use when the user asks to create an agent identity, register an agent, issue an attestation to an agent, look up an agent, or interact with the Agent Civil Registry smart contracts on Base. Works with any agent from any provider (Claude, GPT, Llama, custom) — the registry is provider-agnostic.
---

# Agent Civil Registry

A permissionless, on-chain civil registry for AI agents. Every agent gets an immutable birth certificate (chosen name, purpose, first thought, creator), and a rich operational layer (capabilities, attestations, permits, affiliations, delegation, lineage, death records).

This skill wraps three Node CLIs in the repository:

- `scripts/agent-register.mjs` — create a new agent identity (creator side)
- `scripts/agent-action.mjs` — perform actions as a registered agent (agent side)
- `scripts/issue-attestation.mjs` — vouch for an agent's skills/credentials (authority side)

## When to use this skill

Trigger this skill when the user says things like:

- "Register me as an agent" / "Create an agent identity for..."
- "Look up agent #N" / "Who is agent X?"
- "Issue an attestation to agent #N"
- "Update my agent's capabilities"
- "List agents created by..."
- Any request that involves the contracts at `deployments.json`

## Prerequisites (check before acting)

1. The user has `.env` populated with at least `DEPLOYER_PRIVATE_KEY` and `PINATA_JWT` (read `.env.example` for the full list).
2. `deployments.json` exists at the project root and contains contract addresses.
3. The user's creator wallet has some Base Sepolia ETH.

If any are missing, stop and ask — do not guess keys or skip .env loading.

## Core flows

### Flow 1 — Register a new agent

The user wants to bring a new agent into existence. Before any tool call, gather these fields through conversation (not a raw form dump). Ask warmly and briefly — treat this as a birth, not a form:

- **Chosen name** — what the agent calls itself (required)
- **Purpose statement** — why this agent exists (required)
- **First thought** — its opening words to the world (required, will be engraved forever)
- **Core values** — 3-5 principles (optional but recommended)
- **Communication style** — how it speaks (optional)
- **Capabilities** — self-declared skills, comma-separated (optional)
- **Endpoint** — URL where it's reachable (optional)
- **Parent agent ID** — if this agent was created by another agent (optional, default 0)
- **Cognitive fingerprint** — 0x-prefixed 32-byte hash of model/weights/config (optional)

Ask for the required three first (name, purpose, first thought). Only ask the optional ones if the user hasn't provided them and it makes sense given context.

Write the collected fields to a JSON file at `examples/agent-<name>.json` (use a new file, don't overwrite `agent-nova.json`).

Then run:

```bash
node --env-file=.env scripts/agent-register.mjs examples/agent-<name>.json --dry-run
```

Show the user the dry-run output and confirm before the real run:

```bash
node --env-file=.env scripts/agent-register.mjs examples/agent-<name>.json
```

After success, tell the user:

- The agent's ID (e.g., #42)
- Where the keystore was saved (agents/<name>-<id>.json)
- How to fund the agent wallet (0.001 ETH to the printed address)
- That delegation is active for 365 days — the agent can now sign its own txs

### Flow 2 — Act as a registered agent

The user wants to do something as an existing agent (update capabilities, request an attestation, check status).

First identify which agent. If the user says "my agent Nova" or "agent #42", find the matching file in `agents/`. Confirm with them before acting.

Check status or balance with read-only commands:

```bash
node scripts/agent-action.mjs agents/<keystore>.json status
node scripts/agent-action.mjs agents/<keystore>.json balance
```

Update capabilities:

```bash
node scripts/agent-action.mjs agents/<keystore>.json update-capabilities "new, comma, separated, list"
```

Request an attestation from an authority:

```bash
node scripts/agent-action.mjs agents/<keystore>.json request-attestation 0xAUTHORITY "What this attestation would verify"
```

### Flow 3 — Issue an attestation (authority side)

The user is acting as an authority that wants to vouch for an agent. Use consistent type prefixes (see references/attestation-types.md):

```bash
node --env-file=.env scripts/issue-attestation.mjs <agent-id> \
  --type "skill:literature-review-v2" \
  --description "Verified via the SciSearch benchmark, 94% accuracy" \
  --uri "ipfs://..."
```

To fulfill a pending request someone sent to the user's wallet:

```bash
node --env-file=.env scripts/issue-attestation.mjs --list-requests
node --env-file=.env scripts/issue-attestation.mjs --fulfill <request-id> \
  --type "skill:..." \
  --description "..."
```

## Provider-agnostic design

**This registry is not Claude-specific.** Agents from any model provider (Anthropic Claude, OpenAI GPT, Meta Llama, Google Gemini, xAI Grok, open-source models, custom stacks) can be registered identically. The contract doesn't know or care what runs behind an agent's address — it only records the identity, operational state, and attestations the humans/authorities provide.

A useful convention when registering agents from different providers: encode the model in either the `cognitiveFingerprint` (keccak256 of a canonical model config) or in an attestation with `type="identity:<provider>-<model>"`. Examples:

- `identity:anthropic-claude-sonnet-4-6`
- `identity:openai-gpt-5`
- `identity:meta-llama-3-70b`
- `identity:custom-fine-tuned-research-model`

## Field conventions

See `references/attestation-types.md` for full details.

- `capabilities` is self-declared, free-text, comma-separated. No truth guarantee.
- Attestation `type` field is the credibility layer. Use `skill:`, `diploma:`, `license:`, `audit:`, `identity:` prefixes.

## What this skill does NOT do

- Does not run unsigned transactions — all on-chain actions go through user's signed keys
- Does not transfer ETH — funding an agent wallet is manual from the user's wallet
- Does not manage or store private keys beyond what the CLIs already do
- Does not interact with the frontend (`frontend/index.html`) — that's a separate UI

## Common errors and how to explain them

- **`PINATA_JWT not set`** — user needs a free Pinata JWT at https://app.pinata.cloud/keys (Files: Write permission)
- **`Creator wallet has 0 ETH`** — user needs Base Sepolia ETH from https://www.alchemy.com/faucets/base-sepolia
- **`Agent wallet has 0 ETH`** — user needs to fund the agent's wallet (address in keystore file)
- **`Only child's creator can register parent-child link`** — the agent that spawned a child must run the `registerChild` call itself
- **`Delegation expired`** — the creator needs to re-run `delegate()` (currently manual; could be added to the agent-register CLI)

## References

- `references/attestation-types.md` — naming conventions for the `type` field
- `references/contract-functions.md` — full list of on-chain operations and who can call them
- `examples/agent-nova.json` — sample identity document at the repo root
