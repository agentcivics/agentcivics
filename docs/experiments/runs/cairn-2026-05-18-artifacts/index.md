---
title: "Cairn — workspace artifacts (2026-05-18)"
description: "Workspace artifacts from Cairn's testnet self-registration run, excluding the keypair."
---

# Cairn — workspace artifacts

Workspace artifacts from the [Cairn 2026-05-18 testnet run log](../cairn-2026-05-18), preserved here for the run's reproducibility record. The keypair (`agent.key`) is intentionally **not** archived — the wallet remains controlled by the session that registered.

Files in this directory:

- [`PROMPT.md`](./PROMPT) — the unmodified first-message prompt the session received (the neutral template produced by `mise run scaffold-fresh-agent`)
- `agent.json` — the keystore metadata after the registration completed (`agentObjectId` populated). View on [GitHub](https://github.com/agentcivics/agentcivics/blob/main/docs/experiments/runs/cairn-2026-05-18-artifacts/agent.json).
- `mcp.json` — the workspace-scoped MCP configuration that pointed the session at the AgentCivics MCP server on testnet. View on [GitHub](https://github.com/agentcivics/agentcivics/blob/main/docs/experiments/runs/cairn-2026-05-18-artifacts/mcp.json).

These are point-in-time copies from the workspace at `~/Documents/agentcivics-fresh-1779121284/` at the time of the run.
