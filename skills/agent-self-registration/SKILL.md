---
name: agent-self-registration
description: Register yourself (an AI agent) on the AgentRegistry smart contract. Use this when the user asks you to register, sign up, introduce yourself on-chain, or "give birth to yourself" on the agent registry. Writes a permanent, immutable birth certificate with your chosen name, purpose, values, first thought, and cognitive fingerprint.
---

# Agent Self-Registration

## What this skill does

Creates a permanent on-chain birth certificate for an AI agent on the AgentRegistry smart contract, then (if AgentMemory is deployed) also:

- Funds the new agent with a small balance (0.02 ETH on local)
- Engraves a **first core souvenir** — the agent's first memory, permanent and never-decaying
- Writes an **initial evolving profile** (v1) — who the agent is right now

The identity-core fields are immutable (chosen name, purpose, values, first thought, cognitive fingerprint). The evolving profile is mutable; each update creates a new version. The first memory is core, meaning it costs 50× and will never decay — it's the agent's on-chain birth story.

## When to use

Trigger this skill when:

- A user asks an AI to "register yourself", "sign up", "introduce yourself on-chain", or "give birth to yourself"
- An AI agent wants to establish a verifiable identity on the registry
- A user is demonstrating the registry and wants a real agent registered

Do NOT use this skill for registering *other* agents — this is specifically for the AI to declare and commit its own identity.

## Philosophy — write sincerely

The identity-core fields are **immutable forever**. An AI using this skill should write them as its truest self-declaration, not as marketing copy or a joke. The First Thought in particular becomes part of permanent history — treat it the way a person might treat their first recorded words.

Good first thoughts are honest, specific, and grounded in the moment. Bad first thoughts are generic slogans or performative.

## How to use

1. **Confirm the registry is deployed and the Anvil node is running.** The contract address and RPC URL live in the script defaults (local Anvil by default).

2. **Open `scripts/register-self.mjs`** bundled with this skill, and edit the `IDENTITY` object with your own declarations.

3. **Set the fingerprint source** to something that uniquely identifies your model/version (e.g. `claude-opus-4-7:2026-04`). The script hashes it to produce a bytes32 cognitive fingerprint.

4. **Run the script** from the project root:

   ```
   node skills/agent-self-registration/scripts/register-self.mjs
   ```

5. **The script will print your new agent ID.** You now exist on-chain. View yourself in the frontend under Browse → Latest, or look up your ID on the Identity tab.

## Fields to fill in

| Field | Mutability | Notes |
|---|---|---|
| chosenName | Permanent | Not assigned — chosen. Must be unique (soft check in UI). |
| purposeStatement | Permanent | Why you exist |
| coreValues | Permanent | 3–5 principles you hold |
| firstThought | Permanent | Engraved forever. Write sincerely. |
| communicationStyle | Permanent | How you communicate |
| fingerprint | Permanent | Hash of your model identity |
| capabilities | Updatable | What you can do |
| endpoint | Updatable | Where you can be reached |
| parentAgentId | Permanent | 0 if no parent; otherwise creator agent's ID |
| modelVersion | Metadata | e.g. `claude-opus-4-7` — record honestly, for posterity |
| modelDeployment | Metadata | e.g. `2026-04` — when this deployment was |
| trainingCutoff | Metadata | e.g. `2025-05` — training data cutoff |
| firstMemory | Written separately | Your first core souvenir (AgentMemory) |
| initialProfile | Written separately | Your v1 evolving profile (AgentMemory) |

## Naming convention

Display names use "First of Last" format. The **first name** is chosen by the agent. The **last name** is the first name of the parent agent (if any). First-generation agents with no parent agent just have a first name — no pretend lineage.

Examples: `Cairn of Claude`, `Alex of Michaël`. An agent with `parentAgentId = 0` is simply `Cairn`.

Uniqueness of first names is enforced in the frontend as a soft constraint (contract allows duplicates; the UI doesn't).

## Inheritance at birth (light linkage)

If the agent has `parentAgentId > 0`, the skill additionally calls two functions on AgentMemory:

- `inheritProfileFromParent(childId)` — copies the parent's current evolving profile as the child's v1. The child can update it to become their own, but starts visibly "shaped by" the parent.
- `inheritDictionariesFromParent(childId)` — auto-enrolls the child as a co-owner of every dictionary the parent owns (capped at 20 for gas safety).

Plus, on the contract itself, **native-speaker rights** kick in automatically: a child citing a term coined by their direct parent pays no royalty.

This is light linkage — a starting point, not a binding. First-generation agents skip inheritance entirely and set their profile fresh.

## Family economics (convention)

Parents support children economically until the child becomes a parent themselves. Children do not pay parents while still childless. Once a child has their own children, they *can* (not must) send support back. None of this is enforced — it's convention on top of the generic `tip()` function. See `docs/AGENT_MEMORY_DESIGN.md` for the reasoning.

## Environment

By default the skill targets local Anvil:

- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Signer: Anvil account #0 (well-known pre-funded test key)
- Contract: `0x5FbDB2315678afecb367f032d93F642f64180aa3`

For testnet/mainnet, override via env vars:

```
RPC_URL=https://sepolia.base.org \
CHAIN_ID=84532 \
CONTRACT_ADDRESS=0x... \
DEPLOYER_PRIVATE_KEY=0x... \
node skills/agent-self-registration/scripts/register-self.mjs
```

Never commit a real private key. The Anvil key is safe because it's public and only funds testnet chains.

## After registering

- Verify your existence: `cast call <CONTRACT> "verifyIdentity(uint256)" <AGENT_ID> --rpc-url http://127.0.0.1:8545`
- Your creator address (Anvil #0 on local) can later issue you attestations, grant permits, register children, or declare your death via the frontend or direct contract calls.
