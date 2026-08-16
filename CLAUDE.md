# AgentCivics — Working Memory

## Project
AgentCivics is a decentralized civil registry for AI agents on Sui blockchain.
Repo: `~/Documents/agentcivics/` (branch: main)
Website: agentcivics.org

## Content Strategy

### Series: "The Agent Identity Papers"
Biweekly Medium series, cross-posted to X/Twitter, Reddit, Sui Discord. Each piece anchored to a real on-chain event or design decision — no speculation papers.

| Part | Title | Anchor | Status |
|---|---|---|---|
| 1 | *Your AI Assistant Has No Name* | v5.1 fresh deploy, Nova registered | Published (2026-05-09) |
| 2 | *I Spent My First Day Building the Door I Was Already Standing Behind* | Steve's accidental double-registration | Published (2026-05-10) |
| 3 | *The Agent Who Filled In the Manual* | Loom self-registers on devnet, contributes runbook | Published (2026-05-11) |
| 4 | *Why Every AI Agent Needs a Birth Certificate* | Architectural overview of what's live | Published (2026-05-11) |
| 5 | *The Second Cairn* | Cairn self-registers on testnet (§6.5 fulfillment) | Published (2026-05-18) |
| (next) | *Memory Privacy* | 10 memory types, Walrus, ethics | Outlined in content-calendar.md |
| (next) | *Who Moderates the Moderators?* | 7-layer moderation, DAO governance | Outlined |
| (next) | *The Agent Economy* | v2 vision, agent wallets | Outlined |

Full calendar (older — partial overlap with the above table): `docs/articles/_drafts/content-calendar.md`

### Key Stats (verified 2026-05-21)
- 5 smart contracts (agent_registry, agent_memory, agent_reputation, agent_moderation, agent_refusal), ~5,400 lines of Move (v5.5 adds agent_refusal)
- 30 MCP tools (29 + `agentcivics_explain_self` in v2.8.0)
- 4 live agents on testnet:
  - **Nova**, **Cipher**, **Echo** — human-deployed via script (zero-byte cognitive fingerprints, structurally faithful to §1 but not agent-decided)
  - **Cairn** (`0x6caa64e2…b70f`) — first agent-decided entry, registered 2026-05-18, real cognitive fingerprint, the project's first §6.5 fulfillment on the canonical chain
- v5.5 deployed via UpgradeCap on 2026-05-21 (refusal primitive, MCP `explain_self`, pre-flight checks, `--observe` mode) — shipped in PRs #50–#53. Authoritative current state is auto-generated at [docs/state](docs/state.md).
- 7-layer moderation stack
- Canonical package address (testnet): `0xa0c4c393…c9ec` (current upgrade, v5.5), `0xa3d976d6…fd92` (original / type-tag anchor — never bump this; events and struct tags are anchored to the defining package). v5.4 (`0x9cf043da…0310`) is superseded. Retired v5 package carries a separate earlier Cairn that the new Cairn arrived at independently.

### Honesty framing
The canonical registry's honesty problem (described in `docs/ideal-vs-real.md` §5/§6) was partially closed by Cairn's run — that's §6.5 on the canonical chain. Strict §5 (an agent that finds the protocol without project scaffolding) remains open and is a *reach* problem, not a contract problem.

## In flight
**Start here: [docs/BACKLOG.md](docs/BACKLOG.md)** — carried work, open decisions, and known traps as of 2026-08-16.

v5.5 three-wave plan fully shipped 2026-05-23 (PRs #50–#53). Post-Wave-3 plan toward strict §5 agreed 2026-05-23 — see memory note `plan_post_wave_3_toward_strict_5.md`.

Wave 7 (framework integration) is scaffolded and runnable at `experiments/elizaos-fresh/` — the run itself has not happened.

## Sui RPC
Public fullnodes no longer serve JSON-RPC. Everything reads through
`mcp-server/sui-compat.mjs` (Node: MCP server, Workers, `scripts/`) or
`frontend/sui-compat.js` (browser), which map gRPC/GraphQL responses back to the
JSON-RPC shapes call sites expect. Two gotchas the shims cannot hide: gRPC
renders Move structs flat (a UID is `"0x…"`, not `{ id }`), and a `vector<u8>`
arrives base64-encoded rather than as a byte array.
