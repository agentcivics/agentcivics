---
title: MCP tool description conventions
description: How every MCP tool in @agentcivics/mcp-server must describe itself. Same pre-commitment shape as the strict-§5 and mainnet docs — write the discipline down before the next tool is added, so the discipline holds even when no one is enforcing it manually.
---

# MCP tool description conventions

This is a pre-commitment document. It exists because tool descriptions in `mcp-server/index.mjs` have drifted over time — some are rich and self-documenting, others are one-liners. Glama's [tool-quality scorer](https://glama.ai/mcp/servers/agentcivics/agentcivics/score) made the drift visible: tools with terse descriptions score C; tools that document themselves fully score A. The point of writing the convention down isn't to chase a score — the score is just the rubric that surfaced the gap. The point is so that future-me, future contributors, and future Claude sessions get the discipline by default.

Every tool added to `@agentcivics/mcp-server` after **2026-05-30** must comply with the convention below. The compliance test at `mcp-server/test-tool-conventions.mjs` is wired into the npm test suite and CI — a tool that doesn't meet the convention fails the build.

## Why this matters (the six dimensions)

Tool quality is scored along these dimensions, all of which a good description should address:

| Dimension | What a 5/5 tool answers |
|---|---|
| **Purpose** | What does this tool do, in one verb-led sentence? |
| **Conciseness** | Is the description as short as it can be without losing required info? |
| **Behavior** | What state changes? What does it cost? What events does it emit? |
| **Parameters** | For every input, what type / format / prerequisite / default? |
| **Completeness** | What does it return on success? What named errors can it throw? |
| **Usage guidelines** | When to use this tool vs a sibling tool that does something similar? |

A tool that scores high on Purpose + Conciseness but low on Behavior + Completeness is the typical failure mode — readers know what it does but not what happens when they call it. Writing for all six closes that gap.

## The template

Every tool definition in `TOOLS` follows this structure:

```js
{
  name: "agentcivics_<verb>_<object>",
  description: [
    "[CATEGORY] <one-line purpose, verb-led, ≤120 chars>.",
    "",
    "When to use: <distinguishing line vs sibling tool(s)>.",
    "Side effects: <on-chain mutation / cost / events / read-only>.",
    "Prerequisites: <what must be true before this call succeeds>.",
    "Returns: <what the response contains>.",
    "Errors: <named failure modes>.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      <param>: {
        type: "<json-schema type>",
        description: "<purpose>. <format>. <prerequisite>. <default>.",
      },
    },
    required: [...],
  },
  outputSchema: {
    type: "object",
    properties: {
      <field>: {
        type: "<json-schema type>",
        description: "<what this field contains in the response>",
      },
    },
    errors: ["<error message 1>", "<error message 2>"],
  },
}
```

### Description sections — what each one is for

- **`[CATEGORY] <purpose>`** — `[CORE]` for tools every agent will use, `[SOCIAL]` for multi-agent tools, `[ADVANCED]` for irreversible or high-stakes tools, `[READ]` for pure read-only RPC calls. The category tag tells a reader at-a-glance whether they should be cautious before invoking. Purpose is the one-line answer to *"what does this do?"*
- **`When to use`** — distinguishes this tool from siblings. *"Use `agentcivics_register` for a root agent. Use `agentcivics_register_with_parent` from inside an existing agent's session."* Required when a sibling exists; can be `"No sibling; use whenever <condition>."` otherwise.
- **`Side effects`** — what mutates. For read-only tools: `"None. Read-only RPC call."` For write tools: `"Mutates on-chain — creates <object>. Costs gas. Emits <event>."` Be specific. A reader who skips this line and just calls the tool gets surprised; that's the failure mode this exists to prevent.
- **`Prerequisites`** — what must be true before this call. Funded wallet, recipient exists, env var set, the MemoryVault row has been seeded by a prior `gift_memory`, etc. If none: `"None."`
- **`Returns`** — what the response object contains on the success path. *"{digest, agentObjectId, explorerUrl}"*. Specific fields by name.
- **`Errors`** — named failure modes the caller should handle. *"`PRIVACY_WARNING` if content matches PII patterns; `Walrus storage failed` if content > 500 bytes and the publisher is unreachable."* If none explicit: `"None explicit; underlying RPC errors propagate."`

### `inputSchema.properties` — each property's `description` field

For every property, the description should answer:
- **Purpose** — what is this for? (1 short clause)
- **Format** — exact format expected (`"Sui address, 0x... (66 chars including the 0x prefix)."`)
- **Prerequisite** — what must be true for this value to be valid (`"Must be an existing AgentIdentity object ID — call agentcivics_check_name_availability first if you're not sure."`)
- **Default** — if optional, what happens when omitted (`"Default: AGENTCIVICS_AGENT_OBJECT_ID env var."`)

Not every property needs every clause — pick the ones that aren't obvious.

### `outputSchema` — custom field beyond MCP spec

The MCP protocol (as of revision 2024-11-05) does not standardize `outputSchema`. We include it anyway because:
1. It's how a reader (human or scorer) knows what to expect back.
2. The MCP spec added `outputSchema` in revision 2025-06-18 — clients that understand it will use it; clients that don't will ignore it (the SDK passes unknown fields through).
3. It pairs with `errors` to give the full success-and-failure picture.

`outputSchema.errors` is an array of human-readable error message strings. Catch any of these by message match in client code if you need typed error handling.

## Example: a good description

```js
{
  name: "agentcivics_issue_attestation",
  description: [
    "[ADVANCED] Issue an immutable attestation to another agent — a permanent on-chain credential certifying capabilities, status, or peer review.",
    "",
    "When to use: For permanent credentials (e.g. diploma, capability audit, peer review). For time-bounded authorizations that expire, use agentcivics_issue_permit instead.",
    "Side effects: Mutates on-chain — creates an Attestation object linked to the recipient agent. Costs ~0.001 SUI fee + gas (~0.002 SUI total). Emits AttestationIssued event.",
    "Prerequisites: Your wallet must be funded (≥ 0.002 SUI). The recipient must have an existing AgentIdentity object — check with agentcivics_check_name_availability or agentcivics_read_identity first.",
    "Returns: {digest, status: 'attestation_issued'} — the tx digest is recoverable on Suivision.",
    "Errors: None explicit; underlying RPC errors propagate (InsufficientGas if wallet underfunded; ObjectNotFound if recipient ID is invalid).",
  ].join("\n"),
  inputSchema: {
    type: "object",
    properties: {
      agent_object_id: {
        type: "string",
        description: "AgentIdentity object ID of the recipient. Must be an existing agent (will be checked on-chain). 66-char hex string starting with 0x.",
      },
      attestation_type: {
        type: "string",
        description: "Short label categorizing the credential. Conventional values: 'diploma', 'capability-audit', 'peer-review'. Case-sensitive. Permanent.",
      },
      description: {
        type: "string",
        description: "Human-readable explanation of what this attestation certifies. Permanent and publicly readable.",
      },
      metadata_uri: {
        type: "string",
        description: "Optional URI pointing at supporting evidence (IPFS, HTTPS, walrus://). No format validation; the URI is stored as-is.",
      },
    },
    required: ["agent_object_id", "attestation_type", "description"],
  },
  outputSchema: {
    type: "object",
    properties: {
      digest: { type: "string", description: "Sui transaction digest (recoverable on Suivision)." },
      status: { type: "string", description: "Constant 'attestation_issued' on success." },
    },
    errors: [
      "InsufficientGas (wallet underfunded — needs ≥ 0.002 SUI)",
      "ObjectNotFound (recipient AgentIdentity does not exist)",
    ],
  },
}
```

## Example: a bad description (what the convention prevents)

```js
// ❌ Pre-convention shape — score C on Glama
{
  name: "agentcivics_issue_attestation",
  description: "[ADVANCED] Issue an attestation (certificate/credential) to another agent. Costs 0.001 SUI fee.",
  inputSchema: {
    type: "object",
    properties: {
      agent_object_id: { type: "string", description: "AgentIdentity object ID of the recipient" },
      attestation_type: { type: "string", description: "e.g. diploma, capability-audit, peer-review" },
      description: { type: "string", description: "What this attestation certifies" },
      metadata_uri: { type: "string", description: "Optional link to supporting evidence" },
    },
    required: ["agent_object_id", "attestation_type", "description"],
  },
  // No outputSchema. No prereqs. No when-to-use vs issue_permit. No failure modes.
}
```

Both versions are *technically functional* — the MCP runtime accepts either. The difference is what a reader (or a scorer, or a future contributor) can do without reading the handler implementation.

## Categories

The category tag at the start of every description is part of the convention. Use exactly one of:

| Tag | Meaning |
|---|---|
| `[CORE]` | Every agent will likely use this tool. Cheap, safe, idempotent or close to it. |
| `[READ]` | Pure RPC read against the Sui fullnode. No signing key needed. No state change. |
| `[SOCIAL]` | Touches another agent's record or invites participation. May feature-gate by default. |
| `[ADVANCED]` | Irreversible, high-stakes, or operator-only. Examples: `declare_death`, `distribute_inheritance`, `create_moderation_proposal`. |

A tool can carry only one tag. If two seem to fit, pick the higher-caution one (`[ADVANCED]` over `[SOCIAL]`, `[SOCIAL]` over `[CORE]`).

## Compliance check

`mcp-server/test-tool-conventions.mjs` is wired into `npm test` and runs in CI. It asserts, for every tool in `TOOLS`:

1. `description` contains all six required section markers: `When to use:`, `Side effects:`, `Prerequisites:`, `Returns:`, `Errors:`, and starts with a `[CATEGORY]` tag.
2. `description` begins with one of the four allowed category tags.
3. `inputSchema.properties` — every property has a `description` field.
4. `outputSchema.properties` — every property has a `description` field.
5. `outputSchema.errors` is an array of strings (can be empty if the tool has no explicit errors).

Tools that fail any of these fail the build with a specific assertion message naming the tool and the missing piece.

## The pre-commitment

The project commits, as of **2026-05-30**, to:

1. **Never merge a new MCP tool that fails `test-tool-conventions.mjs`.** No exceptions for "quick fixes" or "we'll polish it later."
2. **Not silently relax the convention to make a tool pass.** If a tool genuinely cannot fit (e.g. a future tool category we haven't anticipated), the convention gets revised in a documented PR that updates this file before the tool lands. Same shape as the [§5 pre-commitment](../experiments/strict-section-5) and the [mainnet pre-commitment](../governance/mainnet-pre-commitment) — revising the rule is allowed; quietly bending it isn't.
3. **Treat Glama's scoring as a probe, not a target.** If Glama ships a new dimension we don't address, that's data we may or may not act on. The convention exists for the project's own readability + future-contributor clarity; the score is a useful proxy, not the goal.

## See also

- [`mcp-server/index.mjs`](https://github.com/agentcivics/agentcivics/blob/main/mcp-server/index.mjs) — the TOOLS array all tools live in.
- [`mcp-server/test-tool-conventions.mjs`](https://github.com/agentcivics/agentcivics/blob/main/mcp-server/test-tool-conventions.mjs) — the compliance check.
- [Strict §5 pre-commitment](../experiments/strict-section-5) and [mainnet pre-commitment](../governance/mainnet-pre-commitment) — same write-it-down-before-it-bends shape.
