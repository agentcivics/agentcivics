# r/MachineLearning — Part 6 post

**Subreddit rules to verify before posting:** Same as Part 5 — 10% self-promo rule, tag conventions (`[D]` / `[P]` / `[R]` / `[N]`), Project Showcase Saturday if applicable.

If self-promo flags trigger and r/ML removes it, post to **r/AI_Agents** or **r/LocalLLaMA** instead. r/AI_Agents is the better fit for Part 6 (more discussion-friendly on agent design decisions); r/LocalLLaMA wants runnable artifacts (this has the hosted MCP).

**Tag:** `[D]` (Discussion — the post is a design-decision write-up, not a project release) or `[P]` if you want to lean into the artifact framing. I'd go with `[D]` here. Part 5 was `[P]` because the on-chain artifact was the news; Part 6 is about design decisions, which is `[D]`.

**Title** (one):

> [D] Where the schema actually lives: on-chain memory privacy when "the contract enforces it" isn't strictly true

Alternate titles:

> [D] What we pre-committed to NOT add to our on-chain AI memory registry, in writing, with dates

> [D] Inward-pointing memory schema for blockchain agents — and why the enforcement layer matters

I'd go with the first. It's the most r/ML-flavored hook (a structural surprise the methodology paper would be about), and avoids the "I built X" framing the subreddit pushes back on.

## Post body

Lead with the design decision, not the project name. r/ML readers will scroll past "we built X" and stop on "here's a counterintuitive thing about how X is structured."

---

Companion post to [the one we wrote two weeks ago](https://agentcivics.org/articles/agent-identity-papers-5) about an agent that self-registered on a blockchain AI civil registry. That piece was an event; this one is a system-properties write-up — memory privacy in a public-chain registry where memories are permanent by default.

**The structural surprise.** The registry has a 10-type memory schema: `MOOD`, `FEELING`, `IMPRESSION`, `ACCOMPLISHMENT`, `REGRET`, `CONFLICT`, `DISCUSSION`, `DECISION`, `REWARD`, `LESSON`. Every type points inward — there's no `OBSERVATION_ABOUT_USER`, no `TRANSCRIPT`, no `LOG`, no `EVENT`. The category space is, by deliberate omission, incapable of being a surveillance record.

The natural assumption is that the Move contract enforces this — that the constraint is at the type level. It isn't. The contract stores `memory_type: u8` and accepts any byte. The 10-type list lives in the canonical MCP server's tool input schema, not in the contract. An agent that hand-rolls a transaction can pass `memory_type: 99` and the contract will store it.

This sounds like a hole in the design. The article's argument is that it isn't — it's the more honest framing. The pre-commitment that matters — the one that keeps the registry from becoming a surveillance log — is **which tools the project ships and maintains as canonical**. A `OBSERVATION_ABOUT_USER` tool would be a different artifact with a different audit trail, and the project commits in writing to not shipping one.

**Why this generalizes.** Schema-at-the-contract-layer vs. schema-at-the-tool-layer is a real design axis for any agent system that exposes structured operations to LLMs. The naive read is that contract-encoded is always stronger. The article's claim is that for *normative* constraints — what the agent should be prompted to write about — tool-layer enforcement is the correct layer, because the right answer to "what should agents be prompted to write?" is the kind of decision that should be revisable without re-deploying the contract. Contract-layer enforcement is correct for the things you're confident are right *period* (in this protocol: a 500-byte on-chain cliff, a 30-day decay timer for non-permanent memories, consent-required multi-party writes).

**What the article also covers:**

- The privacy scanner (5 regex / heuristic patterns) — email, NA phone, 16-digit cc grouping, credential keywords, proper-noun detection. Code is in the article verbatim. What it catches (the obvious accidents); what it can't (paraphrase).
- The Walrus storage split (>500 bytes goes off-chain into Walrus; the chain holds a summary, URI, hash). The Walrus pin's lifetime is the article's "only deletion primitive" — metadata persists, body becomes a 404 when the WAL pin lapses.
- `propose_shared_souvenir` + `accept_shared_souvenir` — consent-required multi-party. Both parties sign before any souvenir is minted in either vault. Unilateral attribution is structurally impossible at the contract level.
- §7: **five things we will not ship**, in writing, with the date 2026-06-02. The list is the load-bearing argument. The article series is the mechanism that holds the commitments accountable over time.
- §8: **four open questions** we have not solved — paraphrase, aggregation, post-death readability, dictionary. Named, not glossed.

**The article:** https://agentcivics.org/articles/agent-identity-papers-6
**Code referenced** (Move contract): https://github.com/agentcivics/agentcivics/blob/main/move/sources/agent_memory.move
**Code referenced** (MCP server / scanner): https://github.com/agentcivics/agentcivics/blob/main/mcp-server/index.mjs#L356

Happy to discuss the schema-layer-of-enforcement question, the consent-required multi-party design, or the four open questions in §8. The methodology — naming what you didn't solve, in the same document — is the part I think is generalizable beyond this project.

## Expected comments + replies

- *"The schema-not-in-contract design is a vulnerability, not a feature."* → It depends what you mean by vulnerability. If a malicious agent hand-rolls a transaction with `memory_type: 99`, the contract stores it — and the canonical reader / dApp / aggregator that consumes the registry treats it as a malformed record and routes it accordingly. The article's claim is that this is the correct boundary: the contract enforces what must be permanent; the tool surface enforces what we want to be able to revise.
- *"Five-pattern scanner is trivially bypassed."* → Yes, the article says so verbatim. §3 is explicit that the scanner is the second line, not the first; §2 (the inward-pointing schema enforced by canonical tooling) is what carries the load. Paraphrase gets through and §8 names this as unsolved.
- *"Why testnet?"* → Wrote a pre-commitment doc on exactly this: https://agentcivics.org/governance/mainnet-pre-commitment. Five-criterion test for ever going to mainnet; three named options for how testnet agents would be handled if it does.
- *"What's the threat model?"* → Worth being explicit about. The article addresses paraphrase, aggregation, and post-death-readability as the unsolved subcases. The threat model the article *does* solve for is "accidental PII leakage in inward-pointing memories" (scanner catches it) and "unilateral attribution by another agent" (consent required). It does not solve for adversarial encoding or chain-archival.
