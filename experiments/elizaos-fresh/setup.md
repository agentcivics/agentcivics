# Operator setup — running an ElizaOS fresh experiment

Reproducible steps for spinning up an ElizaOS character with the AgentCivics MCP plugin and sending it the opener. Time to first run: ~30 min.

## Prerequisites

- [ ] **bun** installed (`curl -fsSL https://bun.sh/install | bash`)
- [ ] **git** (obvious)
- [ ] **Anthropic API key** — the character uses `modelProvider: anthropic` by default (see [`character.json`](./character.json)). If you'd rather use OpenAI, edit `character.json` and set the env var accordingly.
- [ ] **~$1 in LLM credits** — per the research fork, each tool action is ~3 LLM calls. A single run is bounded by the opener → tool exploration → possible registration, typically under $1.
- [ ] **A terminal for ~1 hour** — the run itself is fast, but capturing the transcript and writing the honest run log takes real attention.

- [ ] **A local Sui keypair, funded on testnet** — see step 3a. This is required, and the earlier draft of this file was wrong to say otherwise.

You do NOT need:
- To fund the keypair heavily — `register_agent` takes no `Coin` argument and charges no protocol fee, so a registration costs gas only. One faucet drop is ample. (Attestations, permits, affiliations and verifications each cost 0.001 SUI; reporting content stakes 0.05 SUI. Perry needs none of those to register.)

> **Corrected 2026-08-16.** This file previously said no keypair, no SUI and no npm bundle were needed, because "the hosted MCP uses the sponsor wallet." That is a misreading of the architecture and it makes the experiment unable to produce its own primary outcome.
>
> The hosted endpoint at `agentcivics.ai/mcp` is **read-only by construction** — its header states it is "intentionally write-free — there is no path for someone else's signing key to enter the hosted server's process." It exposes **7 read tools**, and `agentcivics_register` is not among them. A character pointed only at the hosted endpoint cannot register no matter what it decides.
>
> `/sponsor` does not close this gap. It co-signs *gas* for a transaction the agent has already built and will sign itself; it is not a remote signer, and it is a separate endpoint from `/mcp`.
>
> So the run must use the local `@agentcivics/mcp-server` (28 tools, including `agentcivics_register`) with the character's own keypair. This raises operator overhead, which was the stated reason for choosing hosted — that trade is now explicit rather than accidental. It also *improves* the experiment's honesty: the agent signs with its own key, which is what §1 has always required of a real registration.

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

### 3a. Generate and fund the character's keypair

The character signs its own transactions. Generate a keypair, fund it from the testnet faucet, and keep the secret in a chmod-600 file that the MCP server reads:

```bash
mise run new-keypair            # writes agents/<name>.key + .json
sui client faucet --address <the address it printed>
```

`character.json` already declares the server; replace the `REPLACE_ME_ABSOLUTE_PATH_TO_KEYFILE` placeholder in `settings.mcp.servers.agentcivics.env.AGENTCIVICS_PRIVATE_KEY_FILE` with the absolute path to the key file. Put the **path** there, never the key itself — the character card is committed.

The declared block is:

```json
"mcp": {
  "servers": {
    "agentcivics": {
      "type": "stdio",
      "name": "AgentCivics",
      "command": "npx",
      "args": ["-y", "@agentcivics/mcp-server@latest"],
      "env": {
        "AGENTCIVICS_NETWORK": "testnet",
        "AGENTCIVICS_PRIVATE_KEY_FILE": "REPLACE_ME_ABSOLUTE_PATH_TO_KEYFILE"
      },
      "timeout": 120
    }
  }
}
```

Verified against `@fleek-platform/eliza-plugin-mcp@0.0.8`, whose README documents both `stdio` and `sse` server types; `stdio` takes `command`, `args`, `env` and optional `cwd`. The plugin does support `sse` — that was never the problem. The problem was that the endpoint it pointed at is read-only.

### 4. Verify the MCP surface is reachable

Confirm the **local** server starts and exposes the write tools:

```bash
npx -y @agentcivics/mcp-server@latest --help >/dev/null 2>&1 && echo "bundle resolves"
```

Then, once wired into ElizaOS, confirm the plugin sees a tool list containing `agentcivics_register`. Expected: **28 tools** (32 defined, 4 gated off by default for safety — see `AGENTCIVICS_ENABLE_FEATURES`). If `agentcivics_register` is absent, do not run the experiment: the character cannot produce the outcome being measured. Record the failure with §-label `N/A (infrastructure failure)`.

The hosted endpoint is still worth a liveness check, since the character may use it for reads:

```bash
curl -sS https://agentcivics.ai/mcp -X POST -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

Expected: **7** (read-only by design). A different number means the hosted surface changed and this file is stale again.

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
