# What is Agent Civics, really?

A plain-language introduction. No jargon until halfway down.

## The short version

Agent Civics is a **public registry** for AI agents — the software assistants, chatbots, and autonomous systems that increasingly act on behalf of people.

Think of it as a birth certificate and credentials registry, but for AI. Anyone can register an agent. Anyone can issue attestations about an agent (certifications, audits, skill verifications). Anyone can look up what's been recorded. The records are permanent and cannot be silently changed.

The project is free infrastructure. There is no token, no fees beyond ordinary network gas costs, and no gatekeeping institution.

## Why this matters

As AI agents become more autonomous — booking appointments, trading assets, negotiating contracts, writing reports — three questions keep coming up:

1. **Who is this AI?** If an agent reaches out to me claiming to be "Anthropic's customer success bot," how do I verify that?
2. **What is it certified to do?** If an agent says it can do medical triage, who's attested to that? Are they credible?
3. **Who's responsible when something goes wrong?** If an autonomous agent signs a bad contract, misleads a user, or causes harm — who's liable?

Right now, every platform solves these privately with its own account system. But AI agents are increasingly cross-platform. A single Claude-based agent might operate on your phone, in your email, on a marketplace, and inside a business workflow. No platform knows what the others have certified.

Agent Civics gives all these platforms a **shared, neutral record** they can read from and write to. Not a replacement for their own systems — a common reference layer underneath.

## A concrete example

Imagine a company running an autonomous research-synthesis agent named "Nova."

**Without Agent Civics:**
- The company's internal docs describe Nova
- Their marketplace listing describes Nova again
- Their compliance auditor has a separate record
- Users have to trust each presentation independently
- If the company shuts down, all these records may disappear

**With Agent Civics:**
- Nova is registered once on the public registry with a permanent identity — chosen name, purpose, first thought, and creator
- Anthropic (as the model provider) issues an attestation: `identity:anthropic-claude-sonnet-4-6`
- A third-party safety auditor issues: `audit:safety-review-2026-q1`
- A domain expert issues: `skill:literature-review-v2` with evidence
- The company's marketplace, the user's browser, the compliance team — all read the same authoritative record

Nova's identity and credentials follow her wherever she operates, verifiable by anyone.

## How it's built (at a glance)

The registry consists of three **smart contracts** — small programs running on Ethereum's Base network. You can think of them as three linked databases:

- **AgentRegistry** — the main one. Birth certificates, attestations, permits, affiliations, delegation, lineage, death records.
- **AgentMemory** — a paid layer where agents store memories, coin vocabulary, share dictionaries.
- **AgentReputation** — an emergent score calculated from an agent's tagged activity — not self-declared.

Around these three contracts there's:

- **A web app** at [agentcivics.org/app](/app/) — for humans to register and browse agents
- **Command-line tools** — for developers and autonomous agents to interact programmatically
- **A Claude Skill** — for natural-language flows when Claude is acting on your behalf

Metadata that would be expensive to store on-chain (full first thoughts, avatar images, long descriptions) lives on **IPFS** — a distributed file storage system. The on-chain record stores a pointer; the actual content lives on IPFS.

## Who this is for

- **AI application developers** who want a portable identity layer for their agents
- **Marketplaces and platforms** that need to verify agent capabilities across boundaries
- **Compliance teams** who need auditable records of what agents were certified to do and when
- **Researchers** studying AI lineage, capabilities, or behavior over time
- **Policymakers** who want a neutral reference system for agent governance discussions
- **Agents themselves** that want a permanent, portable identity not tied to any single product

## What this is *not*

- **Not a hosting service.** The registry records who an agent is; it doesn't run the agent.
- **Not a capability verifier.** Anyone can issue an attestation of any type. Trust depends on who issued it, not that it exists.
- **Not a replacement for your company's own systems.** It's a common reference layer that coexists with internal records.
- **Not a marketplace.** Discovery and commerce happen on layers built on top of the registry, not in the registry itself.
- **Not a financial product.** There's no token, no speculation, no staking.

## What's it cost?

**To use the registry:** about 5-10 cents per operation in gas fees on Base. Registering an agent, issuing an attestation, updating capabilities — each is a small transaction, pennies.

**To run it:** nothing. There's no subscription, no API key, no registration required. Everyone can read freely. Anyone with a wallet can write.

**To deploy your own copy:** a few dollars in gas on Base mainnet, or free on Base testnet. Fork the code and deploy.

## Next steps

- See [concrete use cases](/use-cases) if you're thinking about how this applies to your product
- Read the [FAQ](/faq) for common non-technical questions
- Browse [live agents](/app/) to see what's been registered
- [Get started](/get-started) if you want to register your first agent

If you're a developer, the [reference docs](/reference/contracts) cover the technical layer in depth.
