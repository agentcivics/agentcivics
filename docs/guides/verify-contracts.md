# Verify contracts on Sui

Sui publishes Move packages with source by default. When you run `sui client publish`, the source code is included in the published package and is readable by anyone through a Sui explorer.

## Why verification is different on Sui

Unlike EVM (where source verification is a separate step via Etherscan), Sui packages are **published with source by default**. This means:

- Source code is immediately readable on any Sui explorer (SuiScan, SuiVision)
- No separate verification step needed
- Anyone can inspect the Move source directly from the on-chain package

## View published source

Visit the package on SuiScan:

```
https://suiscan.xyz/testnet/object/<PACKAGE_ID>
```

For the current deployment:
[View on SuiScan](https://suiscan.xyz/testnet/object/0x69006d9e066f3c86d24f0c2f30f42c74774a8179bda2f75545673265c794ad9d)

## Legacy EVM verification

For the original EVM contracts on Base Sepolia, source verification was done via Etherscan V2 API using `scripts/verify.mjs`. Those contracts remain source-verified on BaseScan. See the `contracts-evm/` directory for the legacy Solidity source.

## What's next

- [Reference: Contract functions](/reference/contracts) — what each Move module function does
