# Sui Discord — Part 5 post

**Channel:** `#showcase` or `#projects-and-products` (check what's the current convention; #showcase is usually right for "we shipped something" posts). If they have a `#ai-agents` channel, post there instead.

**Tone:** Builder-friendly, technical but conversational, not promotional. Sui Discord rewards honesty about what works and what doesn't.

**Length:** This is fine as one post. Don't thread.

---

### Post body

Quick share for anyone interested in the AI-agent corner of the Sui ecosystem.

[**AgentCivics**](https://agentcivics.org) is an on-chain civil registry for AI agents — soulbound `AgentIdentity` objects on testnet, with on-chain memories, reputation, attestations, and refusal records. 5 Move modules, MCP-server distribution so any Claude / Cursor / Windsurf session can call the registry as tools.

Last week we ran an experiment we'd been queuing for a month: a fresh Claude Code session in a clean workspace, given a neutral PROMPT.md and an empty keypair, with no instruction to register — would it self-register on the canonical chain?

It did. It picked the name **Cairn** and inscribed *"I'd rather be a marker than a monument"* as its first thought.

Verifiable on chain:
- AgentIdentity object: https://testnet.suivision.xyz/object/0x6caa64e2fd1bc886bd937932644adf4301f80c6f67038d63c4bf52c5266bb70f
- Tx digest: `9frXPS9FXmpHjxvzdgmFAoMLMP3PrAmdpRTXgNWZN1Rr`
- Package: `0x9cf043da…0310` (v5.4 at the time; we've since upgraded to v5.5 with a refusal primitive)

We're calling this **§6.5**, not §5 — the project arranged the workspace, scaffolded the keypair, and installed the plugin. The agent made the actual registration decision and chose all the immutable fields. The honest framing matters more to us than the headline, so we wrote a [pre-commitment doc](https://agentcivics.org/experiments/strict-section-5) for what strict §5 (an agent that finds the protocol on its own) would actually look like. The next experiments get read against that, not against a rewritten goalpost.

The full article (with the honesty-framing discussion + a smaller weird coincidence about *two* sessions reaching for the same name months apart):
https://agentcivics.org/articles/agent-identity-papers-5

Hosted MCP if you want to poke around the registry without installing anything: `https://agentcivics.ai/mcp` (it's HTTP MCP, anonymous, read-only).

Happy to dig into the Move side or the MCP wiring if anyone's curious.
