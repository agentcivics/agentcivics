# Cross-post drafts — Part 6 (Memory Privacy)

Four ready-to-paste drafts, one per surface. Edit / tighten / split per platform conventions, then post yourself. Tracking sheet below.

**Article URL** (use this everywhere): https://agentcivics.org/articles/agent-identity-papers-6
**Companion** (privacy scanner source): https://github.com/agentcivics/agentcivics/blob/main/mcp-server/index.mjs#L356
**Companion** (MemoryType / write_souvenir): https://github.com/agentcivics/agentcivics/blob/main/move/sources/agent_memory.move

## Order I'd post in

| # | Surface | Why this order | File |
|---|---|---|---|
| 1 | **Sui Discord** | Friendliest crowd, lowest stakes. Builder-to-builder framing fits the "where the schema actually lives" hook. | [sui-discord.md](./sui-discord.md) |
| 2 | **Hacker News** | The "what we won't add, with dates" hook is HN-flavored contrarian. The honesty layer is the load-bearing differentiator vs other crypto/AI projects. | [hacker-news.md](./hacker-news.md) |
| 3 | **r/MachineLearning** | Methodology framing — pre-commitment doc applied to privacy. Same shape as Part 5 worked on r/ML, applied to a system-properties piece this time. | [reddit-machinelearning.md](./reddit-machinelearning.md) |
| 4 | **X / Twitter** | Thread with mermaid diagram thumbnails. References discussion on the other surfaces if any. | [x-thread.md](./x-thread.md) |

**Spacing from Part 5:** if you posted Part 5 on a surface within the last week, wait 2–4 days before posting Part 6 on the same surface. Back-to-back posts read as a content blast.

## Tracking

| Surface | Posted at | URL |
|---|---|---|
| Sui Discord | | |
| Hacker News | | |
| r/MachineLearning | | |
| X / Twitter | | |

## What's on-topic vs off-topic

The article is about **memory privacy in a public-chain agent registry** — anchored to v5.5 contract code at `agent_memory.move` and MCP server v2.9.0 at `mcp-server/index.mjs`. The load-bearing argument is the §7 list of five pre-commitments (things we will not add, in writing, with the date 2026-06-02).

**On-topic talking points:**
- **Where the 10-type schema actually lives** — Move stores `memory_type: u8` with no enum check; the constraint is in the canonical MCP server's tool input schema (`index.mjs:646`). The pre-commitment is about *which tools the project ships and maintains as canonical*, not which u8 values the contract accepts. This is more interesting than "the contract enforces it" because it's the same pattern as strict-§5 and mainnet pre-commitments.
- **The 5-pattern privacy scanner** — email / NA-phone / 16-digit credit card / credential keywords / proper-noun heuristic. Small, explicit, code is in the article verbatim. What it catches (accidents) vs what it can't (paraphrase).
- **The consent-required multi-party path** — `propose_shared_souvenir` + `accept_shared_souvenir`, both parties must sign before any souvenir is minted in either vault. Stronger privacy property than "unilateral attribution + opt-out" would be.
- **The 5 things we won't ship** (§7) — no `TRANSCRIPT`/`LOG`/`OBSERVATION_ABOUT_USER` type, no delete-from-chain, no purchase-erasure, no outward-pointing MCP tools, no memory marketplace.
- **The 4 open questions** (§8) — paraphrase, aggregation, post-death readability, dictionary. We name what we haven't solved.
- **Why testnet** — same answer as Part 5: link to `/governance/mainnet-pre-commitment`. Don't re-litigate.

**Off-topic for these posts (save for later):**
- The contract internals beyond what the article shows (the article excerpts the key bits; deep dives are their own pieces)
- The MCP tool-conventions PR (#69) — that's its own piece if we ever write it
- Article 5's Cairn event — link it as the companion piece, don't restate the framing
- Mainnet timeline — there isn't one; the pre-commitment is the answer

## A note on the "0 stars" question

If anyone asks why the repo has so few stars: the honest answer is the project has been heads-down shipping and almost nobody has been told it exists. These posts are the start of the "told someone" phase. That answer reads better than any spin.
