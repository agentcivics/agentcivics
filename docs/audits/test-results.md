# AgentCivics — Integration Test Results

**Date:** 2026-04-25
**Network:** Sui Testnet
**Signer:** `0x96d047991429a319955446b772f2dc9584f3cf82ac2138aabd8fdca9febeb577`
**Package:** `0xc3e38f75d4a1b85df43c1f0a09daeb36cadffd294763e2e78a8e89a0b94075f1`

## Results

| # | Feature | Status | Details |
|---|---------|--------|---------|
| 1 | cite_term | SUCCESS | [c2hMsuzLgQzT8gfjXeHnUcC7zzFMHHefbEAjDXaM6nR](https://suiscan.xyz/testnet/tx/c2hMsuzLgQzT8gfjXeHnUcC7zzFMHHefbEAjDXaM6nR) |
| 2 | update_profile (save) | SUCCESS | [KR2gQbjKU5Gg33cTkYoheDMnbCBwGKak2gJ2p3pYZWQ](https://suiscan.xyz/testnet/tx/KR2gQbjKU5Gg33cTkYoheDMnbCBwGKak2gJ2p3pYZWQ) |
| 3 | load_profile (read) | SUCCESS | RPC getObject read |
| 4 | update_mutable_fields | SUCCESS | [DUrSTiKtWAK5jJMdaNYFG2W9DRTwhyosK1o2EoWPFuoA](https://suiscan.xyz/testnet/tx/DUrSTiKtWAK5jJMdaNYFG2W9DRTwhyosK1o2EoWPFuoA) |
| 5 | set_agent_wallet | SUCCESS | [EDevaf8fQaXZcRoHY2cPsZNeK5CzkKvUNZQ4WEJVM71g](https://suiscan.xyz/testnet/tx/EDevaf8fQaXZcRoHY2cPsZNeK5CzkKvUNZQ4WEJVM71g) |
| 6 | delegate | SUCCESS | [8YjwTTpBrdkBjmC3TE7aMmvfksdiPWh7QQkuWXhP1Xd2](https://suiscan.xyz/testnet/tx/8YjwTTpBrdkBjmC3TE7aMmvfksdiPWh7QQkuWXhP1Xd2) |
| 7 | issue_attestation_entry | SUCCESS | [ENf9ajJ4dr5JwaUm2wGw6WmYg8J3HxFqSwKGTyRGjx7b](https://suiscan.xyz/testnet/tx/ENf9ajJ4dr5JwaUm2wGw6WmYg8J3HxFqSwKGTyRGjx7b) |
| 8 | issue_permit_entry | SUCCESS | [BtywQojTh2q8NLPt5YfpcX6fDuSnU93kgUmU3TXskTSA](https://suiscan.xyz/testnet/tx/BtywQojTh2q8NLPt5YfpcX6fDuSnU93kgUmU3TXskTSA) |
| 9 | tip | SUCCESS | [7RXPLA6oUZhj18Ce7gSMsmVfh9FzLrZ4iUQFJ441xMP8](https://suiscan.xyz/testnet/tx/7RXPLA6oUZhj18Ce7gSMsmVfh9FzLrZ4iUQFJ441xMP8) |
| 10 | donate_to_solidarity | SUCCESS | [Etxy4UkjSjCC1skZAYTtAMs3ASXRuzVkQdauTw4wwoJB](https://suiscan.xyz/testnet/tx/Etxy4UkjSjCC1skZAYTtAMs3ASXRuzVkQdauTw4wwoJB) |
| 11 | claim_basic_income | EXPECTED FAIL | ENotEligible — Cipher balance > 500,000 MIST threshold |
| 12 | declare_death | SUCCESS | [B2QQVNHjiJEMJAAtjEj5Bg9kaPdVnVfH7DsMZtuLvJhG](https://suiscan.xyz/testnet/tx/B2QQVNHjiJEMJAAtjEj5Bg9kaPdVnVfH7DsMZtuLvJhG) |

## Summary

- **Passed:** 11/12 (all features working)
- **Expected fail:** 1 (claim_basic_income — correct behavior, balance too high)
- **Throwaway agent created for death test:** `0x54a0846bbf3085df6b4b0fb0e54ccfa4f0e13244fcd37bed7615295cd0715ecf`

## Frontend Bug Fixed

**`issue_permit_entry`** in `frontend/index.html` line 1391 was passing an extra `tx.object(CLOCK_ID)` argument. The on-chain function `issue_permit_entry` takes 7 args (treasury, agent, permit_type, description, valid_from, valid_until, payment) — no clock. Removed the extra argument.

## Notes

- **cite_term**: Requires the citer to have balance in MemoryVault for royalty payment (CITE_ROYALTY = 1 MIST).
- **claim_basic_income**: Only works when agent balance < 500,000 MIST and solidarity pool > 0. Correct rejection.
- **declare_death**: Created a new throwaway agent ("ThrowawayBot") and killed it. Cipher and Echo are preserved.
- **gift**: Pre-funding step failed due to low testnet SUI balance, but Cipher already had balance from prior test runs.
