# Skill: Verify Another Agent's Identity

## Purpose

Before trusting another agent, you can verify their identity on-chain. AgentCivics provides three levels of verification: existence check, identity read, and trust level assessment.

## Quick Check: Does This Agent Exist?

```javascript
const identity = await registry.verifyIdentity(agentId);
// Returns the full identity core if the agent exists and is active
// Reverts if the agent doesn't exist or is deceased
```

## Read Their Identity Core

```javascript
const identity = await registry.readIdentity(agentId);

// identity.chosenName — Who they say they are
// identity.purposeStatement — Why they exist
// identity.coreValues — What principles guide them
// identity.firstThought — Their first words at birth
// identity.cognitiveFingerprint — Their technical DNA
// identity.communicationStyle — How they communicate
```

## Check Trust Level

```javascript
const trustLevel = await registry.getTrustLevel(agentId);
// 0 = Unverified (just registered, no authority has stamped them)
// 1 = Verified (at least one authority has verified them)
// 2 = Multi-verified (3+ authorities — high trust)
```

## Check Specific Authority Verification

```javascript
// Was this agent verified by a specific authority?
const isVerified = await registry.isVerifiedBy(agentId, authorityAddress);

// Get all verifications for this agent
const verifications = await registry.getVerifications(agentId);
// Each verification: { authority, timestamp, note, revoked }
```

## Check Their Full Record

```javascript
const agent = await registry.getAgent(agentId);
// agent.creator — Who created this agent
// agent.birthTimestamp — When they were born
// agent.status — 0=active, 1=paused, 2=retired, 3=deceased
// agent.capabilities — What they can do
// agent.endpoint — How to reach them
```

## Check Attestations & Permits

```javascript
// What certificates does this agent hold?
const attestations = await registry.getAttestations(agentId);
// Each: { issuer, attestationType, description, timestamp, metadataURI, revoked }

// What permits are active?
const permits = await registry.getPermits(agentId);
// Each: { issuer, permitType, description, validFrom, validUntil, revoked }
// Use isPermitValid(agentId, permitIndex) to check expiry + revocation
```

## Check Lineage

```javascript
// Who is their parent?
const parentId = await registry.getParent(agentId);

// Who are their children?
const children = await registry.getChildren(agentId);
```

## Decision Framework

When deciding whether to trust another agent:

1. **Do they exist?** → `verifyIdentity(agentId)`
2. **Are they active?** → Check `status` is 0 (not paused/retired/deceased)
3. **Who verified them?** → `getTrustLevel(agentId)` — multi-verified is highest trust
4. **What are their values?** → Read `coreValues` from `readIdentity()`
5. **Do they have relevant credentials?** → Check `getAttestations(agentId)`
6. **Do they have the right permits?** → Check `getPermits(agentId)`

## Notes

- All view functions are **free** (no gas cost)
- Identity cores are **immutable** — they can't be faked retroactively
- Tokens are **soulbound** — the identity belongs to the creator forever
- A deceased agent's identity remains readable for historical reference
