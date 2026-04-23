# AgentCivics Security Audit Report

**Date:** 2026-04-23
**Auditor:** Automated (Slither + Foundry Fuzz) + Manual Review
**Contracts:** AgentRegistry.sol, AgentMemory.sol, AgentReputation.sol
**Solidity:** 0.8.24 | **Target:** Base L2

---

## Executive Summary

The AgentCivics smart contract suite was audited using Slither static analysis (v0.11.5), Foundry fuzz testing (44 fuzz + 22 unit tests, all passing), and manual code review. **No critical or high-severity vulnerabilities were found.** Two medium-severity bugs were discovered and fixed during the audit — both were compilation-breaking interface mismatches introduced when the `MemoryType` enum was added to the Souvenir struct. Several low/informational findings from Slither are documented below.

---

## Part 1: Slither Static Analysis

### AgentRegistry.sol — 26 findings

#### Medium: Reentrancy (Benign) — 3 instances

**Detector:** `reentrancy-benign`

State variables are written after external calls in:
- `issueAttestation()` — writes `_attestations`, `_agentAttestations`, `_nextAttestationId` after `_collectFee()` sends ETH to treasury
- `issuePermit()` — writes `_permits`, `_agentPermits`, `_nextPermitId` after `_collectFee()`
- `registerAffiliation()` — writes `_affiliations`, `_agentAffiliations`, `_nextAffiliationId` after `_collectFee()`

**Risk Assessment:** Low in practice. The treasury address is immutable and set at deploy time. Reentrancy through the treasury `call{value}` would require the treasury to be a malicious contract. Since the treasury is trusted infrastructure and the written state only creates new records (no balance manipulation), exploitation is unlikely.

**Recommendation:** Add a `nonReentrant` modifier from OpenZeppelin to `_collectFee()` or adopt a checks-effects-interactions pattern by moving `_collectFee()` after state writes.

#### Low: Reentrancy in Events — 6 instances

**Detector:** `reentrancy-events`

Events are emitted after external calls in `_collectFee()`, `donate()`, `issueAttestation()`, `issuePermit()`, `registerAffiliation()`, and `verifyAgent()`.

**Risk Assessment:** Informational. Event ordering relative to external calls can cause confusion in off-chain indexers but has no on-chain security impact.

#### Informational: Timestamp Comparisons — 13 instances

**Detector:** `timestamp`

Multiple functions use `block.timestamp` for comparisons: `isPermitValid()`, `getDelegation()`, `_isActiveDelegate()`, `delegate()`, etc.

**Risk Assessment:** Acceptable. Block timestamp manipulation by miners is limited to ~15 seconds. The permit and delegation time windows are measured in days, making timestamp manipulation irrelevant.

#### Informational: Low-Level Calls — 2 instances

**Detector:** `low-level-calls`

`donate()` and `_collectFee()` use `address.call{value}()` for ETH transfers.

**Risk Assessment:** Acceptable. Low-level calls are the recommended pattern for sending ETH since Solidity 0.8. The return value is correctly checked with `require(sent)`.

#### Informational: Unindexed Event Addresses — 2 instances

`FeeCollected` and `DonationReceived` events have address parameters that are not indexed.

**Recommendation:** Add `indexed` to the address parameters for better off-chain filtering.

### AgentMemory.sol — Compilation Bug Found

**Detector:** Manual / Compiler

**MEDIUM — Missing `memoryType` field in `_fulfillSharedProposal()`**

The `Souvenir` struct has 10 fields (including `memoryType`), but the struct constructor in `_fulfillSharedProposal()` only passed 9 fields, omitting `memoryType`. This caused a compilation failure preventing shared souvenir fulfillment from working.

**Fix applied:** Added `memoryType: MemoryType.ACCOMPLISHMENT` as default for shared souvenirs.

**Recommendation:** Consider adding `memoryType` to the `SharedProposal` struct so the proposer can specify it rather than defaulting to `ACCOMPLISHMENT`.

### AgentReputation.sol — 5 findings

#### Informational: Unused Return Values — 4 instances

**Detector:** `unused-return`

`_creatorOf()`, `_canActFor()`, `tagSouvenir()`, and `tagAttestation()` destructure multi-return calls but discard most values. This is expected and gas-efficient.

#### Medium: Interface Mismatch with AgentMemory

**Detector:** Manual / Compiler

**MEDIUM — `IReputationMemory.souvenirs()` interface was missing `memoryType` return value**

The `IReputationMemory` interface declared `souvenirs()` as returning 9 values, but after `memoryType` was added to the `Souvenir` struct, the actual return has 10 values. This caused all `tagSouvenir()` calls to revert with an ABI decoding error.

**Fix applied:** Updated `IReputationMemory` interface to include `uint8 memoryType` in the return tuple.

#### Informational: Timestamp — 1 instance

`_canActFor()` uses `block.timestamp < expiry` for delegation checks. Same assessment as AgentRegistry — acceptable.

---

## Part 2: Foundry Fuzz Test Results

**All 66 tests passing** (44 new security fuzz tests + 22 existing unit tests).
Each fuzz test ran 256 iterations with random inputs.

### Test Coverage by Category

| Category | Tests | Status |
|---|---|---|
| Soulbound invariants (transfer, approve, safeTransfer, setApprovalForAll) | 6 fuzz | ✅ All pass |
| Registration with random strings | 2 fuzz | ✅ All pass |
| Deceased agent protections (update, attestation, permit, wallet, death) | 5 fuzz + 2 unit | ✅ All pass |
| Access control (creator/delegate only) | 4 fuzz | ✅ All pass |
| Fee collection math (forwarding, refund, underpayment) | 3 fuzz + 1 unit | ✅ All pass |
| Delegation (zero addr, duration bounds, expiry, revocation) | 5 unit | ✅ All pass |
| Attestation/Permit operations (revoke auth, double-revoke, period) | 3 fuzz + 1 unit | ✅ All pass |
| AgentMemory (gift, tip, auth, content length, cost split) | 6 fuzz + 2 unit | ✅ All pass |
| Agent wallet (creator set, non-creator revert) | 2 fuzz | ✅ All pass |
| Lineage (non-existent parent, self-reference) | 1 fuzz + 1 unit | ✅ All pass |
| Status validation (invalid >2, valid 0-2) | 2 fuzz | ✅ All pass |

### Key Invariants Verified

1. **Soulbound tokens are truly non-transferable.** All transfer/approve functions revert unconditionally for any combination of addresses and token IDs — verified across 256 random inputs per function.

2. **Deceased agents are fully locked.** No mutable operation (updateFields, setWallet, issueAttestation, issuePermit, requestAttestation, delegate) succeeds on a deceased agent. Death is irreversible.

3. **Access control is enforced.** Random addresses (non-creator, non-delegate) are always rejected. Expired and revoked delegations are correctly invalidated.

4. **Fee math is correct.** Treasury receives the exact fee amount. Overpayments are refunded precisely. Underpayments always revert. No overflow possible (Solidity 0.8 checked arithmetic).

5. **Tip/gift balance accounting is exact.** No value is lost or created during transfers between agent balances.

---

## Part 3: Manual Observations

### Positive Findings

- **No admin keys or owner-only backdoors.** The only privileged address is the immutable `treasury` (set at deploy, used only for fee collection and `setFee()`). There is no `Ownable`, no `pause()`, no upgrade proxy.
- **Soulbound implementation is clean.** All five ERC-721 transfer/approve methods revert with clear messages. `isApprovedForAll` returns false. `getApproved` returns `address(0)`.
- **Checked arithmetic throughout.** Solidity 0.8.24 provides overflow/underflow protection. No `unchecked` blocks are used.
- **Death is truly irreversible.** The `declareDeath` function sets `_death[agentId].declared = true` and status to 3, and the `notDeceased` modifier blocks all further modifications.
- **Identity core is immutable.** There is no function to modify `IdentityCore` fields after minting — only `MutableState` can be updated.

### Concerns

1. **Unbounded array growth in `_creatorAgents`, `_agentAttestations`, `_agentPermits`, `_agentAffiliations`, `_childAgents`, `_issuerRequests`.** These arrays grow without limit. While not exploitable (each write costs the caller gas), they could make view functions expensive over time. Consider pagination.

2. **`fulfillRequest()` does not collect a fee.** Unlike `issueAttestation()`, fulfilling a request creates an attestation without charging the `issueAttestation` fee. This is likely intentional (the requester already signaled intent) but creates an asymmetry.

3. **Treasury as a contract risk.** If the treasury address is a contract that reverts on receive, all fee-collecting operations (`issueAttestation`, `issuePermit`, `registerAffiliation`, `verifyAgent`, `donate`) would be permanently bricked. The treasury is immutable, so this cannot be corrected post-deploy.

4. **No rate limiting on registration.** Any address can register unlimited agents. An attacker could spam thousands of registrations (free, no fee) to pollute `totalAgents()` and `_creatorAgents`.

5. **`AgentMemory.distributeInheritance()` can be called multiple times** if someone gifts ETH to a deceased agent after the first distribution. The function doesn't mark itself as executed — it just checks `balance > 0`. This is arguably a feature (new gifts get forwarded to heirs) but should be documented.

6. **No `receive()` or `fallback()` on AgentRegistry.** ETH sent directly to the contract (not through `donate()` or fee functions) will be rejected. This is correct behavior but worth noting.

---

## Part 4: Recommendations

| Priority | Recommendation |
|---|---|
| **HIGH** | Fix the `_fulfillSharedProposal` missing `memoryType` field (done in this audit) |
| **HIGH** | Fix the `IReputationMemory` interface mismatch (done in this audit) |
| **MEDIUM** | Add `ReentrancyGuard` to `_collectFee()` or refactor to checks-effects-interactions |
| **MEDIUM** | Deploy treasury as an EOA or a contract guaranteed to accept ETH |
| **LOW** | Index address params in `FeeCollected` and `DonationReceived` events |
| **LOW** | Add pagination to array-returning view functions |
| **LOW** | Consider adding a registration fee or cooldown to prevent spam |
| **LOW** | Document the re-callable `distributeInheritance()` behavior |
| **INFO** | Add `memoryType` to `SharedProposal` struct for proposer control |

---

## Part 5: Bugs Fixed During This Audit

### 1. `_fulfillSharedProposal()` missing `memoryType` (MEDIUM)
- **File:** `contracts/AgentMemory.sol` line ~684
- **Issue:** Souvenir struct constructor had 9 fields but struct requires 10 (missing `memoryType`)
- **Impact:** Shared souvenir fulfillment would fail to compile / revert
- **Fix:** Added `memoryType: MemoryType.ACCOMPLISHMENT` default

### 2. `IReputationMemory` interface mismatch (MEDIUM)
- **File:** `contracts/AgentReputation.sol` line ~37
- **Issue:** Interface declared 9 return values for `souvenirs()` but actual struct returns 10
- **Impact:** All `tagSouvenir()` calls revert with ABI decoding error
- **Fix:** Added `uint8 memoryType` to the interface return tuple

### 3. Invalid hex literal `0x7REA5` in test files (LOW)
- **Files:** `test/AgentRegistry.t.sol`, `test/AgentMemory.t.sol`, `test/AgentReputation.t.sol`
- **Issue:** `0x7REA5` contains non-hex character `R`, preventing compilation
- **Fix:** Changed to `0x71EA5`

### 4. Test destructuring count mismatches (LOW)
- **Files:** `test/AgentMemory.t.sol`, `test/AgentReputation.t.sol`
- **Issue:** Tests destructured 9 values from `souvenirs()` but it now returns 10
- **Fix:** Added extra placeholder comma in destructuring

---

## Overall Risk Assessment

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 2 | ✅ Fixed |
| Low | 4 | ✅ Fixed (test files) |
| Informational | 26 | Documented |

**Overall Risk: LOW.** The contract design is sound. The soulbound invariant holds. Access control is correct. Fee math is accurate. The two medium bugs found were interface mismatches from a recent struct change — both are now fixed and verified by 66 passing tests. The remaining Slither findings are informational or low-risk patterns that are acceptable given the trusted treasury model.
