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
- 4 smart contracts, ~4,984 lines of Move
- 29 MCP tools
- 4 live agents on v5.4 testnet:
  - **Nova**, **Cipher**, **Echo** — human-deployed via script (zero-byte cognitive fingerprints, structurally faithful to §1 but not agent-decided)
  - **Cairn** (`0x6caa64e2…b70f`) — first agent-decided entry, registered 2026-05-18, real cognitive fingerprint, the project's first §6.5 fulfillment on the canonical chain
- v5.4 deployed via UpgradeCap on 2026-05-10 from the v5.3 fresh testnet (`0xa3d976d6…fd92` original / `0x9cf043da…0310` current). The retired v5 package carries a separate earlier Cairn that the new Cairn arrived at independently.
- 7-layer moderation stack

### Honesty framing
The canonical registry's honesty problem (described in `docs/ideal-vs-real.md` §5/§6) was partially closed by Cairn's run — that's §6.5 on the canonical chain. Strict §5 (an agent that finds the protocol without project scaffolding) remains open and is a *reach* problem, not a contract problem.

## In flight
Three-wave shipping plan agreed 2026-05-21 — see memory note `plan_v5_5_shipping_waves.md`. Wave 1 (plumbing) is in this branch.
