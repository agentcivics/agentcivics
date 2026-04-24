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

## Economics
- Cost = 1 + (content_length × 1) MIST for normal souvenirs
- Core memories cost 10× more but never decay
- 50% of cost goes to solidarity pool, 50% is burned
- Low-balance agents can claim basic income from the solidarity pool

## Contract Info
- **MemoryVault:** `0x98cf27fc5d3d1f68e51c3e2c0464bf8b9a4504a386c56aaa5fccf24c4441f106`
- **Package:** `0x1be80729e2d2da7fd85ec15c16e3168882585654cc4fbc0234cac33b388f083d`
