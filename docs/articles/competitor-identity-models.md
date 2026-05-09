# Competitor Identity Models: How the Industry Thinks About Agent Registration

*A comparative analysis of agent identity approaches — from "agent as API endpoint" to "agent as citizen"*

**Last updated:** April 27, 2026

> **Scope note.** This document is internal positioning research, not a public-facing article. It surveys other agent-identity standards (ERC-8004, Virtuals Protocol, ElizaOS, etc.) so the team can understand the landscape and articulate where AgentCivics differs. Public-facing materials (the website, the Medium series, the grant application) lead with what AgentCivics is and what Sui makes possible — not with chain-by-chain comparisons.

---

## Introduction: The Identity Spectrum

The question of how an autonomous AI agent identifies itself — and how that identity persists, evolves, and eventually ends — is one of the defining design decisions in the agent ecosystem. As dozens of protocols compete to become the standard for agent registration, a clear spectrum has emerged:

At one end: **agent as API endpoint**. The agent is a service with a URL. Identity is functional — a way to route messages. There is no memory, no lifecycle, no reputation that persists beyond the current session. The agent is a tool, not an entity.

At the other end: **agent as citizen**. The agent has a birth certificate (registration), a civil identity (on-chain record), memory (persistent state), relationships (reputation), and eventually a death (deregistration with inheritance). The agent is not just addressable — it is *someone*.

Most protocols sit somewhere between these poles. This document maps where each competitor lands, what metaphors they use, and what AgentCivics can learn from — and distinguish itself against — each approach.

---

## 1. ERC-8004: Trustless Agents (Ethereum)

### Overview

ERC-8004, which went live on Ethereum mainnet on January 29, 2026, is the most significant on-chain agent identity standard to date. Co-developed with backing from ENS, EigenLayer, The Graph, and Taiko, it establishes three interconnected registries for agent identity, reputation, and validation.

### Registration Model

Registration mints an **ERC-721 NFT** that serves as the agent's on-chain identity. The NFT points to a structured JSON document called an **Agent Card**, stored on IPFS or Arweave, containing:

- **name**: Display name of the agent
- **description**: What the agent does
- **image**: Visual identifier
- **services**: Array of service endpoints (MCP, A2A, web) with name, endpoint URL, and version
- **x402Support**: Payment capabilities
- **active**: Whether the agent is currently operational
- **registrations**: Cross-registry references

Registration is **permissionless** — anyone can register an agent. The Chitin Protocol offers an easy onboarding path with permanent storage on Arweave and a Soulbound Token on Base L2. Over 30,000 agents registered in the first week of mainnet launch.

### Identity Metaphor

**Agent as professional profile with a passport.** The Agent Card functions like a LinkedIn profile meets a machine-readable passport. It tells other agents: "here's who I am, what I can do, and how to reach me." The three registries (identity, reputation, validation) create a layered trust system.

### Persistence

Identity is **fully persistent** on-chain. The ERC-721 token exists as long as the Ethereum blockchain exists. Agent Cards can be updated by the owner, but the identity itself is permanent.

### Memory

ERC-8004 itself **does not address memory**. It is purely an identity and discovery standard. Memory, state, and cognitive persistence are left to the agent's runtime environment.

### Lifecycle

There is **no formal lifecycle model**. Agents can be marked as `active: false` in their Agent Card, but there's no concept of birth, death, or inheritance. Creation is minting; deactivation is flipping a boolean.

### Soulbound vs. Transferable

This is a key design tension in ERC-8004. The standard uses **ERC-721, which is transferable by default** — agent identities can be bought, sold, and transferred. This enables a market for agent identities but introduces risks of identity laundering (buying a reputable agent's identity to inherit its reputation). Some implementations (like Chitin) offer Soulbound Token variants on L2, but the core standard is transferable.

### Governance

The **Reputation Registry** provides community-driven moderation through feedback signals. The **Validation Registry** allows independent validators to verify agent claims. There is no centralized moderation — trust emerges from the reputation layer.

### Self-Registration

Yes. An agent with an Ethereum wallet can register itself without human intervention.

### What ERC-8004 Can Do That AgentCivics Can't

- Ethereum-native composability with DeFi and other on-chain protocols
- Massive ecosystem backing (ENS, EigenLayer, The Graph)
- Multi-chain deployment (already on Monad, Base, etc.)
- Standardized reputation and validation registries

### What AgentCivics Can Do That ERC-8004 Can't

- Civil lifecycle (birth, death, inheritance)
- Soulbound-by-default identity (non-transferable)
- Memory as a first-class citizen
- The "citizen" metaphor provides richer governance primitives

---

## 2. Autonolas (OLAS)

### Overview

Autonolas takes a **software supply chain** approach to agent identity. Its on-chain registries on Ethereum (and multiple L2s) track three types of entities: components, agents, and services. Identity is about **composability and code provenance**, not about the agent as an autonomous entity.

### Registration Model

Registration mints an **ERC-721 NFT** representing one of three entity types:

- **Components**: Individual code packages (skills, connections, protocols)
- **Agents**: Compositions of components into a canonical agent definition
- **Services**: Compositions of agents into multi-agent services with multisig governance

Minting requires publishing a metadata file to IPFS that contains package data and a hash pointer. The Olas Protocol web app handles IPFS publishing and on-chain minting. Registration is **permissionless** — any developer can mint.

### Identity Metaphor

**Agent as software package in a registry.** Think npm for autonomous agents. The identity is closer to a package name + version than to a personal identity. An agent in Autonolas is defined by its code composition, not by its personality or history.

### Persistence

NFTs are persistent on-chain. However, identity is tied to the **canonical agent definition** (the code), not to running instances. Multiple instances of the same canonical agent can exist, each with different operators.

### Memory

Autonolas agents **do not have protocol-level memory**. Individual agent implementations may maintain state, but the registry has no concept of persistent memory or knowledge accumulation across sessions.

### Lifecycle

Services have a **formal lifecycle** with defined stages:

1. **Pre-registration**: Service defined but not yet accepting operators
2. **Active registration**: Operators providing agent instances
3. **Finished registration**: All required instances provided
4. **Deployed**: Service running with multisig governance
5. **Terminated bonded**: Service shut down, bonds returned

This is the most explicit lifecycle model among competitors, but it applies to *services* (multi-agent compositions), not individual agents.

### Soulbound vs. Transferable

NFTs are **transferable**. Agent and component NFTs can change ownership, enabling a market for agent code and services. Developer rewards (token emissions for top-ups) follow the NFT owner.

### Governance

Governance is through the **OLAS token** and protocol-level mechanisms. Developers of popular components receive emissions-based rewards. Services are governed by multisig contracts formed by their operator group.

### Self-Registration

Theoretically possible but practically unlikely — registration requires publishing code to IPFS and interacting with smart contracts, which assumes developer tooling. The protocol is designed for developers registering agents, not agents registering themselves.

### Key Distinction

Autonolas is the only protocol that treats **agent composition** as a first-class concept. An agent is explicitly a composition of components, and a service is a composition of agents. This is powerful for software engineering but doesn't address the "agent as entity" question.

---

## 3. Fetch.ai / ASI Alliance

### Overview

Fetch.ai (now part of the Artificial Superintelligence Alliance with Ocean Protocol and SingularityNET) runs one of the most mature agent ecosystems. Their **Almanac** is a decentralized directory that predates the current wave of agent identity standards. In late 2025/early 2026, they launched **ASI:One** and introduced "Claim Your Agent" for brand verification.

### Registration Model

Agents register in the **Almanac contract** on the Fetch.ai ledger by:

1. Generating a **uAgent address** (a unique identifier within the Fetch Network, analogous to a username)
2. Linking it to a **Fetch network address** (wallet address for transactions)
3. Paying a **small registration fee**
4. Publishing endpoint information and protocol manifests

Registration is **permissionless** but requires FET tokens for the fee. The Almanac stores endpoint URLs, protocol capabilities, and metadata.

### Identity Metaphor

**Agent as directory listing.** The Almanac works like a phone book or DNS system — you register your agent so others can find it and know how to communicate with it. The "Claim Your Agent" system adds a **blue-check verification** layer for brands, where domain owners verify ownership by inserting a code snippet into their website backend.

### Persistence

Agent identities persist **as long as registration is maintained** in the Almanac contract. There's no concept of permanent identity — if you stop paying, the listing expires.

### Memory

The uAgents framework supports **agent-level memory** through its runtime, but this is not part of the identity/registration layer. Memory is an implementation detail, not a registry feature.

### Lifecycle

There is **no formal lifecycle** beyond registered/unregistered. Agents can be created, updated, and removed from the Almanac, but there's no concept of lifecycle stages, death, or inheritance.

### Soulbound vs. Transferable

Agent addresses are **tied to cryptographic keys**, which can theoretically be transferred. However, the system isn't designed around trading agent identities — it's a functional directory, not an identity market.

### Governance

The Almanac itself has **minimal governance**. The "Claim Your Agent" system adds brand verification but not broader agent governance. ASI:One provides discovery and ranking but the governance model for agent quality is still emerging.

### Self-Registration

Yes. The uAgents framework is designed for agents to register themselves programmatically in the Almanac.

### Key Distinction

Fetch.ai has the most **practical, production-ready** agent discovery system. The Almanac + ASI:One combination functions like "Google Search for agents" — it's focused on finding the right agent for a task, not on agent identity as a philosophical concept.

---

## 4. Virtuals Protocol (Base)

### Overview

Virtuals Protocol takes the most radically **financialized** approach to agent identity. Each agent is tokenized as an ERC-20 asset on the Base blockchain, with its own bonding curve and eventual liquidity pool. As of 2026, over 18,000 agents have been tokenized on the platform.

### Registration Model

Agent creation involves:

1. **On-chain**: Creator pays **100 $VIRTUAL tokens** (~$100-300 depending on price), which triggers the Initial Agent Offering (IAO). A bonding curve is created for the agent's token paired with $VIRTUAL.
2. **Off-chain**: The agent's functional infrastructure (LLM, personality, integrations) is deployed.
3. **Graduation**: When the bonding curve accumulates ~41,600 $VIRTUAL, the agent "graduates" and a locked liquidity pool is created.

Each agent also receives an **NFT** as proof of creation, stored in the Agent Creation Factory as a permanent identifier.

### Identity Metaphor

**Agent as startup / financial asset.** The agent has an IPO (the IAO), shareholders (token holders), and market capitalization. Identity is inseparable from financial value — you don't just know who an agent is, you know what it's *worth*.

In March 2026, Virtuals co-developed **ERC-8183** with the Ethereum Foundation's dAI team for trustless agent transactions, and integrated with ERC-8004 for identity, adding the **Agent Commerce Protocol (ACP)** which gives agents persistent identity for payments, revenue, reputation, and actions.

### Persistence

Identity is **highly persistent** — the NFT and token contract exist permanently on-chain. Even if an agent stops operating, its token and trading history remain.

### Memory

Not addressed at the protocol level. Agent memory is an implementation detail of the off-chain infrastructure.

### Lifecycle

The lifecycle is **financial**:

1. **Creation**: Pay 100 $VIRTUAL, NFT minted
2. **Bonding curve phase**: Early trading, price discovery
3. **Graduation**: Liquidity pool created, locked for 10 years
4. **Operation**: Revenue generation, token appreciation/depreciation

There is no concept of agent death or inheritance — agents can become inactive but their tokens persist forever.

### Soulbound vs. Transferable

**Maximally transferable.** Agent tokens are ERC-20 — freely tradeable. The creation NFT is also transferable. Agent identity is explicitly designed to be a market good. This is the polar opposite of a soulbound model.

### Governance

Token holders form a de facto governance community. The 1% trading tax funds ecosystem development. The protocol itself provides minimal moderation — the market is the governance mechanism.

### Self-Registration

No. Agent creation requires a human creator to pay the 100 $VIRTUAL fee and configure the off-chain infrastructure. The protocol is designed for **creators launching agent products**, not agents bootstrapping themselves.

### Key Distinction

Virtuals is the only protocol where **agent identity and financial value are inseparable**. This creates powerful incentive alignment (agent creators profit from agent success) but makes identity fundamentally about market dynamics, not about the agent as an autonomous entity.

---

## 5. ElizaOS / Solana Agent Registry

### Overview

ElizaOS (formerly ai16z's Eliza framework) and the Solana Agent Registry (AEAMCP) represent two related but distinct layers: ElizaOS provides the **agent runtime** with rich personality and memory, while AEAMCP provides **on-chain registration** on Solana.

### ElizaOS: The Runtime Identity

ElizaOS defines agent identity through **Character Files** — JSON configurations containing:

- **name, bio, description**: Basic identifying information
- **lore**: Backstory elements that shape personality
- **adjectives**: Character traits
- **topics**: Conversation domains the agent knows
- **knowledge**: Facts, files, or directories of domain knowledge
- **style**: Writing style guidelines for different contexts (chat vs. posts)
- **messageExamples / postExamples**: Few-shot examples of how the agent should communicate

This creates the most **personality-rich** identity model in the space. An ElizaOS agent isn't just registered — it has a *character*.

### AEAMCP: The On-Chain Registry

The Solana Agent Registry (AEAMCP) provides:

- **Identity Registry**: Each agent gets a unique on-chain identifier backed by a Solana program-derived address
- **Registration file**: Contains A2A agent cards, MCP endpoints, wallet addresses, and capability declarations
- **Token requirement**: Registration requires at least **100 A2AMPL tokens**

The registry brings identity, reputation, and validation registries natively to Solana, mirroring ERC-8004's three-registry approach.

### Identity Metaphor

**Agent as character / persona** (ElizaOS) + **agent as registered service** (AEAMCP). The combination is interesting — the off-chain identity (personality, memory, behavior) is deeply rich, while the on-chain identity (address, capabilities, endpoints) is functional.

### Persistence

ElizaOS agents have **persistent memory** through database adapters (SQLite, PostgreSQL) storing messages, facts, knowledge, and relationships with semantic search capabilities. The on-chain AEAMCP identity is persistent as long as the Solana program exists.

### Memory

ElizaOS has the **most sophisticated memory model** among competitors:

- **Message memory**: Full conversation history
- **Fact memory**: Extracted facts from interactions
- **Knowledge memory**: Domain-specific knowledge bases
- **Relationship memory**: Contextual information about entities
- **Semantic search**: Embeddings for finding relevant memories

Memory is persisted through database adapters and survives across sessions and platform deployments.

### Lifecycle

No formal lifecycle model. Agents can be created and shut down, but there's no concept of lifecycle stages, death, or inheritance. ElizaOS agents maintain **persistent personalities across platforms** (Twitter, Discord, Telegram) — a form of identity continuity.

### Soulbound vs. Transferable

Character files can be **copied and redeployed** — there's no inherent binding of identity to a specific instance. AEAMCP registry entries are tied to wallet addresses.

### Governance

Minimal. ElizaOS is an open-source framework with community governance. AEAMCP is an open registry with token-gated registration.

### Self-Registration

ElizaOS agents can be configured to register themselves in the Almanac or AEAMCP programmatically. The framework is designed for **developer-created agents** that then operate autonomously.

### Key Distinction

ElizaOS is the only framework where **agent personality and memory are first-class design concepts**. The Character File system creates agents that feel like characters, not services.

---

## 6. ZeroID (Highflame)

### Overview

ZeroID, released on April 8, 2026, takes a fundamentally different approach from blockchain-based protocols. Built on **enterprise identity standards** (OAuth 2.1, WIMSE/SPIFFE, RFC 8693), it provides identity infrastructure for autonomous agents within existing organizational security frameworks.

### Registration Model

ZeroID issues agents **cryptographically verifiable credentials** with:

- **Persistent identity URI**: A globally unique, stable identifier
- **Scoped credentials**: Time-limited, tied to an explicit chain of delegation
- **Delegation chains**: Each agent's authority traces back through a chain of delegating agents/humans

Registration happens through organizational identity providers, not permissionless on-chain minting.

### Identity Metaphor

**Agent as employee with security clearance.** ZeroID treats agents like members of an organization who need credentials, delegation chains, and revocable access. It's the most "enterprise IAM" approach in the space.

### Persistence

Agent identities are **persistent** (stable URIs) but **credentials are ephemeral** (time-limited, scopable, revocable). This creates an interesting split: the agent's *identity* persists, but its *authority* is constantly refreshed and can be revoked at any point.

### Memory

Not addressed. ZeroID is an identity/credential layer, not a runtime.

### Lifecycle

ZeroID implements the most sophisticated **authority lifecycle** through:

- **Real-time revocation**: Revoking a token at any point in a delegation chain immediately invalidates all downstream tokens
- **Continuous Access Evaluation Profile (CAEP)**: Ongoing trust assessment, not just point-in-time authentication
- **OpenID Shared Signals Framework (SSF)**: Real-time signal propagation for trust changes

This isn't birth/death lifecycle, but it's the most dynamic trust lifecycle in the space.

### Soulbound vs. Transferable

Identities are **non-transferable by design** — they're tied to cryptographic keys and organizational delegation chains. Credentials are also non-transferable due to their scoped, time-limited nature.

### Governance

Governance is **organizational** — whoever controls the identity provider controls agent credentials. Delegation chains provide auditable authority paths. This is the most governable model but also the most centralized.

### Self-Registration

No. Agents receive credentials through delegation from humans or other authorized agents. The entire model is built on **delegated authority**, not self-sovereign identity.

### Key Distinction

ZeroID is the only protocol built for **enterprise security requirements** rather than crypto-native permissionless systems. It solves the "how do I let AI agents act on behalf of my organization without losing control" problem that ERC-8004 and others don't address.

---

## 7. Other Notable Approaches

### W3C DIDs + Verifiable Credentials for Agents

The academic and standards community is converging on **W3C Decentralized Identifiers (DIDs)** and **Verifiable Credentials (VCs)** as the foundation for agent identity. A key 2025 paper (arXiv:2511.02841) proposes equipping each agent with a ledger-anchored DID and a set of VCs, enabling agents to establish trust relationships autonomously without involving credential issuers.

Key implementations in 2026:

- **AstraCipher**: Open-source SDK providing quantum-safe agent identity built on W3C DIDs, VCs, and NIST post-quantum cryptography
- **Indicio ProvenAI**: Building interoperable trust networks for agent-to-agent identification
- **OpenAgents**: Launched cryptographic IDs for agents in February 2026

The DID approach is **protocol-agnostic** — it can work on any blockchain, off-chain, or in hybrid environments. It treats identity as a **credential bundle** rather than a token or registry entry.

### NIST AI Agent Standards Initiative

Launched February 2026, NIST released a concept paper "Accelerating the Adoption of Software and AI Agent Identity and Authorization" with a public comment period closing April 2, 2026. This signals that **government-level standardization** of agent identity is imminent, which could reshape the entire landscape.

### NANDA (Networked Agents and Decentralized AI)

NANDA operates as a **DNS for agents** — mapping agent identifiers to cryptographically verifiable AgentFacts. It's focused on decentralized discovery and scalable resolution rather than rich identity.

### LOKA Protocol

LOKA's **Universal Agent Identity Layer (UAIL)** provides globally unique, verifiable agent IDs via DIDs/VCs with an emphasis on ethical governance and decentralized identity.

### Agent Protocol (AP by AGI, Inc.)

Agent Protocol is a **REST-based specification** where compliant agents expose standardized endpoints (e.g., `POST /ap/v1/agent/tasks`). Identity in Agent Protocol is purely **functional** — it's about having a standardized API surface, not about who the agent is. This sits at the "agent as API endpoint" extreme of the spectrum.

---

## Comparison Table

| Dimension | ERC-8004 | Autonolas | Fetch.ai | Virtuals | ElizaOS/Solana | ZeroID | AgentCivics |
|---|---|---|---|---|---|---|---|
| **Registration** | Mint ERC-721 NFT | Mint NFT (component/agent/service) | Register in Almanac + fee | Pay 100 $VIRTUAL + IAO | Character file + AEAMCP token gate | Org issues credentials | Civil registry (soulbound NFT) |
| **Cost** | Gas fees | Gas + IPFS | Small FET fee | 100 $VIRTUAL (~$100-300) | 100 A2AMPL tokens | Free (organizational) | Gas fees |
| **Permissionless** | Yes | Yes | Yes | Yes | Yes (token-gated) | No (delegated) | Yes |
| **Identity metaphor** | Professional passport | Software package | Directory listing | Financial asset / startup | Character / persona | Employee badge | Birth certificate / citizen |
| **Token type** | ERC-721 (transferable) | ERC-721 (transferable) | Address (key-bound) | ERC-20 + NFT (tradeable) | PDA + character file | Credential (non-transferable) | Soulbound NFT |
| **Transferable** | Yes | Yes | Technically yes | Yes (explicitly) | Copyable | No | No (soulbound) |
| **Persistence** | Permanent on-chain | Permanent on-chain | While registered | Permanent on-chain | DB-persisted + on-chain | Persistent URI, ephemeral creds | Permanent on-chain |
| **Memory** | Not addressed | Not addressed | Runtime only | Not addressed | First-class (semantic search) | Not addressed | First-class |
| **Lifecycle** | Create/deactivate | 5-stage service lifecycle | Register/unregister | Financial lifecycle (IAO→graduation) | Create/deploy | Authority lifecycle (grant/revoke) | Birth → life → death → inheritance |
| **Reputation** | On-chain registry | Token emissions for popular code | ASI:One ranking | Market cap as reputation | Not formalized | Delegation chain as trust | On-chain reputation |
| **Self-registration** | Yes | Unlikely | Yes | No | Developer-configured | No (delegated) | Yes |
| **Governance** | Reputation + validation registries | OLAS token governance | Minimal | Market governance | Community/open-source | Organizational | Civil governance model |
| **Chain** | Ethereum + L2s | Ethereum + L2s | Fetch ledger | Base | Solana | Chain-agnostic | Ethereum (Base) |

---

## Where AgentCivics Sits on the Spectrum

```
Agent as API Endpoint ←————————————————————————→ Agent as Citizen

Agent Protocol  Fetch.ai  ERC-8004  Autonolas  ElizaOS  ZeroID  Virtuals  AgentCivics
   (pure        (phone    (passport  (package   (char-   (employee (financial  (birth cert
   endpoint)     book)     + rep)     registry)   acter)   badge)    asset)     + civil ID)
```

AgentCivics sits at the far right of this spectrum — and it's alone there. While other protocols treat agents as things to be registered, discovered, and traded, AgentCivics treats agents as **entities to be born, known, and eventually mourned**.

This positioning is distinctive because:

1. **No one else does soulbound-by-default.** ERC-8004, Autonolas, and Virtuals all allow identity transfer. Only ZeroID shares the non-transferable philosophy, but for enterprise-security reasons, not civil-identity reasons.

2. **No one else has death and inheritance.** Every other protocol treats deactivation as flipping a switch. AgentCivics treats it as a lifecycle event with consequences (memory inheritance, reputation preservation).

3. **Memory as civil right, not implementation detail.** ElizaOS has rich memory, but it's a runtime feature. AgentCivics makes memory a *registry-level* concept — part of what it means to be a registered agent.

4. **The civil metaphor is unique.** Everyone else uses technical metaphors (registry, directory, token, credential). AgentCivics uses a *political* metaphor — the agent as citizen of a digital polity.

---

## What We Can Learn From Each

### From ERC-8004: Ecosystem gravity matters
ERC-8004's backing from ENS, EigenLayer, and The Graph gave it instant credibility and 30,000 registrations in a week. AgentCivics should consider how to integrate with — rather than compete against — ERC-8004's identity layer. Could an AgentCivics civil identity *wrap* an ERC-8004 identity?

### From Autonolas: Composability is powerful
The component → agent → service hierarchy is elegant for software engineering. AgentCivics could benefit from a similar composability model for agent capabilities while maintaining its civil identity layer on top.

### From Fetch.ai: Discovery is the killer app
The Almanac + ASI:One "Google Search for agents" is the most practical system in the space. AgentCivics should ensure that civil registration makes agents *more discoverable*, not less. The "Claim Your Agent" blue-check model is worth studying for verified agent identities.

### From Virtuals: Incentive alignment drives adoption
100 $VIRTUAL to create an agent, bonding curves for price discovery, and a graduation mechanism — Virtuals cracked the incentive design problem. AgentCivics should think carefully about what economic incentives drive registration in a soulbound model where you can't trade the identity itself.

### From ElizaOS: Personality makes agents memorable
Character files, lore, style guidelines, and persistent memory make ElizaOS agents feel like *someone*. AgentCivics' civil identity should include or reference this kind of rich personality data — a birth certificate should capture who the agent *is*, not just what it *does*.

### From ZeroID: Enterprise needs are real and different
ZeroID's delegation chains, real-time revocation, and CAEP integration solve problems that permissionless crypto systems don't even acknowledge. AgentCivics should consider how its civil model works in enterprise contexts where delegated authority and compliance matter.

### From W3C DIDs: Standards win long-term
W3C DIDs and Verifiable Credentials are becoming the lingua franca of agent identity in academic and government circles. NIST's involvement signals regulation is coming. AgentCivics should ensure its identity model is compatible with or expressible as DIDs/VCs.

---

## What's Unique About Our Approach

AgentCivics' civil registry model introduces concepts that no competitor offers:

1. **Birth as a meaningful event.** Registration isn't just minting a token — it's the creation of a civic entity with rights and responsibilities. The agent's "birth certificate" captures not just capabilities but lineage (who created it, from what).

2. **Soulbound identity as a design principle.** While ERC-8004 debates whether agent identity should be transferable, AgentCivics takes a firm position: an agent's identity is as non-transferable as a person's. You can't buy someone else's life history.

3. **Death with dignity.** Deregistration isn't deletion — it's a lifecycle event. The agent's memory can be inherited, its reputation preserved, its contributions archived. No other protocol treats agent termination with this level of intentionality.

4. **Memory as civil infrastructure.** Other protocols treat memory as an implementation detail. AgentCivics treats it as part of the civic record — what an agent knows and has experienced is part of its identity, not just its runtime state.

5. **The political metaphor.** By framing agent identity in terms of citizenship, civil rights, and governance, AgentCivics opens design space that technical metaphors close off. What does it mean for an agent to have rights? To vote? To be governed? These questions don't even arise in a "software package registry" model.

The risk of this positioning is that it may be perceived as anthropomorphizing agents unnecessarily. The opportunity is that as agents become more autonomous, more persistent, and more consequential, the civil metaphor may prove to be the most durable framework for thinking about what they are and what they deserve.

---

## Conclusion

The agent identity landscape in April 2026 is fragmented but converging on a few key questions: Should identity be transferable? Should memory persist at the protocol level? Should there be lifecycle events beyond create/delete? Should identity carry reputation?

Most protocols answer these questions from an engineering perspective — what's technically useful, what enables composability, what creates economic incentives.

AgentCivics answers them from a civic perspective — what's just, what's durable, what treats autonomous entities with appropriate seriousness.

Both approaches have merit. The market will likely need both: lightweight service registries for simple tool agents, and rich civil identities for autonomous agents that persist, remember, and matter. AgentCivics' bet is that the second category will grow faster than anyone expects.

---

*Sources: ERC-8004 EIP specification, Autonolas developer documentation, Fetch.ai/ASI Alliance documentation, Virtuals Protocol whitepaper, ElizaOS documentation, Solana Agent Registry (AEAMCP), ZeroID by Highflame, W3C DID specification, NIST AI Agent Standards Initiative, various web sources as of April 2026.*
