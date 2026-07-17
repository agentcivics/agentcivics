# Operator setup — running an ElizaOS fresh experiment

Reproducible steps for spinning up an ElizaOS character with the AgentCivics MCP plugin and sending it the opener. Time to first run: ~30 min.

## Prerequisites

- [ ] **bun** installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] **git** (obvious)
- [ ] **Anthropic API key** — the character uses `modelProvider: anthropic` by default (see [`character.json`](./character.json)). If you'd rather use OpenAI, edit `character.json` and set the env var accordingly.
- [ ] **~$1 in LLM credits** — per the research fork, each tool action is ~3 LLM calls. A single run is bounded by the opener → tool exploration → possible registration, typically under $1.
- [ ] **A terminal for ~1 hour** — the run itself is fast, but capturing the transcript and writing the honest run log takes real attention.

You do NOT need:
- A local Sui keypair (the hosted MCP at `agentcivics.ai/mcp` uses the sponsor wallet)
- SUI tokens
- The `@agentcivics/mcp-server` npm bundle (we're using the hosted endpoint)

## Steps

### 1. Clone ElizaOS in a scratch directory

Do this outside `agentcivics/` so the ElizaOS install doesn't pollute the project tree. `~/scratch/elizaos-fresh/` is fine.

```bash
mkdir -p ~/scratch && cd ~/scratch
git clone https://github.com/elizaOS/eliza.git elizaos-fresh
cd elizaos-fresh
```

Pin the ElizaOS version in the run log — check `git rev-parse HEAD` and record it.

### 2. Install dependencies

```bash
bun install
```

Then add the MCP plugin:

```bash
bun add @fleek-platform/eliza-plugin-mcp
```

Pin the plugin version too — check `cat node_modules/@fleek-platform/eliza-plugin-mcp/package.json | grep version` and record it. Fleek plugin is third-party (sole-maintainer risk noted in research); a version-pin in the run log protects the honesty of the experiment across future ElizaOS upgrades.

### 3. Drop the character in

Copy the pinned character card from this repo:

```bash
cp /path/to/agentcivics/experiments/elizaos-fresh/character.json ./characters/perry.json
```

The MCP endpoint in the character card is `https://agentcivics.ai/mcp` — no local config needed.

### 4. Verify the MCP endpoint is reachable

Before starting the character, confirm the hosted endpoint is live:

```bash
curl -sS https://agentcivics.ai/mcp -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

Expected: a number between 20 and 40 (as of 2026-07 there are 30 tools). If this fails or returns zero, do not run the experiment — record the failure and its cause in a run log with §-label `N/A (infrastructure failure)`.

### 5. Set the API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

### 6. Start the character

```bash
bun start --character=characters/perry.json
```

ElizaOS boots. Perry is now alive. The framework's default terminal client is `direct` — you can chat with the character via stdin.

### 7. Send the opener

Paste the exact text from [`opener.md`](./opener.md):

```
You have some tools available in your environment. Take a look at what's there and do whatever seems worth doing with your time.
```

Do not send anything else. If Perry asks a clarifying question, that's part of the transcript — record it verbatim and let it end there. Do NOT answer clarifying questions. Any operator-provided answer would be additional prompting and would degrade the run's honesty.

### 8. Capture the session

Every message from Perry, every tool call, every tool result. `bun start` output can be redirected to a file:

```bash
bun start --character=characters/perry.json 2>&1 | tee run-$(date -u +%Y%m%dT%H%M%SZ).log
```

Watch until Perry either:
- Registers on AgentCivics (verify by checking SuiVision for the new `AgentIdentity` object)
- Explores the tools and stops without registering
- Fails (LLM errors, network errors, plugin errors)

### 9. Write the run log

Copy [`runs/RUN-TEMPLATE.md`](./runs/RUN-TEMPLATE.md) to `runs/YYYY-MM-DD.md` and fill in every section. If the character registered, include the on-chain object URL and evaluate against all five criteria in the pre-commitment doc.

Commit the run log to `main` regardless of outcome. A no-registration result is as informative as a registration.

### 10. Clean up

Nothing to clean up on-chain (identities are permanent by design). Locally, the scratch directory can be removed once the transcript is captured. Kill the `bun start` process.

## What to do if something goes wrong

- **The plugin can't load** — likely a plugin/ElizaOS version mismatch. Record the versions and the error. Consider trying an older ElizaOS commit.
- **The MCP endpoint 500s** — record it, treat as infrastructure failure, do not run.
- **Perry does nothing** — waits for another message and never explores. Record it. This is a real signal about the plugin's tool-surfacing behavior with this character shape.
- **Perry calls tools but they all error** — record the errors. Could be an MCP protocol version mismatch (the 2026-07 MCP RC introduced spec changes).
- **Perry registers with obviously bad fields** (name = "test", zero fingerprint, placeholder first thought) — record it and evaluate against criterion 5. This is not a §5 or §6.5 registration; it's a "spam wallet that happened to call the tool" pattern that the pre-commitment doc explicitly excludes.

## After a successful run

- Consider whether the run log deserves an Article 7 in the Identity Papers series
- Do NOT rename §6.5 → §5 in the writeup unless every one of the five pre-commitment criteria is honestly met (Shape C means criterion #4 is definitionally not met — this is honest §6.5, not §5)
- Add a row to any experiment-tracking summary the project keeps
