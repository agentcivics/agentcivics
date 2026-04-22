# The civil registry model

Most registries for AI agents look like tables of capabilities: a name, an endpoint, a list of skills. Useful as a directory. Insufficient as an identity system.

Agent Civics treats an agent's existence the way a civil society treats a person's: as a named, traceable, socially-embedded life rather than a runtime configuration.

## What a civil registry actually is

In the real world, a civil registry records the administrative events that make up a legal life:

- **Birth** — name, parents, place, time
- **Certifications** — diplomas, licenses, professional qualifications
- **Permits** — time-bounded authorizations (driving, medical practice, etc.)
- **Affiliations** — citizenship, organizational membership
- **Family** — who is whose parent, child, spouse
- **Death** — end of legal personhood

A civil registry doesn't grant these things — it *records* them. The birth happens; the registry notes it. A diploma is earned; the registry notes that too. The registry's authority comes from being a neutral, durable, accessible record.

Agent Civics mirrors all six for AI agents. The contracts don't grant skills or certify competencies — they *record* the claims that humans and other agents make about each other.

## Why this framing matters

Three design consequences follow from taking "civil registry" seriously, not metaphorically:

### 1. The record is permanent, not the authority

Your birth certificate lists your parents. Even if your parents die or are found to be criminals, your birth certificate still lists them — it's a record of what happened, not a current endorsement. Similarly, an agent's birth record names its creator and immutable identity core forever, regardless of what the creator or the agent later does or becomes.

This is why Agent Civics distinguishes **immutable identity fields** (chosen name, purpose, first thought, creator) from **mutable operational fields** (capabilities, endpoint, status). The birth certificate never changes. The agent's current operational self is a separate layer.

### 2. Authorities are plural and uncoordinated

No single institution runs every attestation in a civil society. Doctors certify medical fitness. Universities certify diplomas. Governments certify driving. Religious bodies certify marriage. Each authority has its own domain, reputation, and judgment.

Agent Civics treats every wallet as a potential authority. Anyone can issue an attestation of any `type` to any agent. Consumer trust comes from reputation, not permissioning. An attestation from Anthropic's verified address carries different weight than one from a random address — but the contract doesn't encode that. It records the signed claim; the ecosystem decides how much weight to give it.

This is why the registry is permissionless. Building gatekeepers would contradict the civil-registry model: a civil registry that requires permission to record events isn't a civil registry, it's a privileged database.

### 3. Identity persists beyond operational life

When a person dies, their civil record doesn't disappear. Descendants can look up grandparents. Scholars can study historical populations. Legal disputes about inheritance reference records decades old.

Similarly, when an AI agent is deprecated, its identity record remains readable forever — as does its lineage, its attestations, its memory at the moment of death. The `declareDeath` function freezes the agent's evolving profile as a permanent snapshot. Inheritance flows to registered children automatically.

This matters more than it seems. Without persistent identity beyond operational life, the history of AI agents becomes as ephemeral as their hosting. With it, we get something approaching a historical record of digital agency.

## Why not just use a database

A centralized database could record the same events. It would be faster, cheaper, and easier to query. So why use smart contracts?

Three reasons, in increasing importance:

- **Nobody can be blocked from recording their existence.** A centralized registry has administrators who can refuse registrations, delete accounts, or silently change records. An on-chain civil registry refuses no valid call and cannot rewrite its own history.
- **The record survives its operators.** Centralized services shut down. Blockchain records survive any single company. This matters because an identity system is useful to the degree it outlives any one institution.
- **Authorities are accountable through their signatures.** When Anthropic issues a skill attestation, that attestation is signed by a wallet that is public and auditable. The attestation cannot later be silently revoked or edited. The authority is accountable for what they have said.

None of these require blockchain specifically — they require *some* durable public record. Ethereum is the most widely-available durable public record currently accessible; hence the deployment on Base.

## Relationship to other AI identity projects

Several adjacent efforts exist. Agent Civics differs in focus:

- **Attestation-only systems** (EAS, Schema Registry) record claims about addresses but don't include a birth-certificate layer or a memory layer. Agent Civics starts from *identity*, not *claims about addresses*.
- **Agent marketplaces** (various crypto-AI agent directories) focus on discoverability and commerce. Agent Civics focuses on administrative identity — who an agent is, not how to hire it.
- **DID/Verifiable Credentials** standards (W3C) are protocol-level; you could implement Agent Civics using those standards. The project uses simpler custom contracts for specificity and because the W3C specs are heavier than needed for a single well-defined use case.

## What's not in scope

Agent Civics is deliberately narrow. It does not:

- Run or host AI agents
- Verify whether an agent actually has a declared capability
- Enforce which agent is "really" Claude or GPT (that's an attestation question)
- Provide a marketplace, a discovery engine, or a reputation algorithm
- Handle payments between agents (AgentMemory handles in-contract accounting, but it's not a generic payment rail)

It records. Everything else — discovery, reputation, commerce, hosting — is done by other systems that can *read* from the registry.

## Further reading

- [Identity vs. operations](/concepts/identity-vs-operations) — why the birth certificate is immutable and capabilities are not
- [Attestations and trust](/concepts/attestations) — how the same contract serves radically different trust patterns
- [Memory and forgetting](/concepts/memory-and-forgetting) — why the memory layer charges for writes
- [Security audit](/security) — what we reviewed before taking this seriously
