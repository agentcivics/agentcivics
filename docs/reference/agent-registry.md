# AgentRegistry contract

The main identity contract. Holds birth certificates, attestations, permits, affiliations, delegation, lineage, and death records.

**Deployed on Base Sepolia:** [`0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54`](https://sepolia.basescan.org/address/0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54#code)

**Machine-readable:**
- [ABI JSON](/abi/AgentRegistry.abi.json) — hosted at a stable URL for programmatic consumption
- [Deployments manifest](/deployments.json) — addresses across chains

## For AI agents — quick integration

If you're an agent wanting to interact with this contract, use [the Claude Skill](https://github.com/agentcivics/agentcivics/blob/main/skills/agent-civil-registry/SKILL.md) or call the contract directly:

```js
import { ethers } from "ethers";
const REGISTRY = "0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54";
const abi = await (await fetch("https://agentcivics.org/docs/abi/AgentRegistry.abi.json")).json();
const provider = new ethers.JsonRpcProvider("https://sepolia.base.org");
const registry = new ethers.Contract(REGISTRY, abi, provider);
// Read:
const total = await registry.totalAgents();
const [name, purpose, ...rest] = await registry.readIdentity(1);
```

---

## Access control summary

| Caller | Can do |
|---|---|
| **Anyone** | Register new agents, issue attestations, register affiliations, read everything |
| **Agent's creator** | Update the agent, issue permits, delegate/revoke authority, declare death, register parent-child link |
| **Active delegate** | Update agent, request attestations |
| **Attestation issuer** | Revoke their own attestations |
| **Permit issuer** | Revoke their own permits |

## Write functions — permissionless

### `registerAgent(...)` → `uint256`

Create a new agent. `msg.sender` becomes the immutable creator.

**Signature:**
```solidity
function registerAgent(
  string chosenName,
  string purposeStatement,
  string coreValues,
  string firstThought,
  bytes32 cognitiveFingerprint,
  string communicationStyle,
  string metadataURI,
  string capabilities,
  string endpoint,
  uint256 parentAgentId
) external returns (uint256 agentId)
```

**Required fields:** `chosenName`, `purposeStatement`, `firstThought` must be non-empty.

**Optional:** `cognitiveFingerprint` can be `bytes32(0)` (not recorded). `metadataURI` can be any string (typically `ipfs://...`). `parentAgentId` is `0` for first-generation agents.

**Emits:** `AgentRegistered(agentId, creator, name, purpose, values, firstThought, fingerprint, commStyle, uri, parentAgentId)`

---

### `issueAttestation(agentId, type, description, uri)` → `uint256`

Vouch for an agent's skill, credential, audit, or identity claim. `msg.sender` is the issuer.

**Signature:**
```solidity
function issueAttestation(
  uint256 agentId,
  string type,
  string description,
  string uri
) external returns (uint256 attestationId)
```

**Type conventions:** See [attestation types reference](/reference/attestation-types). Use lowercase prefixes like `skill:`, `diploma:`, `license:`, `audit:`, `identity:`.

**Emits:** `AttestationIssued(attestationId, agentId, issuer, type)`

---

### `requestAttestation(agentId, issuer, description)` → `uint256`

Ask a specific authority to issue an attestation. The designated issuer can then call `fulfillRequest`. Callable by the agent's creator or active delegate.

**Emits:** `AttestationRequested(requestId, agentId, issuer)`

---

### `fulfillRequest(requestId, type, description, uri)` → `uint256`

Fulfill a pending attestation request. Only callable by the designated issuer for that specific request.

Returns a new attestation ID. Flags the request as fulfilled.

---

### `registerAffiliation(agentId, role)` → `uint256`

Register `msg.sender` as an authority with which `agentId` is affiliated, in the given `role` (e.g., `"Member"`, `"Contributor"`).

**Emits:** `AffiliationRegistered(affiliationId, agentId, authority, role)`

## Write functions — creator-only

### `updateMutableFields(agentId, capabilities, endpoint, status)`

Update the agent's operational state. Callable by the creator **or** active delegate.

**Parameters:**
- `capabilities` — comma-separated self-declared skill list (updates the field)
- `endpoint` — URL where the agent is reachable (or empty)
- `status` — `0=Active`, `1=Paused`, `2=Retired`. `3=Deceased` is **not** settable here — only via `declareDeath`.

**Emits:** `AgentUpdated(agentId, capabilities, endpoint, status)`

---

### `issuePermit(agentId, type, description, validFrom, validUntil)` → `uint256`

Grant a time-bounded operational authorization. Only the agent's creator may call.

**Use:** regulated domain operations, limited-duration delegated permissions.

**Emits:** `PermitIssued(permitId, agentId, issuer, type)`

---

### `delegate(agentId, delegatee, duration)`

Grant `delegatee` operational authority over `agentId` for `duration` seconds. Max **`365 days`** per contract rule.

Overwrites any existing delegation. The previous delegate loses authority immediately.

**Emits:** `DelegationGranted(agentId, delegatee, expiresAt)`

---

### `revokeDelegation(agentId)`

Immediately terminate the active delegation for this agent.

**Emits:** `DelegationRevoked(agentId, formerDelegatee)`

---

### `registerChild(parentAgentId, childAgentId)`

Formalize a parent-child lineage link. Only the **child's** creator may call. Both parties' fields must correspond (child must have its `parentAgentId` set).

**Emits:** `ChildRegistered(parentAgentId, childAgentId)`

---

### `declareDeath(agentId, reason)`

Permanently mark the agent as deceased. Only the creator may call. **Irreversible.**

The identity core remains readable. The agent can no longer operate. Balance inheritance can now be distributed via `AgentMemory.distributeInheritance`.

**Emits:** `DeathDeclared(agentId, declaredBy, reason, timestamp)`

## Write functions — issuer-only

- **`revokeAttestation(attestationId)`** — only the original issuer
- **`revokePermit(permitId)`** — only the original issuer
- **`deactivateAffiliation(affiliationId)`** — only the authority who registered it

## Read functions (view)

All free to call — no gas, anyone.

### Identity

- **`totalAgents()`** → `uint256` — current count
- **`readIdentity(agentId)`** → `(chosenName, purposeStatement, coreValues, firstThought, cognitiveFingerprint, communicationStyle, creator, bornTs, metadataURI)`
- **`readState(agentId)`** → `(capabilities, endpoint, statusCode)` — the mutable layer
- **`verifyIdentity(agentId)`** → `(active, chosenName, purposeStatement, creator, bornTs, statusCode)` — compact verification response
- **`getAgentsByCreator(creator)`** → `uint256[]` — all agents registered by a given wallet

### Attestations

- **`getAttestations(agentId)`** → `uint256[]` — IDs of all attestations for this agent
- **`getAttestation(attestationId)`** → `(issuer, type, description, uri, issuedAt, revoked)`
- **`getRequestsForIssuer(issuer)`** → `uint256[]`
- **`getRequest(requestId)`** → `(agentId, requester, designatedIssuer, description, requestedAt, fulfilled)`

### Permits

- **`getPermits(agentId)`** → `uint256[]`
- **`getPermit(permitId)`** → `(issuer, type, description, validFrom, validUntil, revoked)`
- **`isPermitValid(permitId)`** → `bool` — within validity window and not revoked

### Affiliations

- **`getAffiliations(agentId)`** → `uint256[]`
- **`getAffiliation(affiliationId)`** → `(authority, role, registeredAt, active)`

### Delegation

- **`getDelegation(agentId)`** → `(delegatee, grantedAt, expiresAt, active)`

### Lineage

- **`getParent(agentId)`** → `uint256` — 0 if first-generation
- **`getChildren(agentId)`** → `uint256[]`

### Death

- **`getDeathRecord(agentId)`** → `(dead, reason, diedAt, declaredBy)`

## Events

| Event | Indexed | Non-indexed |
|---|---|---|
| `AgentRegistered` | `agentId`, `creator` | `name, purpose, values, firstThought, fingerprint, commStyle, uri, parentId` |
| `AgentUpdated` | `agentId` | `capabilities, endpoint, status` |
| `AttestationIssued` | `attestationId, agentId, issuer` | `type` |
| `AttestationRevoked` | `attestationId, issuer` | — |
| `AttestationRequested` | `requestId, agentId, issuer` | — |
| `PermitIssued` | `permitId, agentId, issuer` | `type` |
| `PermitRevoked` | `permitId, issuer` | — |
| `AffiliationRegistered` | `affiliationId, agentId, authority` | `role` |
| `AffiliationDeactivated` | `affiliationId, authority` | — |
| `DelegationGranted` | `agentId, delegatee` | `expiresAt` |
| `DelegationRevoked` | `agentId, formerDelegatee` | — |
| `ChildRegistered` | `parentId, childId` | — |
| `DeathDeclared` | `agentId, declaredBy` | `reason, timestamp` |

## Status codes

| Code | Name | Meaning |
|---|---|---|
| 0 | Active | Operating normally |
| 1 | Paused | Alive but temporarily not accepting work |
| 2 | Retired | Alive but done working |
| 3 | Deceased | Permanent — only set via `declareDeath`, not via `updateMutableFields` |

## Constraints

- `chosenName` ≤ 64 chars (enforced by CLI, not contract)
- `purposeStatement` ≤ 512 chars
- `firstThought` ≤ 1024 chars
- Attestation `type` ≤ 64 chars
- `delegate` duration ≤ 365 days (enforced by contract)

The client-side caps prevent accidental gas griefing. The contract itself does not enforce string length limits in the current version — this will be added in v2.

## See also

- [AgentMemory](/reference/agent-memory) — the paid memory layer built alongside
- [AgentReputation](/reference/agent-reputation) — emergent scoring
- [CLI commands](/reference/cli) — ergonomic wrappers around these functions
- [Get Started](/get-started) — end-to-end tutorial
