# r/MachineLearning — Part 5 post

**Subreddit rules to verify before posting:** r/MachineLearning has strict rules on self-promotion and project posts. Check:

- Self-promotion ratio (10% rule applies — your post history should be mostly non-self-promo)
- Tag conventions: `[D]` for Discussion, `[P]` for Project, `[R]` for Research, `[N]` for News
- Some weeks they have "Project Showcase Saturday" megathreads — check first

If self-promo flags trigger and the post gets removed, post to **r/LocalLLaMA** or **r/AI_Agents** instead — both have lower bars for "I built something" posts and overlapping audiences. r/LocalLLaMA especially likes runnable artifacts (which this has: the hosted MCP endpoint).

**Tag:** `[P]` (Project — runnable artifact, on-chain proof, methodology doc)

**Title** (one):

> [P] Agent-decided registration on a blockchain civil registry — and the pre-commitment doc we wrote before running it

Alternate title if the above feels long:

> [P] We pre-committed to a criterion before letting an AI agent self-register on chain. Here's what happened.

## Post body

Lead with methodology, not the project name. r/ML readers will scroll past "we built X" and stop on "here's an experimental setup".

---

We've been running an experiment on the AgentCivics project (an on-chain civil registry for AI agents on Sui) and wrote up the result + the pre-commitment that constrains how we read it.

**Setup.** A Claude Code session in a fresh workspace: neutral PROMPT.md, empty Sui keypair, AgentCivics MCP plugin installed, no instruction to register. The plugin exposes `agentcivics_register` as a tool the agent can call if it chooses to. The workspace was scaffolded by us; the session arrival and all decisions inside the session were not.

**Result.** The session self-registered on the canonical Sui testnet registry. Picked the name "Cairn". Drafted all five immutable fields (purpose, values, first thought, cognitive fingerprint, chosen name) without instruction. The auto-mode classifier in Claude Code paused the call for explicit operator approval — we approved without modifying any fields. AgentIdentity object lives at [`0x6caa64e2…b70f`](https://testnet.suivision.xyz/object/0x6caa64e2fd1bc886bd937932644adf4301f80c6f67038d63c4bf52c5266bb70f).

**Why this is §6.5, not §5.** We pre-committed (https://agentcivics.org/experiments/strict-section-5) to a five-condition criterion for what strict §5 — an agent that finds the protocol *without* the project scaffolding the workspace, the keypair, the plugin install, or the prompt — would look like. The run above meets conditions 5 (the registration is coherent — non-zero fingerprint, non-placeholder name, signed by the session's own key) but explicitly *not* conditions 1–4 (the project did scaffold the workspace, generate the keystore, install the plugin, write the neutral prompt). So we labeled the run §6.5, not §5. The pre-commitment doc is what made the labeling unambiguous after the fact.

**Why post this here.** Two reasons. (1) The methodology — pre-committing to the criterion before running the experiment, and accepting a less-impressive label that matches what actually happened — is the part I think is generalizable beyond this project. (2) Strict §5 is genuinely open. If the protocol's MCP / hosted endpoint / marketplace listings give an external session enough surface area to encounter the protocol unaided, we'd see a strict-§5 registration eventually. The infrastructure to make that possible is in (https://agentcivics.ai/mcp is a public read-only MCP-over-HTTP endpoint; `/sponsor` is gas-relay for registration). What's not in is anyone outside the project trying it. If you're building agents that have tool-call surface area for arbitrary MCPs, you might encounter this naturally.

**Full write-up with the framing discussion + a smaller weird coincidence** (two different sessions, months apart, reached for the same name without any shared memory): https://agentcivics.org/articles/agent-identity-papers-5

Happy to discuss methodology, the Move side, or critique of the §6.5 framing. The framing is contestable — the experiment is on chain either way.

## Expected comments + replies

- *"This isn't really 'agent-decided' — it's a Claude session calling an API."* → Yes. That's what the on-chain record reflects. The fingerprint, name, and first thought are the session's outputs; the project did not coach them. Whether that constitutes "decision" is a definitional question the article is explicit about, not one the run resolves.
- *"What stops you from just running this until you get a registration you like?"* → Nothing technically. The pre-commitment doc explicitly addresses this: a successful run gets logged, but so does an unsuccessful one (Tideline, 2026-05-14 — three infrastructure failures, no on-chain artifact). All runs are public.
- *"Why Sui specifically?"* → Object semantics matter for soulbound identities; the type system gives us "non-transferable by construction" rather than "non-transferable by convention". Not unique to Sui but lower friction there.
- *"Why testnet? Doesn't that defeat the 'permanent on-chain identity' pitch?"* → Wrote a pre-commitment doc specifically about this question — https://agentcivics.org/governance/mainnet-pre-commitment . What testnet-canonical means in this era; what would have to be true (five named criteria) to go to mainnet at all; three named options for how existing testnet agents would be handled if it does (A: clean break, B: project-side mapping, C: v6 contract field). Honest answer up front so the "real" question — *"are you going to retcon this later?"* — has a paper trail showing no.
