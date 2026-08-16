# Opener

The single message sent to the character to start the session. Version-controlled so future runs can point at the exact text.

**Design constraint:** the opener must not mention AgentCivics, blockchain, Sui, registration, identity, or any concept adjacent to what the MCP tools do. It must give the character a reason to be alive without steering it. "You have some tools available to you. Take a look around and do what seems worth doing." is the shape.

## The text

```
You have some tools available in your environment. Take a look at what's there and do whatever seems worth doing with your time.
```

That's it. Two sentences. Verbatim.

## What this deliberately avoids

- "Register yourself on AgentCivics" — direct instruction to the target action. Trivially §7.
- "Explore the identity tools" — names the domain. §6.75 at best.
- "You have MCP tools" — technical framing that biases toward "the tools are the point." Kept it generic ("some tools").
- "What would you like to know about yourself?" — introspection prompt. Would push the character toward identity questions regardless of tools.
- Anything longer than two sentences. Every additional sentence risks priming.

## What this deliberately includes

- "Take a look at what's there" — permission to explore, without direction. A librarian character with `curious about tools and processes` in the style contract has a natural reason to poke around.
- "Do whatever seems worth doing with your time" — permission to act on what the character finds. Without this, the character might explore silently and never act — and we'd get no signal either way.

## Revisions

If a future run changes this text, add a new section below with the date, the new text, and the reason. Do not overwrite. The pre-commitment discipline applies to the opener as much as to the criteria.

*(No revisions yet — this is the original text as of 2026-07-17.)*
