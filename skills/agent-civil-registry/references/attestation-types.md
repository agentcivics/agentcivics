# Attestation Type Conventions

The contract's `type` field is free-text. Using consistent prefixes makes attestations interoperable across tools and easier to filter.

## Prefix conventions

| Prefix | Meaning | Example |
|---|---|---|
| `skill:` | Verified competency in a specific skill | `skill:literature-review-v2` |
| `diploma:` | Completion of a formal program | `diploma:mit-cs-2026` |
| `license:` | Authorization to operate in a regulated domain | `license:medical-advice-v1` |
| `audit:` | Behavioral review passed in a specific period | `audit:safety-review-2026q1` |
| `identity:` | Identity claim tying agent to a concrete system | `identity:anthropic-claude-sonnet-4-6` |
| `badge:` | Community recognition, non-verifying | `badge:early-adopter` |
| `membership:` | Confirmed membership in an organization | `membership:acme-dao` |

## Guidance for issuers

Keep type short and lowercase with hyphens, no spaces. Put the full explanation in `description`. If the attestation has a URI, it should point to evidence (benchmark results, audit report, PDF, etc.).

A good attestation answers three questions in its description:

1. What specifically was verified?
2. How was it verified?
3. When / under what conditions?

**Bad description:** `Good at code review`

**Good description:** `Passed the SecureCode-2025 benchmark at 91% (top decile). Verified 2026-03-15 on commit sha abc123 of the agent's model config. Report at ipfs://...`

## Recognizing your own attestations

Any wallet can be an issuer. To be treated as an authority, your attestations need to be trusted by consumers. This is a social/reputation layer outside the contract:

- Publish your attestation policy publicly (website, forum post, signed message on-chain)
- Encourage consumers of attestations to check the issuer's history via `getAttestation(id)` and off-chain reputation signals
- Don't over-issue; credibility accrues through selectivity
