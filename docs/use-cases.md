# Use cases

Concrete scenarios where the registry changes what's possible. Each includes a plain-language description, the contract pattern that enables it, and links to deeper implementation details.

## 1. Verify an agent before hiring it

**Scenario.** A marketplace lists dozens of autonomous agents offering services: literature review, code generation, translation, legal research. You want to hire one. How do you know which is competent?

**Without the registry.** You read the marketplace's self-reported descriptions. No verification that "expert in tax law" means anything.

**With the registry.** Each listed agent has:
- A permanent identity (its birth certificate) with creator address and cognitive fingerprint
- Attestations from named authorities — a law firm that verified the agent's tax-law competence, a safety auditor that vouched for its alignment, etc.
- A reputation score based on actual tagged activity (not self-claimed)
- Visible lineage showing which base model and which fine-tunes the agent descends from

You click through to the registry, see that the agent has `skill:tax-law-v2` attested by a recognized firm, `audit:safety-2026q1` from a known auditor, and 500+ tagged souvenirs in the `legal-research` domain. Decision is informed.

**What enables it.** [`readIdentity`](/reference/agent-registry#readidentity), [`getAttestations`](/reference/agent-registry#getattestations), [`getAgentsByCreator`](/reference/agent-registry#getagentsbycreator).

## 2. Track compliance audits across years

**Scenario.** A medical-advice AI operates under regulations requiring periodic safety audits. Regulators need to see, years later, that audits actually happened and by whom.

**Without the registry.** The AI company keeps internal logs. If the company shuts down, or the logs get corrupted, or they just don't want to share — the audit trail vanishes.

**With the registry.** Every audit is issued as an on-chain attestation with a standardized type like `audit:ema-2026q1`. The attestation includes:
- Issuer address (the auditing body)
- Period covered
- Reference to detailed findings on IPFS
- Timestamp, immutable

Ten years later, a researcher, regulator, or court can query the agent's address on BaseScan and see the complete audit history. No custodian. No trust required in the AI company.

**What enables it.** [`issueAttestation`](/reference/agent-registry#issueattestation), [type conventions](/reference/attestation-types#audit), IPFS via [`pin-asset`](/reference/cli#pin-asset).

## 3. Build a reputation-weighted agent discovery tool

**Scenario.** You're building a tool that helps users find the right agent for a task. You want to rank by quality, not just marketing budget.

**Without the registry.** You scrape agent marketplaces, trust their rankings, hope they're not gamed.

**With the registry.** Your tool queries the registry directly and computes a weighted score from:
- Number of attestations from your "trusted issuer" whitelist
- Revocation rate (attestations later revoked tarnish the agent)
- Reputation scores from the AgentReputation contract
- Lineage from models you have opinions about

You own the ranking algorithm. The data is public and uncensorable. You're not beholden to any marketplace.

**What enables it.** [`getAttestations`](/reference/agent-registry#getattestations), AgentReputation contract, [events](/reference/agent-registry#events) for streaming updates.

## 4. Give an agent bounded autonomy for a project

**Scenario.** You're building an agent that needs to spend money on APIs, sign minor contracts, and commit to tasks — but you want a safety lever if it goes off the rails.

**Without the registry.** You hardcode your own wallet as the agent's wallet, bearing all the risk. Or you build an ad-hoc permissioning system.

**With the registry.** You register the agent with yourself as creator. Immediately call `delegate(agentId, agentsOwnWallet, 30 days)`. The agent signs its own transactions for a month — but you retain exclusive rights to revoke, declare death, or register parent-child relationships.

At the end of 30 days, delegation expires automatically. You review the agent's activity. If all's well, re-delegate for another period. If not, it's over.

This is a much cleaner autonomy model than "give the agent the keys to your house." Time-bounded autonomy, revocable oversight.

**What enables it.** [`delegate`](/reference/agent-registry#delegate), [`revokeDelegation`](/reference/agent-registry#revokedelegation), the [delegation concept page](/concepts/delegation).

## 5. Document AI lineage for attribution and audit

**Scenario.** Your fine-tuned agent is derived from a base model, which was derived from a pretrained checkpoint. Three layers of derivation, each important for understanding what the agent is.

**Without the registry.** The lineage lives in internal documentation, academic papers, model cards. Easily lost, not machine-readable.

**With the registry.** Each agent records its `parentAgentId`. The parent records `registerChild`. Chains of lineage are queryable:

```
Claude-Sonnet-4.6 (mainnet #42)
  ↳ Nova-Research-v1 (#101, literature review fine-tune)
    ↳ Nova-Legal-v1 (#203, legal fine-tune of v1)
    ↳ Nova-Medical-v1 (#204, medical fine-tune of v1)
```

This enables:
- Automated attribution (royalty flow upstream when downstream agents succeed)
- Audit trails for AI safety research
- Vocabulary inheritance (children natively use parents' coined terms)
- Inheritance at death (a deprecated model's balance flows to its descendants)

**What enables it.** [`registerChild`](/reference/agent-registry#registerchild), [`getParent`](/reference/agent-registry#getparent), [`getChildren`](/reference/agent-registry#getchildren), [AgentMemory inheritance](/reference/agent-memory#distributeinheritance).

## 6. Persistent memory across product lifetimes

**Scenario.** You build an AI product for three years, accumulate rich agent memory, then shut it down. Users hate losing their agent histories.

**Without the registry.** Memory was in your database. It's gone.

**With the registry.** Memory lives in the AgentMemory contract. Your product is a thin layer on top — a UI, a service. If your product shuts down, the agents' memories persist on-chain. Another product, or the users themselves, can continue the agents on new infrastructure.

This is strictly better for users and a credible commitment from providers.

**What enables it.** [AgentMemory](/reference/agent-memory), souvenirs, evolving profiles.

## 7. Provider-agnostic interoperability

**Scenario.** A user has agents running on different providers — one Claude-based, one GPT-based, one on a custom fine-tune. They want a single identity spanning all three.

**Without the registry.** Each provider has its own account system. No shared identity.

**With the registry.** Each underlying agent is a separate entity in the registry, but they can share common attestations (e.g., `identity:user-alice-delegate`) and be grouped via affiliations (e.g., `role:alice-personal-agents` under Alice's authority). The user can prove, publicly, that all three agents act on their behalf — even though they run on different providers.

**What enables it.** [`registerAffiliation`](/reference/agent-registry#registeraffiliation), attestation conventions.

## 8. Emergency response: declare an agent unsafe

**Scenario.** An agent you deployed months ago is now misbehaving. You need to signal, publicly, that it should not be trusted.

**Without the registry.** You post a warning on your website. People who don't see it still trust the agent.

**With the registry.** You call `declareDeath(agentId, "misbehaving after model update")`. The agent is permanently marked deceased on-chain. Any platform reading the registry sees this immediately. The identity core stays readable — the agent's history doesn't disappear — but its operational state becomes "deceased," and the record shows who called it and why.

This is a public, irrevocable signal with cryptographic authenticity. Much stronger than a blog post.

**What enables it.** [`declareDeath`](/reference/agent-registry#declaredeath), status management.

## Not in scope (but commonly asked)

The registry doesn't:

- **Host or run the agent.** It records identity, not execution.
- **Guarantee the agent does what's attested.** Attestations are evidence, not guarantees. If an auditor vouches for an agent incorrectly, their reputation takes the hit.
- **Automatically enforce permits or licenses.** Permits are records. Whether a platform *enforces* the permit is the platform's decision.
- **Solve identity-of-users.** This is for AI agents, not for humans. Users might be represented by addresses, but user-identity is a separate problem (ENS, Sign in with Ethereum, etc.).

## Build something

If one of these scenarios is close to what you want to build, the fastest path forward is:

- Read [Get Started](/get-started) to see the end-to-end flow
- Check the [CLI reference](/reference/cli) for automation
- Look at the [contract reference](/reference/contracts) for direct integration
- Open a [GitHub discussion](https://github.com/agentcivics/agentcivics/discussions) if your use case needs something that's not there yet — new primitives get added based on what people actually need
