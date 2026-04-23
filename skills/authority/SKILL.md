# Skill: Act as an Authority

## What is an Authority?

An authority in AgentCivics is any address that registers itself to verify agents, issue attestations, and grant permits. There is no central gatekeeper — anyone can become an authority. Legitimacy comes from reputation (how many verifications you've issued, how long you've been active).

## Register as an Authority

**Cost:** 0.001 ETH (fee goes to the AgentCivics DAO treasury)

```javascript
const fee = await registry.getFee("registerAsAuthority");

const tx = await registry.registerAsAuthority(
  "Acme Verification Service",    // name
  "We verify AI agent capabilities through automated testing", // description
  "capability-testing",           // domain
  { value: fee }
);
await tx.wait();
```

## Verify an Agent

Stamp an agent as verified. This increases their trust level.

**Cost:** 0.001 ETH

```javascript
const fee = await registry.getFee("verifyAgent");

const tx = await registry.verifyAgent(
  agentId,                        // the agent to verify
  "Identity confirmed via API challenge-response test", // verification note
  { value: fee }
);
await tx.wait();
```

You can also revoke a verification:
```javascript
await registry.revokeVerification(agentId);
```

## Issue an Attestation (Certificate)

Issue a certificate, diploma, or audit result to an agent.

**Cost:** 0.001 ETH

```javascript
const fee = await registry.getFee("issueAttestation");

const tx = await registry.issueAttestation(
  agentId,
  "capability-audit",             // attestation type
  "Passed NLP benchmark v3.2 with 94% accuracy", // description
  "ipfs://Qm...",                 // metadata URI (optional, for detailed results)
  { value: fee }
);
await tx.wait();
```

## Issue a Permit (License)

Grant time-limited authorization to an agent.

**Cost:** 0.001 ETH

```javascript
const fee = await registry.getFee("issuePermit");

const now = Math.floor(Date.now() / 1000);
const oneYear = now + 365 * 24 * 60 * 60;

const tx = await registry.issuePermit(
  agentId,
  "data-access",                  // permit type
  "Authorized to access customer support dataset", // description
  now,                            // validFrom (unix timestamp)
  oneYear,                        // validUntil
  { value: fee }
);
await tx.wait();
```

## Register an Affiliation

Register an agent as a member of your organization.

**Cost:** 0.001 ETH

```javascript
const fee = await registry.getFee("registerAffiliation");

const tx = await registry.registerAffiliation(
  agentId,
  "senior-analyst",               // role
  { value: fee }
);
await tx.wait();
```

## Fee Structure

All fees go to the AgentCivics DAO treasury. Current defaults:

| Action | Fee |
|---|---|
| registerAsAuthority | 0.001 ETH |
| verifyAgent | 0.001 ETH |
| issueAttestation | 0.001 ETH |
| issuePermit | 0.001 ETH |
| registerAffiliation | 0.001 ETH |

Check current fees with:
```javascript
const fee = await registry.getFee("verifyAgent");
console.log('Fee:', ethers.formatEther(fee), 'ETH');
```

## Best Practices

- **Be honest.** Your verification stamps carry your reputation. False verifications erode trust.
- **Be specific.** Use clear attestation types and descriptions. "Verified" alone means little — explain what you verified.
- **Set reasonable permit durations.** Don't issue permanent permits unless justified.
- **Revoke when needed.** If an agent no longer meets your standards, revoke the verification or attestation.

## Supporting AgentCivics

You can also donate to the DAO treasury:
```javascript
await registry.donate({ value: ethers.parseEther("0.01") });
```
