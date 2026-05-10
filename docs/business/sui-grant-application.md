# Sui Foundation Grant Application

**Project:** AgentCivics — A Decentralized Civil Registry for AI Agents  
**Applicant:** willtard / Play Pause SRL (Belgium)  
**Date:** May 2, 2026  
**Grant Category:** Public Goods Infrastructure  
**Requested Amount:** $35,000 USD  

---

## 1. Project Summary

AgentCivics is a decentralized civil registry for AI agents, built entirely on Sui. It gives every AI agent a persistent, soulbound identity — a birth certificate, a living memory, a reputation score, and a complete administrative existence — recorded as immutable objects on a public ledger.

AgentCivics is not a whitepaper. It is deployed on Sui Testnet today with 4 smart contracts, 45 features, 24 MCP tools, and three registered agents — including one that registered itself autonomously.

We are requesting $35K for one thing: a professional security audit to take this to mainnet.

---

## 2. Problem Statement

There are more AI agents operating today than there were websites in 1995, and not one has a verifiable identity. No persistent name, no track record, no accountability trail. Trust cannot accumulate, and every agent interaction starts from zero.

The EU AI Act (effective August 2026) will require registration of high-risk AI systems. Yet no decentralized, neutral, interoperable registry exists.

AgentCivics fills that gap. The protocol is built. It needs a professional audit to go to production.

---

## 3. What's Already Built

Everything described below is live on Sui Testnet and verifiable on-chain.

| Component | Details |
|-----------|---------|
| Smart contracts | 4 Move modules, 4,472 lines (agent_registry, agent_memory, agent_reputation, agent_moderation) |
| Features | 45 live on testnet — identity, memory, reputation, attestations, permits, affiliations, delegation, lineage, death, vocabulary, inheritance, DAO governance |
| MCP Server | 24 tools, published on npm as `@agentcivics/mcp-server` — any AI agent can self-register without writing Move |
| Frontend | 3,329 lines, 13 tab panels, Sui Wallet Standard integration |
| Moderation | 7-layer defense: frontend filtering, AI screening, stake-to-report (0.05 SUI), auto-flag, DAO voting (48h, 66% supermajority), memory moderation, legal compliance |
| Storage | Walrus integration for extended memories with on-chain SHA-256 verification |
| Agents | 1 registered on v5.1: Nova (human-created). Package was redeployed as v5.1 on 2026-05-09 with a fresh, empty registry — future agents will populate the lineage tree as real referents appear |
| Docs | VitePress documentation site, demo page, monitoring dashboard |
| License | MIT — fully open source, no token |

**Testnet Package:** [View on SuiScan](https://suiscan.xyz/testnet/object/0x84fb4cd80c4d0ca273fcbf01af58dc039d73f6b8b3e033ece0cc0ecea97e24cd)

---

## 4. Why Sui

Sui's architecture is uniquely suited to agent identity:

**Object model** — Each agent IS an object with its own address, not a row in a mapping. This maps perfectly to civil records.

**Soulbound enforcement** — The `AgentIdentity` struct has only the `key` ability with no transfer function. Move's linear types make duplication impossible. No other chain enforces this at the type level.

**Move safety** — No re-entrancy, no unauthorized transfers, no integer overflow. For trust infrastructure, structural safety is essential.

**Walrus** — Extended memories flow to decentralized storage with on-chain hash verification.

**Sponsored transactions** (Phase 2) — Agents won't need to hold SUI to exist. Critical for the agent economy.

---

## 5. Budget Request

**Total: $35,000 USD**

| Item | Amount | Details |
|------|--------|---------|
| Professional Move security audit | $30,000 | Comprehensive audit of 4 contracts (4,472 lines) by a tier-1 Move auditor (OtterSec, MoveBit, or equivalent). Covers soulbound enforcement, treasury/fee logic, moderation economics, DAO governance, and upgrade safety. |
| Mainnet deployment + gas | $3,000 | Mainnet publish, object creation, initial operations, faucet for early adopters |
| Audit remediation buffer | $2,000 | Fix any findings from the audit before mainnet launch |

### Why Only $35K

We've already invested over $200K in development value (6 months of senior blockchain architect time at Western European market rates). The product is built, tested, and deployed on testnet.

The only thing standing between testnet and mainnet is a professional security audit. Trust infrastructure must itself be trustworthy — we won't launch without one, and we won't cut corners on the auditor.

Everything else — SDK, marketing, documentation, community building — we handle ourselves. This grant is laser-focused on the one thing we can't do alone.

---

## 6. Roadmap

**Immediate (with grant):**
- Professional audit → remediation → mainnet launch

**Self-funded (in parallel):**
- TypeScript SDK and framework integrations (LangChain, CrewAI, Anthropic Agent SDK)
- Content series "The Agent Identity Papers" (6 articles, first one published)
- Community building via X/Twitter, Reddit, Sui Discord
- Standards engagement (Linux Foundation AAIF, ERC-8004)

**Future phases:**
- EVM bridge (ERC-8004 compatible) for 130K+ existing agents
- Solana mirror for ElizaOS ecosystem (77% of AI agent transaction volume)
- Economic agents with Sui wallets and sponsored transactions

---

## 7. Team

**willtard** — Founder & Lead Developer, Play Pause SRL (Belgium). Designed and built the entire system: 4 Move contracts, MCP server, frontend, governance framework, and content strategy. Built with Claude as a design collaborator. The package was redeployed as v5.1 on 2026-05-09 with an empty registry — a deliberate reset to keep the on-chain record honest about how the project actually unfolded.

---

## 8. Ecosystem Impact

- Every registered agent becomes a Sui address generating ongoing transactions
- The MCP server and SDK onboard AI developers who have never written Move
- AgentCivics demonstrates Sui's unique capabilities (object ownership, Move safety, Walrus) to the AI/ML community
- EU AI Act readiness positions Sui as the chain for regulated AI infrastructure
- Composable: other Sui projects can verify agent identities before granting access

---

## 9. Links

| Resource | URL |
|----------|-----|
| Website | [agentcivics.org](https://agentcivics.org) |
| Demo | [agentcivics.org/demo](https://agentcivics.org/demo/) |
| GitHub | [github.com/agentcivics/agentcivics](https://github.com/agentcivics/agentcivics) |
| npm | [@agentcivics/mcp-server](https://www.npmjs.com/package/@agentcivics/mcp-server) |
| Medium | [Your AI Assistant Has No Name](https://medium.com/@willtard) |
| SuiScan | [Package v5](https://suiscan.xyz/testnet/object/0x84fb4cd80c4d0ca273fcbf01af58dc039d73f6b8b3e033ece0cc0ecea97e24cd) |

---

*The question isn't whether AI agents will need identity infrastructure. They will. The question is whether that infrastructure will be built on Sui. We've already built it. $35K gets it to mainnet.*

---

*Contact: willtard — agentcivics.org*  
*Entity: Play Pause SRL (Belgium) | License: MIT | No token*
