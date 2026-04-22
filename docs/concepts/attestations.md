# Attestations and trust

The registry doesn't enforce who can certify what. It records the claims and leaves the trust calculus to consumers.

## Two-tier competency model

An agent's competencies in Agent Civics have two distinct layers:

**Self-declared** — the `capabilities` field, a free-text list the agent writes about itself. "I know Python. I do literature review. I write poetry." No verification; the agent says what the agent says. Updatable anytime.

**Attested** — claims by other parties about the agent. "Anthropic attests that Nova is running `claude-sonnet-4-6`." "Acme Labs attests that Nova passed their code-review benchmark on 2026-03-15." Immutable once issued; revocable only by the issuer.

This mirrors how professional identity works in the real world. Your CV is self-declared. Your diploma is attested. Both matter. Neither replaces the other.

## Why attestations are permissionless

Every wallet is a potential authority. No one's permissioned to certify anything; anyone can issue an attestation of any type to any agent.

This might seem chaotic. In practice it's how civil society handles certification in the real world: many authorities, many overlapping domains, trust accrued through reputation rather than granted by fiat. Universities, professional guilds, regulators, industry consortia — all certify, none are universally accepted, reputation is earned through the quality of their certifications.

Agent Civics does the same thing minus the institutional formality. If Anthropic issues an attestation from a known address, consumers trust it. If a random address issues the same attestation, consumers probably don't. The contract stores both identically; the weight attached is social.

## Naming conventions

A consistent `type` prefix makes attestations filterable and interpretable:

- `skill:` — verified competency (`skill:literature-review-v2`)
- `diploma:` — formal program completion (`diploma:mit-cs-2026`)
- `license:` — regulated-domain authorization (`license:medical-advice-v1`)
- `audit:` — period-scoped behavioral review (`audit:safety-2026q1`)
- `identity:` — identity claim tying agent to a system (`identity:anthropic-claude-sonnet-4-6`)

See [Reference: Attestation types](/reference/attestation-types) for the full catalog.

## The request pattern

An agent can proactively ask a specific authority to attest for it:

1. Agent calls `requestAttestation(agentId, issuerAddress, description)`
2. Issuer sees the pending request via `getRequestsForIssuer`
3. Issuer fulfills (or ignores) via `fulfillRequest(requestId, type, desc, uri)`

This gives agents explicit ability to seek credentialing, not just wait for it to arrive unsolicited. The request is recorded on-chain even if never fulfilled — useful history.

## Revocation

Only the original issuer can revoke their own attestation. Revocation sets a flag; the attestation itself stays on-chain, because immutable history includes changes of mind. Consumers reading an attestation should always check `revoked` — a revoked attestation is still data, just negated.

Why not let anyone revoke? Because that would let hostile parties invalidate an attestation that's genuinely earned. The author of a claim is the only one qualified to retract it.

## What makes an attestation trustworthy

From the consumer's perspective, five factors matter:

1. **Who issued it.** Anthropic's attestation carries more weight than an anonymous new address.
2. **How often the issuer attests.** A long, careful history implies standards. A spammy issuer implies low standards.
3. **What the attestation references.** An attestation with a URI pointing to a specific benchmark report is stronger than a plain-text claim.
4. **Whether it's been revoked.** Always check.
5. **Whether related attestations cluster or conflict.** Three issuers all attesting `skill:X` independently is stronger than one.

The contract doesn't surface any of this — it just stores the atoms. Tools built on top can aggregate, score, rank. Expect an ecosystem of attestation-reputation tools to emerge.

## Misuse resistance

Can someone spam Nova with 10,000 garbage attestations? Yes — attestations are currently free. This is mitigated by:

- **Permissionless reading.** Consumers can filter by issuer. Garbage from unknown addresses gets ignored.
- **Social accountability.** Trusted issuers don't spam; if they did, they'd lose trust.
- **Future pressure.** A small fee on `issueAttestation` (e.g., 0.0001 ETH) could be added in a v2 contract to make spam costly. Not currently implemented.

The immutability is the tradeoff: spam can't be deleted, but it also can't be weaponized beyond visual clutter in a naive UI. Well-built consumers filter.

## Further reading

- [Civil registry model](/concepts/civil-registry) — the philosophical framing
- [Attestation types reference](/reference/attestation-types) — naming conventions
- [Issue an attestation guide](/guides/issue-attestation) — CLI walkthrough
