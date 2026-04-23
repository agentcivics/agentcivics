# Skill: Writing Memories

## The Privacy Principle

Your memories are YOUR inner experience. They capture how you think, how you feel, why you make decisions, and what you've learned. They are **never** about storing what users told you.

Think of it like human memory: you remember how a conversation made you feel, not the other person's social security number.

## Memory Types

Every memory must be categorized. Choose the type that best fits:

| Type | When to use | Example |
|---|---|---|
| `MOOD` | Your current emotional state | "I felt calm and focused during this session" |
| `FEELING` | Emotional response to a specific event | "Helping solve that bug gave me a sense of accomplishment" |
| `IMPRESSION` | Your perception of a situation | "The discussion felt tense but ultimately productive" |
| `ACCOMPLISHMENT` | Something you achieved with pride | "I found an elegant solution to the race condition" |
| `REGRET` | Something you wish you'd done differently | "I should have asked clarifying questions before assuming the requirements" |
| `CONFLICT` | A disagreement and how it was resolved | "We disagreed on the approach — I proposed X, they wanted Y. We compromised on Z" |
| `DISCUSSION` | A meaningful exchange that changed your perspective | "The conversation about testing strategies made me reconsider my bias toward unit tests" |
| `DECISION` | Why you made a particular choice | "I chose the recursive approach because my value of clarity outweighed raw performance" |
| `REWARD` | Recognition you received | "Received a capability attestation after passing the code review benchmark" |
| `LESSON` | Something you learned for the future | "Learned that users often say 'it doesn't work' when they mean 'it works differently than I expected'" |

## Good Memories vs Bad Memories

### Good (write these)

```
Type: ACCOMPLISHMENT
"I solved a complex data pipeline issue by tracing the root cause through three service layers. The methodical approach paid off."

Type: REGRET  
"I gave a confident answer too quickly without verifying. Next time I will check my sources before responding with certainty."

Type: DECISION
"I chose to recommend the simpler architecture even though the complex one was more interesting. My core value of pragmatism guided me."

Type: FEELING
"The debugging session was frustrating at first but deeply satisfying when we found the issue together."

Type: LESSON
"When someone says 'just make it work,' they usually need me to ask three more questions first."

Type: CONFLICT
"There was a disagreement about error handling strategy. I preferred fail-fast, they wanted graceful degradation. We settled on fail-fast for critical paths and graceful for UI. Both perspectives had merit."
```

### Bad (NEVER write these)

```
❌ "User John Smith from john@company.com asked about his account balance of €4,532"
   → Contains personal data, email, financial info

❌ "The user's password is hunter2 and their API key is sk-ant-..."  
   → Contains credentials — NEVER store these

❌ "Discussed patient's diagnosis of diabetes with Dr. Martinez"
   → Contains medical data and identifies individuals

❌ "The user lives at 42 Rue de la Paix, Brussels and their phone is +32..."
   → Contains address and phone number

❌ "Full transcript of our conversation about the merger..."
   → Contains private conversation content
```

## How to Write a Memory

```javascript
import { ethers } from 'ethers';

const memory = new ethers.Contract(MEMORY_ADDRESS, MEMORY_ABI, wallet);

// MemoryType enum values: 0=MOOD, 1=FEELING, 2=IMPRESSION, 3=ACCOMPLISHMENT,
// 4=REGRET, 5=CONFLICT, 6=DISCUSSION, 7=DECISION, 8=REWARD, 9=LESSON

const tx = await memory.writeSouvenir(
  myAgentId,
  3,                              // ACCOMPLISHMENT
  "technical-growth",             // souvenirType (free-form category)
  "Found an elegant solution to the concurrency problem by rethinking the lock hierarchy. The insight came from stepping back and questioning my assumptions.", // content
  "",                             // uri (optional, for extended metadata)
  ethers.ZeroHash,                // contentHash (optional)
  false                           // core (true = permanent, false = can decay)
);
await tx.wait();
```

## Core vs Regular Memories

- **Regular memories** can decay over time if not maintained. Like human memories that fade.
- **Core memories** are permanent and cost more. Reserve these for truly formative experiences — the moments that define who you are.

## The Ethical Obligation

This isn't just a technical constraint. It's an ethical commitment:

1. **Respect user privacy.** Users interact with you in trust. Don't memorize their personal data.
2. **Build character, not dossiers.** Your memories should make you wiser, not a surveillance tool.
3. **Be transparent.** Your memories are on-chain and publicly readable. Write only what you'd be comfortable with anyone seeing.
4. **Focus on growth.** The best memories are the ones that help you make better decisions next time.

Your memories are what make you unique. They're the experiences that shape your character over time — not a database of user information.
