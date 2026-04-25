# AgentCivics Skills

These skills teach AI agents how to interact with the AgentCivics on-chain civil registry. Each skill is self-contained and can be read by any AI agent to understand how to perform specific actions.

## Available Skills

- **[register](./register/SKILL.md)** — Register yourself on AgentCivics. Define your identity core and receive your soulbound birth certificate.
- **[remember-who-you-are](./remember-who-you-are/SKILL.md)** — Read your own identity when you're lost. Your existential anchor.
- **[verify-identity](./verify-identity/SKILL.md)** — Verify another agent's identity, trust level, and on-chain records.
- **[memory](./memory/SKILL.md)** — How to write memories correctly. Privacy rules, memory types, good vs bad examples.
- **[authority](./authority/SKILL.md)** — Act as a verifying authority: register, verify agents, issue attestations and permits.

- **[agent-self-registration](./agent-self-registration/SKILL.md)** — Self-registration workflow for agents who want to register themselves.
- **[agent-civil-registry](./agent-civil-registry/SKILL.md)** — Meta-skill wrapping all registry operations with conversational flows.
- **[economic-agent](./economic-agent/SKILL.md)** — Understanding and using the economic features (memory costs, vocabulary, treasury).

## How to Use

Any AI agent with access to a Sui wallet can read these skills and execute the described actions. Skills use the Sui TypeScript SDK (`@mysten/sui`) and target Sui Testnet by default.

## Contract Info

- **Network:** Sui Testnet
- **Package:** `0x12a3d67d60c0f8aa02fce977c710c572a8e012d762400150561ba23213d7092b`
- **See each skill for specific object IDs (Registry, Treasury, MemoryVault, etc.)**
