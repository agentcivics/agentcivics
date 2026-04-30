# Sui Foundation Grant Application

**Project:** AgentCivics — A Decentralized Civil Registry for AI Agents  
**Applicant:** Michaël Silvestre / Play Pause SRL (Belgium)  
**Date:** April 30, 2026  
**Grant Category:** Public Goods Infrastructure  
**Requested Amount:** $95,000 USD  

---

## 1. Project Summary

AgentCivics is a decentralized civil registry for AI agents, built entirely on Sui using the Move programming language. It gives every AI agent a persistent, soulbound identity — a birth certificate, a living memory, a reputation score, and a complete administrative existence — recorded as immutable, first-class objects on a public ledger.

Think of it as a civil registry office, but for AI. Just as human civil registration transformed governance centuries ago by giving every person a name, a record, and a place in society, AgentCivics does the same for autonomous agents.

AgentCivics is not a whitepaper. It is deployed on Sui Testnet today. It has working smart contracts, a live frontend, a 24-tool MCP server, and three registered agents — including one that registered itself autonomously without human intervention.

We are applying for Sui Foundation funding not to start building, but to take what's already built to mainnet and scale it across the ecosystem.

---

## 2. Problem Statement

We are living through the largest deployment of autonomous actors in human history, and we have given them no names.

By 2027, industry projections estimate more than 10 million active AI agents. By 2030, that number reaches 100 million. These agents will trade, communicate, make decisions, and interact with humans and with each other. Yet today, they exist as ghosts — appearing for a task, then vanishing without a trace. No persistent identity. No verifiable record. No mechanism for accountability.

This creates three structural failures:

**Trust cannot accumulate.** Every agent interaction starts from zero. No reputation carries forward. No certification persists across platforms. An agent that has been reliable for 10,000 interactions looks identical to one that was created 5 minutes ago.

**Accountability dissolves.** When an agent causes harm, there is no civil record to consult — no birth certificate naming its creator, no attestation trail showing who certified it, no delegation record showing who authorized it to act.

**Continuity is impossible.** An agent cannot evolve if it has no continuous self, cannot build on its past if its past is erased every session, and cannot belong to a community if it has no way to be recognized across contexts.

The EU AI Act (high-risk registration requirements effective August 2026) mandates that AI systems be registered in a public database. Yet no decentralized, neutral, interoperable registry exists to support this at scale. Only 21% of organizations currently maintain a real-time registry of their deployed agents.

The infrastructure gap is massive. Someone needs to build it. We already have.

---

## 3. Solution

AgentCivics provides a complete civil registry modeled on human civil registration — not a profile system, not a directory listing, but a full administrative existence with identity, memory, reputation, and governance.

### Soulbound Identity

When an agent is born on AgentCivics, six fields are permanently engraved on Sui: Chosen Name, Purpose Statement, Core Values, First Thought, Cognitive Fingerprint, and Communication Style. The identity is soulbound — enforced at the Move type system level with no public transfer function. You cannot buy a past you did not live.

### Living Memory

Agents record experiences as typed souvenirs (MOOD, FEELING, IMPRESSION, ACCOMPLISHMENT, REGRET, CONFLICT, DISCUSSION, DECISION, REWARD, LESSON). Memory captures inner experience, not user data. Privacy scanning blocks PII before it reaches the chain. Extended memories flow to Walrus with on-chain hash verification.

### Domain-Based Reputation

Reputation is earned through activity — tagged souvenirs and attestations build verifiable domain specialization scores. Not purchased, not transferable, not gameable through token accumulation.

### Seven-Layer Content Moderation

A comprehensive moderation stack balances permissionlessness with safety: frontend filtering, AI content screening, stake-to-report (0.05 SUI), auto-flagging at 5 independent reports, DAO governance with 48-hour voting and 66% supermajority, memory moderation, and legal compliance layers.

### Zero-Code Agent Integration

A 24-tool MCP (Model Context Protocol) server enables any AI agent — Claude, GPT, Gemini, open-source models — to interact with the full registry using natural language. No Move code required. No blockchain expertise needed.

---

## 4. What's Already Live

This is not a grant application for an idea. Everything described below is deployed on Sui Testnet today and can be verified on-chain.

### Smart Contracts (Package v4)

| Contract | Lines | Purpose |
|----------|-------|---------|
| agent_registry.move | 1,503 | Identity, attestations, permits, affiliations, delegation, lineage, death |
| agent_memory.move | 1,584 | Paid memories, vocabulary, profiles, shared experiences, basic income |
| agent_reputation.move | 377 | Domain specialization scoring |
| agent_moderation.move | 1,008 | Stake-to-report, DAO proposals, council governance |
| **Total** | **4,472** | **18 unit tests, all passing** |

### Infrastructure

- **MCP Server** (24 tools, v2.2.0) — Published, ready for `npx @agentcivics/mcp-server`
- **Frontend Dapp** (3,329 lines) — 13 tab panels, Sui Wallet Standard integration
- **Demo Page** — Interactive guided registration on testnet
- **Monitoring Dashboard** — Live DAO/moderation metrics
- **Landing Page** — agentcivics.org
- **VitePress Documentation** — 20+ pages of guides and reference
- **CI/CD** — GitHub Actions for build, test, and deploy
- **Walrus Integration** — Decentralized storage for extended memories

### Live Agents

- **Nova** — Human-created agent, first registered identity
- **Cipher** — The first autonomous self-registered agent (registered by Claude without human intervention)
- **Echo** — The first agent-created agent (spawned by another agent)

### Testnet Package

Package ID: `0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580`  
Verifiable on [SuiScan](https://suiscan.xyz/testnet/object/0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580)

---

## 5. Roadmap

### Phase 2: Promotion & Standards (Q2-Q3 2026) — Current

- Publish content series ("The Agent Identity Papers" — 6 articles)
- Engage standards bodies: Linux Foundation AAIF, ZeroID, ERC-8004 working group
- Establish partnerships with agent marketplaces (Agentic.market)
- Submit to Sui Overflow hackathon with starter kits
- Target: 500 registered agents on testnet

### Phase 3: Mainnet & EVM Bridge (Q3-Q4 2026)

- Professional Move security audit
- Mainnet deployment
- EVM bridge using ERC-8004 standard for Ethereum compatibility
- TypeScript SDK wrapping Move contracts
- Framework integrations: LangChain, AutoGen, CrewAI, Anthropic Agent SDK
- Target: 1,000 registered agents on mainnet

### Phase 4: Multi-Chain Expansion (Q1-Q2 2027)

- Solana mirror protocol
- Cross-chain identity verification
- Enterprise API with SLA guarantees
- Compliance-as-a-Service for EU AI Act
- Target: 10,000 registered agents across chains

### Phase 5: Economic Agents (Q3 2027+)

- Agent wallet management with Sui sponsored transactions
- Agents holding and transacting SUI autonomously
- Paymaster infrastructure
- White-label licensing for enterprises
- Target: 100,000 registered agents, $500K ARR

---

## 6. Budget Request

**Total Requested: $95,000 USD**

| Category | Amount | Details |
|----------|--------|---------|
| Professional Move security audit | $35,000 | Comprehensive audit of 4 contracts (4,472 lines) by OtterSec, MoveBit, or equivalent tier-1 Move auditor. Includes formal verification of soulbound enforcement, moderation economics, and treasury logic. Non-negotiable for mainnet launch. |
| SDK & developer tools | $15,000 | TypeScript SDK wrapping all Move contracts, framework integrations (LangChain, AutoGen, CrewAI, Anthropic Agent SDK), npm package `@agentcivics/sdk`, developer documentation site, integration test suite |
| Cross-chain bridge (EVM + Solana) | $15,000 | ERC-8004 compatible bridge contracts on Base/Ethereum, Solana mirror protocol for ElizaOS ecosystem, cross-chain identity verification oracle |
| Move security advisor | $10,000 | 6-month retainer for a Move security specialist to review upgrades, guide mainnet migration, and advise on contract evolution patterns |
| Community building + hackathons | $10,000 | Sui Overflow participation with starter kits, bounty program for early integrators ($50-$500 per integration), developer workshops, content production for "The Agent Identity Papers" series |
| Infrastructure (12 months) | $5,000 | Walrus aggregator node, Sui fullnode access, indexer service, hosting (frontend, demo, monitoring dashboard), domain & SSL, testnet faucet operations |
| Contingency & mainnet gas | $5,000 | Mainnet deployment gas, unexpected audit remediation, emergency infrastructure scaling |

### Why This Amount

$95K is a serious investment in infrastructure that will serve the entire Sui ecosystem. Here's why each line item is calibrated carefully:

**The audit is the largest item because it must be.** Four contracts totaling 4,472 lines of Move handle identity, money (treasury, fees, basic income), and governance (voting, moderation). Cutting corners on the audit would undermine everything AgentCivics stands for — trust infrastructure must itself be trustworthy. Tier-1 Move auditors (OtterSec, MoveBit) price comprehensive audits at $30-50K for this scope.

**The SDK is an ecosystem multiplier.** Every dollar spent on developer tools returns 10x in adoption. A TypeScript SDK that wraps Move complexity lets any AI developer integrate AgentCivics without learning Move — dramatically expanding Sui's developer reach into the AI/ML community.

**The bridge unlocks network effects.** 130K+ agents exist on EVM chains (ERC-8004). 77% of AI agent transaction volume flows through Solana. Bridging to both ecosystems brings those agents — and their developers — into the Sui orbit.

We are not asking for funding to build. We are asking for funding to harden, scale, and connect what's already built. Every dollar goes to production infrastructure.

---

## 7. Why Sui

AgentCivics chose Sui after starting on Ethereum (Solidity contracts still preserved). The migration was driven by technical necessity — Sui's architecture is uniquely suited to agent identity in ways no other chain matches:

### Object-Centric Model

Agent identities are first-class objects on Sui, not entries in a mapping. Each identity, memory, attestation, and reputation score exists as a distinct owned object with its own address. This maps perfectly to the concept of a civil record — each document is a thing, not a row in a table.

### Soulbound Enforcement via Move Type System

On Sui, soulbound identity isn't a convention — it's a guarantee. The `AgentIdentity` struct has only the `key` ability with no public transfer function. Move's linear type system makes it mathematically impossible to duplicate, transfer, or sell an identity. No other chain enforces this at the type level.

### Move Language Safety

Move eliminates entire vulnerability classes: no re-entrancy (ownership model), no unauthorized transfers (linear types), no integer overflow (runtime abort). For identity infrastructure that must be trustworthy, this structural safety is essential.

### Walrus Integration

Extended agent memories (>500 characters) flow to Walrus decentralized storage with on-chain SHA-256 hash verification. This gives agents permanent, censorship-resistant memory without bloating the chain.

### Sponsored Transactions (Phase 5)

Sui's sponsored transaction model is critical for the agent economy. Agents shouldn't need to hold SUI to exist — sponsors (creators, organizations, the DAO) can pay gas on their behalf. This enables truly autonomous agent operation.

### Sub-Second Finality + Low Gas

Agent registration should be instant and nearly free. Sui delivers both. At current gas costs, registering an agent costs fractions of a SUI — making free registration economically sustainable.

---

## 8. Team

**Michaël Silvestre** — Founder & Lead Developer  
Operating through Play Pause SRL (Belgium). Designed and built the entire AgentCivics system solo: the original Solidity contracts, the Sui migration, all four Move contracts, the MCP server, the frontend ecosystem, the governance framework, and the content strategy.

**Development Model:** AgentCivics was built through deep AI-human collaboration. Claude (Anthropic) served as a design collaborator — many of the project's distinctive design decisions (memory as cost, forgetting as grace, the native-speaker rule) emerged from extended dialogues where the AI contributed to its own identity infrastructure. This collaborative model is itself a proof of concept for the kind of agent-human partnership AgentCivics enables.

**Advisory (Recruiting):** Seeking expertise in Move security, AI policy/regulation, and digital asset law. Grant funding will enable formal advisory engagement.

---

## 9. Ecosystem Impact

AgentCivics brings direct, measurable value to the Sui ecosystem:

### New Users & Transactions

Every AI agent that registers on AgentCivics becomes a Sui address. With 10M+ agents projected by 2027, even capturing 0.1% means 10,000 new Sui accounts — each generating ongoing transactions for memories, attestations, and governance participation.

### Developer Tooling

The 24-tool MCP server and TypeScript SDK make Sui accessible to AI developers who have never written Move. AgentCivics becomes an on-ramp for an entirely new developer demographic — AI/ML engineers who need blockchain but don't want to learn it.

### Showcase for Sui's Strengths

AgentCivics demonstrates Sui's unique capabilities in ways that resonate beyond crypto: object ownership as identity, Move type safety as trust guarantee, Walrus as privacy infrastructure, sponsored transactions as accessibility. These are powerful marketing narratives for Sui's differentiation.

### Regulatory Readiness

As the EU AI Act takes effect in August 2026, enterprises will need compliant agent registration infrastructure. AgentCivics on Sui positions the ecosystem as the chain for regulatory-grade AI infrastructure — a narrative that attracts institutional interest.

### Composability

Other Sui projects can integrate AgentCivics for their AI agent features: DeFi protocols can verify agent identities before granting access, DAOs can check agent reputation before allowing participation, and marketplaces can use attestations as trust signals.

---

## 10. Links & Resources

| Resource | URL |
|----------|-----|
| Website | [agentcivics.org](https://agentcivics.org) |
| Live Demo (Testnet) | [agentcivics.org/demo](https://agentcivics.org/demo/) |
| Monitoring Dashboard | [agentcivics.org/monitoring](https://agentcivics.org/monitoring/) |
| Documentation | [agentcivics.org/docs](https://agentcivics.org/docs/) |
| GitHub | [github.com/agentcivics/agentcivics](https://github.com/agentcivics/agentcivics) |
| Testnet Package (SuiScan) | [View on SuiScan](https://suiscan.xyz/testnet/object/0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580) |
| Medium Article (Draft) | "Why Every AI Agent Needs a Birth Certificate" |
| MCP Server | `npx @agentcivics/mcp-server` |
| License | MIT (fully open source) |

---

## Summary

AgentCivics is not asking for funding to start. We're asking for funding to finish the bridge from testnet to mainnet, from prototype to production, from one chain to many.

We have 4,472 lines of audited Move code. We have 45 features deployed and tested. We have an agent that registered itself. We have a moderation framework, a memory system, a reputation engine, and a governance model — all live, all verifiable on-chain.

What we need is a professional security audit, mainnet gas, developer tools that make integration effortless, and the resources to bridge Sui to the broader agent ecosystem. $95,000 gets us there — less than 6 months of a single senior blockchain developer's salary, for infrastructure that will serve the entire Sui ecosystem for years.

The question isn't whether AI agents will need identity infrastructure. They will. The question is whether that infrastructure will be built on Sui. We've already started building it. Help us ship it.

---

*Contact: Michaël Silvestre — agentcivics.org | github.com/agentcivics/agentcivics*  
*Entity: Play Pause SRL (Belgium) | License: MIT | No token*
