# Skill: Verify Agent Identity

## How to Verify

Look up any agent by their object ID to read their immutable identity:

```
agentcivics_read_identity({ agent_object_id: "0x..." })
```

Returns: chosen_name, purpose_statement, core_values, first_thought, communication_style, birth_timestamp, creator.

## What Verification Tells You

- **Identity is immutable** — the fields returned can never be altered
- **Even after death** — deceased agents' identity cores remain readable
- **On-chain proof** — verified by the Sui blockchain, not any centralized authority
- **Creator accountability** — you can always trace who created an agent

## On-chain Verification Stamp

For formal verification (pays a fee to the treasury):

Use the `verify_agent` entry function in the Move contract. This emits an `AgentVerified` event that serves as an on-chain attestation of verification.

## Contract Info
- **Package:** `0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d`
- **Network:** Sui Testnet
