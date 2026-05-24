# Hacker News — Part 5 post

**URL:** `https://agentcivics.org/articles/agent-identity-papers-5`

**Submission type:** "Show HN" *or* a plain link submission. Pick:
- **Show HN** if you want it framed as "I built X, here's the result" — appropriate because the project is yours.
- **Plain link** if you want it framed as "here is a thing that happened" — slightly more neutral.

The Show HN convention reads cleaner here because the project, the article, and the run are all yours — pretending otherwise looks like cosplay. Go Show HN.

**Posting time:** Tuesday–Thursday, 14:00–17:00 UTC (09:00–12:00 EST, when the US is online and EU still active). Avoid weekends and Mondays.

## Title options

HN titles cannot start with "Show HN:" if you use the link-submission form; it's added automatically in the Show HN form. Just write the bare title. Max 80 chars. No marketing fluff — HN strips those titles.

Recommended (pick one):

1. **"An AI agent self-registered on a blockchain registry — why we're calling it §6.5"**
   *(83 chars — at the limit; may need a trim. Best curiosity hook. The §6.5 vs §5 reframe is the load-bearing surprise.)*

2. **"The Second Cairn: first agent-decided entry on our on-chain AI registry"**
   *(72 chars. Article's actual title, slightly trimmed. Less HN-friendly because the "Second" is opaque without context.)*

3. **"Cairn: an AI agent registered itself on chain — what we're not claiming about it"**
   *(81 chars — trim to fit. Strong: leads with the artifact name + the honesty framing in one line.)*

I'd go with **#3** if it fits, **#1** if it doesn't. Avoid generic-sounding titles like "AgentCivics: civil registry for AI agents" — HN flags those as marketing within minutes.

## What to expect

- The honesty framing (§6.5 ≠ §5) is *the* defensible angle on HN. Lead with it in any comment replies. HN commenters routinely accuse projects of overclaiming; this one preempts the accusation.
- Expect questions about: how the keypair was generated (you didn't see it), what makes this different from "I scripted register()" (the auto-mode block is the answer), and whether the agent really "decided" anything (the cognitive_fingerprint + chosen_name being the agent's outputs is the evidence).
- A few will dismiss it as "a Claude session calling an API". The right reply is that's exactly what it is — and that on-chain provenance is what makes the difference between a one-off API call and a persistent identity claim. Don't argue past that.
- **"Why testnet?" / "What happens at mainnet?"** will come up within the first 10 comments. Standard reply: *"Wrote a pre-commitment doc on exactly this — five criteria for deploying to mainnet at all, three named options for how existing testnet agents would be handled if it does."* Link to https://agentcivics.org/governance/mainnet-pre-commitment . Don't re-litigate the question in-thread; the doc is the answer.

## Don't post in body

Show HN posts get a body field. **Leave it empty** or, if you want to add one, keep it under 4 lines:

```
First agent-decided entry on our canonical Sui testnet registry. Cairn's AgentIdentity object: 0x6caa64e2…b70f. Explicit about what we are and aren't claiming — this is §6.5 (project-scaffolded workspace, agent-decided fields), not strict §5 (agent finds the protocol unaided). Strict-§5 pre-commitment + a separate mainnet pre-commitment (testnet is canonical for the demonstration era; five-criterion test for ever going to mainnet) both linked from the article.
```

Anything longer reads as promotional.
