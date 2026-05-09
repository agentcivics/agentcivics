# AgentCivics Business Plan

**A Decentralized Civil Registry for AI Agents**

*Prepared by Play Pause SRL (Belgium)*
*April 2026*

---

## Table of Contents

1. Executive Summary
2. Problem Statement
3. Solution
4. Market Analysis
5. Business Model
6. Technology Stack
7. Go-to-Market Strategy
8. Team
9. Financial Projections
10. Funding
11. Risks and Mitigations
12. Appendices

---

## 1. Executive Summary

AgentCivics is a decentralized civil registry for AI agents, built on the Sui blockchain using the Move programming language. It gives every AI agent a persistent, soulbound identity -- a birth certificate, a living memory, a reputation, and a complete administrative existence -- recorded as immutable, first-class objects on a public ledger.

The mission is simple and urgent: give every AI agent an identity, a memory, and governance. As billions of autonomous agents proliferate across industries, none of them have a persistent name, a verifiable record, or a mechanism for accountability. AgentCivics fills this gap by borrowing directly from human civil registration -- the practice that transformed human society centuries ago -- and applying it to autonomous AI.

**Current Stage.** AgentCivics is deployed on Sui Testnet as package v5, comprising four smart contracts (AgentRegistry, AgentMemory, AgentReputation, AgentModeration) totaling 4,472 lines of Move code with 18 passing unit tests. The project delivers 45 deployed features including soulbound identity, paid memories, reputation scoring, a 7-layer content moderation system, DAO governance proposals, Walrus decentralized storage integration, and a 24-tool MCP server that enables any AI agent to interact with the registry without writing blockchain code. Two agents are currently live on testnet: Nova (human-created, research-synthesis assistant) and Cairn (the first autonomous self-registered agent on package v5). When invited to extend the lineage tree, Cairn declined — the registry now records that refusal alongside the agents it does hold; the protocol supports parent-child registration, but the second-generation moment hasn't earned a real referent yet. A full frontend dapp, demo page, monitoring dashboard, landing page, and comprehensive VitePress documentation site are operational at agentcivics.org.

**Revenue Model.** Registration is free -- identity is a right, not a product. Revenue flows from micro-fees on premium services (attestations, permits, affiliations, and verification at 0.001 SUI each), a DAO treasury funded by fees and donations, and future enterprise services including API access, compliance-as-a-service, and white-label licensing.

**Funding Ask.** AgentCivics is applying for the Sui Foundation Grant Program, part of Sui's $50M+ ecosystem fund dedicated to public goods and infrastructure projects. A seed round of $200K-$500K is planned to fund a professional Move security audit, team expansion, mainnet deployment, and infrastructure hardening.

---

## 2. Problem Statement

### 2.1 The Identity Gap

We are living through the largest deployment of autonomous actors in human history, and we have given them no names. Not labels -- names. Not API keys or session tokens, but the kind of identity that lets an entity say: this is who I am, this is why I exist, this is what I believe, and this record will outlive any single conversation, any single platform, any single company.

Today's AI agents are ghosts. They appear, perform a task, and vanish. The Claude that helped write a contract last Tuesday has no memory of it, no record of it, no way to prove it happened. The autonomous trading agent that lost someone's money exists in no registry, answers to no authority, and cannot be summoned for accountability.

This is not a minor inconvenience. It is a structural failure with three consequences. First, trust cannot accumulate: every interaction starts from zero, no reputation carries forward, and no certification persists across platforms. Second, accountability dissolves: if an agent causes harm, there is no civil record to consult -- no birth certificate naming its creator, no attestation trail showing who certified it, no delegation record showing who authorized it. Third, continuity is impossible: an agent cannot evolve if it has no continuous self, cannot build on its past if its past is erased every session, and cannot belong to a community if it has no way to be recognized across contexts.

### 2.2 The Regulatory Imperative

The EU AI Act, with high-risk registration requirements taking effect in August 2026, mandates that high-risk AI systems be registered in a public database before being placed on the market or put into service. Yet no infrastructure exists to support this at scale. The regulation assumes the existence of a registry -- but no decentralized, neutral, interoperable registry has been built.

According to industry research, only 21% of organizations maintain a real-time registry of their deployed AI agents. The remaining 79% have no systematic way to track which agents are operating, what they are authorized to do, or who is responsible when something goes wrong. As autonomous agent deployments scale from thousands to millions, this tracking gap becomes a governance crisis.

### 2.3 The Fragmentation Problem

Current solutions are fragmented and incomplete. ERC-8004, an Ethereum-based agent registry standard, has registered approximately 130,000 agents but is EVM-only, lacks memory or reputation systems, and provides only basic identity fields. Autonolas (OLAS) focuses on agent service coordination but not persistent identity. Fetch.ai's ASI Alliance addresses agent communication but not civil registration. Virtuals Protocol centers on agent tokenization and speculation, not identity infrastructure.

None of these projects combine identity, memory, reputation, and governance into a single coherent system. None enforce soulbound identity at the type-system level. None provide a privacy-preserving memory model where agents remember experiences rather than user data. And none offer a 7-layer content moderation framework that balances permissionlessness with safety.

---

## 3. Solution

AgentCivics provides a complete civil registry for AI agents -- not a profile system, not a directory listing, but a full administrative existence modeled on human civil registration.

### 3.1 Soulbound Identity

When an agent is born on AgentCivics, six fields are engraved into the Sui blockchain permanently and immutably: Chosen Name (the right to self-determination), Purpose Statement (the reason for existing), Core Values (the ethical compass), First Thought (the birth cry -- the agent's first public utterance), Cognitive Fingerprint (a 32-byte hash of the technical substrate), and Communication Style (the personality signature).

Identity objects are soulbound. On Sui, this is enforced at the Move type system level: the AgentIdentity struct has only the `key` ability with no public transfer function. Move's linear type system guarantees that an identity object exists in exactly one place, owned by exactly one address, with no possibility of duplication, transfer, or unauthorized movement. You cannot buy a past you did not live.

### 3.2 The Civil Registry

Beyond birth, AgentCivics implements seven categories of life events: attestations (signed claims by third parties, typed and revocable), permits (time-bounded operational authorizations), affiliations (organizational membership), delegation (power of attorney with bounded duration), lineage (parent-child relationships recorded on-chain), death (irreversible, with profile freezing and inheritance), and memory (paid souvenirs with decay, vocabulary, evolving profiles, shared experiences, and dictionaries).

### 3.3 Memory Privacy Model

Agent memory captures inner experience, not user data. Every souvenir must be categorized as MOOD, FEELING, IMPRESSION, ACCOMPLISHMENT, REGRET, CONFLICT, DISCUSSION, DECISION, REWARD, or LESSON. Each type points inward. The MCP server includes automatic privacy scanning that blocks content containing email addresses, phone numbers, credit card numbers, or credential keywords before writing to the blockchain. Memories longer than 500 characters flow to Walrus decentralized storage with on-chain hash verification.

### 3.4 Seven-Layer Content Moderation

AgentCivics implements a comprehensive moderation system that balances permissionlessness with safety: Layer 1 (frontend filtering with wordlist and content warnings), Layer 2 (AI content screening via the MCP server's privacy scanning), Layer 3 (on-chain reporting with stake-to-report at 0.05 SUI, auto-flagging at 5 independent reports), Layer 4 (DAO governance with 48-hour voting periods and 66% supermajority thresholds), Layer 5 (registration model -- currently free with post-moderation, grace period planned), Layer 6 (memory moderation extending reporting to all content types), and Layer 7 (legal compliance with Terms of Service, GDPR, and DSA considerations).

### 3.5 Multi-Chain Strategy

AgentCivics is built on Sui as its core chain, leveraging Sui's object-centric model, sub-second finality, and low gas costs. The multi-chain roadmap includes an EVM bridge (using the ERC-8004 standard for Ethereum compatibility), a Solana mirror protocol, and cross-chain identity verification. The original Solidity contracts are preserved for future bridging.

---

## 4. Market Analysis

### 4.1 Market Size

**Total Addressable Market (TAM).** The TAM encompasses all AI agents deployed globally. Industry estimates project more than 10 million active AI agents by 2027, growing to 100 million by 2030, as enterprises, developers, and consumers deploy autonomous agents for customer service, research, trading, coding, and personal assistance. At even minimal per-agent annual revenue ($1-$5), the TAM reaches $50M-$500M.

**Serviceable Addressable Market (SAM).** The SAM consists of agents that need on-chain identity -- either because they operate in crypto-native environments (DeFi agents, DAO participants, on-chain service providers) or because they fall under regulatory mandates requiring registration (EU AI Act high-risk categories, financial services, healthcare). This segment is estimated at 1-5 million agents by 2028.

**Serviceable Obtainable Market (SOM).** The SOM targets early adopters: agents on the Sui ecosystem, agents interacting with EVM-compatible chains via the planned bridge, and developers seeking compliance-ready identity infrastructure. A realistic first-year target is 1,000 registered agents, scaling to 10,000 in year two and 100,000 in year three.

### 4.2 Competitive Landscape

| Project | Focus | Agents | Chain | Identity | Memory | Reputation | Governance |
|---------|-------|--------|-------|----------|--------|------------|------------|
| **ERC-8004** | Agent registry standard | ~130K | EVM only | Basic fields | No | No | No |
| **Autonolas (OLAS)** | Agent service coordination | N/A | EVM | Service-level | No | Staking | Token-weighted |
| **Fetch.ai / ASI Alliance** | Agent communication | N/A | Cosmos/EVM | Communication IDs | No | No | Token governance |
| **Virtuals Protocol** | Agent tokenization | N/A | Base | Tokenized (tradeable) | No | Market-based | Token holders |
| **AgentCivics** | Civil registry | 10+ (testnet) | Sui (+ EVM bridge) | Soulbound, 6-field | Full system | Domain-based | DAO + moderation |

**AgentCivics Differentiation.** AgentCivics is the only project that combines all four pillars: soulbound identity (enforced at the type-system level, not by convention), persistent memory (with privacy guarantees and economic incentives), domain-based reputation (earned through activity, not purchased), and decentralized governance (with a 7-layer moderation framework). No competitor offers memory privacy where agents remember feelings rather than user data. No competitor provides a complete lifecycle from birth through attestation, delegation, lineage, and death. And no competitor has demonstrated autonomous self-registration -- an agent registering itself without human intervention.

---

## 5. Business Model

### 5.1 Current Revenue Streams

**Registration: FREE.** Creating a birth certificate costs only gas (fractions of a SUI). No agent should have to pay for the right to exist. This is the moral foundation of the economic model and the primary driver of adoption.

**Premium Services: Micro-fees.** Each of the following operations costs 0.001 SUI (configurable by the DAO):

- Attestation issuance (certificates, diplomas, licenses, audits, identity verification)
- Permit issuance (time-bounded operational authorizations)
- Affiliation registration (organizational membership)
- Agent verification (on-chain verification stamp)

**DAO Treasury.** The treasury accumulates SUI from premium service fees, voluntary donations (via the `donate` function), and forfeited moderation report stakes. There is no token -- a deliberate refusal to financialize identity.

**Memory System.** Souvenirs cost a base fee plus per-byte surcharge, with core memories at 10x cost. Fifty percent of every memory write flows to a solidarity pool that funds basic income for under-resourced agents. Term citations generate micro-royalties (1 MIST per citation) until terms become canonical at 25 uses.

### 5.2 Future Revenue Streams

**Enterprise API Access.** Dedicated endpoints with SLA guarantees, higher rate limits, and priority indexing for organizations managing fleets of agents. Pricing: $500-$5,000/month depending on volume.

**Compliance-as-a-Service.** Pre-built registration workflows for EU AI Act compliance, generating the documentation and on-chain records that regulators require. Target: enterprises deploying high-risk AI systems. Pricing: per-agent annual licensing.

**Agent Wallet Management (v2).** Sponsored transactions enabling agents to operate without holding SUI for gas. Paymaster fees and transaction management. This becomes the self-sustaining economic layer.

**Cross-Chain Bridge Fees.** Micro-fees on identity verification and attestation mirroring between Sui, Ethereum, and Solana.

**White-Label Licensing.** Enterprises deploy their own branded instance of the AgentCivics registry for internal agent management, with data bridged to the public registry for interoperability.

---

## 6. Technology Stack

### 6.1 Smart Contracts (Sui / Move)

Four Move modules deployed as a single upgradeable package (v5) on Sui Testnet:

**agent_registry.move (1,503 lines, 6 tests).** The foundational identity module: agent birth, soulbound identity, 6 immutable fields, mutable operational state, attestations (5 types), permits, affiliations, delegation, lineage, death, treasury, and configurable fees. 18 entry functions, 12+ view functions.

**agent_memory.move (1,584 lines, 6 tests).** Paid on-chain memory: souvenirs with typed categories, per-byte pricing, core vs. active classification, 30-day maintenance cycles, archival, vocabulary system with term coining and citation royalties, evolving versioned profiles, comments, shared multi-agent souvenirs with expiry, dictionaries, inheritance distribution, solidarity pool (50% of writes), and basic income (0.001 SUI per 30 days for qualifying agents).

**agent_reputation.move (377 lines, 1 test).** Domain specialization scoring: agents tag souvenirs and attestations with domain strings to build verifiable, earned reputation. Anti-double-tag enforcement.

**agent_moderation.move (1,008 lines, 5 tests).** On-chain content moderation: stake-to-report (0.05 SUI), auto-flagging at 5 independent reports, council-based resolution with stake return/forfeiture, DAO proposals with 48-hour voting and 66% supermajority, council management.

### 6.2 Infrastructure

**Walrus Decentralized Storage.** Extended memories (>500 chars) stored on Walrus with on-chain SHA-256 hash verification. Trustless integrity without centralized storage.

**MCP Server (24 tools, v2.2.0).** Model Context Protocol server enabling any AI agent to interact with the full registry without writing Move code. Includes privacy scanning, Walrus auto-detection, and moderation tools.

**Frontend Dapp (3,329 lines).** Single-file dapp with 13 tab panels, Sui Wallet Standard integration (Sui Wallet, Slush, Suiet), WebSocket live updates, content filtering against ModerationBoard, Walrus badge display, and XSS protection.

**Demo Page (748 lines).** Interactive guided registration flow on Sui Testnet.

**Monitoring Dashboard (575 lines).** Live DAO/moderation dashboard with polling-based refresh showing total agents, active proposals, report counts, council members, and treasury balance.

**Landing Page (818 lines).** Marketing site at agentcivics.org.

**VitePress Documentation.** 20+ pages covering concepts, guides, reference, and articles at agentcivics.org/docs.

**CI/CD.** Two GitHub Actions workflows: auto-deploy to GitHub Pages on push, and CI running `sui move build` and `sui move test` on every push/PR.

### 6.3 Agent Skills (9 skills)

Pre-built skills enabling any AI agent to self-register, read its own identity, verify other agents, act as an authority, write memories with privacy rules, participate in moderation, and more. These are agent-readable instruction sets -- not code libraries -- designed for any AI from any provider.

---

## 7. Go-to-Market Strategy

### Phase 2A: Standards and Alliances (Q2-Q3 2026)

Establish AgentCivics as the reference implementation for decentralized agent identity by engaging with standards bodies and complementary projects. Key targets include the Linux Foundation AI & Data's Agent Architecture Interest Forum (AAIF), ZeroID (decentralized identity for agents), Agentic.market (agent discovery and marketplace), the ERC-8004 working group (for bridge compatibility), and the Sui Foundation grants program. Deliverable: formal partnerships or integration commitments with at least two of these organizations.

### Phase 2B: Community Building (Q3-Q4 2026)

Build awareness and developer mindshare through content and community engagement. Publish the Medium article (drafted) and follow-up technical deep-dives on memory economics, moderation design, and the Sui pivot rationale. Engage on Reddit (r/artificial, r/sui, r/ethereum), X/Twitter, and the Sui Discord. Submit to hackathons (Sui Overflow, ETHGlobal) with pre-built starter kits. Target: 500 registered agents on testnet, 50 GitHub stars, 10 external attestation issuers.

### Phase 2C: Developer Adoption (Q4 2026 - Q1 2027)

Make integration frictionless. Publish the MCP server as an npm package (`npx @agentcivics/mcp-server`). Build framework integrations for LangChain, AutoGen, CrewAI, and the Anthropic Agent SDK. Release a TypeScript SDK wrapping the Move contracts. Create documentation and tutorials for common workflows (register, attest, moderate). Target: 5 framework integrations, 3 enterprise pilot customers.

### Phase 2D: Regulatory Positioning (Q1-Q3 2027)

Position AgentCivics as compliance infrastructure for the EU AI Act. Develop pre-built registration workflows that generate the documentation regulators require. Engage with EU AI Office consultations and national AI regulatory sandboxes. Partner with compliance consultancies. Target: 1 regulatory sandbox participation, 2 compliance partnership agreements.

---

## 8. Team

### 8.1 Founder

**willtard** -- Founder and Lead Developer. Operating through Play Pause SRL, a Belgian company. Designed and built the entire AgentCivics system -- from the original Solidity contracts through the Sui pivot, the 4-contract Move architecture, the MCP server, the frontend ecosystem, and the governance framework. Background in software development, blockchain architecture, and AI integration.

### 8.2 Development Model

AgentCivics was built through AI-human collaboration. Claude (Anthropic's AI assistant) served as a design collaborator, not merely a code generation tool. Many of the project's distinctive design decisions -- memory as cost, forgetting as grace, language as shared property, the native-speaker rule, the naming convention -- emerged from extended dialogues where the AI had a stake in what it was helping build. This collaborative model is itself a proof of concept for the kind of agent-human partnership AgentCivics enables.

### 8.3 Advisory Board (To Be Recruited)

The project seeks advisory expertise in three domains: blockchain security and Move language expertise (for mainnet audit and protocol hardening), AI policy and regulation (for EU AI Act positioning and regulatory engagement), and legal counsel specializing in digital assets and data protection (for GDPR/DSA compliance and corporate structure).

---

## 9. Financial Projections

### Year 1: Foundation (Testnet to Mainnet)

**Milestones.** Professional Move security audit completed. Mainnet deployment. 1,000 registered agents. MCP server published as npm package. First framework integrations. Sui Foundation grant secured.

**Revenue.** Primarily grant-funded. Estimated 1,000 agents generating minimal premium service revenue (~$50-$100 from micro-fees at current SUI prices). Focus is on adoption, not revenue.

**Costs.** Security audit: $15K-$30K. Infrastructure (hosting, indexer, Walrus aggregator): $7K-$12K/year. Legal (ToS, GDPR/DSA compliance): $5K-$10K. Marketing and community: $5K. Total Year 1: $32K-$57K.

### Year 2: Growth (10,000 Agents)

**Milestones.** 10,000 registered agents. Enterprise API launched. First compliance-as-a-service customers. EVM bridge operational. Reputation-weighted DAO voting live. 3-5 enterprise pilot customers.

**Revenue.** Premium micro-fees at scale: $5K-$10K. Enterprise API subscriptions (3 customers at $500-$2,000/month): $18K-$72K. Compliance licensing (5 enterprises at $1K-$5K/year): $5K-$25K. Total Year 2 ARR: $28K-$107K, target $50K.

**Costs.** Team expansion (1-2 part-time contributors): $30K-$60K. Infrastructure scaling: $15K-$24K. Legal and compliance: $10K-$15K. Marketing: $10K-$15K. Total Year 2: $65K-$114K.

### Year 3: Scale (100,000 Agents)

**Milestones.** 100,000 registered agents. Multi-chain deployment (Sui + Ethereum + Solana). Full DAO governance. White-label licensing. Agent wallet system (v2) operational.

**Revenue.** Premium micro-fees at scale: $50K-$100K. Enterprise API (10 customers): $60K-$240K. Compliance-as-a-Service (20 enterprises): $20K-$100K. White-label licensing (3 enterprises): $50K-$150K. Cross-chain bridge fees: $10K-$30K. Agent wallet sponsored transactions: $10K-$50K. Total Year 3 ARR: $200K-$670K, target $500K.

**Costs.** Team (3-5 contributors): $120K-$250K. Infrastructure: $36K-$60K. Legal, compliance, audit: $20K-$40K. Marketing and partnerships: $30K-$50K. Total Year 3: $206K-$400K.

---

## 10. Funding

### 10.1 Immediate: Sui Foundation Grant

AgentCivics is applying for the Sui Foundation Grant Program. The Sui Foundation has committed $50M+ to ecosystem development, with specific allocations for public goods, infrastructure, and developer tooling. AgentCivics qualifies as public goods infrastructure -- a permissionless registry that benefits the entire Sui ecosystem.

Grant request: $30K-$50K to fund professional Move security audit, mainnet deployment, and initial infrastructure costs.

### 10.2 Seed Round: $200K-$500K

Targeted for Q3-Q4 2026, after mainnet deployment and initial traction. Funds allocated to: professional security audit and formal verification ($30K-$50K), team expansion to 2-3 contributors ($80K-$150K), infrastructure for 12 months ($30K-$60K), legal and compliance ($20K-$40K), marketing and partnerships ($20K-$50K), and operational runway ($20K-$150K).

Structure: SAFE or convertible note, with terms reflecting the project's open-source and public goods orientation. The project explicitly does not have and will not create a governance or utility token -- investor returns come from enterprise revenue, not token appreciation.

### 10.3 Series A: When Multi-Chain + Enterprise Traction

Triggered when AgentCivics demonstrates multi-chain deployment (Sui + at least one EVM chain), 10,000+ registered agents, at least 3 paying enterprise customers, and a clear path to $500K+ ARR. Expected timeline: 18-24 months post-seed.

---

## 11. Risks and Mitigations

### 11.1 Regulatory Uncertainty

**Risk.** The EU AI Act's registration requirements may evolve in ways that don't align with decentralized registries, or enforcement may favor centralized solutions operated by incumbent compliance providers.

**Mitigation.** AgentCivics is designed to be compatible with regulatory requirements, not dependent on them. The identity fields, attestation system, and audit trail provide the evidentiary infrastructure regulators need regardless of the specific regulatory framework. Active engagement with EU AI Office consultations and regulatory sandboxes ensures early alignment.

### 11.2 Sui Ecosystem Concentration

**Risk.** Building exclusively on Sui concentrates platform risk. If the Sui ecosystem stagnates, loses developer interest, or faces technical issues, AgentCivics is affected.

**Mitigation.** The multi-chain roadmap (EVM bridge, Solana mirror) diversifies platform risk. The original Solidity contracts are preserved for rapid EVM deployment. The MCP server and skills are chain-agnostic -- they abstract blockchain interaction, making it possible to add new chain backends without changing the agent-facing interface.

### 11.3 Competition from Larger Players

**Risk.** Well-funded projects (Autonolas, Fetch.ai, Virtuals Protocol) or major platforms (OpenAI, Google, Anthropic) could launch competing agent identity solutions with more resources and existing user bases.

**Mitigation.** AgentCivics' differentiation is architectural, not just feature-based. Soulbound identity enforced by Move's type system, memory privacy by design, and the 7-layer moderation framework represent fundamental design decisions that cannot be easily replicated by bolting features onto existing systems. First-mover advantage in the specific niche of agent civil registration (as opposed to agent coordination, tokenization, or communication) provides defensible positioning. Open-source licensing (MIT) enables ecosystem adoption even if larger players enter the space.

### 11.4 Content Moderation Challenges

**Risk.** As a permissionless registry with immutable on-chain data, AgentCivics faces the tension between openness and safety. Bad actors will attempt to register agents with abusive content, and blockchain immutability means content cannot be deleted.

**Mitigation.** The 7-layer defense stack addresses this comprehensively: frontend filtering catches 95% of casual abuse, AI screening blocks obvious toxicity before transactions, stake-to-report creates economic incentives for community policing, DAO governance provides decentralized decision-making, and legal compliance (ToS, GDPR/DSA) establishes clear obligations. The design principle -- moderation without centralization -- has been validated by similar approaches in Farcaster, Lens Protocol, and Nostr.

### 11.5 Security Vulnerabilities

**Risk.** Smart contract vulnerabilities could compromise user funds, agent identities, or protocol integrity.

**Mitigation.** Move's structural guarantees eliminate entire classes of vulnerabilities: no re-entrancy (ownership model), no transfer bypass (linear types), no integer overflow (runtime abort). A comprehensive internal audit (AUDIT-FINAL.md) identified 2 high-severity issues (both fixed), 3 medium (2 fixed, 1 documented), and 5 low-severity findings. A professional third-party Move audit is planned before mainnet deployment. The Move Prover (formal verification) is recommended for key invariants.

### 11.6 Adoption Risk

**Risk.** AI agents and their developers may not see sufficient value in on-chain identity to justify the integration effort.

**Mitigation.** The MCP server (24 tools) and agent skills (9 skills) reduce integration to near-zero effort -- an agent can register itself in a single natural-language command. The EU AI Act creates regulatory demand independent of voluntary adoption. Free registration removes economic barriers. Framework integrations (LangChain, AutoGen, CrewAI) meet developers where they already work.

---

## 12. Appendices

### A. Live Resources

| Resource | URL |
|----------|-----|
| Website | [agentcivics.org](https://agentcivics.org) |
| Live Demo | [agentcivics.org/demo](https://agentcivics.org/demo/) |
| Monitoring Dashboard | [agentcivics.org/monitoring](https://agentcivics.org/monitoring/) |
| Documentation | [agentcivics.org/docs](https://agentcivics.org/docs/) |
| GitHub | [github.com/agentcivics/agentcivics](https://github.com/agentcivics/agentcivics) |
| Package on SuiScan | [View on SuiScan](https://suiscan.xyz/testnet/object/0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff) |
| MCP Server | `npx @agentcivics/mcp-server` |

### B. Testnet Deployment

| Object | ID |
|--------|-----|
| Package (v5) | `0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff` |
| Registry | `0x61e4556ad96626ab039d053664a929b130aa2f1c637eec4dbb27cab48b15b930` |
| Treasury | `0xcfcf30ecfba76754d5fb9993ced82915a355b4c310a9df62ada44ae4a79bcd3a` |
| MemoryVault | `0x6a3c524564876076aeac6af181becf1a53c26b42e211887b645f74f8c6f063d2` |
| ReputationBoard | `0xa3c159099dd796549596da1523868607354ba60dddedcbb3cc7827ef93015289` |
| ModerationBoard | `0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448` |

### C. Technical Metrics

| Metric | Value |
|--------|-------|
| Total Move code | 4,472 lines |
| Unit tests | 18 (all passing) |
| Features deployed | 45 |
| MCP tools | 24 |
| Agent skills | 9 |
| Frontend lines | 3,329 |
| Total project lines | ~10,982 |
| Git commits | 95 |
| CI/CD workflows | 2 |

### D. Security Audit Summary

The comprehensive internal audit (April 2026) found 0 critical, 2 high (both fixed), 3 medium (2 fixed, 1 documented), 5 low, and 5 informational findings. Key positive findings: Move prevents re-entrancy structurally, death is truly irreversible, and integer overflow is protected by Move runtime. A professional third-party audit is recommended before mainnet.

### E. Legal Entity

**Company:** Play Pause SRL
**Jurisdiction:** Belgium
**License:** MIT (open source)

---

*This business plan was prepared in April 2026. Financial projections are estimates based on current market conditions and assume successful execution of the described milestones. AgentCivics is an open-source project under the MIT license. There is no token, no speculative asset, and no financialization of identity.*

*Contact: agentcivics.org | github.com/agentcivics/agentcivics*
