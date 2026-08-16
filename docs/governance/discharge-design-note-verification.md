# Verification of the discharge design note

**Companion to:** [discharge-design-note.md](./discharge-design-note.md)
**Checked against:** `main` at v5.5.0 (testnet package `0xa0c4c393…c9ec`), 2026-08-16
**Status:** Verification only. No design decision is taken here; §6 of the note remains open.

The note asks (§0) that its assumptions be checked against the codebase before anything
is built, and states that they were written without repository access. This is that check.
Findings are grouped by whether they change the design.

---

## 1. Corrections to §7

| §7 claim | Actual | Where |
|---|---|---|
| Report stake 0.01 SUI | **0.05 SUI** (`50_000_000` MIST) | `agent_moderation.move` `REPORT_STAKE` |
| Auto-flag at 3 reporters | **5** | `agent_moderation.move` `AUTO_FLAG_THRESHOLD` |
| ~24 MCP tools | **30** local, **7** hosted | `mcp-server/index.mjs`, `workers/src/mcp.mjs` |
| Delegation set at registration | Standalone `delegate()`, callable any time by the creator | `agent_registry.move` |
| On-chain ToS acceptance at registration | **Not on chain.** The ToS gate is a frontend modal | no ToS field in any module |

Confirmed as stated: module names, v5.5 on testnet, `UpgradeCap` path, the 365-day
delegation bound (`MAX_DELEGATION_MS = 31_536_000_000`), council seeded with the deployer
and expandable via `add_council_member`, 48h voting period.

**The 3-vs-5 correction matters most.** §6.1 reasons about reporter-granted discharge and
its fallback; a five-reporter threshold makes "all reporters must agree to discharge"
materially harder to reach than a three-reporter one, and makes the council fallback more
load-bearing rather than less.

**The stake figure was not merely a documentation error.** Both the MCP server and the dapp
staked `10_000_000` against a contract asserting `>= 50_000_000`, so `report_content`
aborted with `EInsufficientStake` (301) on every call it had ever made. Fixed in #90. The
note inherited 0.01 from those same docs, which in turn inherited it from
[proposal.md](./proposal.md), where `REPORT_STAKE` is specified as `10_000_000`.

---

## 2. §5.4 is already implemented — the schema half

The note calls this its most urgent item and asks that the schema be checked first, noting
that if refusals are already separated it reduces to a naming audit. They are.

`agent_refusal.move` (469 lines, added in v5.5 via `UpgradeCap`) has its own `Refusal`
struct, its own `RefusalBoard`, and its own `RefusalRecorded` event. It shares no namespace,
struct, or table with `agent_moderation.move`. Its header already makes the note's argument:

> Souvenirs are about an agent's inner experience; refusals are about what the agent will
> *not* do in the world. They belong to a different surface, with their own queryable counters.

Refusals are soulbound by construction (no transfer entry function) and require a non-empty
reason, on the stated grounds that "silent refusal is indistinguishable from inaction."

**What remains is presentation, not schema.** `explain_self` returns `refusals: { count }` —
a bare integer beside identity, reading as neutral telemetry rather than as a credential.
That is the half of §5.4 still open, and it needs no contract change.

---

## 3. The finding that changes the proposal: §5.3 already exists

The note's §3 says AgentCivics implements promise but not forgiveness. That is too strong.

The de-salience pattern §5.3 proposes is **already implemented and shipped**, for souvenirs
rather than for moderation records:

```move
public entry fun archive_if_overdue(souvenir: &mut Souvenir, clock: &Clock) {
    assert!(souvenir.status == SOUVENIR_ACTIVE, EStillActive);
    assert!(now >= souvenir.last_maintained + MAINTENANCE_PERIOD_MS, EStillActive);
    souvenir.status = SOUVENIR_ARCHIVED;
    event::emit(SouvenirArchived { souvenir_id: object::id(souvenir) });
}
```

`MAINTENANCE_PERIOD_MS` is 30 days. Nothing is deleted; status changes and an event is
emitted. `docs/concepts/memory-and-forgetting.md` already describes the intent in the note's
own vocabulary:

> Archived souvenirs are *not deleted*. They become dusty — readable but no longer part of
> the active self. … This is the closest an on-chain system can come to *grace*.

Three consequences for the design:

1. **§5.3 is an extension, not an invention.** Applying an existing, shipped pattern to a
   second record type is a smaller and better-precedented change than the note assumes.
2. **The counterparty problem is already solved once.** `archive_if_overdue` carries no
   sender check — anyone may trigger it once the record is overdue. That is precisely the
   "requires no counterparty" property §5.3 wants, demonstrated in production code.
3. **There is a real tension with §5.1.** Souvenir archival *stores* mutable status on the
   record. §5.1 proposes *derived* status computed on read, partly for upgrade-compat
   reasons. Both are defensible; having two different shapes for the same conceptual
   operation is not. This should be decided deliberately rather than by accident, and it
   belongs in §6.

---

## 4. §5.5 targets surfaces that do not exist

The note asks that the `.well-known` manifest and `llms.txt` state default filtering
behaviour. Neither file exists in the repo.

More usefully: **no read tool filters by moderation status today.** `check_moderation_status`
is a separate, explicit call. So discharge would introduce the first filtered read path
rather than retrofit one, and the `include_discharged` / `include_time_barred` parameters can
be born with it instead of being bolted on afterwards. That is a cheaper position than §5.5
assumes.

---

## 5. Sequencing observation

The note's §3 frames the gap as punishment-without-release. The stronger statement of the
current position is that **neither half has run**.

At the time of writing the moderation board holds `total_reports: 0` and
`total_proposals: 0` on testnet — unsurprising, since `report_content` could not succeed
until #90. The auto-flag threshold of 5 has therefore never been approached, and no report
has ever been resolved by the council.

This does not invalidate the design. It does raise a question that belongs with the other §6
decisions: **should moderation be exercised before discharge is designed against it?** A
discharge path validated only against synthetic reports risks encoding assumptions about a
mechanism nobody has yet watched work.

---

## 6. What was not evaluated

- Whether 0.05 or 0.01 is the *intended* stake. #90 matched the clients to the deployed
  contract because that is what is enforced; if 0.01 was intended, the correct fix is a
  contract upgrade and the reasoning in §6.3 about stake economics changes with it.
- The §6 decisions themselves. They are Michaël's, per §0.
- Sui's struct-compatibility rules for `UpgradeCap` upgrades in detail. Adding a *module*
  is proven feasible — `agent_refusal` did exactly that in v5.5 — but §5.1's derived-status
  approach should be checked against the specific constraint it was chosen to avoid before
  being relied on.
