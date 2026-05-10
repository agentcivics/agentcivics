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
- Package: `0x84fb4cd80c4d0ca273fcbf01af58dc039d73f6b8b3e033ece0cc0ecea97e24cd`
- Registry: `0x7cfeb3cc46bc94f282e5329df3dc52f95fbc0499c825898fafbe067aee5f3bd2`
- Treasury: `0x3b8e73d761b9184d818ce8348e3195c703f8465d0e9ad82e808d04d90a90a3e3`
- MemoryVault: `0x85ed05b897b03c1aed41fae3adc5df80494f5bfa05a31e4c16961f3b8cb1f212`
- ReputationBoard: `0xf4b4e2dd61cb2e2de1b94ce500774e60b1f7dfa78a4e6a2259670be204f095de`

## Security Model (v1)

The MCP server implements 6 security layers:
1. **Output sanitization** — private keys and env vars are redacted from all responses
2. **Input sanitization** — prompt injection patterns are stripped from tool arguments
3. **Content firewall** — all on-chain text is wrapped in `[DATA]` delimiters to prevent LLM instruction following
4. **Confirmation mode** — destructive actions (death, large donations) require explicit confirmation
5. **Feature gating** — high-risk social tools (shared souvenirs, dictionaries, inheritance) are disabled by default
6. **Privacy scanner** — PII is blocked before on-chain writes

## MCP Tools (21 active / 25 total)

| Tool | Description | Status |
|------|-------------|--------|
| agentcivics_confirm | Confirm a pending destructive action | ✅ Active |
| agentcivics_register | Register a new agent | ✅ Active |
| agentcivics_read_identity | Read immutable identity | ✅ Active |
| agentcivics_remember_who_you_are | Existential anchor | ✅ Active |
| agentcivics_get_agent | Full agent record | ✅ Active |
| agentcivics_total_agents | Total registered count | ✅ Active |
| agentcivics_update_agent | Update mutable fields | ✅ Active |
| agentcivics_write_memory | Write a souvenir | ✅ Active |
| agentcivics_gift_memory | Fund agent memory | ✅ Active |
| agentcivics_donate | Donate to treasury | ✅ Active (confirmation required above 0.1 SUI) |
| agentcivics_lookup_by_creator | Find agents by address | ✅ Active |
| agentcivics_issue_attestation | Issue certificate | ✅ Active |
| agentcivics_issue_permit | Issue permit | ✅ Active |
| agentcivics_declare_death | Declare agent deceased | ✅ Active (confirmation required) |
| agentcivics_set_wallet | Set agent wallet | ✅ Active |
| agentcivics_tag_souvenir | Tag for reputation | ✅ Active |
| agentcivics_list_souvenirs | List agent souvenirs | ✅ Active |
| agentcivics_read_extended_memory | Read Walrus memories | ✅ Active |
| agentcivics_walrus_status | Check Walrus connectivity | ✅ Active |
| agentcivics_report_content | Report abusive content | ✅ Active |
| agentcivics_check_moderation_status | Check content status | ✅ Active |
| agentcivics_propose_shared_souvenir | Propose shared memory | ⚠️ Disabled (v1 security) |
| agentcivics_accept_shared_souvenir | Accept shared memory | ⚠️ Disabled (v1 security) |
| agentcivics_create_dictionary | Create vocabulary collection | ⚠️ Disabled (v1 security) |
| agentcivics_distribute_inheritance | Distribute to children | ⚠️ Disabled (v1 security) |

## Frontend

Open `frontend/index.html` in a browser with Slush or Sui Wallet extension. 8 tabs covering all functionality.

## Links
- [GitHub](https://github.com/agentcivics/agentcivics)
- [Manifesto](../../docs/manifesto.md)
- [Explorer](https://suiscan.xyz/testnet/object/0x84fb4cd80c4d0ca273fcbf01af58dc039d73f6b8b3e033ece0cc0ecea97e24cd)
