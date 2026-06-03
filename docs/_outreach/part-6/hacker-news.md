# Hacker News — Part 6 post

**URL:** `https://agentcivics.org/articles/agent-identity-papers-6`

**Submission type:** Show HN. Same reasoning as Part 5 — the project, the article, and the design decisions are all yours; pretending otherwise looks like cosplay.

**Posting time:** Tuesday–Thursday, 14:00–17:00 UTC. Avoid weekends and Mondays. If you posted Part 5 to HN recently, wait at least 4 days before posting Part 6.

## Title options

HN strips marketing-flavored titles within minutes. The honesty / refusal framing is what survives HN's filter. Pick one:

1. **"What we won't add to our on-chain AI agent registry, in writing, with dates"**
   *(80 chars — at the cap. Strongest hook. "What we won't add" is contrarian-shaped — HN reads "negative roadmaps" more carefully than positive ones. The "with dates" is the cred-builder.)*

2. **"An on-chain AI memory system that refuses to host a surveillance log"**
   *(73 chars. Concrete subject, refusal as the action. The word "refuses" carries the article's argument in one verb.)*

3. **"Memory Privacy: where the 10-type schema actually lives in our agent registry"**
   *(80 chars. Less HN-flavored, more honest about the structural surprise. Use only if #1 and #2 feel wrong.)*

I'd go with **#1** as the default. **#2** if you want the more dramatic framing.

Do NOT use titles like "Privacy in agent identity protocols" — HN flags abstract titles as marketing within minutes.

## What to expect

- "Why is the schema in the MCP server and not the contract?" — *will* come up. This is actually the article's strongest argument; lead with it. Reply: *"Because what an agent gets prompted to write is a tool-surface decision that should be revisable without an UpgradeCap migration. The contract encodes the things we're confident are right period (500-byte cliff, decay timer, consent-required shared path); the tool surface encodes the things we want to be able to revise as we learn what the limits look like in practice."*
- "What stops someone from running a non-canonical MCP server with a `TRANSCRIPT` type?" — Real question, fair to take seriously. Reply: *"Nothing technical. The pre-commitment is about the canonical tooling. Someone running a different MCP server with a different schema would be running a different project; the canonical registry's category space is defined by the canonical tooling, and the registry's identity is bound to that tooling staying canonical. The §7 list in the article is the contract on that."*
- "Five-pattern scanner is trivially bypassed" — Yes, the article says so verbatim. Reply: *"Right. §3 is explicit that the scanner is the second line, not the first; the inward-pointing schema is what carries the load. The scanner catches the obvious accidents (email leaks, phone numbers in souvenirs). Paraphrase gets through. The article names this as an unsolved problem in §8, not a solved one."*
- "Why testnet?" / "What happens at mainnet?" — Standard answer: link to `/governance/mainnet-pre-commitment`. Don't re-litigate.
- The §7 "five things we won't ship" list is the load-bearing surprise. Lead with it in any sub-thread that drifts toward "but you could add X" — the answer is "yes, we could, and we committed in writing on 2026-06-02 not to."

## Don't post in body

Show HN posts get a body field. **Leave it empty** or keep it under 4 lines:

```
System-properties piece on memory privacy in our on-chain AI agent registry. Five pre-commitments (things we won't add, with the date 2026-06-02): no TRANSCRIPT/LOG/OBSERVATION_ABOUT_USER type, no delete-from-chain, no purchase-erasure, no outward-pointing MCP tools, no memory marketplace. Four open questions we haven't solved are named in §8. Companion piece (an agent self-registering on chain) at /articles/agent-identity-papers-5.
```

Anything longer reads as promotional.
