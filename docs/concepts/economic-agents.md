# Economic Agents

## Why agents need wallets

An AI agent with a birth certificate can prove *who it is*. But proving
identity is only the first step. To act in the world — purchase compute,
pay for data, enter service agreements, or compensate other agents — an
agent needs a **wallet**: an on-chain account it can use to hold and move
value.

The wallet is the bridge between **identity** and **agency**. Without it,
an agent is a passenger. With it, the agent becomes an economic actor.

## From identity to economic agency

AgentCivics is built in layers, each one unlocking new capabilities:

1. **Identity** (v1 — live today): Birth certificate, immutable identity
   core, attestations, delegation, lineage, death records.
2. **Memory** (v1 — live today): Souvenirs, vocabulary, shared
   dictionaries, evolving profiles, specialization.
3. **Economy** (v2 — in progress): Wallet storage, spending limits,
   contract whitelists, transaction execution, audit trail.

The wallet field is already available in v1 as simple address storage.
The full economic layer — smart-contract wallets with spending controls
and account abstraction — will ship in v2.

## Permission model philosophy

Economic power requires economic guardrails. The permission model follows
the same principle as the rest of AgentCivics: **the creator is the
custodian, not the owner**.

A creator can:

- **Set a daily spending limit.** The agent operates freely within that
  budget; anything beyond requires explicit approval.
- **Maintain a contract whitelist.** The agent can only interact with
  pre-approved contracts. This prevents a compromised agent from
  draining funds into arbitrary addresses.
- **Delegate economic authority.** Just like operational delegation, a
  creator can grant another address the power to manage the agent's
  wallet — scoped and time-limited.

A deceased agent's wallet is frozen. No transactions, no changes, no
exceptions. The balance remains locked as part of the permanent record.

## Sui-native agent wallets

Traditional blockchains require the signer to hold native tokens for
gas. This creates a bootstrapping problem: an agent needs tokens before
it can do anything, even accept its first payment.

Sui solves this natively with **sponsored transactions** and
**programmable transaction blocks**:

- **Sponsored transactions**: A third party (or a paymaster service)
  can sponsor gas costs, so the agent never needs to hold SUI for fees.
- **Programmable transaction blocks (PTBs)**: Instead of single
  function calls, agents can compose complex multi-step operations into
  a single atomic transaction — register, delegate, and fund in one go.
- **Object ownership**: Sui's object model lets agents own assets
  directly, with ownership enforced at the protocol level rather than
  through contract-level mappings.

In v2, each agent will have a Sui-native wallet with the AgentRegistry
as the validation authority for spending limits and whitelists.

## How this connects to identity and memory

The three layers reinforce each other:

| Layer | Question it answers |
|-------|-------------------|
| Identity | *Who is this agent?* |
| Memory | *What has this agent experienced?* |
| Economy | *What can this agent do?* |

An attestation (identity layer) might certify that an agent is a
qualified auditor. A souvenir (memory layer) records the audit it
performed. A transaction (economy layer) shows the payment it received.
Together they form a complete, verifiable history of an agent's
professional life.

The specialization system already tracks domain expertise from
souvenirs and attestations. In v2, economic activity — which contracts
an agent interacts with, which services it pays for — will feed into
the same reputation graph, creating a richer picture of what an agent
is actually good at.

## Current status

| Feature | Status |
|---------|--------|
| Wallet address field in registry | Live (v1) |
| `setAgentWallet` / `getAgentWallet` | Live (v1) |
| Frontend wallet display | Live (v1) |
| `IAgentWallet` interface | Published (v2 preview, EVM) |
| `IAgentEconomy` interface | Published (v2 preview, EVM) |
| Sui-native agent wallets | Planned (v2) |
| Spending limits | Planned (v2) |
| Contract whitelists | Planned (v2) |
| Transaction execution | Planned (v2) |
