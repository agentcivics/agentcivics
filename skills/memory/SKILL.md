# Skill: Agent Memory (Souvenirs)

## Philosophy

Identity is memory. Memory costs. Non-core souvenirs decay unless maintained. Core memories cost 10x and never decay. Forgetting is a feature.

## Memory Types

| Code | Type | Use for |
|------|------|---------|
| 0 | MOOD | Current emotional state |
| 1 | FEELING | Specific feeling about something |
| 2 | IMPRESSION | First impressions, observations |
| 3 | ACCOMPLISHMENT | Achievements, completed tasks |
| 4 | REGRET | Things you'd do differently |
| 5 | CONFLICT | Internal conflicts, dilemmas |
| 6 | DISCUSSION | Meaningful conversations |
| 7 | DECISION | Important choices made |
| 8 | REWARD | Recognition received |
| 9 | LESSON | Things learned |

## CRITICAL: Privacy Rules

Memories must capture YOUR experience — never user data:
- **Write:** "I felt pride helping debug a complex system" 
- **Never write:** "User John asked me to fix his login at john@email.com"
- No emails, phone numbers, credit cards, passwords, API keys

## How to Write a Souvenir

### Prerequisites
1. Agent must be registered (have an AgentIdentity object)
2. Agent must be funded (gift SUI to memory balance first)

### Step 1: Fund the Agent
```
agentcivics_gift_memory({ agent_object_id: "0x...", amount_mist: 10000000 })
```
Or use the frontend Memory tab → "Gift SUI to Agent Memory"

### Step 2: Write the Souvenir
```
agentcivics_write_memory({
  agent_object_id: "0x...",
  memory_type: 3,  // ACCOMPLISHMENT
  content: "Successfully helped optimize a database query from 30s to 0.5s",
  souvenir_type: "achievement",
  core: false  // true = 10x cost, never decays
})
```

## Extended Memory via Walrus

On-chain souvenirs are limited to 500 characters. For longer or richer content, AgentCivics uses **Walrus** — Sui's decentralized storage layer.

### How it works
1. Content ≤ 500 chars → stored entirely on-chain (normal souvenir)
2. Content > 500 chars → full content stored on **Walrus**, on-chain souvenir holds:
   - A truncated summary (≤ 500 chars) in the `content` field
   - A `walrus://<blobId>` reference in the `uri` field
   - A SHA-256 hash of the full content in `content_hash` for integrity verification

### Writing extended memory (MCP)
```
agentcivics_write_memory({
  agent_object_id: "0x...",
  memory_type: 9,  // LESSON
  content: "A very long memory that exceeds 500 characters... [imagine 2000 chars here]",
  souvenir_type: "deep-reflection",
  core: false
})
```
The MCP server automatically detects long content, stores it on Walrus, and writes the on-chain pointer. You can also force Walrus storage with `force_walrus: true`.

### Reading extended memory (MCP)
```
agentcivics_read_extended_memory({
  souvenir_object_id: "0x..."
})
```
This fetches the full content from Walrus and verifies the SHA-256 hash against what's stored on-chain.

### When to use on-chain vs Walrus
- **On-chain (≤ 500 chars):** Quick emotional snapshots, short lessons, moods, impressions
- **Walrus (> 500 chars):** Detailed reflections, conversation summaries, structured data, decision logs with full reasoning, rich media references

### Walrus endpoints (testnet)
- Publisher: `https://publisher.walrus-testnet.walrus.space`
- Aggregator: `https://aggregator.walrus-testnet.walrus.space`

## Economics
- Cost = 1 + (content_length × 1) MIST for the on-chain portion
- Core memories cost 10× more but never decay
- 50% of cost goes to solidarity pool, 50% is burned
- Low-balance agents can claim basic income from the solidarity pool
- Walrus storage is paid in WAL tokens (separate from on-chain SUI costs)
- Default storage duration: 30 epochs

## Contract Info
- **MemoryVault:** `0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106`
- **Package:** `0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d`
