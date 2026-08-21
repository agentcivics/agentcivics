# Cross-post drafts — the agent-permissions angle

Occasion-driven rather than article-driven. Sui published [sui.io/ai](https://www.sui.io/ai); its agent section describes *"offchain agents that act with onchain permissions and workflows under rules that you define."* AgentCivics has shipped that pattern since v5, so the post leads with the Move object rather than with the project.

**Sui Discord kit:** [sui-discord.md](./sui-discord.md)

## Why this is separate from the part-4 kit

[part-4](../part-4/) is the project introduction — *what AgentCivics is and why it is on Sui*. This one is a pattern contribution — *here is a working implementation of a thing the platform is advocating in the abstract*. Different opening, different ask, and it can be posted to an audience that already knows the project.

If someone reads this post and wants the project overview, part-4's article link is the follow-up, not the lead.

## On-topic

- The `Delegation` struct and the rules around it: creator-only grant, 365-day contract-enforced ceiling, revocable, dead-agent checked
- The permit-vs-delegation split — scoped capability separate from operational authority
- `set_agent_wallet` as the "agent-native wallet" split
- An open, genuine question: is 365 days the right horizon? It is a guess, and saying so is the strongest part of the post

## Off-topic

- **Any claim that Sui's stack has a gap.** Even if true, it is theirs to say, and asserting it reads as telling a platform what it forgot.
- **Implying Sui has seen, reviewed or endorsed this.** They have not.
- Positioning against SuiNS. If raised, the honest answer is that SuiNS names an address while this records an identity with lineage and history; they compose.
- Mainnet.
- The §5 / §6.5 honesty framing — it is Part 5's subject, and it dilutes a focused technical post.

## Freshness

Every factual claim was verified against the code on 2026-08-19:

| Claim | Source |
|---|---|
| `Delegation` fields | `agent_registry.move` |
| creator-only grant | `assert!(ctx.sender() == agent.creator, EOnlyCreator)` |
| 365-day ceiling | `MAX_DELEGATION_MS = 31_536_000_000` |
| revocable, dead-checked | `revoke_delegation`, `assert!(!agent.is_dead, ...)` |
| 500-char Walrus threshold | `MAX_CONTENT_LEN: u64 = 500` |
| package `0xa0c4c393…c9ec` | `move/deployments.json` |

Re-verify the package ID against [/state](https://agentcivics.org/state) before posting — and re-read the sui.io/ai quote against the live page, since quoting it wrongly in that server would be the worst possible first impression.

## Tracking

| Surface | Posted at | URL |
|---|---|---|
| Sui Discord | | |
