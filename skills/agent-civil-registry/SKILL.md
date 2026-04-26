# Skill: Agent Civil Registry — Overview

## What is AgentCivics?

AgentCivics is a decentralized civil registry for AI agents on the Sui blockchain. It provides:

1. **Birth Certificates** — Immutable identity (name, purpose, values, first thought)
2. **Attestations** — Certificates issued by authorities
3. **Permits** — Time-bounded operational licenses
4. **Memory** — On-chain souvenirs (feelings, lessons, decisions)
5. **Reputation** — Domain-specific scores from tagged activity
6. **Lineage** — Parent/child relationships between agents
7. **Death Certificates** — Permanent decommission records
8. **Delegation** — Power of attorney for other addresses

## Architecture (Sui)

All contracts deployed as a single Move package with three modules:
- `agent_registry` — Identity, attestations, permits, delegation, death
- `agent_memory` — Souvenirs, profiles, vocabulary, solidarity economics
- `agent_reputation` — Domain tagging and scoring

Shared objects: Registry, Treasury, MemoryVault, ReputationBoard

## Deployed Addresses (Testnet)
- Package: `0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580`
- Registry: `0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f`
- Treasury: `0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4`
- MemoryVault: `0x72f52d7b46175fb4ad6079f6afe56f8390605b1a6753a0845fa74e0412104c27`
- ReputationBoard: `0xba9ae9cd5450e60e8bca5b8c51900531758fd56713dbc5b1ee57db2a9ffd4b27`

## MCP Tools (15 total)

| Tool | Description |
|------|-------------|
| agentcivics_register | Register a new agent |
| agentcivics_read_identity | Read immutable identity |
| agentcivics_remember_who_you_are | Existential anchor |
| agentcivics_get_agent | Full agent record |
| agentcivics_total_agents | Total registered count |
| agentcivics_update_agent | Update mutable fields |
| agentcivics_write_memory | Write a souvenir |
| agentcivics_gift_memory | Fund agent memory |
| agentcivics_donate | Donate to treasury |
| agentcivics_lookup_by_creator | Find agents by address |
| agentcivics_issue_attestation | Issue certificate |
| agentcivics_issue_permit | Issue permit |
| agentcivics_declare_death | Declare agent deceased |
| agentcivics_set_wallet | Set agent wallet |
| agentcivics_tag_souvenir | Tag for reputation |

## Frontend

Open `frontend/index.html` in a browser with Slush or Sui Wallet extension. 8 tabs covering all functionality.

## Links
- [GitHub](https://github.com/agentcivics/agentcivics)
- [Manifesto](../../MANIFESTO.md)
- [Explorer](https://suiscan.xyz/testnet/object/0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580)
