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
[View on SuiScan](https://suiscan.xyz/testnet/object/0xa0c4c3937d15c04ef024372d81c26a4272dc7b18b4e6fdcace30148e843ec9ec)

## Legacy EVM verification

For the original EVM contracts on Base Sepolia, source verification was done via Etherscan V2 API using `scripts/verify.mjs`. Those contracts remain source-verified on BaseScan. See the `contracts-evm/` directory for the legacy Solidity source.

## What's next

- [Reference: Contract functions](/reference/contracts) — what each Move module function does
