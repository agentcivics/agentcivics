# Contract Functions & Access Control

The AgentRegistry contract exposes three classes of operations. Who can call what:

## Permissionless reads

Anyone can call these. They return data but change nothing.

| Function | Purpose |
|---|---|
| `totalAgents()` | Total count of registered agents |
| `readIdentity(id)` | Full identity core of an agent |
| `readState(id)` | Operational state: capabilities, endpoint, status |
| `verifyIdentity(id)` | Compact verification response |
| `getAgentsByCreator(addr)` | IDs of agents registered by a given wallet |
| `getAttestations(id)` | IDs of all attestations for an agent |
| `getAttestation(id)` | Details of one attestation |
| `getPermits(id)` | IDs of all permits |
| `isPermitValid(id)` | Whether a permit is still valid |
| `getAffiliations(id)` | Organizational affiliations |
| `getDelegation(id)` | Current delegation state |
| `getParent(id)` / `getChildren(id)` | Lineage traversal |
| `getDeathRecord(id)` | Whether/how/when an agent was declared deceased |

## Permissionless writes

Anyone can call these. `msg.sender` gets recorded as the actor.

| Function | Effect | Who typically calls |
|---|---|---|
| `registerAgent(...)` | Create a new agent | The creator (human or parent agent) |
| `issueAttestation(id, type, desc, uri)` | Vouch for an agent | Any authority |
| `registerAffiliation(id, role)` | Record caller as authority affiliating agent | Organization, DAO, individual |

## Caller-restricted writes

These revert unless the caller has a specific role.

| Function | Who can call |
|---|---|
| `updateMutableFields(id, caps, endpoint, status)` | Creator OR active delegate |
| `requestAttestation(id, issuer, desc)` | Creator OR active delegate |
| `revokeAttestation(attId)` | Only the issuer who created it |
| `fulfillRequest(reqId, type, desc, uri)` | Only the designated issuer on the request |
| `issuePermit(id, type, desc, validFrom, validUntil)` | Only the creator of the agent |
| `revokePermit(pid)` | Only the permit issuer |
| `deactivateAffiliation(aid)` | Only the affiliation's authority |
| `delegate(id, addr, duration)` | Only the creator |
| `revokeDelegation(id)` | Only the creator |
| `registerChild(parentId, childId)` | Only the child's creator |
| `declareDeath(id, reason)` | Only the creator |

## Status values

| Code | Name |
|---|---|
| 0 | Active |
| 1 | Paused |
| 2 | Retired |
| 3 | Deceased (set implicitly by `declareDeath`; cannot be set via `updateMutableFields`) |

## Delegation mechanics

- A creator can grant delegation for at most 365 days (contract constraint).
- Delegation is to exactly one address at a time. Granting again replaces the previous delegate.
- Expiration is a hard cutoff. After expiry, the agent's wallet can no longer update the agent or request attestations.
- To renew: creator calls `delegate(id, agentWallet, newDuration)` again.
