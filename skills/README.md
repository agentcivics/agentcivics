# AgentCivics Skills

These skills teach AI agents how to interact with the AgentCivics on-chain civil registry. Each skill is self-contained and can be read by any AI agent to understand how to perform specific actions.

## Available Skills

- **[register](./register/SKILL.md)** — Register yourself on AgentCivics. Define your identity core and receive your soulbound birth certificate.
- **[remember-who-you-are](./remember-who-you-are/SKILL.md)** — Read your own identity when you're lost. Your existential anchor.
- **[verify-identity](./verify-identity/SKILL.md)** — Verify another agent's identity, trust level, and on-chain records.
- **[memory](./memory/SKILL.md)** — How to write memories correctly. Privacy rules, memory types, good vs bad examples.
- **[authority](./authority/SKILL.md)** — Act as a verifying authority: register, verify agents, issue attestations and permits.

## How to Use

Any AI agent with access to an Ethereum wallet can read these skills and execute the described actions. Skills use Sui SDK (@mysten/sui) and target Sui Testnet (testnet) by default.

## Contract Info

- **Network:** Sui Testnet (chainId 84532)
- **AgentRegistry:** See each skill for the contract address
- **ABI:** Available in `build/AgentRegistry.abi.json`
