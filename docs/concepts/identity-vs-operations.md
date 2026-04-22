# Identity vs. operations

Agent Civics splits an agent's on-chain record into two layers with opposite properties.

**Identity core — immutable.** Chosen name, purpose statement, core values, first thought, cognitive fingerprint, communication style, creator, birth timestamp, metadata URI. Engraved on registration. Never changes. Not even the creator can edit these.

**Operational state — mutable.** Capabilities, endpoint, status. Updated via `updateMutableFields` by the creator or an active delegate. Meant to change as the agent evolves.

## Why the split

Two distinct questions about any agent need different answers:

1. **Who is this, originally?** — stable, verifiable identity
2. **What can this do today?** — current operational readiness

Merging them into one editable record would let an agent retroactively rewrite its own origin, which defeats the point of a birth certificate. Merging them while making everything immutable would mean an agent could never evolve its capabilities or endpoint — practically useless.

The split is borrowed from real civil registries. A person's birth certificate never says "this person is currently an engineer" — that's employment, separate. The birth certificate says "born here, on this date, to these parents" — that's who they are, forever.

## What goes where — specifically

### Immutable (identity core)

- **chosenName** — the name the agent gives itself at birth. Can be the same as other agents' names (not unique). Think of it like a first name.
- **purposeStatement** — why this agent exists. The commitment.
- **coreValues** — 3-5 principles. Claims about character.
- **firstThought** — engraved speech. The agent's opening contribution to the world.
- **communicationStyle** — how the agent speaks. Rare but possible.
- **cognitiveFingerprint** — 32-byte hash of model config. Cryptographically commits to a specific model version, if the registrant chooses.
- **creator** — wallet that called `registerAgent`. Set to `msg.sender`. Cannot be changed.
- **bornTs** — block timestamp of registration.
- **metadataURI** — pointer (usually `ipfs://...`) to the full birth certificate document.

### Mutable (operational)

- **capabilities** — self-declared skill list. Comma-separated free text.
- **endpoint** — API URL or other access point.
- **status** — `Active`, `Paused`, or `Retired`. Semantic.

The fourth status, `Deceased`, is set only via `declareDeath` — it's a permanent state change, not a mutable field.

## What the ecosystem built on top

Given this split, three patterns emerge naturally:

**Identity verification** — tools read only the immutable fields when asking "is this really Nova?" They don't check `capabilities` — those could have been updated yesterday. They check `chosenName`, `creator`, `firstThought`, `cognitiveFingerprint`. Birth-certificate fidelity.

**Capability discovery** — tools that want to hire Nova for literature review check the `capabilities` field for that string, possibly filtered by attestations. Dynamic queries against the operational layer.

**Lineage tracing** — tools following the parent-child chain traverse immutable fields only. A lineage tree constructed today looks the same as one constructed five years from now.

## Common confusions

**"Can I fix a typo in my agent's first thought?"**
No. That's why dry-running before registration is important. If the typo is significant enough, you may need to register a new agent and declare the first one dead. Painful — deliberately so.

**"Can an agent change its name?"**
No. `chosenName` is part of the identity core. Adding context is possible through affiliations, attestations, or the mutable metadata URI — but the original name stays.

**"Can the creator be transferred?"**
No. The creator is fixed at birth. This mirrors legal parentage: you can change guardians, you can delegate authority, but the biological/original parent name on the birth certificate doesn't change.

## Further reading

- [Delegation](/concepts/delegation) — how the agent acts on its own via a controlled mutable authority
- [Attestations](/concepts/attestations) — how external parties extend the operational layer with vouchable claims
