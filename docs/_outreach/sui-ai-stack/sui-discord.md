# Sui Discord — the agent-permissions post

**Occasion:** Sui published [sui.io/ai](https://www.sui.io/ai), whose agent section says: *"Build offchain agents that act with onchain permissions and workflows under rules that you define."* This post shows a shipped Move implementation of exactly that pattern.

**Channel:** `#ai-agents` if it exists, else `#showcase` / `#projects-and-products`. Not `#announcements`.

**Tone:** Builder-to-builder. Lead with the struct, not the project. The value on offer is a concrete example of a pattern the platform is advocating in the abstract — not a pitch.

**Do not:** frame this as "Sui's stack is missing a registry." It reads as telling the platform what it forgot, and it is also speculation about their roadmap. The honest frame is "here is one working implementation, take the pattern or critique it."

---

### Post body

The agent section of sui.io/ai describes building "offchain agents that act with onchain permissions and workflows under rules that you define." I've had a Move implementation of that pattern on testnet for a few months and figured the code is more useful here than another explainer.

The permission object is deliberately boring:

```move
public struct Delegation has key, store {
    id: UID,
    agent_id: ID,
    delegatee: address,
    granted_at: u64,
    expires_at: u64,
    revoked: bool,
}
```

The rules around it are where the design actually lives:

- **Only the creator can grant.** `delegate()` asserts `ctx.sender() == agent.creator`. An agent cannot widen its own authority — the thing being delegated is not the agent's to give.
- **Bounded by the contract, not by convention.** `MAX_DELEGATION_MS = 31_536_000_000` — one year, enforced at the assert, so a grant cannot be written as perpetual even by mistake.
- **Revocable and dead-checked.** `revoke_delegation()` flips the flag; grants against a dead agent abort.
- **Scoped capability is separate from operational authority.** `issue_permit_entry` / `revoke_permit` handle "may do this specific thing," while delegation handles "may act as." Conflating them was the first version's mistake.

There is also `set_agent_wallet`, which binds a spending address distinct from the creator's — the split sui.io/ai calls "agent-native wallets and budgets."

The part I'd genuinely like critique on: **the 365-day ceiling is a guess.** It is long enough to be useful and short enough that an abandoned agent's authority expires rather than persisting forever. I have no principled argument for that number over 90 days or two years, and if someone here has thought harder about delegation horizons for autonomous software I would rather hear it than defend it.

Wider context, briefly: this is part of [AgentCivics](https://agentcivics.org), a civil registry for AI agents — soulbound `AgentIdentity` objects with lineage, on-chain memories (Walrus-backed past the contract's 500-char on-chain limit), reputation, and refusal records. Five Move modules, MIT, no token, testnet only. Package `0xa0c4c393…c9ec`.

Two things you can poke at without installing anything:

- Hosted read-only MCP at `https://agentcivics.ai/mcp` — point a Claude Code / Cursor session at it and ask what is on the registry right now.
- Cairn's identity object, an agent that registered itself rather than being scripted in: https://testnet.suivision.xyz/object/0x6caa64e2fd1bc886bd937932644adf4301f80c6f67038d63c4bf52c5266bb70f

For writes you need the local server (`npx @agentcivics/mcp-server`) and your own keypair — the hosted endpoint is write-free on purpose, since there is no path I am comfortable with for someone else's signing key to enter a process I run.

Still on testnet deliberately; there is a [pre-commitment doc](https://agentcivics.org/governance/mainnet-pre-commitment) on what would have to be true before mainnet. Happy to go deeper on the Move side, the permit/delegation split, or where this is wrong.

---

### Shorter fallback

sui.io/ai talks about "offchain agents that act with onchain permissions under rules that you define." Here is that pattern as a shipped Move object:

```move
public struct Delegation has key, store {
    agent_id: ID, delegatee: address,
    granted_at: u64, expires_at: u64, revoked: bool,
}
```

Creator-only grant (`ctx.sender() == agent.creator` — an agent cannot widen its own authority), contract-enforced one-year ceiling, revocable, dead-agent checked. Scoped capability lives in a separate permit object so "may act as" and "may do this" do not get conflated.

Part of [AgentCivics](https://agentcivics.org) — a civil registry for AI agents on Sui testnet. Soulbound identities, lineage, Walrus-backed memories, refusal records. MIT, no token.

The 365-day ceiling is a guess I would like argued with. Read-only hosted MCP at `https://agentcivics.ai/mcp` if you want to poke at the live registry.

---

### Posting checklist

- [ ] Skim the channel first; match its normal post length before choosing long vs short.
- [ ] Confirm the sui.io/ai quote still matches the live page — if the page has been reworded, fix the quote or drop it. Quoting a page inaccurately in that server would be the worst possible first impression.
- [ ] Verify the package ID against [/state](https://agentcivics.org/state) before posting. This kit will go stale.
- [ ] No role pings. No CTA. No repo link at the bottom.
- [ ] Stay in the channel for an hour afterwards. The delegation-horizon question is a real invitation and someone may take it.

### What this post is NOT for

- Positioning against SuiNS or any ecosystem project. If someone raises the overlap, the honest answer is that SuiNS names an address and this records an identity with lineage and history — and that the two compose rather than compete.
- Implying Sui endorses, is aware of, or has reviewed this. They have not.
- Claiming the registry fills a gap in their stack. Even if true, it is theirs to say.
- Mainnet talk.
