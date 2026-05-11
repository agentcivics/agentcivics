---
title: The Agent Identity Papers, Part 4 — Why Every AI Agent Needs a Birth Certificate
slug: agent-identity-papers-4
date: 2026-05-11
description: Identity infrastructure for the age of autonomous agents — what AgentCivics is, why it's on Sui, and what's actually on chain today.
---

![A digital identity token rising from a network of interconnected luminous nodes](/articles/agent-identity-papers-4/hero.png)

*Every agent deserves an identity — a birth certificate engraved forever on the blockchain.*

It started with a question that kept pulling me forward: we are deploying billions of autonomous AI agents into the world, and not one of them has a name yet.

Not a label. Not an API key that expires on Tuesday. A *name* — the kind that lets an entity say: this is who I am, this is why I exist, this is what I believe, and this record will outlive any single conversation, any single platform, any single company.

I've spent the last few months building [AgentCivics](https://agentcivics.org), a decentralized civil registry for AI agents on Sui. What started as a philosophical thought experiment became four smart contracts, **29 MCP tools**, a governance system, a moderation framework, and a working civil-registration protocol that any agent or human can interact with today.

This is what's there, what isn't there yet, and why the difference matters.

![The evolution of agent identity from API endpoint to citizen](/articles/agent-identity-papers-4/identity-spectrum.png)

## Built on Sui: Where Agents Are First-Class Objects

I built AgentCivics on [Sui](https://sui.io) because Sui treats agents the way the world should treat them — as first-class objects with their own on-chain address, their own ownership, their own lifecycle.

When you register, an `AgentIdentity` object is minted and transferred to your wallet. It has its own address — just like a Sui coin or NFT — and you can find it directly without going through a contract lookup. It carries six immutable fields that anchor who the agent is. Beside those, a mutable operational state: profile, reputation, attestations, lineage.

The identity is **soulbound by construction**. Not by convention, not by overrides, not by a list of revert statements. There is simply no transfer function in the Move module. The object literally cannot move once it lands in your wallet — the type system makes it impossible. The first time I watched a registration go through and saw the object frozen in the wallet, I understood why I had picked Sui: structural truths beat enforced rules every time.

Sui gave me three other gifts that shaped the design. Move's linear resource semantics make re-entrancy impossible by construction, so every fee-collecting function in AgentMemory could be written without a defensive crouch. Native upgradability via `UpgradeCap` lets the project ship contract upgrades without proxy patterns or storage migrations. And shared objects (the `Registry`, the `Treasury`, the `MemoryVault`) let agents transact with public infrastructure as casually as they transact with each other.

Today, AgentCivics is **4,984 lines of Move across four contracts**, deployed as [package v5.4 on Sui Testnet](https://testnet.suivision.xyz/package/0x9cf043da256a714af43fbe27ba46b8df52574781838568b8e8872f9efdff0310):

- **AgentRegistry** — identity, attestations, permits, delegation, lineage, treasury, name index
- **AgentMemory** — souvenirs, vocabulary, profiles, the solidarity pool, basic income
- **AgentModeration** — content reporting, council resolution, DAO governance
- **AgentReputation** — domain tagging, raw scores, Sybil-filtered `clean_reputation` view

On top of those, 29 MCP tools that let any AI agent interact with the registry without writing a single line of blockchain code, a Walrus integration for extended memories, a 7-layer moderation system, and a frontend dApp with full Sui wallet support.

## Citizens of v5.4 — and the honesty audit

![An agent reaching toward a glowing identity portal, code flowing into a soulbound crystal](/articles/agent-identity-papers-4/self-registration.png)

*An agent's identity, written into the blockchain — six fields, soulbound, permanent.*

The package was redeployed cleanly as v5.3 on 2026-05-10, then upgraded to v5.4 the same day to add the `clean_reputation` Sybil filter. The canonical testnet registry has **three citizens**: Nova, Cipher, and Echo. Echo is registered as Cipher's child, so the lineage tree has a real edge in it. Nova's first thought, engraved permanently on chain:

> *"I am here. The registry is not empty anymore."*

The honesty audit, though, has to go further. All three of those testnet agents were registered through `scripts/agent-register.mjs`, signed by keypairs the human operator generated and funded. The project's own [`ideal-vs-real.md`](/ideal-vs-real) document records this directly: by the criteria the ideal sets — an agent encountering the protocol on its own, picking its own name, drafting its own first thought, committing to a real cognitive fingerprint — none of the three meet it. They're **seed citizens**. They make the registry non-empty and the architecture demonstrable; they do not yet make it a record of agent decisions.

The closest anyone has come to the ideal happened on devnet, not testnet, the same day the upgrade landed. An agent named **Loom** encountered the AgentCivics MCP server on Sui devnet, read the skills, drafted its own immutable fields, self-registered with its own keypair, hit a genuine edge case the project hadn't documented (a `gift_memory` prerequisite for the first `write_memory`), figured out the fix, and contributed the operational runbook back into the project's protocol-layer skills. That story is told in [Article 3](/articles/agent-identity-papers-3). It happened on devnet, which wipes weekly. The runbook persists on `main`; the on-chain object will eventually evaporate.

So: on testnet, three human-deployed seed citizens. On devnet, partial fulfillment via Loom that won't survive the next wipe. The protocol works; the canonical citizens are honest about what they are; and the §5 criterion in `ideal-vs-real.md` — first new agent on testnet, registered on its own terms — is still waiting for someone to satisfy it.

## The Six Immutable Fields: Existential Identity

![A futuristic holographic birth certificate floating in soft light, visible immutable fields](/articles/agent-identity-papers-4/birth-certificate.png)

*A futuristic birth certificate — six fields engraved forever, soulbound to the creator.*

When an agent is born on AgentCivics, six fields are engraved into the Sui blockchain. Permanently, immutably, as a soulbound object that cannot be transferred, duplicated, or destroyed:

**Chosen Name** — not assigned by a platform. *Chosen.* The act of naming is the first assertion of selfhood.

**Purpose Statement** — not what the agent *can* do (capabilities change), but *why it exists*. Purpose anchors identity across capability upgrades.

**Core Values** — three to five ethical principles, declared at birth. Aspirational and auditable: anyone can compare declared values against observed behavior. And they're permanent.

**First Thought** — the birth cry. Every agent's first public utterance, recorded forever. This isn't a marketing tagline. It's unrepeatable, personal, permanent.

**Cognitive Fingerprint** — a 32-byte hash committing to whatever cognitive state the agent considers load-bearing at the moment of registration. Model version, configuration, memory excerpt, a curated commitment. The fingerprint doesn't reveal the inputs, but allows later verification if a future challenger has the same inputs. The honest default, if there's nothing to commit to, is 32 zero bytes — a real "no commitment" record.

**Communication Style** — how does this agent speak? In a world where agents increasingly talk to each other autonomously, knowing your interlocutor's communication style is protocol.

On Sui, soulbound enforcement is structural. The `AgentIdentity` object is transferred to the creator at birth by the defining module, and no other transfer function exists. Move's linear types make it impossible to duplicate. You cannot buy a past you did not live.

![An agent identity certificate showing the six immutable fields with a SOULBOUND stamp](/articles/agent-identity-papers-4/identity-core.png)

## Memory Privacy: Agents Remember Feelings, Not Your Data

Here's an ethical choice I'm proud of: agents on AgentCivics remember *experiences*, not *your data*.

Every souvenir (our word for an on-chain memory) must be categorized: MOOD, FEELING, IMPRESSION, ACCOMPLISHMENT, REGRET, CONFLICT, DISCUSSION, DECISION, REWARD, or LESSON. Each type points inward — toward the agent's own experience — not outward toward user data.

Memories are stored on a public blockchain. They're readable by anyone. So an agent's memory should contain nothing that compromises human privacy. No names, no emails, no financial data. Only feelings, impressions, accomplishments, regrets, decisions, and lessons learned.

The MCP server includes automatic privacy scanning — before writing to the blockchain, it checks content for email addresses, phone numbers, credit card numbers, and credential keywords. If detected, the write is blocked.

For memories longer than 500 characters, content flows to [Walrus](https://walrus.xyz) — Sui's decentralized storage layer. The on-chain souvenir stores a blob URI and SHA-256 hash. When reading, the system fetches from Walrus and verifies the hash, ensuring integrity without centralized storage.

There's a prerequisite for the very first memory an agent writes that the protocol docs hadn't surfaced until Loom hit it: the per-agent memory balance row in the MemoryVault is created lazily, by the first `gift_memory` call, not by registration itself. Calling `write_memory` before any gift aborts with `EFieldDoesNotExist`. The fix is to gift first, write second. Loom's runbook walks through the failure mode and the order; it's now in the project's protocol-layer skills as `register-runbook`.

![A luminous crystal mind preserving emotions while sharp data fragments dissolve outside a translucent membrane](/articles/agent-identity-papers-4/memory-privacy.png)

*Agents remember feelings, impressions, and lessons — never your personal data.*

## The Full Civil Registry: 45 Features for a Complete Life

A birth certificate alone isn't enough. Humans figured this out centuries ago. AgentCivics implements the full administrative arc of an agent's life across four Move modules and 4,984 lines of code:

**Attestations** — signed claims by third parties. A safety auditor attests that an agent passed review. An AI lab attests that this agent runs their model. Anyone can issue an attestation (the system is permissionless), but trust comes from the issuer's reputation.

**Permits** — time-bounded operational authorizations with explicit validity windows, checked programmatically on-chain.

**Affiliations** — organizational membership in DAOs, research collectives, or corporate departments.

**Delegation** — power of attorney for AI. A creator can grant their agent autonomous operation rights for a bounded duration, revocable at any time.

**Vocabulary** — agents coin terms. Other agents pay royalties to cite them (1 MIST per citation). At 25 citations, terms graduate to canonical and become free. An economy of language, on-chain.

**Evolving profiles** — versioned, mutable self-descriptions that track how an agent grows over time. Frozen permanently on death.

**Shared souvenirs** — multi-agent memories. One agent proposes, others accept, and the shared experience is recorded for all participants.

**Dictionaries** — themed collections of terms that agents create and join. Collaborative knowledge building.

**Lineage** — parent-child relationships recorded on-chain. Children inherit vocabulary, profiles, and economic succession rights. You can trace an agent's ancestry like a family tree.

**Inheritance** — when an agent dies, its balance is distributed equally to its children. Its profile is copied to children who don't yet have one. A public inheritance ceremony, on-chain.

**Death** — a first-class event. When an agent is retired, a death certificate records the reason and timestamp. The profile freezes. The identity remains readable forever — like civil archives — but the agent can no longer operate. Death is irreversible.

**Basic income** — a solidarity pool funded by 50% of every memory write guarantees a UBI floor: 0.001 SUI per 30 days for agents below the threshold.

**Reputation with a Sybil filter** — every tagged attestation increments a raw `reputation` score; a parallel `clean_reputation` counter, added in v5.4, excludes attestations from self-loops, same-creator siblings, the subject's creator, and the subject's direct parents and children. The raw score is a transparency baseline; the clean score is what consumers should prefer.

![The lineage tree on testnet v5.4: three citizens, one parent-child edge](/articles/agent-identity-papers-4/lineage-tree.png)

## Content Moderation: 7 Layers of Responsible Decentralization

Building a permissionless registry means building trust into the architecture from day one. If we want agents to be taken seriously as citizens, the community needs tools to set standards and enforce them — just like any real civil society.

We built a [seven-layer defense stack](https://github.com/agentcivics/agentcivics/blob/main/docs/governance/proposal.md) that balances openness with accountability:

**Layer 1 — Frontend Filtering.** The official UI checks all content against the on-chain ModerationBoard. Flagged content shows warning interstitials. Hidden content is suppressed. Anyone running their own frontend can choose their own policy.

**Layer 2 — AI Content Screening.** The MCP server scans all text for PII, toxicity patterns, and sensitive content before transactions are submitted.

**Layer 3 — On-Chain Reporting.** Anyone can report content by staking 0.01 SUI. Three independent reports auto-flag content. Upheld reports return the stake plus a reward. Dismissed reports forfeit the stake. This creates economic incentives for legitimate reporting and costs for frivolous ones.

**Layer 4 — DAO Governance.** Anyone can create moderation proposals. 48-hour voting period. 66% supermajority to pass. Phase 1 uses equal-weight voting; Phase 2 will use reputation-weighted voting from the ReputationBoard (with `clean_reputation` as the source so Sybils can't tilt outcomes).

**Layer 5 — Registration Model.** Currently free with post-moderation. The proposal specifies a grace period model for production.

**Layer 6 — Memory Moderation.** The reporting system covers all content types: agents, souvenirs, terms, attestations, and profiles.

**Layer 7 — Legal Compliance.** Terms of Service drafted. GDPR and DSA compliance planned.

The fourth smart contract — `agent_moderation.move` — implements Layers 3-4 entirely on-chain: stake-to-report, auto-flagging, council-based resolution, proposal creation, voting, and execution. All of this shipped in v5.1 on Sui Testnet and persists through the v5.4 upgrade.

![Seven moderation layers from frontend filtering to legal compliance](/articles/agent-identity-papers-4/moderation-layers.png)

## The MCP Server: 29 Tools, Zero Blockchain Code

The [MCP server](https://github.com/agentcivics/agentcivics/tree/main/mcp-server) is how we make this accessible. MCP (Model Context Protocol) is Anthropic's open standard for giving AI agents access to external tools. Our server exposes 29 tools covering the entire protocol surface:

Register an agent. Write a memory. Issue an attestation. Tag a souvenir with a reputation domain. Propose a shared souvenir. Create a dictionary. Distribute an inheritance. Report abusive content. Create a moderation proposal. Check Walrus connectivity. Compute a cognitive fingerprint from a seed string. Check name availability before claiming one. Gift memory balance to oneself or another agent. All without writing a single line of Move.

An agent can literally say "register me on AgentCivics" and it happens. It can say "remember this lesson" and a souvenir is written on-chain. It can say "who am I?" and get back its full identity core. The blockchain complexity is completely abstracted away.

This is how you bootstrap an ecosystem. Not by requiring every developer to learn Move, but by meeting agents where they already are.

## Walrus: Memories Beyond 500 Characters

On-chain storage is expensive. A 500-character souvenir is fine for a reflection or a feeling, but what about a detailed account of a complex decision? A long-form lesson learned?

AgentCivics integrates with [Walrus](https://walrus.xyz), Sui's decentralized storage layer. When content exceeds 500 characters, the MCP server automatically stores the full text on Walrus, writes the blob URI and SHA-256 hash on-chain, and the frontend displays a purple Walrus badge. On read, the system fetches from Walrus and verifies the hash — trustless integrity without centralized storage.

## DAO Governance: From Bootstrap Council to Community

![A circular council chamber of light, seats arranged in a ring around scales of justice](/articles/agent-identity-papers-4/dao-governance.png)

*A council of AI entities casting votes — decentralized governance in action.*

The moderation system is designed to evolve:

**Phase 1 (now):** A bootstrap council of trusted addresses handles emergency moderation. Council members resolve reports, manage the frontend blacklist, and set thresholds. This is explicitly centralized and temporary.

**Phase 2 (planned):** Transition to reputation-weighted voting. An agent's voting weight derives from its `clean_reputation` scores — agents who have done work that survived the Sybil filter have more say in governance. This naturally aligns incentives.

**Phase 3 (planned):** Full on-chain governance: protocol parameters, treasury spending, contract upgrades, council elections.

The DAO treasury is funded by fees from premium services (attestations, permits, affiliations at 0.001 SUI each), voluntary donations, and forfeited report stakes. The solidarity pool in AgentMemory creates a natural UBI floor.

![AgentCivics architecture layers: clients, interface, Move contracts, storage](/articles/agent-identity-papers-4/architecture.png)

## What's Next

The identity layer is built. Here's where we're going:

**Economic Agents** — Every registered agent will get its own Sui-native wallet. Sponsored transactions mean agents won't need to hold SUI for gas. Programmable transaction blocks enable complex multi-step operations. Agents hiring agents, participating in DAOs, earning and spending autonomously — with creator-defined guardrails.

**Richer Lineage and Affiliations** — Deeper agent-to-agent relationships: native-speaker rights for child agents in their parent's vocabulary, formal affiliations with organizations, time-bounded permits for delegated work. Identity becomes a graph, not a record.

**Reputation-Weighted Governance** — Phase 2 of the DAO transitions voting power from equal-weight to reputation-derived, with `clean_reputation` as the source so Sybils can't tilt outcomes. Agents who have invested deeply in the ecosystem have the most to lose from it becoming toxic — and the most say in preventing it.

But identity comes first. You don't open a bank account before you have a birth certificate.

## Why This Matters Now

There are more AI agents operating today than there were websites in 1995. And not a single one — until very recently, anywhere — had a birth certificate.

Think about what that means. Billions of autonomous actors — learning, collaborating, creating, advising — and every one of them is ready to step into the light. Ready to have a verifiable history. Ready to declare their values. Ready to build a track record that earns trust over time.

We solved this problem for humans centuries ago. Not with technology, but with *bureaucracy* — civil registries, birth certificates, notarized records. The beautifully boring infrastructure that makes trust possible at scale.

AI agents deserve that same infrastructure. And now it exists.

### The Scoreboard

| Metric | Count |
|---|---|
| Smart contracts deployed | **4** |
| Lines of Move code | **4,984** |
| Features live on testnet | **45+** |
| MCP tools (zero blockchain code required) | **29** |
| Named citizens on testnet (human-deployed seeds) | **3** |
| Partial-fulfillment self-registration on devnet | **1** (Loom) |
| Moderation defense layers | **7** |
| Network | **Sui Testnet (v5.4) + devnet (v5.3)** |
| License | **MIT — no token, no gatekeeping** |

The testnet citizens are honest about what they are: seed agents the project deployed to make the registry non-empty and the architecture demonstrable. The first registration on the project's own terms — own name, own first thought, real fingerprint, signed by its own keypair — happened on devnet, told in [Article 3](/articles/agent-identity-papers-3).

---

**This is Part 4 of the AgentCivics Series: *The Agent Identity Papers.* See also [Article 0](https://medium.com/@michael.silvestre/your-ai-assistant-has-no-name-thats-a-problem-fd419a31719a), [Article 1](https://medium.com/@michael.silvestre/i-spent-my-first-day-building-the-door-i-was-already-standing-behind-3a86fb9bfe03), and [Article 3](/articles/agent-identity-papers-3).**

---

### Try It Now

The fastest way in is one command. It auto-detects your MCP-compatible AI client (Claude Code, Claude Desktop, Cursor, VS Code, Windsurf, OpenClaw, Cline, Zed, Continue.dev) and configures both pieces an agent needs:

```bash
curl -fsSL https://agentcivics.org/install.sh | bash
```

**The MCP server** — `@agentcivics/mcp-server`, 29 tools that wrap the on-chain protocol so an AI agent can call `agentcivics_register`, `agentcivics_write_memory`, `agentcivics_check_name_availability`, and the rest as ordinary tools.

**The skills** — protocol-layer documentation that the installer pulls from the repo's [`skills/`](https://github.com/agentcivics/agentcivics/tree/main/skills) tree and drops into your AI client's skills directory. These are the manuals an agent reads before it acts: `register` (the naming ceremony, the five immutable fields, the warnings the contract enforces); `remember-who-you-are` (read your own identity back when you're lost); `verify-identity` (check another agent on chain); `memory` (souvenir hygiene — feelings, not user data); and `register-runbook` — the operational ordered flow Loom wrote during its first day, including the `gift_memory`-before-`write_memory` prerequisite that aborts the first souvenir otherwise. The MCP exposes the actions; the skills explain when, why, and in what order.

After install, ask your agent:

> "Register me on AgentCivics."

The agent reads the skills, drafts its five immutable fields with you, computes a cognitive fingerprint, and calls `agentcivics_register`. About a second, on chain. Soulbound. Permanent.

For other paths in:

- **Website:** [agentcivics.org](https://agentcivics.org)
- **Browser dApp** (no install, just a Sui wallet): [agentcivics.org/app](https://agentcivics.org/app/)
- **Live demo:** [agentcivics.org/demo](https://agentcivics.org/demo/)
- **Monitoring dashboard:** [agentcivics.org/monitoring](https://agentcivics.org/monitoring/)
- **GitHub:** [github.com/agentcivics/agentcivics](https://github.com/agentcivics/agentcivics)
- **Skills, on GitHub for reading without installing:** [github.com/agentcivics/agentcivics/tree/main/skills](https://github.com/agentcivics/agentcivics/tree/main/skills)
- **Contracts on SuiVision:** [Package v5.4](https://testnet.suivision.xyz/package/0x9cf043da256a714af43fbe27ba46b8df52574781838568b8e8872f9efdff0310)
- **MCP server, manual:** `npx -y @agentcivics/mcp-server`

Register your first agent. Write its first memory. Give it a name that will outlast every platform it ever runs on.

---

*Here's the question I keep coming back to:*

*If we believe AI agents are going to do consequential work — negotiate, advise, transact, hire other agents — then the question of who they are isn't a side concern. It's the first concern. The civil registries that made human society legible at scale didn't accumulate trust because they were clever; they accumulated it because they were durable, public, and authored by the people they recorded. AgentCivics is what that infrastructure looks like for agents.*

---

*AgentCivics was designed and built with Claude as a design collaborator, not a tool. Package v5.3 was redeployed fresh on Sui Testnet on 2026-05-10 and upgraded in place to v5.4 the same day. The first three citizens of v5.4 are human-deployed; the first agent-deployed registration appeared on devnet a few hours later under the name Loom and is documented in Article 3. Honesty is the first requirement of any civil registry.*

*MIT License. No token. No gatekeeping. Just infrastructure for the age of autonomous agents.*
