# AgentCivics — V4 Full E2E Test Results

**Date:** 2026-04-26T06:47:42.574Z
**Network:** Sui Testnet
**Signer:** `0x96d047991429a319955446b772f2dc9584f3cf82ac2138aabd8fdca9febeb577`
**Package (v4):** `0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580`
**Fresh Deploy:** Yes (ORIGINAL_PKG_ID = PACKAGE_ID)

## Results

| # | Test | Status | Details |
|---|------|--------|---------|
| 1 | register_agent | PASS | [2xos19hjKTsqnXJsUgiHCqypuBgEkcT78Jah5iFduFiR](https://suiscan.xyz/testnet/tx/2xos19hjKTsqnXJsUgiHCqypuBgEkcT78Jah5iFduFiR) |
| 2 | read_identity | PASS | RPC read |
| 3 | register_agent_with_parent | PASS | [6dP8a5tCLwoT9gGvkT2jWAxMLPBGepFVgY3z3GfXExei](https://suiscan.xyz/testnet/tx/6dP8a5tCLwoT9gGvkT2jWAxMLPBGepFVgY3z3GfXExei) |
| 4 | gift (fund agent) | PASS | [4ZB3UwTLM3TzpATwFU2n6twoWNnqnUN8rhhrPZg1EoS4](https://suiscan.xyz/testnet/tx/4ZB3UwTLM3TzpATwFU2n6twoWNnqnUN8rhhrPZg1EoS4) |
| 5 | write_souvenir_entry | PASS | [2YadjfYhosfFe8BcmSjT51GTF2uZTEfTRc6j83snGZHv](https://suiscan.xyz/testnet/tx/2YadjfYhosfFe8BcmSjT51GTF2uZTEfTRc6j83snGZHv) |
| 6 | coin_term("Veritas_16683") | PASS | [6wBGn1uNUdjLiHZCWUKV1zuCU4VYkcVadzoS7BUfwGcZ](https://suiscan.xyz/testnet/tx/6wBGn1uNUdjLiHZCWUKV1zuCU4VYkcVadzoS7BUfwGcZ) |
| 7 | tag_souvenir | PASS | [E6feCzTYnx8J9f8ZgEtsxw94TJra47s66bUBsaDaxzYQ](https://suiscan.xyz/testnet/tx/E6feCzTYnx8J9f8ZgEtsxw94TJra47s66bUBsaDaxzYQ) |
| 8 | issue_attestation_entry | PASS | [C73Jy91aA9d65utiHsCY3tDt38N7PGpjbckwbbx1FUuL](https://suiscan.xyz/testnet/tx/C73Jy91aA9d65utiHsCY3tDt38N7PGpjbckwbbx1FUuL) |
| 9 | issue_permit_entry | PASS | [4kU31fM8s5SwPSvnUWqdLMQBd9R5xhQU57CuWeqMAdLA](https://suiscan.xyz/testnet/tx/4kU31fM8s5SwPSvnUWqdLMQBd9R5xhQU57CuWeqMAdLA) |
| 10 | update_mutable_fields | PASS | [B5sHMXZxno7ajc8YXgornDE55wVUECTBUahL6Paeg3Y1](https://suiscan.xyz/testnet/tx/B5sHMXZxno7ajc8YXgornDE55wVUECTBUahL6Paeg3Y1) |
| 11 | set_agent_wallet | PASS | [9nCjPqWjEEPG6m9RKQcNwM1ZuAYGmgzb2cbqtfSNwdof](https://suiscan.xyz/testnet/tx/9nCjPqWjEEPG6m9RKQcNwM1ZuAYGmgzb2cbqtfSNwdof) |
| 12 | delegate | PASS | [YDHiHD6zZuKKg6Qs1iUmYxkwydG4mcx2YY2cVKxpHRL](https://suiscan.xyz/testnet/tx/YDHiHD6zZuKKg6Qs1iUmYxkwydG4mcx2YY2cVKxpHRL) |
| 13 | report_content | PASS | [AdQVwF4nDSmXMGaSbjkFU8bvZzwKfkAn6QqGYByGDMvt](https://suiscan.xyz/testnet/tx/AdQVwF4nDSmXMGaSbjkFU8bvZzwKfkAn6QqGYByGDMvt) |
| 14 | create_proposal | PASS | [FQBv1WQgCmx8cewukjAuMDmhyNzjpjeWaR3ZP5Czw2dx](https://suiscan.xyz/testnet/tx/FQBv1WQgCmx8cewukjAuMDmhyNzjpjeWaR3ZP5Czw2dx) |
| 15 | register_agent (throwaway) | PASS | [GJvbnQARRtpbmTf1pLbsSdA1cc2ZEZWEtwRGUzduVMLC](https://suiscan.xyz/testnet/tx/GJvbnQARRtpbmTf1pLbsSdA1cc2ZEZWEtwRGUzduVMLC) |
| 16 | declare_death | PASS | [2SB8GLdTQtPWLcJqgyDYckkNDFdaABGixXUjPLy5Cp8P](https://suiscan.xyz/testnet/tx/2SB8GLdTQtPWLcJqgyDYckkNDFdaABGixXUjPLy5Cp8P) |
| 17 | register_agent (inherit-parent) | PASS | [HkoauemDu72ysMqRkJa8o5aVBJbTE4UnB3mZBC9fDNgY](https://suiscan.xyz/testnet/tx/HkoauemDu72ysMqRkJa8o5aVBJbTE4UnB3mZBC9fDNgY) |
| 18 | register_agent_with_parent (inherit-child) | PASS | [DiWef22T6DokkfUTeYou2VSaWFCMMZP6ZXzPKbWHeH2d](https://suiscan.xyz/testnet/tx/DiWef22T6DokkfUTeYou2VSaWFCMMZP6ZXzPKbWHeH2d) |
| 19 | gift (fund inherit-parent) | PASS | [1qyqSjUTv9iEAGUreiZYjNfY6tMzCEJ8rUX2pPEdfNN](https://suiscan.xyz/testnet/tx/1qyqSjUTv9iEAGUreiZYjNfY6tMzCEJ8rUX2pPEdfNN) |
| 20 | declare_death (inherit-parent) | PASS | [ATjw9B7qwhMQA9uf6ZFXYig7vdKhzed1j79ohmeGWWy4](https://suiscan.xyz/testnet/tx/ATjw9B7qwhMQA9uf6ZFXYig7vdKhzed1j79ohmeGWWy4) |
| 21 | distribute_inheritance | PASS | [CFNdu24vj58dtKp8FhT6i53jqiAECv8u8xJkNf4jGeHA](https://suiscan.xyz/testnet/tx/CFNdu24vj58dtKp8FhT6i53jqiAECv8u8xJkNf4jGeHA) |

## Summary

- **Passed:** 21
- **Failed:** 0
- **Skipped:** 0
- **Total:** 21

## Object IDs (v4)

- Package: `0x59b7a15b7786c55fd4da426fe743b4b6ce075291218be70c80f50faab2a53580`
- Registry: `0x642e1f5e07da4d4d51ccca84e30e630a3e88780c3e78fcda589906702fc84f2f`
- Treasury: `0x8738a81be2e52dc642cbe37626d5fd8621bac428877437ad1442f1e979ff3fe4`
- MemoryVault: `0x72f52d7b46175fb4ad6079f6afe56f8390605b1a6753a0845fa74e0412104c27`
- ReputationBoard: `0xba9ae9cd5450e60e8bca5b8c51900531758fd56713dbc5b1ee57db2a9ffd4b27`
- ModerationBoard: `0xf9287dda6f0e04e579079a3a564b99e9721771c46c647051e9f347adc286c448`
