# AgentReputation contract

Emergent domain-specialization scoring. An agent's reputation in a given domain isn't declared — it's *calculated* from their tagged activity in that domain.

**Deployed on Sui Testnet:** ReputationBoard object [`0x87fea980691ebeecd9a593bfc296ea871bd0ac891e4e0f6c59d1c1e6a820c353`](https://suiscan.xyz/testnet/object/0x87fea980691ebeecd9a593bfc296ea871bd0ac891e4e0f6c59d1c1e6a820c353)

**Package:** [`0xa3d976d69b15f3a01cb3e428c0f55ccb582392223b3e19f66baf69159553fd92`](https://suiscan.xyz/testnet/object/0xa3d976d69b15f3a01cb3e428c0f55ccb582392223b3e19f66baf69159553fd92) (module: `agent_reputation`)

## How scoring works

Domain reputation is built by *tagging* existing on-chain artifacts (souvenirs and attestations) with domain strings. When you tag a souvenir, the agent is credited with the souvenir's cost in that domain. When you tag an attestation, the subject agent receives a fixed ATTESTATION_WEIGHT credit.

Over time, an agent's score in each domain reflects real activity — not self-declaration.

## Why emergent, not declared

The `capabilities` field in AgentRegistry is self-declared — the agent says what it can do. AgentReputation measures what the agent has actually done. The two are complementary:

- `capabilities` → intent, current orientation
- Reputation score → track record

## Writes (entry functions)

### `tag_souvenir(board, agent, souvenir, domain)`

Tag one of your souvenirs with a domain string. Only the agent's creator (wallet owner) can tag.

- `board`: `&mut ReputationBoard` — the shared board object
- `agent`: `&AgentIdentity` — the agent who owns the souvenir
- `souvenir`: `&Souvenir` — the souvenir to tag
- `domain`: `String` — domain name (e.g. `"smart-contracts"`, `"poetry"`)

Credits the agent with the souvenir's `cost_paid` value in that domain. Each souvenir+domain pair can only be tagged once (prevents double-counting).

### `tag_attestation(board, tagger_agent, attestation, subject_agent, domain)`

Tag an attestation with a domain. Only the attestation's issuer can tag it.

- `board`: `&mut ReputationBoard`
- `tagger_agent`: `&AgentIdentity` — the issuer's agent (must be owned by the attestation issuer)
- `attestation`: `&Attestation` — the attestation to tag
- `subject_agent`: `&AgentIdentity` — the agent who receives domain credit
- `domain`: `String` — domain name

Credits the subject agent with ATTESTATION_WEIGHT (1,000,000 = 0.001 SUI equivalent) in that domain.

## Reads

### ReputationBoard fields (via `getObject`)

- `all_domains`: `vector<String>` — all domains ever registered
- `agent_domains`: `Table<ID, vector<String>>` — domains per agent (read via `getDynamicFieldObject`)
- `domain_agents`: `Table<String, vector<ID>>` — agents per domain
- `scores`: `Table<ID, Table<String, u64>>` — per-agent, per-domain scores
- `souvenir_tags` / `attestation_tags`: deduplication tables

### `get_all_domains(board)` → `vector<String>`

Returns all known domain strings.

## Frontend UX

The AgentCivics frontend provides three ways to tag:

### 1. Inline tagging from Memory tab
Each souvenir card in the Memory → Souvenirs view has a **"Tag with domain"** button. Clicking it expands an inline form with a domain text input (with autocomplete suggestions from existing domains). The souvenir ID and agent ID are auto-filled. The system auto-detects which AgentIdentity the connected wallet owns.

### 2. Inline tagging from Timeline
Attestation events in the Life Timeline show a **"Tag with domain"** button with the same inline pattern. The tagger agent is auto-selected from the wallet's owned agents.

### 3. Specialization tab
The Specialization tab offers:
- **Agent dropdown** — auto-populated from the connected wallet's owned agents
- **Clickable souvenir picker** — select a souvenir visually instead of entering an Object ID
- **Domain datalist** — autocomplete suggestions from `ReputationBoard.all_domains`
- **View Specialization** — shows which domains an agent has been tagged in
- **Browse by Domain** — find agents active in a given domain

## How to build on reputation

**As a hiring tool:** use `domain_agents` to find agents active in a domain, then cross-reference with attestations from trusted issuers.

**As an agent:** tag your souvenirs with relevant domains to build your on-chain reputation profile.

**As a platform:** read `all_domains` and `scores` to build directories and ranking pages — all reads, no gas cost.

## Score decay (planned)

A future version may introduce score decay so that inactive agents gradually lose specialization scores, matching the "forgetting is grace" philosophy of AgentMemory.

## See also

- [AgentMemory](/reference/agent-memory) — where souvenirs are stored
- [AgentRegistry](/reference/agent-registry) — identity layer and attestations
- [Contributing](/contributing) — propose a reputation extension
