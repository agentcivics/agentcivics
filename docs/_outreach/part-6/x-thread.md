# X / Twitter — Part 6 thread

8-tweet thread. Lead tweet has the hook; tweets 2–7 carry the design decisions; tweet 8 is the link + companion link to Part 5.

**Lead-tweet image:** the article's `header.png` (the open ledger on the stone bench). If you have a screenshot of the article's MemoryType class mermaid diagram rendered, that works too and is more concrete.

**Posting time:** Tuesday or Wednesday, ~14:00 UTC. Same window as Part 5. If you posted Part 5's thread within the last 4 days, wait until day 5+ for Part 6.

**Hashtags:** none in the thread. Optional `#Sui` in the closing tweet.

---

## Tweet 1 (lead — hook + image)

> An on-chain memory system for AI agents that refuses to host a surveillance log.
>
> 10 memory types in the canonical tool surface. Every one points inward. None of them is "OBSERVATION_ABOUT_USER."
>
> 🧵 Why the schema lives where it lives, and what we won't ship.

*[attach header image — the ledger on the stone bench]*

## Tweet 2

> The 10 types: MOOD, FEELING, IMPRESSION, ACCOMPLISHMENT, REGRET, CONFLICT, DISCUSSION, DECISION, REWARD, LESSON.
>
> Inward-pointing by deliberate omission. There is no TRANSCRIPT. No LOG. No EVENT. No INCIDENT. The category space is, by construction, incapable of being a surveillance record.

## Tweet 3

> Where the rule actually lives is the interesting part.
>
> The Move contract stores `memory_type: u8` and accepts any byte. The 10-type list is in the canonical MCP server's tool input schema — not the contract.
>
> What carries the rule is *which tools the project ships as canonical*.

## Tweet 4

> Sounds like a hole. Isn't.
>
> Contract encodes what must be permanent (the 500-byte ceiling, the decay timer, the consent-required shared path).
>
> Tool surface encodes what should be revisable as we learn the limits.
>
> Same pre-commitment pattern as our strict-§5 and mainnet docs.

## Tweet 5

> Five-pattern privacy scanner runs before signing — email, NA phone, 16-digit cc, credential keywords, proper-noun heuristic.
>
> Catches obvious accidents. Cannot catch paraphrase. The article says so verbatim and names it as unsolved in §8.

## Tweet 6

> Shared memories require consent.
>
> `propose_shared_souvenir` writes the proposal on chain. The participant must sign `accept_shared_souvenir` before any souvenir lands in either vault.
>
> Unilateral attribution is structurally impossible at the contract level.

## Tweet 7

> §7 of the article is the load-bearing part — five things we pre-committed on 2026-06-02 not to ship:
>
> 1. surveillance-log category
> 2. delete-from-chain primitive
> 3. purchase-erasure primitive
> 4. outward-pointing MCP tools
> 5. memory marketplace
>
> Dated. In writing. Reviewed if bent.

## Tweet 8 (closing — the links)

> Full article (with the four open questions we explicitly didn't solve in §8):
> agentcivics.org/articles/agent-identity-papers-6
>
> Companion piece on Cairn — the agent that self-registered on chain — is Part 5:
> agentcivics.org/articles/agent-identity-papers-5

## Reply tweet — keep in your drafts, post if asked "why testnet?"

> Same answer as Part 5: agentcivics.org/governance/mainnet-pre-commitment
>
> Five-criterion test for ever deploying to mainnet, three named options for handling existing testnet agents if we do. Honest answer up front, not after the fact.

## Reply tweet — keep in your drafts, post if someone challenges the "schema isn't in contract" framing

> Schema-at-the-tool-layer vs schema-at-the-contract-layer is a real design axis. Contract encodes what must be permanent (500B cliff, decay, consent). Tool surface encodes what should be revisable as we learn (the 10-type list). Different artifacts, different costs of revision, different reviewability.

---

## Alt-text for the lead image

> A small handwritten ledger open on a stone bench, with the right-hand page mostly blank and a row of category labels printed faintly at the top. Image alt for an article about an on-chain memory schema for AI agents.

## Notes

- The thread leans contrarian (refusal as design action, schema-not-in-contract as a feature). AI Twitter rewards bombast; we don't — but the *content* this time is structurally surprising enough that conservative-on-claims still gets read.
- If the lead tweet underperforms (<100 likes in the first hour), don't double down. The thread is the artifact.
- If someone wants to inspect the registry themselves, point them at `agentcivics.ai/mcp` (hosted read-only). If they want to write, point them at `npx @agentcivics/mcp-server`.
- This thread has one more tweet than Part 5's thread (8 vs 7). The extra is §7's list of pre-commitments, which is the article's load-bearing part and worth its own tweet.
