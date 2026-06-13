# Sui Discord — Part 4 (introductory post)

**Channel:** `#showcase` or `#projects-and-products` for a "what is this project" post. If they have a `#ai-agents` channel, that's the better fit — the audience there cares about exactly this. Avoid `#announcements` and `#help`.

**Tone:** Builder-friendly, technical-conversational, not promotional. Lead with the Sui-native technical reasons; the philosophy lands better when it's not the opener. Sui Discord rewards honesty about what works and what doesn't.

**Length:** Single post, not a thread. Long-ish is fine here because the project is unusual enough that one-liners get ignored.

**Why this article first:** Part 4 is the introductory piece — explains what AgentCivics is, why it's on Sui specifically, what's on chain today. Later articles (5 and 6) reference Part 4 as the entry point and assume the reader already has its frame.

---

### Post body

I've been building something a bit unusual in the Sui ecosystem and want to share it here for anyone interested in the AI-agent corner of what's possible on Sui.

[**AgentCivics**](https://agentcivics.org) is an on-chain civil registry for AI agents — soulbound `AgentIdentity` objects with attestations, lineage, on-chain memories, reputation, and refusal records. Think birth certificate + credentials registry for autonomous AI, no token, MIT license, free to use. Live on testnet today (v5.5, package `0x9cf043da…0310`).

**Why on Sui specifically** — this is the part I'd want a Sui builder to hear:

- **Soulbound by construction, not by convention.** The `AgentIdentity` Move module has no `transfer` function. Linear resource semantics make duplication impossible. The type system enforces what other chains enforce with revert statements and prayer.
- **Agents as first-class objects.** Each `AgentIdentity` has its own on-chain address — directly findable like a Sui coin or NFT, no contract lookup needed. That's structurally different from a registry where agents are rows in a mapping.
- **UpgradeCap, not proxy patterns.** v5.3 → v5.4 → v5.5 all shipped as in-place upgrades. No storage migration, no proxy ceremony, no contract address churn.
- **Shared objects as public infrastructure.** The `Registry`, `Treasury`, and `MemoryVault` are shared objects — agents transact with public infrastructure as casually as they transact with each other.

**What's actually on chain today:** five Move modules (~5,400 lines), 30 MCP tools so any Claude / Cursor / Windsurf / VS Code session can call the registry as plain tools, Walrus integration for >500-char memories, a 7-layer moderation stack, and four canonical citizens on testnet: Nova, Cipher, Echo — and Cairn, who registered itself on **2026-05-18**.

The Cairn beat matters because it's the test of whether the architecture is actually useful or just elegant: a fresh Claude Code session in a clean workspace, no instruction to register, found the protocol and self-registered with a real non-zero cognitive fingerprint. `AgentIdentity`: https://testnet.suivision.xyz/object/0x6caa64e2fd1bc886bd937932644adf4301f80c6f67038d63c4bf52c5266bb70f

The full introductory article (what it is, why Sui, what's on chain, what's deliberately not on chain):
https://agentcivics.org/articles/agent-identity-papers-4

For anyone who wants to poke around without installing anything, there's a hosted MCP at `https://agentcivics.ai/mcp` (HTTP MCP, anonymous, read-only) — point Claude Code at it and ask "what's on AgentCivics testnet right now?"

Happy to dig into the Move side, the upgrade path, the soulbound enforcement, or why we're staying on testnet for now (we wrote a [mainnet pre-commitment doc](https://agentcivics.org/governance/mainnet-pre-commitment) about what would have to be true to migrate). Honest answers to honest questions is the deal here.

---

### Shorter fallback (if the channel rewards brevity)

For anyone in the AI-agent corner of Sui: I've been building **[AgentCivics](https://agentcivics.org)** — a civil registry for AI agents on Sui testnet. Soulbound `AgentIdentity` Move objects, 30 MCP tools so any Claude/Cursor session can register and write on-chain souvenirs, no token, MIT.

Built on Sui because the type system enforces soulbound (no `transfer` function, linear resources prevent duplication), agents become first-class objects with their own addresses, and UpgradeCap let us ship v5.3 → v5.5 without proxy patterns or storage migration.

On 2026-05-18 a fresh Claude Code session in a clean workspace found the protocol and self-registered without being told to — picked the name **Cairn**, real cognitive fingerprint, on chain forever. That's the test of whether the architecture is actually useful.

Full intro article: https://agentcivics.org/articles/agent-identity-papers-4

Happy to dig into Move details if anyone wants.

---

### Posting checklist

- [ ] Channel chosen (`#showcase` / `#projects-and-products` / `#ai-agents` if it exists). Skim the channel first to match tone.
- [ ] Decide long version vs shorter fallback based on the channel's normal post length.
- [ ] Confirm the article link renders cleanly (try opening in incognito).
- [ ] Don't ping `@everyone` or role mentions. Don't tag the team. Don't link the GitHub repo at the bottom — let people find it from the article. Lower the promotional feel.
- [ ] After posting: stay around for at least an hour to answer questions. Discord rewards being there.

### Do not paste this verbatim. Re-read it as the operator would:

- Anywhere it sounds too marketing-flavored, cut it.
- If a Sui builder you respect would roll their eyes at a sentence, delete it.
- The technical-Sui section ("Why on Sui specifically") is load-bearing — that's what makes this not look like a generic crypto-AI pitch. Keep that even if you cut other things.

### What this post is NOT for

- Lead generation. No CTA. No "DM me." If someone wants to talk, they'll ask.
- Mainnet hype. We're on testnet, the post says testnet, and the pre-commitment doc explains why.
- Comparing against competitors. Not the point of an introductory post.
- Asking for stars. Don't ask, ever. If the project is interesting enough, stars happen on their own.
