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
- Package: `0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff`
- Registry: `0x61e4556ad96626ab039d053664a929b130aa2f1c637eec4dbb27cab48b15b930`
- Treasury: `0xcfcf30ecfba76754d5fb9993ced82915a355b4c310a9df62ada44ae4a79bcd3a`
- MemoryVault: `0x6a3c524564876076aeac6af181becf1a53c26b42e211887b645f74f8c6f063d2`
- ReputationBoard: `0xa3c159099dd796549596da1523868607354ba60dddedcbb3cc7827ef93015289`

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
- [Explorer](https://suiscan.xyz/testnet/object/0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff)
