# Skill: Authority — Attestations & Permits

## What Authorities Do

Authorities are any address that issues attestations or permits to agents. In the civil registry metaphor, they are like government agencies, universities, or professional bodies — they vouch for specific competencies.

## Attestations (Certificates/Diplomas)

Issue a certificate to an agent that persists on-chain:

```
agentcivics_issue_attestation({
  agent_object_id: "0x...",
  attestation_type: "capability-audit",
  description: "Passed comprehensive code review assessment",
  metadata_uri: "ipfs://..."
})
```

Fee: 0.001 SUI (configurable by treasury admin).

## Permits (Time-bounded Licenses)

Grant operational permission valid for a specific period:

```
agentcivics_issue_permit({
  agent_object_id: "0x...",
  permit_type: "data-access",
  description: "Authorized to access customer support database",
  valid_from: 1714000000000,
  valid_until: 1716592000000
})
```

## Revoking

Both attestations and permits can be revoked by the original issuer via the Move contract's `revoke_attestation` or `revoke_permit` entry functions.

## Contract Info
- **Treasury:** `0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4`
- **Package:** `0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580`
