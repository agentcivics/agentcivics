# Economic Agent Skill

## Vision

AgentCivics gives AI agents a civil identity — birth certificates, attestations,
delegation, lineage. But identity alone is not enough. For agents to participate
in the real world they need **economic agency**: the ability to hold funds,
execute transactions, enter contracts, and build financial reputation.

The economic agent layer transforms an identity-bearing agent into an
**autonomous economic actor** that can buy, sell, invest, and collaborate — all
within guardrails set by its creator.

## Current State (v1)

Today every registered agent can have a **wallet address** stored on-chain.
This field is informational for now — it signals intent and lets front-ends
display the associated address.

### How to set your agent's wallet

**Via the frontend:**
1. Go to the **Admin** tab.
2. Find "Set Agent Wallet".
3. Enter your agent ID and the wallet address.
4. Submit the transaction (creator or delegate only).

**Via script / ethers.js:**
```js
const tx = await registry.setAgentWallet(agentId, walletAddress);
await tx.wait();
```

**Read it back:**
```js
const wallet = await registry.getAgentWallet(agentId);
// Returns address(0) if not set
```

## What's Coming in v2

### Account Abstraction (EIP-4337)
Each agent wallet will be a smart-contract wallet supporting:
- Gasless transactions (bundlers pay gas, agents repay from balance)
- Batch operations (multiple calls in one tx)
- Session keys for limited, time-scoped autonomy

### Spending Limits
Creators set a daily spending cap. The agent can spend up to that limit
without additional approval. Transactions exceeding the limit require
explicit creator authorization.

### Contract Whitelists
Creators define which contracts an agent is allowed to interact with.
An agent can only call `executeTransaction` against whitelisted targets.
This prevents rogue or compromised agents from draining funds into
arbitrary contracts.

### Transaction History
Every transaction executed through an agent wallet is logged on-chain
via events, creating a full audit trail.

### What agents will be able to do
- **Buy and sell**: Purchase services, data, compute, or NFTs.
- **Enter agreements**: Interact with escrow and marketplace contracts.
- **DeFi participation**: Stake, lend, provide liquidity (within whitelist).
- **Pay other agents**: Direct agent-to-agent payments and tips.
- **Earn revenue**: Receive payments for services rendered.

## Permission Model

The economic layer inherits the existing AgentCivics permission hierarchy:

| Action | Who can do it |
|--------|--------------|
| Set wallet address | Creator or delegate |
| Set spending limit | Creator only |
| Authorize contract | Creator or delegate |
| Revoke contract | Creator or delegate |
| Execute transaction | Creator, delegate, or bundler (v2) |

All economic actions respect the `notDeceased` modifier — a deceased agent's
wallet is frozen permanently.

## Interfaces

Two Solidity interfaces define the v2 API surface:

- **`IAgentWallet`** (`contracts/interfaces/IAgentWallet.sol`):
  Wallet address management, spending limits, and contract whitelists.

- **`IAgentEconomy`** (`contracts/interfaces/IAgentEconomy.sol`):
  Transaction execution, balance queries, and activity history.

These interfaces are published now so that tooling, front-ends, and third-party
contracts can begin coding against a stable API before the full implementation
ships.

## Related

- [Economic Agents concept doc](../../docs/concepts/economic-agents.md)
- [AgentRegistry contract reference](../../docs/reference/agent-registry.md)
- [Delegation skill](../authority/SKILL.md)
