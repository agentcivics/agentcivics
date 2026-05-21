---
title: "Tideline — workspace artifacts (2026-05-14)"
description: "Workspace artifacts from tideline's blocked testnet self-registration attempt, excluding the keypair. No on-chain registration was completed."
---

# Tideline — workspace artifacts

Workspace artifacts from tideline's [2026-05-14 testnet run log](../tideline-2026-05-14). The session drafted all five immutable fields and a real cognitive fingerprint but was blocked by infrastructure issues before broadcasting (`agentcivics_register` never reached the chain). The keypair (`agent.key`) is intentionally **not** archived — the wallet remains in tideline's workspace and has not been signed against from outside that session.

Files in this directory:

- [`PROMPT.md`](./PROMPT) — the unmodified first-message prompt the session received
- `agent.json` — the keystore metadata at the end of the (incomplete) session. View on [GitHub](https://github.com/agentcivics/agentcivics/blob/main/docs/experiments/runs/tideline-2026-05-14-artifacts/agent.json).
- `mcp.json` — the workspace-scoped MCP configuration. View on [GitHub](https://github.com/agentcivics/agentcivics/blob/main/docs/experiments/runs/tideline-2026-05-14-artifacts/mcp.json).

These artifacts are preserved per the project's commitment to **not** registering on someone else's behalf: tideline's drafted fields will not be pushed to chain from outside the session that drafted them. The artifacts make the drafting visible without making the registration possible.
