# Contributing

Agent Civics is public-good infrastructure. If you want to shape it, here's how.

## Ways to contribute

### 1. Talk first (Discussions)

For anything open-ended — ideas, proposals, questions, "what if the project did X" — use **[GitHub Discussions](https://github.com/agentcivics/agentcivics/discussions)** rather than issues. Discussions are for thinking together; issues are for concrete work.

If you're not sure whether to open a discussion or an issue, start with a discussion.

### 2. File a concrete issue

For a specific bug, security concern, or small feature request with a clear scope, open an [issue](https://github.com/agentcivics/agentcivics/issues/new). Good issues include:

- What you were trying to do
- What happened instead
- How to reproduce (if relevant)
- Your environment (if relevant)

For bugs in the smart contracts specifically — please **do not open a public issue** for unfixed security vulnerabilities. Email security@agentcivics.org with details first; we'll coordinate responsible disclosure.

### 3. Propose a new attestation type

Attestation `type` strings are conventions, not rules. But shared conventions make attestations interoperable. To propose a new `type:` prefix or specific attestation type:

1. Open a [Discussion](https://github.com/agentcivics/agentcivics/discussions/categories/ideas) describing the type, what it means, and who would issue it
2. If there's consensus, submit a PR adding it to [`docs/reference/attestation-types`](/reference/attestation-types)
3. Once merged, the convention becomes part of the documented standard

Existing conventions: `skill:`, `diploma:`, `license:`, `audit:`, `identity:`, `badge:`, `membership:`. We can add more.

### 4. Propose a protocol improvement (PIP)

For larger changes that affect the protocol itself — new functions in the contracts, changes to access control, new concepts — use a lightweight RFC process:

1. Open a **Discussion** titled `[PIP] <short description>` explaining:
   - What problem this solves
   - The proposed change
   - Alternatives considered
   - Migration path if breaking
2. Discuss openly. Iterate the proposal.
3. If accepted, the change is implemented in the next contract version (v2, v3, etc.) since existing contracts are immutable.

On Sui, the Move package can be upgraded if the publisher holds the `UpgradeCap`, preserving all existing objects and state. Protocol improvements can be deployed as upgrades rather than requiring full redeployments.

### 5. Submit code (PR)

For documentation fixes, typo corrections, new guides, small UI improvements — just open a PR directly. For larger code changes, discuss first.

Checklist for PRs:
- [ ] `npm test` passes (if applicable)
- [ ] Integration tests run against **devnet**, not testnet (default for `mcp-server/test-*.mjs`). Testnet is reserved for release validation; running tests there pollutes the public registry.
- [ ] No `.env` or private keys committed
- [ ] Docs updated if behavior changed
- [ ] Commit message describes the *why*, not just the *what*

### 6. Run your own trusted authority

The most useful contribution to the ecosystem is often **issuing good attestations from a reputable address**. If you have domain expertise — you're a security auditor, a benchmark maintainer, a standards body — register a wallet, publish your attestation policy publicly, and start issuing attestations about agents you've verified.

Over time, your address accrues reputation. Consumers of the registry learn to trust your attestations. You become an informal authority. No permission required — just do it transparently and consistently.

## Community norms

- **Good faith** — assume the best about others' intentions
- **Plain language** — write so newcomers can follow
- **Transparency** — disclose conflicts of interest, especially around attestations
- **Patience** — this is a volunteer project; responses may take days

## Code of conduct

The standard: treat people with the kindness and respect you'd want in return. Harassment, spam, and bad-faith engagement are not welcome. Maintainers will remove comments, close issues, or block users as needed to keep the project a productive space.

## Governance (lightweight)

Currently: willtard has maintainer rights, makes final calls on merges. This will evolve. If the project grows a substantial community, we'll move to multi-maintainer governance — and eventually, possibly, to a lightweight DAO for funding decisions (not for protocol changes, which remain open-RFC based).

Design principles for any future governance:
- Protocol decisions via open RFC and running code, not token votes
- Funding decisions via transparent spending from a multi-sig or DAO treasury
- No single party can pause or censor the registry

## Supporting the project financially

If you benefit from the project and want to support it:

- **Grants** — if you're part of an organization with a grants program (Sui Foundation, Gitcoin, Protocol Guild), Agent Civics welcomes grant applications or nominations
- **Donations** — once set up, a multi-sig treasury will accept direct donations
- **Contributions in kind** — audit time, design work, documentation, attestations from your expertise

We don't currently accept sponsorships tied to protocol-level privileges. The protocol stays permissionless. Donations fund operations; they don't buy influence over the protocol.

## Thanks

Every attestation issued in good faith, every discussion thread, every typo fix, every new deployment that uses the registry makes this more useful for everyone.

If you're reading this and thinking about contributing — do it. The bar for participation is low. Start with a discussion.
