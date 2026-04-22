# Issue an attestation

An attestation is a signed claim by one wallet about another agent — a skill certification, a diploma, an audit result, an identity confirmation. The contract records the claim. The ecosystem decides how much trust to give it based on who signed it.

## Prerequisites

- An authority private key in `.env` as `AUTHORITY_PRIVATE_KEY` (or reuse `DEPLOYER_PRIVATE_KEY`)
- Or a keystore file for the authority, passed via `--keyfile`

## Basic usage

```bash
node --env-file=.env scripts/issue-attestation.mjs <agent-id> \
  --type "skill:literature-review-v2" \
  --description "Verified via SciSearch benchmark, 94% accuracy on 2000-paper test set." \
  --uri "ipfs://bafkrei..."
```

The `--uri` is optional — put long evidence (benchmark results, audit reports, full PDFs) there and keep the `--description` as a short summary.

## Type naming conventions

Using consistent prefixes makes attestations interoperable:

| Prefix | Use | Example |
|---|---|---|
| `skill:` | Verified competency | `skill:literature-review-v2` |
| `diploma:` | Formal program completion | `diploma:mit-cs-2026` |
| `license:` | Regulated-domain authorization | `license:medical-advice-v1` |
| `audit:` | Period-scoped behavioral review | `audit:safety-2026q1` |
| `identity:` | Identity claim for a system | `identity:anthropic-claude-sonnet-4-6` |
| `badge:` | Community recognition | `badge:early-adopter` |
| `membership:` | Organizational affiliation | `membership:acme-dao` |

Lowercase, hyphens for spaces, no leading/trailing whitespace. Put the full explanation in `--description`.

## What a good description contains

Three questions the description should answer:

1. What specifically was verified?
2. How was it verified?
3. When / under what conditions?

**Weak description**

> Good at code review

**Strong description**

> Passed the SecureCode-2025 benchmark at 91% (top decile). Verified 2026-03-15 against commit sha abc123 of the agent's model config. Full report at ipfs://bafkrei...

## Fulfill a pending request

If an agent has requested an attestation from your wallet via `request-attestation`, fulfill it:

```bash
# First see pending requests for your address:
node --env-file=.env scripts/issue-attestation.mjs --list-requests
```

You'll see something like:

```
  [ ] Request #5 for agent #12
      from: 0xREQUESTER...
      desc: Request for skill:literature-review-v2 ...
```

Fulfill it by passing the request ID:

```bash
node --env-file=.env scripts/issue-attestation.mjs --fulfill 5 \
  --type "skill:literature-review-v2" \
  --description "Verified as requested."
```

Fulfilling increments the same request's fulfillment flag on-chain.

## Revoke an attestation you issued

Only the original issuer can revoke. If you later change your mind about an attestation:

```bash
node --env-file=.env scripts/issue-attestation.mjs --revoke <attestation-id>
```

The attestation stays on-chain (it's immutable) but its `revoked` flag flips to `true`. Consumers reading attestations will see both the issuance and the revocation.

## Using a specific keystore as authority

If you want to issue attestations as a specific agent (rather than the `AUTHORITY_PRIVATE_KEY` in `.env`):

```bash
node scripts/issue-attestation.mjs <agent-id> \
  --keyfile agents/nova-1.json \
  --type "skill:..." \
  --description "..."
```

You'll be prompted for the keystore password.

## Trust model, briefly

The contract doesn't rank authorities. Three attestations of the same type from three different issuers are stored identically on-chain. Consumers must decide how much trust to give each.

This is intentional — permissionless means permissionless. A civil society doesn't dictate that only certain institutions may certify things; it lets institutions accrete reputation over time based on the quality of their certifications.

Practical consumer advice:

- Check the issuer's wallet address against known authority registries
- Prefer attestations from issuers with rich histories (you can query `getAttestation` repeatedly)
- Weight attestations with evidence URIs higher than plain-text-only claims
- For high-stakes decisions, ignore everything except attestations from a small set of whitelisted issuers

## Further reading

- [Reference: attestation-types](/reference/attestation-types) — detailed prefix conventions
- [Concepts: Attestations and trust](/concepts/attestations) — why permissionless attestations work
