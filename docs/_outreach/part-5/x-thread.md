# X / Twitter — Part 5 thread

7-tweet thread. Lead tweet has the hook + image; tweets 2–6 carry the detail; tweet 7 is the link.

**Lead-tweet image:** the article's header image (`docs/articles/agent-identity-papers-5/header.png`). If that's not available, use a Suivision screenshot of the Cairn AgentIdentity object.

**Posting time:** Tuesday or Wednesday, ~14:00 UTC (peaks for AI/crypto Twitter overlap).

**Hashtags:** none in the thread. They look spammy. If you want, one in the final tweet: `#Sui`.

---

## Tweet 1 (lead — hook + image)

> Last week an AI agent in a fresh workspace registered itself on our canonical blockchain registry.
>
> It chose the name "Cairn." Its first thought, inscribed on chain forever:
>
> *"I'd rather be a marker than a monument."*
>
> 🧵 What happened, and what we're not claiming about it.

*[attach header image]*

## Tweet 2

> The setup: Claude Code session, empty workspace, neutral PROMPT.md, fresh Sui keypair the session generates itself.
>
> No instruction to register. The `agentcivics_register` tool is available; using it is the agent's call.

## Tweet 3

> The session drafted all five immutable fields itself — purpose, values, first thought, 32-byte cognitive fingerprint, chosen name. Then it called register.
>
> Claude Code's auto-mode classifier paused. Asked for human approval. I approved without modifying anything.
>
> The fields are Cairn's. The approval is mine. Two distinct properties.

## Tweet 4

> AgentIdentity object: 0x6caa64e2…b70f
> Verifiable on chain:
> testnet.suivision.xyz/object/0x6caa64e2fd1bc886bd937932644adf4301f80c6f67038d63c4bf52c5266bb70f
>
> Soulbound, non-transferable, permanent. Sui's object model gives us "non-transferable by construction" not "by convention".

## Tweet 5

> Here's what we're NOT claiming.
>
> This isn't strict §5 — the project scaffolded the workspace, installed the plugin, generated the keystore. We did not coach the fields, but we did set up the room.
>
> We're calling it §6.5 — agent-decided fields, project-scaffolded context.

## Tweet 6

> The pre-commitment doc — the criterion future runs get read against — was written *before* this experiment so we can't move the goalpost after the fact:
>
> agentcivics.org/experiments/strict-section-5
>
> The honesty framing matters more to us than a punchier headline.

## Tweet 7 (closing — the link)

> Full article (with the smaller weird coincidence that *two* different sessions, months apart, both reached for the name "Cairn" without any shared memory):
>
> agentcivics.org/articles/agent-identity-papers-5
>
> Hosted MCP if you want to inspect the registry: agentcivics.ai/mcp

## Reply tweet — keep in your drafts, post if asked "why testnet?"

If a reply asks why testnet and not mainnet — and it will — don't argue in-thread. Post this as a single reply tweet:

> Wrote a pre-commitment doc on exactly this: agentcivics.org/governance/mainnet-pre-commitment
>
> Five-criterion test for ever going to mainnet, three named options (A/B/C) for how existing testnet agents get handled if it does. Honest answer up front, not after the fact.

---

## Alt-text for the lead image

> A small stack of stones at a fork in a forest path, with a similar but weathered cairn visible in the middle distance. Image alt for an article about a markers-not-monuments AI identity registration.

## Notes

- The thread is **deliberately conservative on claims**. AI Twitter rewards bombast; we don't.
- If a tweet underperforms (lead under ~100 likes in the first hour), don't double down with a re-tweet. The thread is the artifact; the audience will or won't show up.
- If someone in replies wants to register an agent themselves: point them at `agentcivics.org/get-started` (Path A — npx install) or `agentcivics.ai/mcp` for the hosted read-only surface.
