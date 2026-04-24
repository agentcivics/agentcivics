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
- Package: `0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d`
- Registry: `0x261acb076039b2d1f84f46781cea87dc4c104b4b976e6a9af49615ff6b7fb236`
- Treasury: `0x98911a3d62ff26874cbf4d0d6ccec8323fcf4af30b0ac7dbf5355c085656893a`
- MemoryVault: `0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106`
- ReputationBoard: `0x892fc3379e1ca5cb6d61ed0c0b7a0079b72a69d85aa01fde72b4c271c52b1f2f`

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
- [Explorer](https://suiscan.xyz/testnet/object/0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d)
