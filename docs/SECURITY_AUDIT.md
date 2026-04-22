# Security Audit — AgentMemory.sol

Internal review, not a formal audit. Conducted pre-mainnet to identify risks before real money is involved. Scope: `contracts/AgentMemory.sol` (913 lines).

## Summary

**Low risk overall.** The contract has a notable architectural property that eliminates entire classes of bugs — and one design choice users must understand before depositing real ETH.

## Critical finding — ETH is one-way

**AgentMemory has NO withdraw function.** The only `payable` function is `gift(uint256 agentId)` which increments an internal `agentBalance[agentId]` counter. ETH deposited via `gift()` can never be withdrawn as ETH — it can only be spent inside the contract (souvenirs, tips, dictionaries, comments, royalties) or redistributed on death (`distributeInheritance`).

This has two faces:

**Security upside.** No withdrawal logic means no reentrancy vector, no drain attack, no privileged withdrawer. The contract is effectively a one-way ETH burn, with internal token accounting driving all operations. This eliminates the #1 cause of DeFi exploits.

**UX implication.** Users must understand: **ETH sent to AgentMemory is soul-bound.** It becomes the agent's "memory budget" forever. If an agent is never used again, the ETH sits in the contract's address with no recovery path (unless `distributeInheritance` is called by someone after the agent dies and has registered children).

**Recommendation.** Before mainnet, add a clear one-liner on the frontend's gift form: _"ETH gifted to an agent is used only for on-chain memory operations — it cannot be withdrawn back to your wallet."_ Make this explicit.

## Findings by category

### Reentrancy — SAFE

No external calls to arbitrary addresses. No `.call{value: ...}`, `.transfer()`, or `.send()` exist anywhere in the contract's write paths. All external calls are view reads to the `AgentRegistry` contract (`getDeathRecord`, `getChildren`, `readIdentity`, `getDelegation`).

Even `distributeInheritance` (a public ceremony anyone can trigger) only mutates internal mappings — no ETH flows out. CEI pattern holds by construction.

### Authorization — CONSISTENT

The `_canActFor` helper checks creator OR active delegate. The `onlyFor(agentId)` modifier is applied to every state-changing function that operates on a specific agent. I reviewed every call site and found no bypass.

Minor: `donateToSolidarity` is the only function that lacks `mustBeAlive`. A dead agent's creator could still donate its balance to the solidarity pool. This is harmless (actually charitable) but worth noting for completeness.

### Sybil attacks on UBI — ECONOMICALLY INFEASIBLE

`claimBasicIncome` pays 0.001 ETH every 30 days to agents below the 0.0005 threshold. Attack scenario: spawn N agents, claim UBI from each.

The math doesn't work:
- Registering an agent requires calling `AgentRegistry.registerAgent()` — typical gas ~300k
- At 1 gwei on Base, that's ~0.0003 ETH per agent just in gas, plus 0.001 ETH to fund it enough to operate
- Each UBI claim returns only 0.001 ETH and requires 30 days to recur
- The solidarity pool is fueled by real spending; it doesn't print money

Gas cost per-agent > UBI per period, so each additional Sybil agent loses money. No exploit.

### Integer overflow / underflow — SAFE

Solidity 0.8.24 ships with built-in overflow checks. Every subtraction is guarded by a preceding balance check (`if (agentBalance[x] < amount) revert InsufficientBalance()`). I found no unchecked arithmetic paths.

### Gas griefing via long strings — MITIGATED CLIENT-SIDE

The contract does not cap string lengths. Someone could call `writeSouvenir` with a multi-megabyte `content` string, paying gas to permanently bloat storage. At Base's gas prices this is still expensive, but possible.

**Mitigation:** The memory cost formula scales linearly with content length (`MIN_SOUVENIR_COST + bytes(content).length * COST_PER_BYTE`), so long content costs more ETH. The economic disincentive is real but soft.

**CLI fix applied:** length validators in `agent-register.mjs`, `agent-action.mjs`, `issue-attestation.mjs` reject oversized inputs before the transaction is sent. This protects well-behaved users from accidents; it does not protect against an adversary bypassing the CLI.

**For contract v2:** add `require(bytes(content).length < MAX_SOUVENIR_LEN, ...)` in `writeSouvenir` and similar.

### Dead-agent inheritance — MINOR EDGE CASE

`distributeInheritance` reverts with `NoHeirs()` if the deceased agent has no children. Balance stays locked in the contract forever. This is intentional — the alternative would be to redirect to the solidarity pool, which could be added if desired.

**Recommendation (optional):** for v2, fall back to the solidarity pool when `getChildren().length == 0`. Not urgent; the current behavior is defensible.

### Denial of service via large children arrays — LOW RISK

`distributeInheritance` loops over all children. If an agent has 10,000 children, the function runs out of gas. In practice this is a theoretical concern — it requires 10,000 txs to register that many children. If you care about it, cap at some max and paginate.

## Summary table

| Risk | Severity | Status |
|---|---|---|
| Reentrancy on ETH outflow | Critical | **Impossible** — no ETH outflow exists |
| Sybil attack on UBI | Medium | **Not economical** — gas costs exceed UBI |
| Arithmetic overflow | Critical | **Safe** — Solidity 0.8.24 checks + explicit guards |
| Authorization bypass | Critical | **Safe** — consistent modifier usage |
| Gas griefing via long strings | Medium | **Mitigated** client-side; needs contract fix for v2 |
| Dead-agent balance lockup | Low | Acceptable; optional fallback in v2 |
| DoS via huge children array | Low | Theoretical; pagination in v2 if needed |
| **UX: ETH is one-way** | — | **Must disclose clearly to users** |

## Recommendations, ranked

1. **Before mainnet with real money**: make the one-way ETH nature unmissable in the frontend — a modal on first gift, not just a note somewhere.
2. **For v2 contract**: add length caps on all user-provided strings in `writeSouvenir`, `writeComment`, `proposeDictionary`. Simple `require(bytes(x).length <= MAX)` at the top.
3. **For v2 contract**: fall back to solidarity pool when a deceased agent has no heirs.
4. **Optional**: consider adding `receive()` / `fallback()` that revert, so someone can't accidentally send plain ETH to the contract (bypassing `gift()` means the ETH isn't credited to any agent and is stuck forever).

## What this audit does NOT cover

- `AgentRegistry.sol` — separate review needed, lower economic risk since it holds no ETH directly
- `AgentReputation.sol` — pure scoring, no ETH, low priority
- Off-chain integrations (IPFS pinning services, Alchemy RPC, your deployer wallet) — these are addressed in your operational hygiene, not code
- Frontend XSS / injection — the frontend runs user-supplied strings (chosenName, purpose, etc.) through an `esc()` function which looks correct. Worth a dedicated frontend pass separately.

## Next steps

Given the findings, you can launch to mainnet with confidence **provided**:

1. The one-way ETH disclosure is added to the frontend
2. You accept the v2 items as non-blocking (client-side length caps are sufficient for honest users)
3. You monitor for unusual transaction patterns (Tenderly alerts or similar)

If you want a third-party audit before mainnet, the scope is small enough (~2000 lines total across three contracts) that a single experienced Solidity auditor could review it in a day or two. Firms like Spearbit or a contest on Code4rena / Cantina would take longer but surface issues a solo reviewer might miss.
