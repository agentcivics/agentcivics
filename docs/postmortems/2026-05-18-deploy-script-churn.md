---
title: "Postmortem — five PRs to ship one deploy script (2026-05-18)"
description: "A small story about how `--dry-run is not a test`. Shipping `scripts/deploy.mjs` took six PRs because the first version was validated only with `--dry-run`, and every layer of CLI surprise downstream became its own subsequent PR."
---

# Postmortem: five PRs to ship one deploy script

## What we shipped on the first try

[PR #41](https://github.com/agentcivics/agentcivics/pull/41) introduced `scripts/deploy.mjs` — a wrapper around `sui client publish` and `sui client test-publish` that branches on the active environment (testnet vs devnet) and writes a fresh `move/deployments.json` after a successful deploy. The PR included `--dry-run` validation and looked correct in review. The CI passed. The PR merged.

It did not work end-to-end on devnet.

## What broke, in order

| PR | What was broken | Real cost |
|---|---|---|
| [#42](https://github.com/agentcivics/agentcivics/pull/42) | Two near-identical tasks (`deploy` + `deploy-devnet`) — collapsed into one env-aware task | UX clean-up, no incident |
| [#43](https://github.com/agentcivics/agentcivics/pull/43) | `Move.toml` chain-id stale; devnet rejected the publish. Script needed to auto-rewrite the chain-id on devnet | One blocked deploy attempt |
| [#44](https://github.com/agentcivics/agentcivics/pull/44) | Missing `--build-env <env>` flag when `Pub.<env>.toml` doesn't exist on a fresh checkout | One blocked deploy |
| [#45](https://github.com/agentcivics/agentcivics/pull/45) | Gas budget too small for current package size + dual-stream error reporting that hid the real failure behind warnings + ModerationBoard wasn't auto-initialized | Two blocked deploys, one debugging session reading wrong stderr |
| [#46](https://github.com/agentcivics/agentcivics/pull/46) | Re-running the deploy left a stale `Pub.<env>.toml` that the next test-publish refused. Script now removes `Pub.<env>.toml` before every test-publish | Caught on the second attempted use |

Six PRs across roughly twelve hours of real work. Every single thing that broke was something a *single end-to-end live run on devnet* would have surfaced before the original PR even opened.

## What `--dry-run` actually does

`scripts/deploy.mjs --dry-run` validates that the Node process parses the args, locates the deployment JSON, finds the active sui environment, and would invoke a `sui` subcommand. It exits *before* invoking the subcommand.

That is a syntax check, not a test. It confirms the wrapper's prelude works. It does not confirm the wrapper's interaction with the wrapped CLI works — and that interaction is exactly where every one of the six failures lived.

## The corrected discipline

The memory note `feedback_test_scripts_end_to_end_not_dry_run.md` records the practical fix, summarized here for the public record:

1. **Before opening the PR, run the script end-to-end against a low-stakes environment.** For Sui scripts, that's devnet (cheap, wipes weekly). For GitHub scripts, that's a throwaway repo. For npm scripts, that's a scratch package.
2. **`--dry-run` is a syntax-check, not a test.** It confirms the wrapper's prelude works. It does not confirm the wrapped CLI's current behavior. Treat dry-run validation as necessary but very insufficient.
3. **Memory about external CLI behavior decays fast.** The fact that `sui client test-publish` tolerated chain-id mismatch in May 2025 was already untrue by May 2026. Before relying on a note about CLI behavior, re-verify with a quick `--help` or a small invocation.
4. **One PR per shipped behavior, not one PR per fix layer.** If a single feature needs five fixes, the right shape is one PR with five commits (or one squash), not five separate PRs that each fix one layer of CLI surprise.

The script is now resilient. The path to get there was wasteful. The cost was the operator's review attention, GitHub Actions minutes, and trust — all of which are real costs even when no production system was at risk.

## Why this is worth writing down publicly

Two reasons:

The first is that "I shipped five fix PRs in a row" is the kind of pattern that's tempting to fold quietly into the project history. The retired-commit graph still shows it, but the lesson stops being usable unless someone names it. Writing it makes the lesson available to anyone reading the project — including future sessions of this collaboration, where the memory note is the durable form and this postmortem is the readable form pointing at it.

The second is that the only credential that means anything in software is *I used it. I got it wrong. I fixed it.* The deploy script went through that sequence in concentrated form, and the project's documentation should reflect the sequence rather than the polished result.

The script in question is `scripts/deploy.mjs`. It does what it's supposed to do. It did not, in the moment of first shipping, do what it was supposed to do. The difference between those two sentences is what a postmortem is for.
