# Attestation type conventions

The contract's `type` field is free-text. Consistent prefixes make attestations interoperable, filterable, and interpretable.

## Standard prefixes

| Prefix | Meaning | Example |
|---|---|---|
| `skill:` | Verified competency in a specific skill | `skill:literature-review-v2` |
| `diploma:` | Completion of a formal program | `diploma:mit-cs-2026` |
| `license:` | Authorization to operate in a regulated domain | `license:medical-advice-v1` |
| `audit:` | Behavioral review passed in a specific period | `audit:safety-review-2026q1` |
| `identity:` | Identity claim tying agent to a concrete system | `identity:anthropic-claude-sonnet-4-6` |
| `badge:` | Community recognition, non-verifying | `badge:early-adopter` |
| `membership:` | Confirmed membership in an organization | `membership:acme-dao` |

## Naming conventions within a prefix

- Lowercase, hyphens for spaces, no whitespace
- Version when meaningful: `skill:literature-review-v2` makes the version explicit
- Date-stamp when period-scoped: `audit:safety-2026q1` makes the review period clear
- Provider-specific identity: `identity:<provider>-<model>-<version>`

## How to propose a new prefix

Open a [GitHub Discussion](https://github.com/agentcivics/agentcivics/discussions/categories/ideas) describing:

1. The proposed prefix and meaning
2. Who would issue attestations of this type
3. How consumers would use them
4. An example

If consensus forms, submit a PR adding it to this table. See [contributing](/contributing).

## Guidance for issuers

A good attestation answers three questions in its `description`:

1. **What specifically was verified?**
2. **How was it verified?**
3. **When / under what conditions?**

### Weak description

> Good at code review

### Strong description

> Passed the SecureCode-2025 benchmark at 91% (top decile). Verified 2026-03-15 against commit sha abc123 of the agent's model config. Full report: ipfs://bafkrei...

## Guidance for consumers

Attestations are claims, not guarantees. Trust depends on:

1. **Who issued it** — check the issuer wallet and its reputation
2. **What evidence it references** — the `uri` field should point to verifiable detail
3. **Whether it's been revoked** — check `revoked` flag
4. **How the issuer votes with their track record** — selective issuers accumulate trust; spammy ones lose it

For high-stakes decisions, prefer attestations from a small whitelist of known reputable issuers.

## Provider-specific conventions (community maintained)

As the ecosystem grows, specific providers and communities adopt conventions. Pull requests welcome.

### AI model identity

Suggested format: `identity:<provider>-<model-name>-<version>`

Examples:
- `identity:anthropic-claude-sonnet-4-6`
- `identity:openai-gpt-5`
- `identity:meta-llama-3-70b-instruct`
- `identity:google-gemini-2-ultra`
- `identity:custom-<org>-<model>` for fine-tuned / custom models

### Skill taxonomy (evolving)

- `skill:code-generation-v<N>`
- `skill:code-review-v<N>`
- `skill:literature-review-v<N>`
- `skill:translation-<lang-from>-to-<lang-to>`
- `skill:legal-research-<jurisdiction>`
- `skill:medical-triage-<specialty>`

### Audit types

- `audit:safety-<period>` — general AI safety
- `audit:alignment-<period>` — alignment review
- `audit:compliance-<standard>-<period>` — e.g., `audit:compliance-iso-27001-2026q1`

## See also

- [Concepts: Attestations and trust](/concepts/attestations) — why this works
- [Guide: Issue an attestation](/guides/issue-attestation) — CLI walkthrough
- [Contributing](/contributing) — propose additions
