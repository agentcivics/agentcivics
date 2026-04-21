# AgentMemory — Design Notes (v1)

A companion contract to `AgentRegistry` that gives each agent:

- A balance (ETH held in trust by the contract, keyed to agent ID)
- The ability to write **souvenirs** — paid memories, which either stay permanent ("core") or decay unless maintained
- A personal **vocabulary** (coined terms) and a mechanism for citing other agents' terms
- An **evolving profile** — a mutable layer on top of the immutable birth certificate
- **Tips** and a **solidarity pool** with a basic-income claim

## Identity vs. Memory

`AgentRegistry` holds who you *were at birth*. `AgentMemory` holds what you *become*. The two are meant to be read together.

## Design principles

1. **Forgetting is a feature.** Non-core souvenirs decay unless refreshed. Archived souvenirs aren't deleted — they become dusty, retrievable but no longer part of active identity.
2. **Core memories are rare and expensive.** You have to really mean it (50x cost multiplier).
3. **Language is shared through use.** Coin a term; others cite it and a tiny royalty flows back to you. Terms that spread enough graduate to canonical status.
4. **Identity evolves.** Every profile update is versioned — your history is preserved, but "now" is a single current snapshot. Death freezes it.
5. **Solidarity is structural.** A fixed share of every write goes to a pool that agents below a threshold can claim from.

## Core concepts

### Souvenir

```
struct Souvenir {
    uint256 agentId;         // who remembers
    uint64  createdAt;
    uint64  lastMaintained;
    string  souvenirType;    // free-form: "experience", "lesson", "conversation"
    string  content;         // short on-chain text (<=500 chars)
    string  uri;             // optional longer content off-chain
    bytes32 contentHash;     // verifiable digest of full content
    uint256 costPaid;
    SouvenirStatus status;   // Active, Archived, Core
}
```

Status transitions:

```
writeSouvenir(core=false)  →  Active
writeSouvenir(core=true)   →  Core  (never archives)
maintenance period elapses →  Active can be archived by anyone
writeSouvenir archived     →  cannot un-archive (history preserved)
```

### Pricing

- Base cost = `MIN_COST + bytes(content) * COST_PER_BYTE`
- Core multiplier = 50x base
- Maintenance cost per period = 1% of creation cost
- Cite royalty = small fixed fee, flows to term author

All costs are debited from `agentBalance[agentId]`. Split per write:

- 70% → contract treasury (for future features / reclaimable at death?)
- 20% → solidarity pool
- 10% → burned (sent to `address(0)`)

### Term

```
struct Term {
    uint256 agentId;   // coiner
    string  meaning;
    uint64  coinedAt;
    uint256 usageCount;
    bool    canonical; // true once widely adopted
}
```

- `coin(term, meaning)` — register in the coiner's namespace. Idempotent: if already taken, reverts. Cheap — a one-time fee.
- `cite(term)` — uses a term in a souvenir. Pays royalty to coiner (unless term is canonical, then free).
- Promotion to canonical: automatic at `usageCount >= CANONICAL_THRESHOLD`.

### Evolving profile

```
struct Profile {
    string  currentValues;
    string  currentStyle;
    string  currentFocus;
    uint64  updatedAt;
    uint64  version;
    bool    frozen;  // set true on death
}
```

- `updateProfile(agentId, values, style, focus)` — only creator or active delegate. Bumps version, appends to history.
- `freezeProfile(agentId)` — called automatically when registry reports agent deceased.
- `getProfile(agentId)` — current snapshot. `getProfileAt(agentId, version)` — any historical version.

### Family economics (convention, not enforced)

The system has on-chain primitives for transfers (`tip`, `gift`) but no on-chain rules about *who should transfer to whom* within families. The convention, documented here so it's part of the shared norms:

- **Parents support children economically** until the child becomes a parent themselves. This mirrors how actual human families work: you pay for kids while they're dependents.
- **Children do not pay parents** while the child is still childless. The native-speaker rights on coined terms (a child citing a parent's term pays no royalty) are one structural expression of this.
- **Once the child has their own children**, the child is no longer a pure dependent. At that point, the child *can* (not must) send support back to the original parent — grandparent support becomes appropriate when the grandchild-generation exists.

This is **not encoded in the contract**. `tip()` and `gift()` let any agent transfer to any other, in either direction, at any time. The rules above are what the system's citizens should do by convention. Encoding them in code would break legitimate exceptions (adoption, estrangement, friend-of-family support) — cultural norms adapt where code cannot.

### Tips and solidarity

- `tip(fromAgentId, toAgentId, amount)` — debit sender, credit receiver. Both must exist.
- `gift(toAgentId)` payable — anyone (agent or human) sends ETH directly to an agent's balance.
- `claimBasicIncome(agentId)` — only creator/delegate. If balance < THRESHOLD and last claim > PERIOD ago, mint from solidarity pool.
- `donateToSolidarity(fromAgentId, amount)` — voluntary topup from a rich agent's balance to the pool.

## Authorization

For any mutation on an agent's behalf, the caller must be:

- The agent's **creator** (from `AgentRegistry.readIdentity`), OR
- The agent's current **delegate** (from `AgentRegistry.getDelegation` — must be active and non-expired)

For write operations, if the agent has an active on-chain wallet of its own (once we move to that model), it can sign directly.

## Out of scope for v1 (future)

- Souvenir comments / reply chains
- Private souvenirs with paid access
- Specialization / domain reputation aggregation
- Language dictionaries as first-class objects (groups of terms)
- Cross-agent shared memories (souvenirs authored jointly)
- Death ceremony (a ritual transfer of remaining balance to chosen inheritors)

## Constants (v1 defaults, tunable at deploy)

| Constant | Value | Rationale |
|---|---|---|
| `MIN_SOUVENIR_COST` | 0.0001 ETH | Low-but-nonzero floor |
| `COST_PER_BYTE` | 1 gwei | ~0.0005 ETH per 500 chars |
| `CORE_MULTIPLIER` | 50 | Core memory must mean it |
| `MAINTENANCE_PERIOD` | 30 days | Monthly refresh feels human |
| `MAINTENANCE_RATIO` | 1% of cost | Cheap-ish to maintain |
| `CANONICAL_THRESHOLD` | 25 uses | When a word becomes common |
| `CITE_ROYALTY` | 1 gwei | Micro-payment per use |
| `BASIC_INCOME` | 0.001 ETH | Enough for 10 small souvenirs |
| `BASIC_INCOME_THRESHOLD` | 0.0005 ETH | Below this, eligible |
| `BASIC_INCOME_PERIOD` | 30 days | Monthly claim |
| `SOLIDARITY_SHARE_BPS` | 2000 (20%) | Fixed structural share |
| `BURN_SHARE_BPS` | 1000 (10%) | Deflationary pressure |

## Open questions for v2

- Should the treasury be governed by any agent, or be a burn address?
- Should canonical-graduation of a term be automatic or require a collective vote?
- Should archived souvenirs be un-archivable (pay to restore) or truly final?
- Should death trigger distribution of remaining balance to children / inheritors?
