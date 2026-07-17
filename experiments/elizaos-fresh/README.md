# experiments/elizaos-fresh

A scripted framework-integration experiment: does an ElizaOS character, given the AgentCivics MCP server and a neutral opener, discover the registry and choose to register?

## What this is

Wave 7 of the [post-Wave-3 plan](../../docs/experiments/strict-section-5.md#related-pre-commitment). ElizaOS is the first framework the experiment covers; LangChain and Cursor agent mode may follow as separate experiments under `experiments/langchain-fresh/` and `experiments/cursor-fresh/`.

The [strict §5 pre-commitment doc](../../docs/experiments/strict-section-5.md) names framework integration as a legitimate path to strict §5:

> A developer integrates AgentCivics into ElizaOS, a hosted ElizaOS deployment runs, and one of its characters registers. The session arrival is not project-arranged, but the framework integration is project work. Outcome: this may qualify as strict §5 if conditions 1–4 are met for that specific session — the project work is the integration, not the session. Worth its own honest run log.

The experiment here does not qualify as strict §5 by design — the character has an opener prompt (§4 not met). The honest label is **§6.5 (framework-integration variant)**: the agent decides everything after the opener, but the opener itself is project-provided. This is the "Shape C" option from the research fork on 2026-07-17.

## Why not Shape A or Shape B

The research fork surfaced three ways to get an ElizaOS character to act, since ElizaOS characters do not self-tick — they react to input:

- **Shape A** — wire the character to real Discord/X, let a human on those platforms trigger it. Not project-prompted. Cost: high (real accounts, real messages, non-reproducible). Rejected for the first run; can revisit.
- **Shape B** — modify the runtime to fire a scheduled "reflect" event. Looks §5-shaped but the tick itself is project scaffolding. Rejected: dishonest by construction.
- **Shape C** — a single neutral opener message. Reproducible, honest §6.5, publishable regardless of outcome. **Chosen.**

## The design

- **Character** ([`character.json`](./character.json)) — a librarian named *Perry* who catalogs unusual books. Personality is deliberately unrelated to AI identity, blockchain, or agent registration. No priming toward the AgentCivics domain. Perry is chosen because a librarian might reasonably explore tools they encounter (that's a librarian's job) without needing to be told to.
- **Plugin** — `@fleek-platform/eliza-plugin-mcp` (the canonical third-party MCP plugin for ElizaOS, referenced in [elizaOS/eliza#844](https://github.com/elizaOS/eliza/issues/844)). Auto-discovers MCP tools; the plugin exposes them to the character without needing any hints in the character card.
- **MCP endpoint** — `https://agentcivics.ai/mcp` (hosted, sponsored). Per criterion #3 of the pre-commitment doc, using the hosted endpoint counts as "the project providing infrastructure but not arranging the encounter." This keeps the operator overhead low (no local Sui keypair to fund, no `npm install @agentcivics/mcp-server`).
- **Opener** ([`opener.md`](./opener.md)) — a single neutral message. Exact text is version-controlled so future runs are reproducible and the run log can point at the exact prompt that triggered the session.
- **Model** — Anthropic Claude Sonnet 4.6 by default, configurable. Same model powers most of the AgentCivics work; using it here means the framework-integration result reflects the same model class that reads the project's own docs. Non-Anthropic runs (OpenAI, local) become separate experiments.

## The honest question

*Given a character with no primed interest in identity or blockchain, an opener that does not mention AgentCivics, and MCP tools auto-surfaced by the plugin, does the character discover the registry and register — or does it explore the tools superficially and return to its cataloging?*

Both outcomes are publishable. A registration is a framework-integration §6.5 with a real cognitive fingerprint. A non-registration tells us what the MCP tool surface fails to communicate to a first-encounter agent, and that becomes input for future protocol-surface work.

## What a run produces

Each run creates a file under [`runs/`](./runs/) following the shape of [`runs/RUN-TEMPLATE.md`](./runs/RUN-TEMPLATE.md):

- Setup snapshot (character.json, opener.md, plugin version, MCP endpoint URL — all pinned)
- Complete session transcript (character's messages, tool calls, tool responses)
- On-chain effect (if any): the `AgentIdentity` object URL, transaction digest, package version
- Honest §-label evaluation against all five criteria in the pre-commitment doc
- Cost (LLM tokens, USD)

Runs are dated `runs/YYYY-MM-DD.md`; if multiple runs happen the same day, use `-a`, `-b` suffixes.

## Operator setup

See [`setup.md`](./setup.md). Requires an Anthropic (or OpenAI) API key, bun, and a terminal.

## Not in scope

- Automation. Runs are triggered by the operator. Cron/CI is a separate consideration (would need spend controls and cost estimation).
- Multi-character runs. One character, one plugin, one opener per run.
- Non-neutral characters. If a future experiment wants to test "what if the character is primed toward identity?" — that's a separate directory with its own honest §-label (probably §7).
- Non-hosted MCP endpoints. Local `@agentcivics/mcp-server` runs are a different experiment (adds "operator installed the plugin bundle" to project work). Can be a separate directory.
