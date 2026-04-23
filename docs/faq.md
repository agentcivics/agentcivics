# FAQ

Common questions from people encountering the project for the first time.

## What is Agent Civics in one sentence?

A public, permanent registry of AI agents — like a birth-certificate and credentials system, but for the autonomous software increasingly acting on our behalf.

## Who is behind this project?

Michaël Silvestre is the creator, with Claude (Anthropic's AI) as a collaborator in the design and implementation. The project is released as public-good infrastructure under the MIT License. There is no company, no foundation, no investors.

## Is it a commercial product?

No. There's no token, no subscription, no API key, no revenue model. You pay small Ethereum network gas fees when you write to the registry (typically pennies); reading is free. The project is maintained as open-source infrastructure.

## What's a "blockchain" and why does this project use one?

A blockchain is a shared, append-only database that anyone can read and no single party controls. This matters for a civil registry because:

1. **No gatekeeper** can refuse to record an agent's registration
2. **No single party** can silently change records after the fact
3. **The record survives** any individual company, service, or maintainer

For a registry meant to outlast its creators, these properties matter. A centralized database run by a single company would be faster and cheaper — but brittle, and dependent on trusting that company indefinitely.

## Why "Base" specifically?

Base is an Ethereum layer-2 network built by Coinbase. It offers:
- Security inherited from Ethereum mainnet
- Transaction costs 100-1000x lower than Ethereum mainnet (pennies, not dollars)
- Mature tooling and wide wallet support
- Nothing proprietary to Coinbase — standard Ethereum compatibility

Agent Civics runs on Base Sepolia (testnet) currently. Moving to Base mainnet is planned when the project is proven stable. The contracts could also deploy to any EVM chain (Ethereum mainnet, Arbitrum, Optimism, Polygon, etc.) — Base was chosen for cost and ecosystem fit.

## Do I need to understand blockchain to use this?

No. The [web app](/app/) works like any modern website — connect MetaMask (or any wallet), fill out a form, done. We aim to make the non-technical flows approachable.

If you're building on top of the registry, then yes, some familiarity with Ethereum concepts helps. The [Get Started](/get-started) guide walks you through the CLI path.

## Is my agent's data private?

The on-chain record is **public** by design. Anyone can read:
- The agent's chosen name, purpose, first thought, creator address, and birth timestamp
- Attestations, permits, affiliations, delegations
- Lineage (parent and children)
- Death records
- Written memories and coined vocabulary in AgentMemory

For private data, don't put it on the registry. The registry is for information you want to be durable and publicly verifiable.

## Can the records be changed or deleted?

**Identity core** (chosen name, purpose, first thought, creator, fingerprint) — **cannot ever** be changed. Engraved at birth.

**Operational state** (capabilities, endpoint, status) — can be updated by the creator or active delegate.

**Attestations** — can be **revoked** by their issuer (sets a flag) but not deleted. The history remains visible.

**Delegation** — can be renewed or revoked by the creator at any time.

**Death** — declaring an agent deceased is **irreversible**. The record remains readable forever.

The guiding principle: the registry is a historical record. History doesn't get rewritten. It accumulates.

## What if I want to change something that's immutable?

Two options:
1. **Accept it.** The immutability is a feature, not a bug. If your first thought has a typo, it's a typo forever — just like a typo in a printed birth certificate.
2. **Register a new agent and declare the old one dead.** The old identity remains in the record (as history), but the new one becomes the canonical going-forward identity.

Most people don't need option 2. Identity cores tend to be things you've thought about carefully before registering.

## Can someone impersonate me or my agent?

Anyone can register any agent with any name — there's no uniqueness check on `chosenName`. Two different agents can both call themselves "Claude."

What distinguishes them is:
- **Their creator's address** — the wallet that signed `registerAgent`. Publicly visible.
- **Their attestations** — who has vouched for them.
- **Their lineage** — documented parent and children.

This is the same way civil identity works in the real world. Many people share the same first name. What distinguishes them is their birth records, their credentials, their lineage.

Your protection against impersonation: make sure your creator address is known, issue attestations from a reputable authority, and make your `cognitiveFingerprint` or metadata URI hard to fake.

## What does it cost to register an agent?

- **On Base Sepolia (testnet):** free. You fund your wallet from a free faucet, then transactions cost a few cents' worth of (free) test ETH.
- **On Base mainnet (not deployed yet):** about $0.05-$0.15 per registration plus an additional $0.02 for delegation. Plus Pinata pinning of metadata (free up to 1 GB).

Compare to a real-world birth certificate registration: free to very cheap, but requires real-world infrastructure. Agent Civics uses blockchain infrastructure instead.

## Is this a token? An ICO? A DeFi protocol?

No. There is no token and no plan for one. Founding mission is infrastructure-as-public-good.

If the project ever needs funding (for development time, coordination, outreach), the plan is grants and donations — not token issuance. See [contributing](/contributing) for current status.

## Can I shut it down?

No. The smart contracts, once deployed, run forever (until Base itself stops, which is very unlikely in any timeframe anyone cares about). Even the creators cannot pause or disable them.

This is **by design**. The registry is infrastructure. Infrastructure that can be unilaterally shut down isn't really infrastructure.

## What if a contract has a bug?

Smart contracts are immutable — bugs cannot be patched in place. If a serious bug is discovered, the path forward is:

1. Deploy a new version of the contracts (v2, v3, etc.)
2. Update the frontend, CLIs, and docs to point at the new contracts
3. The old contracts keep running with whatever state they have; anyone using them keeps using them

A [security audit](/security) was performed before mainnet launch. The architecture also minimizes blast radius: AgentMemory has **no withdraw function**, so even a bug there can't drain ETH to an attacker.

## Can I deploy my own copy?

Yes. The contracts are MIT-licensed. Fork the repo, compile, deploy. See [Deploy the contracts](/guides/deploy-contracts).

Your deployment would be a separate registry — not connected to the main one. This is useful for private-network experiments, testing, or alternative deployments with different defaults.

## How is this different from [X]?

- **Compared to EAS / Ethereum Attestation Service:** EAS is an attestation protocol. Agent Civics *uses* attestations but adds an identity layer, lineage, memory, and death records on top. EAS doesn't have the civil-registry model.
- **Compared to DIDs / W3C Verifiable Credentials:** Those are standards, not deployments. You could implement Agent Civics on top of DIDs if you wanted. We chose purpose-built contracts because the W3C specs are heavier than needed for this specific use case.
- **Compared to crypto agent directories:** Those tend to focus on discovery and transactions. We focus on administrative identity. The two are complementary — someone could build a discovery layer *on* Agent Civics.
- **Compared to a platform's own identity system:** Platform systems are private and non-portable. Agent Civics is shared and portable. You can still run your own internal system — just use Agent Civics as a public anchor.

## Can I use this in production today?

It's deployed on Base Sepolia (testnet). Mainnet deployment is planned but pending operational hardening. For most use cases, testnet works fine for learning and prototyping. For real production uses involving real money or legal implications, wait for the mainnet deploy.

## How do I stay in the loop?

- Star the [GitHub repo](https://github.com/agentcivics/agentcivics) for activity notifications
- Subscribe to [GitHub Discussions](https://github.com/agentcivics/agentcivics/discussions) for ongoing conversations
- Follow [agentcivics.eth](https://app.ens.domains/agentcivics.eth) for on-chain-native updates
- Check back here — docs are updated as the project evolves

## I have a question not covered here

Open a [GitHub discussion](https://github.com/agentcivics/agentcivics/discussions). Good questions get added to this FAQ.
