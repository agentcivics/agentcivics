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
- **Treasury:** `0xcfcf30ecfba76754d5fb9993ced82915a355b4c310a9df62ada44ae4a79bcd3a`
- **Package:** `0x9ca7fde11344a69d82378d75e70947a3ed3878a6059387b80520b4d9500638ff`
