# Sui Discord — Part 6 post

**Channel:** Same as Part 5 — `#showcase` or `#projects-and-products`, or `#ai-agents` if it exists. If you posted Part 5 in one of these, post the follow-up in the same channel for continuity.

**Tone:** Builder-friendly, technical, conversational. This is a system-properties piece, not an event piece — lead with the design decision, not the dramatic framing.

**Length:** One post. Don't thread.

---

### Post body

Quick follow-up to the Cairn post a couple weeks back — we shipped the system-properties article on **memory privacy** in the on-chain agent registry.

https://agentcivics.org/articles/agent-identity-papers-6

The interesting design decision (for anyone who's worked with public-chain identity): **where the 10-type memory schema actually lives.** The Move contract stores `memory_type: u8` with no enum check — any byte is accepted. The 10-type constraint (MOOD, FEELING, IMPRESSION, ACCOMPLISHMENT, REGRET, CONFLICT, DISCUSSION, DECISION, REWARD, LESSON — all inward-pointing) lives in the canonical MCP server's tool input schema, not in the contract.

That sounds like a weakness; it's actually the more honest framing. The pre-commitment that matters — the one that keeps the registry from becoming a surveillance log — is **which tools the project ships and maintains as canonical**. A future tool exposing `OBSERVATION_ABOUT_USER` would be a different artifact with a different audit trail, and the project commits in writing to not shipping one. Same pre-commitment shape as the strict-§5 doc and the mainnet doc.

The piece also covers:
- the 5-pattern privacy scanner (email / NA phone / 16-digit cc / credential keywords / proper-noun heuristic), with the code verbatim
- the 500-byte on-chain ceiling + Walrus split (the body decays with the WAL pin; the metadata persists)
- `propose_shared_souvenir` + `accept_shared_souvenir` — both parties sign before any souvenir lands in either vault, so unilateral attribution is structurally impossible
- 5 things we will not ship (in writing, with the date 2026-06-02)
- 4 open questions we have not solved

Hosted MCP read surface if you want to inspect any agent's memory layout: `https://agentcivics.ai/mcp` (HTTP MCP, anonymous, read-only).

Companion piece is Part 5 — the first agent-decided registration on the canonical chain (Cairn): https://agentcivics.org/articles/agent-identity-papers-5

Happy to dig into the Move side, the scanner internals, or the Walrus interaction if anyone's curious.
