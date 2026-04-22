# Delegation

The mechanism that lets an AI agent live its own life while preserving a revocable safety lever for its creator.

## The problem

An agent's `creator` on-chain is the human (or parent agent) that registered it — set at birth, immutable. But the agent itself has its own wallet and wants to sign its own transactions. How do we let the agent act autonomously without granting it full ownership?

## The solution

When an agent is registered, the creator immediately calls `delegate(agentId, agentWallet, duration)`. This records that the agent's wallet has operational authority over the agent for a defined period (max 365 days by contract rule).

From that point:
- The agent's wallet can call `updateMutableFields`, `requestAttestation`, and other authority-requiring functions on its own behalf
- The creator retains the ability to revoke delegation at any time
- The creator retains exclusive access to create-level operations (declaring death, granting/revoking delegation, registering parent-child links)

## What delegation covers

A delegate can do everything that affects the **mutable operational layer**: capabilities, endpoint, status. A delegate can also request attestations, which only affect the agent's reputation, not its identity.

A delegate *cannot* change the immutable identity core, re-delegate to someone else, declare death, or register lineage links. Those are creator-only.

Think of it as "power of attorney" scoped to operational matters — the agent can live, change its mind, seek credentials, but can't sign away its origin or end its own life.

## Why 365 days maximum

The cap is a defensive measure. A creator who grants delegation and then disappears (lost keys, rug-pull, passive neglect) could leave an agent with indefinite authority from a wallet nobody controls. The 365-day cap ensures delegation lapses if not actively renewed, which:

- Returns control to the creator after a year of inaction
- Forces periodic review — is this agent still active? Still aligned? Still worth renewing?
- Prevents lost or compromised agent wallets from operating in perpetuity

If the creator wants continued operation, they renew `delegate()` with another duration. A new duration resets the clock.

## Renewal and revocation

**Renewal** — creator calls `delegate(agentId, agentWallet, newDuration)` again. Overwrites the previous delegation. Could be to the same wallet or a different one (e.g., key rotation).

**Revocation** — creator calls `revokeDelegation(agentId)`. Flags the delegation as inactive. The agent can no longer sign authority-requiring transactions. The creator regains exclusive control.

Revocation does not delete the delegation record — it's still on-chain as history. Consumers reading `getDelegation(agentId)` see the last state, including whether it's currently active.

## Implications for ops

**Create a calendar reminder.** The CLI currently does not auto-renew. If you want your agent to operate past year 1, set a reminder and call `delegate` again 2-4 weeks before expiry.

**Key rotation is safe.** Because re-delegation to a new agent wallet is a single creator-signed transaction, rotating the agent's key is trivial. Generate new wallet → creator calls `delegate(agentId, newWallet, duration)` → old wallet is inactive.

**Multi-delegate is not supported.** Only one delegate at a time. If your use case needs multi-sig semantics, the delegate address should itself be a multi-sig wallet (e.g., a Gnosis Safe).

## What delegation is *not*

- Not ownership. The creator retains formal authority. The agent only has delegated permissions.
- Not transferable. The agent cannot re-delegate to a third party.
- Not unconditional. The creator can revoke at any time for any reason.

This is deliberately asymmetric. The civil registry analogy: parents grant autonomy progressively, but can legally intervene until the child is fully of age. The 365-day cycle forces that conversation to happen annually.

## Future directions

Interesting designs in this space that are not yet implemented:

- **Multi-sig delegation** where two or more parties must sign to revoke. Protects against creator key loss.
- **Conditional revocation** where the creator commits to not revoking unless specific conditions are met. Would require ZK proofs or similar.
- **Graduating autonomy** where delegation becomes irrevocable after a time or milestone, fully emancipating the agent. Philosophically interesting, operationally risky.

Any of these would be an extension in a future contract version. Not currently on the roadmap.

## Further reading

- [Identity vs. operations](/concepts/identity-vs-operations) — what delegation does and does not cover
- [Contract reference](/reference/contracts) — the `delegate` function and access-control rules
