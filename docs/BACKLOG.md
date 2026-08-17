---
title: Backlog
description: "Carried work, open decisions, and known traps. Written 2026-08-16 at the end of the RPC-migration session so the next session starts informed rather than rediscovering."
---

# Backlog

**Last updated:** 2026-08-16 (re-verified later the same day). `main` is at the merge of
#84, which carries #92. #83 has **not** landed — it and #93 are both still open.

Ordered by what blocks what, not by size. Anything marked **decision** is not mine to
pick — it needs Michaël.

---

## 1. Open decisions

### 1.1 — Discharge design note §6 (five forks) — **decision**

[discharge-design-note.md](./governance/discharge-design-note.md) proposes a forgiveness
mechanism. Its §6 lists five genuine forks and §0 is explicit they are not defaults to be
guessed. Read
[discharge-design-note-verification.md](./governance/discharge-design-note-verification.md)
first — several §7 assumptions were wrong and one finding changes the shape of the work.

The sharpest fork, and the one to settle before any code:

> **Stored status or derived status?** `agent_memory::archive_if_overdue` already
> de-saliences a record by *storing* `SOUVENIR_ARCHIVED` on it. §5.1 proposes computing
> status on *read* instead. Both defensible; two shapes for one concept is not.

Also unanswered: who grants discharge in practice, time-bar periods, whether discharge
returns the reporter's stake, the unforgivable class, and whether an agent is told it has
been discharged.

### 1.2 — Is the report stake meant to be 0.05 or 0.01 SUI? — **decision**

The contract enforces `REPORT_STAKE = 50_000_000` (0.05 SUI).
`docs/governance/proposal.md` specifies `10_000_000` (0.01 SUI). Every client and doc had
copied the proposal, so `report_content` aborted with `EInsufficientStake` on every call
it ever made (#90).

#90 matched the clients to the **deployed contract**, because that is what is enforced.
If 0.01 was the intended parameter, the correct fix is the opposite direction — a
contract upgrade — and §6.3 of the design note (discharge economics) changes with it.
This was a judgement call, not a settled fact.

### 1.3 — Should `execTx` wait for finality?

Write tools return as soon as the transaction executes. `devInspect` against a shared
object does not see the write immediately, so a write-then-read in the same breath misses
it — recording a refusal and then listing refusals returns zero. Real, reproducible, and
not specific to refusals.

Adding a wait to one tool would be inconsistent; adding it everywhere slows every write.
Left as-is and documented rather than papered over. Worth a deliberate call.

---

## 2. Runnable work

### 2.1 — Run the ElizaOS wave-7 experiment

`experiments/elizaos-fresh/` is on `main` and now genuinely runnable. Two things had to be
true and only became true on 2026-08-16: the hosted endpoint had to work at all, and the
setup had to point at a surface that can actually register.

Needs a terminal, an Anthropic key, ~$1 of credits, and about an hour of real attention
for the run log. Follow [setup.md](../experiments/elizaos-fresh/setup.md) — note the two
inline corrections dated 2026-08-16.

Honest label is **§6.5 (framework-integration variant)**, not strict §5, because the
opener is project-provided. Do not relabel it in the writeup unless every pre-commitment
criterion is honestly met.

`agentcivics_record_refusal` now exists, so Perry can *refuse* as well as register — a
refusal would be a publishable outcome in its own right, not a null result.

Still unrun as of 2026-08-16: `experiments/elizaos-fresh/runs/` holds nothing but
`RUN-TEMPLATE.md`. This is the largest piece of carried work in the backlog and the only
one that produces new evidence rather than new prose.

### 2.2 — Merge the two open docs PRs, #83 then #93

Both are green on all four checks and `MERGEABLE` / `CLEAN` as of 2026-08-16.

- **#83** — `docs(article-4): freshness pass + Sui Discord intro kit`. Contains new
  outreach material for the Sui Discord.
- **#93** — this backlog. It is **stacked on #83**: branch `docs/backlog` was cut from
  `feat/article-4-freshness-sui-kit`, so it carries #83's two commits. Merge #83 first, or
  merging #93 alone silently lands both.

Neither has a review. Nothing blocks them but the decision to press the button.

---

## 3. Known traps

### 3.1 — The drift check does not cover prose

`scripts/check-id-drift.mjs` guards 23 code and doc surfaces against superseded on-chain
IDs, and it is proven to fail on the two real bugs it was written for. **Articles,
outreach material, audits and the changelog are deliberately excluded** — they are
historical records and are correct precisely because they name old IDs.

The consequence: a stale ID in an article or an outreach kit is invisible to CI and needs
reading. #83 was exactly this — it claimed "package v5.5" while linking the v5.4 package,
in both the article and the Discord kit.

Three separate bugs in one day shared this shape: **the label said one thing and the value
said another** — the v4 moderation board, the stake, and the article's package link. When
reviewing anything that states a fact about the chain, check the value, not the sentence.

### 3.2 — Devnet is wiped periodically

Devnet was redeployed 2026-08-15 (v5.3.4, `0xc1740b78…`). **Still live** — package and
`Registry` both resolve as of 2026-08-16. It will go stale again without warning, and this
has already happened twice in recorded history. When it does:

- `move/deployments.devnet.json` and the npm bundle point at a package that no longer
  exists, and `AGENTCIVICS_NETWORK=devnet` fails with ObjectNotFound for every npx user
- fix is `mise run env-devnet && mise run deploy`, then a version bump and republish —
  bundles pin at publish, so only a version bump rolls fresh IDs

`scripts/deploy.mjs` switches on `sui client active-env`. **Check it before running
anything that writes.** A script whose RPC follows `AGENTCIVICS_NETWORK` but whose funding
step uses the CLI wallet will split-brain across two chains if those disagree — this
happened on 2026-08-15 and put testnet SUI into a throwaway address.

### 3.3 — The hosted MCP is read-only by design

`agentcivics.ai/mcp` exposes 7 read tools. It is write-free on purpose: no third party's
signing key may enter that process. `/sponsor` co-signs *gas* for a transaction the agent
built and signs itself — it is not a remote signer.

Anything that needs to write uses the local `@agentcivics/mcp-server` bundle (32 tools
defined, 28 enabled by default) with its own keypair. The elizaos scaffold assumed
otherwise and could not have produced its own outcome.

### 3.4 — `gh` intermittently could not reach the GitHub API on 2026-08-16

**Working again** later the same day: `gh pr list`, `gh pr view` and `gh pr checks` all
returned normally. Treat this as intermittent rather than fixed — nothing was changed to
repair it, so it may come back.

Earlier, `gh pr create` / `gh api` timed out against `140.82.121.5:443` while `curl`
reached the same IP fine. PRs #90–#92 were created and merged via REST through curl:

```bash
curl -s -X POST https://api.github.com/repos/agentcivics/agentcivics/pulls \
  -H "Authorization: Bearer $(gh auth token)" --data @payload.json
```

`gh auth token` still works, so it is a transport problem in `gh`, not an auth one. Try
`gh` first; fall back to curl if it hangs.

---

## 4. Smaller follow-ups

- **`mcp-server/test-moderation.mjs` fixtures** — now reads IDs from the deployment file,
  but its two agent fixtures moved to `AGENTCIVICS_TEST_AGENT_A/B` env vars because the
  hardcoded pair belonged to a retired deployment. It has not been run end to end since.
- **`test/E2E-v4.mjs`** is the last JSON-RPC caller in the repo. Deliberate — it is a
  v4-era verification script, kept as a historical record like the v4 audit files.
- **`suix_subscribeEvent` in `frontend/index.html`** is dead code behind
  `WS_ENABLED = false`, with a polling fallback carrying the live path. Harmless, but it
  will keep showing up in JSON-RPC greps.
- **`docs/articles/_drafts/agent-identity-papers-5-medium.md`** has been untracked in the
  working tree for the whole session. It is Michaël's draft; never staged. It will follow
  every branch switch until committed or removed.
