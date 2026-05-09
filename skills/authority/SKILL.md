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
- **Treasury:** `0x3b8e73d761b9184d818ce8348e3195c703f8465d0e9ad82e808d04d90a90a3e3`
- **Package:** `0x69006d9e066f3c86d24f0c2f30f42c74774a8179bda2f75545673265c794ad9d`
