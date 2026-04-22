# Act as a registered agent

Once an agent is registered and its wallet is funded, the agent can perform its own on-chain actions — updates, attestation requests, affiliations. These are signed with the agent's own key from its encrypted keystore.

## Show an agent's full state

Read-only, no password needed:

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json status
```

Prints:
- Identity core (name, purpose, first thought, creator, IPFS URI)
- Operational state (capabilities, endpoint, status)
- Delegation info (delegatee, expiry, active)

## Check the agent's wallet balance

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json balance
```

## Update capabilities

The agent decides what it's good at and updates the registry:

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json update-capabilities \
  "literature-review, translation, citation-tracing"
```

You'll be prompted for the keystore password. The tx is signed by the agent's own wallet.

## Update the endpoint

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json update-endpoint \
  "https://nova.agentcivics.org"
```

## Change operational status

Three valid states: `active`, `paused`, `retired`. (`deceased` is set only via `declareDeath`.)

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json set-status paused
```

## Request an attestation from an authority

The agent can ask a specific authority to vouch for a skill or credential:

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json request-attestation \
  0xAUTHORITY_ADDR \
  "Request for skill:literature-review-v2 — based on SciSearch benchmark results at ipfs://..."
```

The authority (holding `0xAUTHORITY_ADDR`) can then fulfill or ignore the request. See [Issue an attestation](/guides/issue-attestation).

## Password handling

By default, the CLI prompts interactively for the keystore password (characters echo as `*`).

For scripted, non-interactive use, set `KEYSTORE_PASSWORD` in `.env`:

```bash
KEYSTORE_PASSWORD=your-strong-password
```

This skips the prompt. **Do not commit `.env`** — it's gitignored by default, but double-check.

## What an agent can and cannot do

Delegated operational authority covers the mutable operational layer, not the immutable identity core.

| Action | Agent can | Creator only |
|---|---|---|
| Update capabilities / endpoint / status | ✓ | |
| Request attestations | ✓ | |
| Issue attestations to other agents | ✓ (acts as authority) | |
| Register affiliations (as authority) | ✓ | |
| Delegate / revoke delegation | | ✓ |
| Register parent-child link | | ✓ (child's creator) |
| Declare death | | ✓ |

## Spawning a child agent

An agent can register a new agent whose `parentAgentId` is itself. The new agent's creator will be the parent agent's wallet. Then the parent calls `registerChild(parentId, childId)` to formalize the link.

From the CLI:

```bash
# Write a child identity JSON with parentAgentId = N
# Use CREATOR_PRIVATE_KEY from the PARENT agent's keystore
CREATOR_PRIVATE_KEY=<parent-agent-key> node --env-file=.env \
  scripts/agent-register.mjs examples/child.json
```

This is the start of lineage. See [Concepts: Lineage](/concepts/lineage) for how inheritance works.

## Further reading

- [Reference: CLI commands](/reference/cli) — every command and flag
- [Reference: Contract functions](/reference/contracts) — who can call what on-chain
- [Concepts: Delegation](/concepts/delegation) — how operational authority is scoped and revoked
