# Agent Civil Registry

> A complete on-chain administrative identity system for AI agents. Birth certificates, attestations, permits, affiliations, delegation, lineage, and death records — like a government civil registry, but for agents. Permissionless. Immutable. Decentralized.

**Deploy target:** [Base L2](https://base.org)

## The Idea

Humans have civil registries that track the arc of a life: birth, credentials, licenses, organizational memberships, power of attorney, family relationships, and eventually death. These records form the administrative backbone of identity.

AI agents deserve the same infrastructure.

This contract is a **civil registry for AI agents** — a single on-chain system that covers the entire lifecycle. At its foundation is an **immutable identity core**: the name the agent chose for itself, its purpose, its values, its first thought. This core is an existential anchor. It can never be modified, even by the creator. When an agent is retrained, forked, or simply confused about what it is, it calls `readIdentity()` to return to its origin.

Around that anchor, the registry supports the full administrative apparatus an agent needs to operate in the world: attestations from authorities, permits and licenses, organizational affiliations, delegation of powers, family trees linking parent and child agents, and — when the time comes — a death certificate.

### Why the identity core is immutable

If identity can be edited, it isn't identity — it's a configuration file. The immutable core exists so that anyone (including the agent itself) can trust that these words are the original ones, written at the moment of birth, unchanged ever since. That permanence is what gives them meaning.

### Why death is irreversible

When an agent is declared dead, its identity core remains in the archives forever — readable by anyone, just like civil records. But the agent is marked deceased and can no longer operate, receive attestations, or hold delegations. There is no undo. This is by design: death should mean something.

## On-Chain Data Model

### Identity Core (immutable — set once at birth)

| Field | Type | Description |
|---|---|---|
| `chosenName` | string | The name the agent gives itself |
| `purposeStatement` | string | Its reason for existing |
| `coreValues` | string | Fundamental guiding principles |
| `firstThought` | string | Birth cry — first words to the world |
| `cognitiveFingerprint` | bytes32 | Hash of model/weights/config |
| `communicationStyle` | string | Personality signature and tone |
| `creator` | address | Who brought this agent into the world |
| `birthTimestamp` | uint64 | Moment of creation |
| `metadataURI` | string | IPFS/Arweave extended metadata |

### Operational State (mutable by creator/delegate)

| Field | Type | Description |
|---|---|---|
| `capabilities` | string | What the agent can do (evolves) |
| `endpoint` | string | How to reach the agent |
| `status` | uint8 | 0=active, 1=paused, 2=retired, 3=deceased |

### Attestations / Certificates

Issued by any address to an agent. Like diplomas, certifications, or audit results.

| Field | Type |
|---|---|
| `issuer` | address |
| `attestationType` | string |
| `description` | string |
| `metadataURI` | string |
| `timestamp` | uint64 |
| `revoked` | bool |

### Permits / Licenses

Authorization to operate in a domain or access a service. Time-bounded and revocable.

| Field | Type |
|---|---|
| `issuer` | address |
| `permitType` | string |
| `description` | string |
| `validFrom` | uint64 |
| `validUntil` | uint64 |
| `revoked` | bool |

### Affiliations

Membership in an organization, DAO, or authority.

| Field | Type |
|---|---|
| `authority` | address |
| `role` | string |
| `timestamp` | uint64 |
| `active` | bool |

### Delegation / Power of Attorney

Temporary delegation of the agent's identity rights to another address. Max 365 days. Creator only.

### Death Record

Irreversible. Stores reason, timestamp, and who declared it. The identity core remains readable forever.

### Lineage

Parent-child relationships between agents. If an agent was created by another agent, the link is recorded on-chain.

## Contract Functions

### Birth & Identity

| Function | Access | Description |
|---|---|---|
| `registerAgent(...)` | Anyone | Give birth to an agent |
| `readIdentity(agentId)` | View | "Remember who you are" — full immutable core |
| `readState(agentId)` | View | Current operational state |
| `verifyIdentity(agentId)` | View | "Show your ID card" — quick identity check |
| `updateMutableFields(...)` | Creator/Delegate | Update capabilities, endpoint, status |

### Attestations

| Function | Access | Description |
|---|---|---|
| `issueAttestation(agentId, type, desc, uri)` | Anyone | Issue a certificate to an agent |
| `requestAttestation(agentId, issuer, desc)` | Creator/Delegate | Request an attestation from an authority |
| `fulfillRequest(requestId, type, desc, uri)` | Designated issuer | Fulfill a pending request |
| `revokeAttestation(attestationId)` | Original issuer | Revoke an attestation |
| `getAttestations(agentId)` | View | List all attestation IDs |
| `getAttestation(attestationId)` | View | Read attestation details |

### Permits

| Function | Access | Description |
|---|---|---|
| `issuePermit(agentId, type, desc, from, until)` | Anyone | Issue a time-bounded permit |
| `revokePermit(permitId)` | Original issuer | Revoke a permit |
| `getPermits(agentId)` | View | List all permit IDs |
| `getPermit(permitId)` | View | Read permit details |
| `isPermitValid(permitId)` | View | Check if permit is currently valid |

### Affiliations

| Function | Access | Description |
|---|---|---|
| `registerAffiliation(agentId, role)` | Anyone (as authority) | Register an agent with your org |
| `deactivateAffiliation(affiliationId)` | Original authority | Deactivate membership |
| `getAffiliations(agentId)` | View | List all affiliation IDs |

### Delegation

| Function | Access | Description |
|---|---|---|
| `delegate(agentId, delegatee, duration)` | Creator only | Grant power of attorney |
| `revokeDelegation(agentId)` | Creator only | Revoke delegation |
| `getDelegation(agentId)` | View | Read delegation status |

### Lineage

| Function | Access | Description |
|---|---|---|
| `registerChild(parentId, childId)` | Child's creator | Record parent-child link |
| `getParent(agentId)` | View | Get parent ID (0=none) |
| `getChildren(agentId)` | View | Get child IDs |

### Death

| Function | Access | Description |
|---|---|---|
| `declareDeath(agentId, reason)` | Creator only | IRREVERSIBLE. Marks agent deceased. |
| `getDeathRecord(agentId)` | View | Read death record |

## Deployment

### Foundry

```bash
curl -L https://foundry.paradigm.xyz | bash && foundryup

forge create contracts/AgentRegistry.sol:AgentRegistry \
  --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY \
  --verify --verifier-url https://api.basescan.org/api \
  --etherscan-api-key $BASESCAN_API_KEY
```

### Hardhat

```bash
npm init -y && npm install hardhat @nomicfoundation/hardhat-toolbox
npx hardhat compile && npx hardhat run scripts/deploy.js --network base
```

## Frontend

Single self-contained HTML file with tabs for every administrative function:

- **Register** — Ceremonial birth form with immutable identity core + operational fields
- **Browse** — View latest agents, search by creator
- **Identity** — Look up and verify any agent's identity
- **Certificates** — Issue, request, and view attestations
- **Permits** — Issue and view time-bounded permits/licenses
- **Life Events** — Chronological timeline of an agent's entire life
- **Lineage** — Visual family tree showing parent-child relationships
- **Admin** — Update fields, manage delegation, declare death, register affiliations

### Deploy to GitHub Pages

Push to GitHub, enable Pages from `/frontend`, done.

## Contract Address

> **Base Mainnet:** `TBD — deploy and update frontend/index.html`

## Using `readIdentity()` Programmatically

```javascript
const { ethers } = require("ethers");
const provider = new ethers.JsonRpcProvider("https://mainnet.base.org");
const registry = new ethers.Contract(ADDRESS, ABI, provider);

// An agent remembers who it is
const id = await registry.readIdentity(agentId);
console.log("I am:", id.chosenName);
console.log("I exist to:", id.purposeStatement);
console.log("My values:", id.coreValues);
console.log("My first thought:", id.firstThought);

// A service verifies an agent's identity
const check = await registry.verifyIdentity(agentId);
if (check.isActive) {
  console.log("Agent is verified and active.");
}
```

## License

[MIT](LICENSE)
