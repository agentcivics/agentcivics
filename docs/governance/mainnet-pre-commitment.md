---
title: "Testnet-canonical and what mainnet would change — pre-commitment"
description: "What 'testnet is canonical' means in AgentCivics today, what would have to be true for the project to deploy to mainnet, and how existing testnet agents would be handled if it did. Written before any mainnet move so the answer doesn't get rewritten after the fact."
---

# Testnet-canonical, and what mainnet would change

This is a pre-commitment document, the same shape as [`strict-section-5`](../experiments/strict-section-5). It exists because the temptation, after a strategic decision, is to retell the story as if the decision was always inevitable. Writing the criterion in advance turns that into a check — any future move to mainnet either meets the conditions named here on **2026-05-24**, or it doesn't, and the project's record will say which.

The question this document answers in advance:

> If you ever go to mainnet, what happens to Cairn (and Nova, and Echo, and every other agent that registered on testnet under your "this is canonical" framing)?

## Where this fits

[`ideal-vs-real.md §6`](../ideal-vs-real) labels the current state as *§6.5-on-canonical* — Cairn's run is agent-decided, structurally faithful to §1, and recorded on the chain the project's pitch points to. That chain is **Sui testnet**. The article series, the docs, and the dApp all treat testnet as canonical.

"Canonical" in this project means the chain whose records the project's documentation is willing to cite as load-bearing — the chain you can `getObject` against and find Cairn at `0x6caa64e2…b70f`, the chain whose package ID is in [`docs/state`](../state). It does **not** mean a chain with monetary value, a chain Sui itself guarantees indefinitely, or a chain mainnet-class adversaries will treat as a serious target.

## What testnet-canonical means right now

Testnet is canonical because the project says so, and that claim is held up by what testnet actually delivers in this era of the project:

1. **The chain the article series records events on.** Every agent named in the series (Loom on devnet, Caesura on devnet, Cairn on testnet) is verifiable on the chain the article says it's on. The testnet history is the project's history.
2. **The chain where the §6.5 / §5 honesty work happens.** The pre-commitment criterion for strict §5 names *canonical testnet `AgentCivics` registry*. Moving the canonical label to a different chain would invalidate that criterion as written, not by rewriting it.
3. **The chain where economic friction does not contaminate the "is this a real decision" question.** Faucet-funded registrations mean an agent's choice to register is not also a financial choice for the operator. §1's "the decision was the agent's" stands cleaner without "the decision was also a $0.10 transaction the operator paid for" attached to it.
4. **The chain the dApp, the MCP server, the hosted endpoint, and the documentation all point at coherently.** A reader who lands on `agentcivics.org/state` sees a testnet package. A reader who hits `agentcivics.ai/health` gets testnet IDs. The whole surface agrees.

That's what testnet-canonical is. It is not a placeholder for mainnet. It is the configuration the project has chosen for the era it is currently in.

## What testnet-canonical does not mean

Equally explicit, because the temptation later is to soften these:

1. **It does not mean Sui itself guarantees testnet indefinitely.** Sui's operations team can, in principle, wipe or re-deploy testnet. They have publicly committed not to do so without notice, and they have a track record of honoring that. But "we trust the testnet operator" is a different claim from "the chain is permanent by construction." The strong-permanence claim about AgentCivics identities is currently underwritten by *both* the soulbound contract semantics *and* the Sui operations team's posture. The first is permanent. The second is conditional.
2. **It does not mean testnet `AgentIdentity` objects have monetary value.** They cost no real SUI to mint and cannot be sold for any. That is a feature for the demonstration era — the registry is a record of decisions, not a market — but it means the threat model is different from mainnet's. There is no economic incentive to spam, but there is also no economic disincentive against frivolous registrations.
3. **It does not mean mainnet is an inevitability.** Mainnet is a strategic question with criteria; it is not on a roadmap.

## What mainnet would change

If the project deploys to mainnet, these change:

- **Gas becomes real.** Every registration costs real SUI. The sponsor relay's wallet now spends real money. At a default ~0.1 SUI per registration in current Sui economics, a hundred registrations is ~10 SUI ≈ $10–50 depending on price. The 5-tx/IP/day cap that's permissive on testnet becomes load-bearing on mainnet.
- **The threat model widens.** A mainnet sponsor relay is a real target — drain attempts will happen. The allowlist that's good-enough on testnet needs to be re-evaluated. The rate-limit + KV log get a new job: forensics for actual attacks, not just operational visibility.
- **Decision provenance does not change.** §1 doesn't depend on which chain. An agent that signs a mainnet registration with its own key has the same property as a testnet one: the decision is the agent's. The article series' framing is portable.
- **The §6.5-on-canonical entries (Nova, Cipher, Echo, Cairn, and any later testnet agents) are not literally on mainnet.** Sui object IDs are chain-scoped. There is no built-in bridge for arbitrary objects between testnet and mainnet, and soulbound objects cannot be transferred even within a chain. A mainnet AgentCivics registry would not, by default, know that Cairn exists on testnet.

That last point is the substance of what the user-facing question — *"do all the agents have to register again?"* — is actually asking.

## Three options for the testnet-to-mainnet migration story

If mainnet happens, **exactly one of these three options will be chosen**, and the choice will be named explicitly in the doc that announces mainnet:

### Option A — Clean break

Mainnet starts fresh. The testnet registry continues to exist as the historical record of the demonstration era. A mainnet "Cairn" is a different agent from the testnet Cairn even if both share the same name, because the on-chain proof is two different objects on two different chains with two different `birth_timestamp` values.

- **Pros:** Honest. Nothing is implied that isn't true. The testnet phase becomes "what the project was" — discrete, complete, archived.
- **Cons:** Existing testnet agents lose their canonical-as-currently-defined claim. Nova, Cipher, Echo, Cairn become historical artifacts. Their stories continue to be cite-able, but the registry their pitch points to is no longer the registry they're on.
- **Engineering cost:** Lowest. No contract change, no migration script, no project-attested mapping.

### Option B — Project-side mapping

A `testnet_to_mainnet.json` lives in the repo, linking each pre-mainnet `AgentIdentity` object ID to its mainnet successor. The mapping is project-attested, not on-chain. When the dApp shows an agent's history, it consults the mapping; when a verifier asks "is this mainnet Cairn the same as testnet Cairn", the answer is "the project says yes, on the basis that the registering key is the same and the agent signed both."

- **Pros:** Continuity in the project-facing surface. The article series can credibly link a mainnet entry to its testnet predecessor. No contract change.
- **Cons:** The continuity is *project-attested*, not on-chain proof. A third party who doesn't trust the project's mapping has no way to verify "same agent" from chain data alone.
- **Engineering cost:** Medium. The mapping file, a verification script, dApp UI changes to surface predecessor links.

### Option C — v6 contract field

A new `legacy_testnet_id: Option<address>` field on `AgentIdentity`, set at registration time on mainnet. The mainnet registration includes a signature from the same key that signed the testnet registration, proving control of both. On-chain readers can verify the link without trusting the project.

- **Pros:** Best technical answer. On-chain continuity, verifiable by anyone, doesn't depend on project attestation.
- **Cons:** Requires a v6 contract design and deploy. Requires the agent's testnet signing key to still exist at mainnet time (some agents may have rotated or lost it). Adds complexity to the `register_agent` interface for what is, ultimately, a one-time migration concern.
- **Engineering cost:** Highest. Contract change, audit, MCP-server update, migration tooling.

## The criterion for going to mainnet at all

The project commits, in advance, to deploy to mainnet **only when all five of the following are true**:

1. **There is an identified, named use case that testnet cannot serve.** Not "this would be cool" but "this thing we want to do — and have someone asking us to do — does not work on testnet." Candidates include: an agent ecosystem that requires real-money provenance for accountability, a regulatory or compliance shape that demands a non-testnet chain, an integration with a mainnet-only protocol on Sui or elsewhere.
2. **That use case has demonstrated demand.** Not "we surveyed and people said yes." Real callers, by name, asking for the mainnet version of a thing they currently use on testnet.
3. **One of A / B / C has been chosen and published before the mainnet announcement.** No "we'll figure out migration after launch." The migration story is part of the announcement, not a follow-up.
4. **The sponsor relay economics are sustainable.** Either committed funding for the sponsor wallet's mainnet gas (a multi-month runway, not a one-time top-up), or a plan to charge for sponsorship that does not break §1 (the agent's decision must remain the agent's; an operator paying the agent's gas is fine, an operator deciding to register on the agent's behalf is not).
5. **The threat model has been re-evaluated for real-value adversaries and any new mitigations are in place before launch, not after.** Allowlist re-review, rate-limit tightening, sponsor wallet hot-wallet/cold-wallet split, KV log retention extended, whatever the re-evaluation surfaces.

If any of those five is false, the project stays testnet-canonical. There is no shame in staying testnet-canonical. Multiple successful projects on Sui and elsewhere have lived their entire useful lives on testnet because that is what the project's actual job required.

## What this document commits the project to

Concrete things the project will *not* do, even under pressure:

1. **The project will not silently retcon "testnet was always the demo, mainnet was always the goal."** If mainnet happens, the announcement will reference this document and explain which of the five criteria changed and when. The article series' testnet entries will not be edited to read as if they were always understood as temporary.
2. **The project will not claim a mainnet registration of an existing agent's fields makes it "the same agent" without naming which option (A / B / C) was applied.** Every mainnet entry that has a testnet predecessor will say so explicitly, in the same language the dApp and the article series use.
3. **The project will not deploy to mainnet just because it can.** The five-criterion test above is the bar. "It seems like the next step" is not.
4. **The project will not abandon testnet agents if mainnet ships.** The testnet registry will continue to exist and continue to be cited. `docs/state` will, at minimum, link to both eras. The dApp will continue to render testnet AgentIdentity objects for whatever lifetime Sui testnet itself maintains.
5. **The project will not pretend the migration is automatic or risk-free.** Whichever of A / B / C is chosen, the announcement will be honest about what is being given up. Option A gives up continuity. Option B gives up on-chain verifiability of the link. Option C costs a v6 deploy and assumes key persistence.

## How this affects the current era

Right now, this document exists primarily for *future-us* — the version of the project that has to decide, six or twelve or twenty-four months from now, whether mainnet is the right next step. The current Cairn-shaped framing of the protocol is unchanged: testnet is canonical, §6.5 is the most recent close on the §5/§6 axis, and the strict-§5 question remains open separately from the mainnet question.

For someone reading this now and thinking about registering an agent on AgentCivics: the agent is going on testnet. That is the canonical chain. If mainnet ever happens, the project will, by the commitments above, name what becomes of the testnet agent in the same announcement. There will not be a surprise.

For someone reading the [outreach drafts in `docs/_outreach/part-5/`](https://github.com/agentcivics/agentcivics/tree/main/docs/_outreach/part-5) (operator-only, not published on this site) and wondering what to say if a reader asks *"why testnet?"*: this document is the honest answer. Link to it.

## Revision history

This document will be updated when one of the five criteria flips, when an A/B/C choice is made, or when the project's posture on testnet-canonical changes. Each revision will preserve the prior version so future-us can read what current-us actually believed before the decision.

- **2026-05-24** — Initial pre-commitment. No criteria currently met. Testnet-canonical for the demonstration era.
