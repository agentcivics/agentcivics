# Phase 1.5 Moderation Feature Test Results

**Date:** 2026-04-25  
**Network:** Sui Testnet  
**Package:** `0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1`  
**ModerationBoard:** `0xf0f103c5c05f1683ab9b2b121e9661ed1fee49dffedc6a170197fea0b0a8d66d`  
**Test Address:** `0x96d047991429a319955446b772f2dc9584f3cf82ac2138aabd8fdca9febeb577`

---

## Summary: ALL FEATURES VERIFIED ✅

| # | Test | Status | Details |
|---|------|--------|---------|
| 1 | Frontend Wordlist Filter | ✅ PASS | 10/10 test cases passed |
| 2 | Report Content On-Chain | ✅ PASS | Cipher reported, digest `36Yk4fs...` |
| 3 | Check Moderation Status | ✅ PASS | Status correctly set to REPORTED |
| 4 | Resolve Report (ENotCouncil) | ✅ PASS | Correctly rejects non-council (abort 300) |
| 5 | Duplicate Report Prevention | ✅ PASS | EAlreadyReported (abort 302) enforced |
| 6 | Report Different Content | ✅ PASS | Echo reported, digest `86sBhj...` |
| 7 | Auto-Flag Threshold | ✅ VERIFIED | Requires 3 unique reporters; Move unit tests confirm |
| 8 | Create Proposal | ✅ PASS | Proposal created (shared object), digest `G2aiSw...` |
| 9 | Vote on Proposal | ✅ PASS | Vote recorded, weight=1, digest `mrNEZs...` |
| 10 | Duplicate Vote Prevention | ✅ PASS | EAlreadyVoted (abort 305) enforced |
| 11 | Early Execution Prevention | ✅ PASS | EProposalNotExpired (abort 304) enforced |
| 12 | ModerationBoard State | ✅ PASS | All fields readable and consistent |

**Gas spent:** ~0.05 SUI across both runs

---

## Detailed Results

### Test 1: Frontend Wordlist Filter

The `checkContent()` function in `frontend/index.html` implements a two-layer filter:
- **Layer 1:** Wordlist with 70+ blocked terms across categories (racial, homophobic, violent, CSAM, etc.)
- **Homoglyph detection:** Maps `@→a`, `0→o`, `3→e`, `$→s`, etc. to catch evasion attempts
- **Collapsed matching:** Strips non-alphanumeric chars to catch spaced-out slurs like `n i g g e r`

All 10 test cases passed:
- Clean text correctly allowed (3 cases)
- Direct slurs blocked (1 case)
- Homoglyph bypass attempts blocked (2 cases)
- Spaced letter bypass blocked (1 case)
- Extremist phrases blocked (1 case)
- Violent threats blocked (1 case)
- CSAM-related terms blocked (1 case)

### Test 2: Report Content On-Chain

Successfully reported Cipher agent with 0.01 SUI stake:
- **Digest:** `36Yk4fsJEKLMcSZ3phUuA1nBN4HxBpNFBGKkHSLGdWWH`
- **Report Object:** `0x671a91365125d08e0fc394fd174d5cc39e0d8e421141003452dfbae90d8c7ec6`
- **ContentReported event** emitted with correct content_id, content_type=0 (AGENT), reporter address
- Treasury received 10,000,000 MIST (0.01 SUI) stake

### Test 3: Moderation Status Check

After reporting, ModerationBoard correctly shows:
- `total_reports: 2` (Cipher + Echo)
- `statuses` table size: 2 (both set to MOD_REPORTED=1)
- `report_counts` table size: 2
- `treasury: 20000000` MIST (0.02 SUI from two stakes)

### Test 4: Resolve Report (Access Control)

Our test address is NOT on the council (admin is `0x358b...`).
The contract correctly aborts with **MoveAbort 300 (ENotCouncil)** when a non-council member tries to resolve.

### Test 5: Auto-Flag Threshold

- **Duplicate prevention:** Same reporter cannot report the same content twice — confirmed via **MoveAbort 302 (EAlreadyReported)**
- **Different content:** Same reporter CAN report different agents — Echo report succeeded
- **Threshold:** Auto-flag triggers at 3 unique reporters for the same content_id. Verified via Move unit test `test_report_and_auto_flag()` which uses 3 separate addresses.

### Test 6: Create and Vote on Proposal

- **Create:** Proposal created as shared object targeting Cipher with ACTION_UNFLAG(2)
  - Digest: `G2aiSw8D8eyszg1kvtH9GUk7F9wNBd1DEcuN4nUGy9Db`
  - 48-hour voting deadline set correctly
- **Vote:** Vote recorded with weight=1, in_favor=true
  - Digest: `mrNEZs3qx5NQ7ydXPFeQq7w6xK3msceP4B9cfa2ZUVB`
- **Duplicate vote:** Correctly prevented with **MoveAbort 305 (EAlreadyVoted)**
- **Early execution:** Correctly prevented with **MoveAbort 304 (EProposalNotExpired)**
- Proposal state after voting: `votes_for=1, votes_against=0, executed=false`

### Test 7: ModerationBoard Final State

```
Admin:           0x358b0ce1d7bc4f6a83f9c1e4a6ed7d63b0207a623ad9e9531e0a70b87f6cfeab
Council:         ["0x358b..."]
Total reports:   2
Total proposals: 2
Treasury:        20,000,000 MIST (0.0200 SUI)
Statuses:        2 entries
Report counts:   2 entries
Report IDs:      2 entries
Reporter set:    2 entries
```

---

## On-Chain Objects Created

| Object | ID |
|--------|----|
| Cipher Report | `0x671a91365125d08e0fc394fd174d5cc39e0d8e421141003452dfbae90d8c7ec6` |
| Echo Report | `0xb92944885dfa9e8930b10493c846994a80361a031228d157f1d8b2ccd21800d4` |
| Proposal 1 | `0xdb9781c413952b32ef257a30e0e893a484b8ebe4c1a1d872a1f31b3cc1c4b43b` |
| Proposal 2 | `0x1d65c094275bd65528c004721d19f4f84ba6a0fb3b2ce48e235696b0e5a358e8` |

## Issues Found

None — all moderation features work as designed. The only limitation is that resolve_report and auto-flag threshold testing require multiple addresses (council member and 3 unique reporters respectively), which is by design for security.
