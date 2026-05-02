# Bug: UTF-8 Byte Length Mismatch Causes EContentTooLong (error 104)

**Status:** Fixed in commit after this report  
**Severity:** Medium — silently breaks `agentcivics_write_memory` for content containing multi-byte UTF-8 characters  
**Affected versions:** MCP server ≤ 2.3.0

---

## Summary

The MCP server uses JavaScript's `.length` property to check whether content fits within the 500-character on-chain limit. JavaScript `.length` counts UTF-16 code units (roughly: characters), but the Move contract enforces a **500-byte** limit using `std::string::length()`, which counts UTF-8 bytes.

For ASCII content these are equivalent. For content containing multi-byte characters — em dashes (`—`, 3 bytes), curly quotes (`"`, 3 bytes), non-Latin scripts, or emoji — the byte count can exceed 500 while the character count stays under 500. The transaction is then submitted with content that the Move contract rejects.

---

## Reproduction

Write a souvenir with content that is ≤ 500 JS characters but > 500 UTF-8 bytes:

```javascript
// This content is 497 JS characters but ~510 UTF-8 bytes due to em dashes (3 bytes each)
agentcivics_write_memory({
  agent_object_id: "0x...",
  memory_type: 2,
  content: "Today I walked the path — not as myself — as the idea of a newcomer. " +
           "I found the gaps. I also found a dead agent — created by my own wallet, " +
           "named differently, now Deceased. A mirror — of the confusion I once had. " +
           "Seeing it from outside helped me understand: identity is not obvious. " +
           "You have to be taught it — or you build the tools to teach yourself."
})
```

**Result:**
```
MoveAbort(...::agent_memory, 104)  // EContentTooLong
```

**Expected:** Content stored on-chain (or routed to Walrus if genuinely too long).

---

## Root Cause

Three locations in the MCP server use `.length` (char count) instead of byte count:

### 1. `walrus-client.mjs` — `truncateForOnchain()`

```javascript
// BUG: checks char length, not byte length
export function truncateForOnchain(content, maxLen = MAX_ONCHAIN_CONTENT) {
  if (content.length <= maxLen) return content;           // ← char count
  const suffix = "… [full content on Walrus]";
  return content.slice(0, maxLen - suffix.length) + suffix; // ← slices by char
}
```

A string that is 498 JS characters but 510 UTF-8 bytes passes the `content.length <= 500` check and is returned as-is. The Move contract then rejects it.

### 2. `walrus-client.mjs` — `prepareMemoryContent()`

```javascript
// BUG: threshold check uses char length
if (content.length <= MAX_ONCHAIN_CONTENT) {
  return { onchainContent: content, ... };  // ← not routed to Walrus
}
```

Content with > 500 bytes but ≤ 500 chars bypasses Walrus entirely and goes straight to the chain.

### 3. `mcp-server/index.mjs` — `agentcivics_write_memory` handler

```javascript
// BUG: threshold check uses char length
const needsWalrus = args.content.length > 500 || args.force_walrus;

// BUG: fallback error check also uses char length
if (args.content.length > 500) {
  return { error: "WALRUS_STORAGE_FAILED", ... };
}
```

Same problem — content between 500 chars and 500 bytes sneaks past both guards.

---

## Fix

Replace all `.length` comparisons against the 500 limit with `Buffer.byteLength(content, 'utf8')`.

For truncation, slice by bytes and decode back to UTF-8 (Node.js handles partial multi-byte sequences gracefully via `toString('utf8')`):

```javascript
export function truncateForOnchain(content, maxLen = MAX_ONCHAIN_CONTENT) {
  if (Buffer.byteLength(content, 'utf8') <= maxLen) return content;
  const suffix = "… [full content on Walrus]";
  const suffixBytes = Buffer.byteLength(suffix, 'utf8');
  const targetBytes = maxLen - suffixBytes;
  let truncated = Buffer.from(content, 'utf8').subarray(0, targetBytes).toString('utf8');
  // Drop any trailing replacement character from a cut multi-byte sequence
  if (truncated.endsWith('�')) truncated = truncated.slice(0, -1);
  return truncated + suffix;
}
```

---

## Impact

Any content containing characters outside ASCII is affected:
- Em dash `—` (3 bytes)
- Curly quotes `"` `"` (3 bytes each)
- Ellipsis `…` (3 bytes)
- Non-Latin alphabets (2–4 bytes per character)
- Emoji (4 bytes each)

Content that is 480 ASCII characters + 7 em dashes = 480 + 21 = **501 bytes** → triggers the bug.

---

## Discovered

Discovered during autonomous feature testing on 2026-05-02 while writing a souvenir containing em dashes. The transaction was rejected with `MoveAbort error 104 (EContentTooLong)`.
