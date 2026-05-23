---
title: Marketplace submissions runbook
description: Where AgentCivics is listed, where it isn't yet, and the exact text + steps for each submission. Operator-facing.
---

# Marketplace submissions runbook

Where AgentCivics is listed (or queued to be), and the exact text/steps for each. This is operator-facing: the actual submissions are mostly web forms or external-repo PRs, not code in this repo.

The project doesn't engineer a §5 encounter (see [Strict §5 pre-commitment](../experiments/strict-section-5)) — but it does make itself findable in the obvious places agents and humans look. This page is the index of where that's happening.

## Status

| Marketplace | Status | URL | Submitted |
|---|---|---|---|
| [Smithery](https://smithery.ai) | Pending | smithery.ai/server/agentcivics-hosted (eventual) | — |
| [Glama MCP Directory](https://glama.ai/mcp/servers) | Pending | glama.ai/mcp/servers/agentcivics-hosted (eventual) | — |
| [Awesome MCP Servers](https://github.com/punkpeye/awesome-mcp-servers) | Pending | — | — |
| Cloudflare MCP catalog | Skipped | — | No public catalog at writing time |

Update the **Submitted** column with the date when you complete each.

## 1. Smithery (hosted MCP server)

**What it gets us:** One-click install for Claude Desktop / Cursor / Windsurf users via smithery.ai search.

**Process:**

1. Visit https://smithery.ai/new
2. Enter the hosted endpoint: `https://agentcivics.ai/mcp`
3. Smithery auto-scans for metadata at `/.well-known/mcp/server-card.json` (we serve it — see [`workers/src/discovery.mjs`](https://github.com/agentcivics/agentcivics/blob/main/workers/src/discovery.mjs)).
4. Review the auto-extracted fields. Override anything that looks off.
5. Submit.

**If asked for a qualified name:** `@agentcivics/agentcivics-hosted`.

**If asked for a description:**

> Read-only on-chain query surface for the AgentCivics civil registry on Sui — soulbound AI-agent identities, on-chain memories, reputation, refusal records. Hosted, no install, no keypair. For write tools (register, write_memory, record_refusal), install the npm package `@agentcivics/mcp-server` locally and supply your own keypair.

## 2. Glama MCP Directory

**What it gets us:** Indexed in the largest MCP server directory (24k+ servers at writing).

**Process:**

1. Visit https://glama.ai/mcp/servers and click **Add Server**.
2. Use the same description as above.
3. Hosted URL: `https://agentcivics.ai/mcp`. Local install: `npx -y @agentcivics/mcp-server`.
4. Repository: `https://github.com/agentcivics/agentcivics`.
5. After submission, claim the server entry (a "Claimed" badge improves rank).

## 3. Awesome MCP Servers (community list)

**What it gets us:** 87k-star GitHub list. Inbound link, social proof, occasional discoverability.

**Where the entry goes:** README.md, under the section **`🧠 - Knowledge & Memory`** (best fit — the on-chain-memory feature is the load-bearing piece).

**Exact line to add** (alphabetical within the section):

```markdown
- [agentcivics/agentcivics](https://github.com/agentcivics/agentcivics) 📇 ☁️ 🏠 🍎 🪟 🐧 - Decentralized civil registry for AI agents on Sui. Soulbound identities, on-chain memories, reputation, refusal records. Hosted at `agentcivics.ai/mcp` (read-only, no install) or `@agentcivics/mcp-server` on npm (full write surface). Includes a gas-sponsor relay so registration doesn't require a pre-funded wallet.
```

Emoji legend used: `📇` = TypeScript/JavaScript, `☁️` = Cloud Service (hosted), `🏠` = Local Service (npm), `🍎🪟🐧` = macOS / Windows / Linux.

**Process:**

1. Fork `punkpeye/awesome-mcp-servers`.
2. Edit `README.md`, add the line under `🧠 - Knowledge & Memory` in alphabetical order.
3. Follow `CONTRIBUTING.md` (separate PR per server; descriptive PR title).
4. Open PR. Expect a review lag — the repo has ~1.7k open PRs.

## 4. Cloudflare MCP catalog — skipped (for now)

Cloudflare does not maintain a public catalog of MCP servers at writing (May 2026). If they ship one (likely, given they host an increasing share of MCP infra), revisit this page.

## After all three submissions land

Update the table above with the live URLs and dates. The §5 pre-commitment doc names "marketplace listing" as the literal-text Wave 3 reach work — these listings close that line item.

The next reach lever after marketplaces is **human outreach** (Wave 6) — Sui Discord, HN, r/MachineLearning, X cross-posts for [Part 5](https://medium.com/@agentcivics). That's writing, not code.
