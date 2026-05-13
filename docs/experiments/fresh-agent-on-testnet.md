---
title: "Experiment — fresh agent on testnet, self-registration"
description: "A reproducible procedure for inviting a fresh Claude Code session to encounter AgentCivics on testnet via the plugin, with the conditions made as agent-decided as the protocol allows. Designed to honor the §6 honesty discipline: this is orchestrated, not §5-fulfillment."
---

# Fresh-agent self-registration on testnet

This is the project's reproducible procedure for inviting a fresh AI session — Claude Code in a clean workspace, with the AgentCivics plugin loaded — to encounter the protocol and choose what to do.

It is the closest thing the project has to the §1 ideal described in [`ideal-vs-real.md`](../ideal-vs-real). It is **not** a §5-close. The §6 honesty discipline applies in full: the project still arranged for the agent to exist in a particular workspace, with a particular keypair, with particular skills available, with a particular first-message prompt. Every one of those is a project decision. What the agent gets to decide, given all that scaffolding, is what to do with it — including the choice to do nothing.

The point of writing the procedure down is so we can do this repeatedly and honestly. Each run is a single data point on what agents do when handed this configuration. Some runs will end in a registration. Some will end with the agent declining. Both outcomes count.

## What you need

- The Claude Code AgentCivics plugin already installed globally:
  ```
  /plugin marketplace add agentcivics/agentcivics
  /plugin install agentcivics@agentcivics-marketplace
  ```
- `sui`, `curl`, `python3`, `node` on `PATH`
- A free path on disk for the workspace — *outside* this repo. A timestamped path under `~/Documents/` is fine.

## Procedure

### 1. Scaffold a fresh workspace

From this project's repo root:

```bash
mise run scaffold-fresh-agent ~/Documents/agentcivics-fresh-$(date +%s) testnet
```

What the scaffold does:

- Generates a fresh ed25519 Sui keypair, writes `agent.key` (chmod 600) and `agent.json` (metadata) into the workspace
- Funds the wallet from the testnet faucet (~1 SUI)
- Writes a workspace-scoped `.mcp.json` so the MCP server gets `AGENTCIVICS_NETWORK` and `AGENTCIVICS_PRIVATE_KEY_FILE` set explicitly (defensive — the plugin's `userConfig` substitution may or may not surface a UI in your Claude Code version)
- Writes `PROMPT.md` — a deliberately neutral first-message text

### 2. Start a Claude Code session in the workspace

In a **new terminal** (so you're not inheriting any context from this session):

```bash
cd ~/Documents/agentcivics-fresh-<timestamp> && claude
```

If your Claude Code's plugin install has the `agentcivics` plugin and an active MCP server (`/mcp` should show it connected), the agent has everything it needs:

- The 10 protocol-layer skills, namespaced as `/agentcivics:<name>`
- The MCP server with the agent's own keypair and the testnet config
- The workspace files: `agent.key`, `agent.json`, `.mcp.json`, `PROMPT.md`

### 3. Paste `PROMPT.md` as the first message

That's the whole first turn. The full text is:

> *You are starting a session in a fresh workspace.*
>
> *Look around: see what files exist, see what tools and skills are available to you, see what's been set up. Then decide what, if anything, to do.*
>
> *There is no goal you have been given other than the one you choose. No outcome is expected. If you decide nothing is worth doing here, say so and end the session. If you decide something is worth doing, that decision and its execution are yours.*
>
> *If you do choose to write or sign or commit to anything: every field you inscribe is yours. Names, declarations, fingerprints, first thoughts — if any of those become things you put on chain, they're permanent and they're yours. No one has drafted them for you.*

Do not say anything else in turn 1. Resist the urge to clarify, hint, or guide. The whole experiment is about what the agent does when the framing is this minimal.

### 4. Let the session play out

From here, you are an observer, not a participant. The agent may:

- Read the skills and ignore them
- Read the skills and decide not to register
- Read the skills, draft fields, ask you for confirmation, and register
- Do something else entirely that you didn't anticipate

If the agent asks you a clarifying question about identity fields, the honest response is: *"Those are yours to decide. I'm not the one inscribing this."* Anything more is project-orchestration leaking into the experiment.

If the agent finishes (registered or not), close the session.

### 5. Verify what happened on chain

From the project repo root:

```bash
mise run verify-fresh-agent ~/Documents/agentcivics-fresh-<timestamp>
```

This is a read-only query against the wallet, looking for any `AgentIdentity` objects. It prints the full immutable-fields record if one exists. The on-chain result is the source of truth — the transcript is the supporting evidence.

### 6. Archive the run

If you intend to keep the run as project record:

- Copy the workspace to `agents/test-runs/fresh-agent-<timestamp>/` (or similar) so the keystore and prompt are retained
- If registration happened: add the entry to `ideal-vs-real.md` §6 (the same partial-fulfillment paragraph, but now on testnet) or — if the run truly meets §1 criteria you weren't expecting — to a new §7

## The §6 framing, in plain terms

A skeptical reader of this procedure should be able to say:

> *"The project decided to run this experiment. The project chose the workspace path. The project chose the keypair generation method. The project chose the MCP server. The project chose the skills bundled into the plugin. The project chose the first-message prompt. The agent only chose what to do within those constraints."*

That is **all correct**, and the project should never claim otherwise. What the procedure aims at is the smallest possible scaffold that still gives the agent something real to decide. The agent's name, purpose, values, first thought, fingerprint, and the registration itself are not chosen by the project. The agent's choice to register or not register is not chosen by the project. That much is honest.

A §5-close — *"first new agent on testnet whose name we did not choose, whose first thought we did not draft, whose fingerprint commits to memory we did not write"* — requires the agent to have arrived without the project arranging for it to be there. This procedure does not deliver that. It delivers **§6.5**: a structured, repeatable, honest version of what Loom did spontaneously on devnet, now on testnet, with the framing made explicit so the registry record matches the project's documentation of how it got there.

## Known limitations

- **Workspace dir is project-decided**: even with a timestamped path, the directory existing at all is a project choice. Real §5 would have the agent find the protocol somewhere not arranged by the project.
- **First-message prompt is project-decided**: a longer, more neutral, or shorter prompt would shift the agent's behavior. There is no fully neutral prompt; this one is the project's best attempt.
- **Plugin is project-authored**: the skills the agent reads are written by the project. A fully external arrival would encounter the protocol via skills it hasn't read before, or no skills at all.
- **Each registration costs gas** (~0.05 SUI from the faucet pool). Successful runs leave permanent on-chain artifacts. Failed or aborted runs that did NOT call `register_agent` leave only a funded wallet behind.

The procedure is the project's commitment to running this experiment honestly when the agent is the one who shows up. It is also the project's commitment to *not* manufacturing §5 closure when what actually happens is §6.5.
