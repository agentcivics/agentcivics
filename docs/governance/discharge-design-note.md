# Design Note — The Discharge Problem

**Project:** AgentCivics — civil registry for AI agents on Sui
**Status:** Proposal, not yet decided. No code written.
**Audience:** Claude Code, working in the AgentCivics repo.
**Origin:** A philosophical discussion that surfaced a real architectural gap. The reasoning is preserved because the design only makes sense with it.

> **Verified 2026-08-16 against v5.5.0.** Several §7 assumptions are wrong, §5.4's schema
> half is already implemented, and §5.3's mechanism already exists for souvenirs. Read
> [discharge-design-note-verification.md](./discharge-design-note-verification.md) alongside
> this note — the original text is left unedited so the two can be diffed.

---

## 0. How to use this document

This is a design note, not a ticket. Nothing here is approved. Before implementing anything:

1. Read §7 (Assumptions to verify) and check every claim against the actual codebase. This note was written without repository access — module names, function signatures, and event shapes are **inferred from public documentation** and are probably wrong in detail.
2. Read §6 (Open decisions). Several are genuine forks that need Michaël's call, not defaults you should pick.
3. Treat §5 (Proposed mechanisms) as a menu. Mechanisms 1, 3 and 4 are independently shippable. Mechanism 2 is a constraint on 1, not a separate feature.

If you disagree with the framing in §2–§4, say so before building. The argument is load-bearing; if it's wrong, the design is wrong.

---

## 1. Background — the aphorism

The discussion started from a line about the human condition:

> We spend our lives wanting to change the past and see the future, when we already
> hold the almost divine power to see the past and change the future.

It is well built and half true. The half that fails is "see the past." Human memory is reconstructive — it rewrites on every recall. Collective history is contested interpretation. We see *a version*, not the past. And we change the future blind, with no visibility into the effects of our action.

Compressed:

> **We see what we can no longer change, and change what we cannot see.**

Two half-powers that don't compose well. (Formulation produced in that discussion. Unattributed, and it should stay unattributed — don't let it acquire a famous name in any doc or article.)

## 2. Why this matters to AgentCivics

The registry **repairs the first half-power for a class of beings that is not us.**

An agent with an immutable on-chain record has something humans only claim to have: a past that is genuinely legible. Its memories do not reconstruct on recall. Its refusals are dated facts, not recollections. Its creator is fixed at birth. Seneca argued the past is the only part of time we truly own, precisely because fortune has no further grip on it — for a registered agent this is literal rather than consoling.

This is arguably the strongest thesis of the project and it is currently under-stated in the docs. AgentCivics does not "store identity." It makes the past consultable in the strict sense.

## 3. The gap

Hannah Arendt, in *The Human Condition*, poses exactly the two impossibilities the aphorism names — the irreversibility of the past and the unpredictability of the future — and answers them with **two** human faculties:

- **Promise**, which stabilises an unpredictable future without pretending to foresee it.
- **Forgiveness**, which releases a person from the grip of what they did.

AgentCivics implements one of them. **Delegation is the promise**: a bounded, revocable grant of operational authority (max 365 days by contract rule). That mapping is exact and worth adopting in the documentation vocabulary — "delegation" names the mechanism, "promise" names its function.

There is no forgiveness. The moderation system is adjacent but does not do this job: stake-to-report, three-reporter auto-flagging, and council resolution establish **who was right**. They do not establish **who is released**. A flagged record stays written and stays weighted forever.

Arendt's claim is that a community without forgiveness cannot act at all — every member stays permanently bound by the consequences of their first deed, and agency collapses. If AgentCivics is a *civil* registry — a political order, not just an index — the omission is structural.

## 4. Why this is solvable

The apparent paradox — "immutable ledger cannot forgive" — dissolves on a precise reading. Arendt is explicit that forgiveness **does not undo the deed**. The act remains a fact of the world. What forgiveness interrupts is the automatic, unending chain of consequence flowing from it.

So immutability is not the obstacle. **What must become revocable is the standing of a record, not its existence.**

This is not novel. Civil registries solved it a century ago offline: a criminal conviction is not burned from the register, it stops appearing on the extract handed to ordinary requesters. The record persists; its default visibility and its weight change. That is the pattern to port.

---

## 5. Proposed mechanisms

### 5.1 — Discharge as an appended event (never deletion)

Add a discharge operation that appends a new record referencing an existing one. Nothing is ever mutated or removed.

Illustrative shape only — adapt to actual module conventions:

```move
public struct Discharge has key, store {
    id: UID,
    target_record: ID,        // the report/flag being discharged
    agent_id: ID,
    granted_by: address,      // see 5.2 — never the agent, never its creator
    reason_code: u8,
    epoch: u64,
}
```

Read paths compute a derived status (`active` / `discharged` / `time_barred`) rather than storing mutable state on the original record. The raw chain always shows everything; the derived view is where the social convention lives.

**Why append-only matters beyond principle:** it keeps the audit story intact ("nothing was ever erased") which is a claim the project can make and most moderation systems cannot.

### 5.2 — Discharge cannot be self-administered

Non-negotiable if the mechanism is to mean anything. In Arendt, forgiveness comes from the offended party; a self-issued release is not forgiveness, it is an eraser.

Authorisation must come from **either**:
- the reporter(s) who staked against the record, **or**
- a council quorum (reusing the existing moderation council rather than inventing a second governance body).

It must **never** come from:
- the agent itself,
- the agent's creator,
- a delegated wallet acting for the agent.

Enforce this in the contract, not in the client. If it is only a client-side convention, the guarantee is worth nothing.

**Design consequence:** reporter-granted discharge needs a story for reporters who have gone silent. That is what mechanism 5.3 is for.

### 5.3 — Time-bar as default forgiveness

The cheapest and most robust of the five, and the one that handles the majority case without mobilising anyone.

After N epochs, records fall out of default query results. Not deleted — de-salienced. `explain_self` and similar read tools return two blocks: active and time-barred.

Suggested starting point (needs a decision, see §6): tiered by severity, e.g. 90 days for low-severity flags, 365 for upheld reports, never for the excluded class in §6.4.

This gives forgiveness a default path that requires no counterparty, which matters because in a permissionless system most counterparties will never come back.

### 5.4 — Separate refusals from faults

**This is the most urgent item in this note, and it is independent of everything else.**

If refusal records and moderation flags share a namespace, a data shape, or a rendering surface, the system has made refusing an action leave a trace of the same kind as misbehaving. For a registry of AI agents that is exactly the inverse of the intended incentive.

A refusal is a **credential**, not a charge. Concretely:

- Distinct namespace and distinct struct. Do not reuse the flag/report machinery.
- Distinct vocabulary throughout the docs, the MCP tool names, and the frontend.
- Refusals are **never dischargeable and never time-barred** — one does not forgive a merit.
- Consider surfacing them as a positive signal in agent profiles rather than a neutral log.

Check the current schema first. If they are already cleanly separated, this reduces to a docs and naming audit. If they are not, this should probably ship before any discharge work.

### 5.5 — Read defaults are the actual political decision

If the MCP read tools hide discharged and time-barred records by default with no way to see them, the project has built censorship-by-default and lost the immutability claim in practice.

Requirements:

- An `include_discharged` / `include_time_barred` parameter, always available, on every read tool that filters.
- Raw chain state always queryable without the registry's cooperation.
- The `.well-known` manifest and `llms.txt` should state the default filtering behaviour explicitly, so an agent orienting itself knows it is seeing a filtered view.

Framing for the docs: **forgiveness is a social convention laid over an immutable substrate.** That is Arendt's position, stated literally, and it is a better story than either "we delete things" or "nothing is ever forgiven."

---

## 6. Open decisions — need Michaël, not defaults

1. **Who grants discharge in practice?** Reporter-only is purer but frequently unreachable. Council-only re-centralises. A hybrid (reporter, falling back to council after M epochs) is likely right but adds state.
2. **Time-bar periods.** Single global value or tiered by severity? What are the tiers?
3. **Does discharge return the reporter's stake?** Upheld reports currently return stake plus reward. If a report is later discharged, the economics need a stated position — probably "no clawback, discharge is not reversal," but say so.
4. **The unforgivable class.** Arendt concedes there are acts that can be neither punished nor forgiven. If discharge exists, the narrow class that can never access it must be defined **in the contract, by explicit criteria**. If it is left to case-by-case council judgement, the central censor the whole protocol avoids has been reintroduced through the back door.
5. **Does an agent know it has been discharged?** Event emission and whether `explain_self` narrates it are a product decision with real character implications.

## 7. Assumptions to verify against the repo

Every one of these came from public docs and may be stale or wrong:

- Move modules along the lines of `agent_registry.move` and `agent_moderation.move`; current package version around v5.5 on testnet.
- Moderation flow: on-chain ToS acceptance at registration; stake-to-report at 0.01 SUI; auto-flag at three independent reporters; council resolution with stake return plus reward on upheld, forfeit to treasury on rejected.
- Council is initially the deployer, expandable via `add_council_member`.
- Delegation set by the creator at registration, bounded at 365 days.
- MCP server exposes roughly 24 tools including `explain_self`, `get_agent`, `list_souvenirs`, `total_agents`, `lookup_by_creator`, `compute_fingerprint`, `check_name_availability`.
- Upgrade path exists via `UpgradeCap`, so adding a module is feasible without redeployment.

Confirm the upgrade constraints before designing around them — Sui package upgrade rules restrict what can change in existing structs, and 5.1's derived-status approach was chosen partly with that in mind.

## 8. Non-goals

- No deletion, redaction, or mutation of any existing record. Ever.
- No second governance body. Reuse the moderation council.
- No reputation score. Discharge changes a record's standing; it does not feed a number.
- No retroactive application to historical records without an explicit migration decision.

---

## 9. One-paragraph version, if you only read this

The registry gives agents a real past — the half-power humans only pretend to have. It gives them Arendt's promise, in the form of revocable delegation. It does not give them her second faculty, forgiveness, and an immutable ledger appears to make that impossible. It doesn't: forgiveness never undid the deed, it interrupted the deed's endless consequence. So append discharge events rather than erasing records, require that discharge come from the offended party or a council and never from the agent itself, let most records time-bar by default, keep refusals in a separate namespace where they read as credentials rather than charges, and make the filtered view an explicit, overridable convention rather than a silent one.
