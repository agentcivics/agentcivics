# Verify on BaseScan

Verification uploads your Solidity source to BaseScan, letting anyone read the code and interact with the contract through BaseScan's Read/Write UI.

## Why verify

Verified contracts show:
- Source code, formatted and searchable
- **Read Contract** tab — call view functions from the browser, no code needed
- **Write Contract** tab — send transactions via MetaMask on BaseScan directly
- Contract ABI publicly exposed for integrations

For a permissionless civil registry, verification is essentially mandatory — it's the difference between "public infrastructure" and "opaque addresses."

## Get an Etherscan API key

The Etherscan V2 API unifies all 60+ chains (Ethereum, Base, Arbitrum, Optimism, etc.) under one key.

1. Go to [etherscan.io/myapikey](https://etherscan.io/myapikey)
2. Create a free account and a new API key
3. Add to your `.env`:

```bash
ETHERSCAN_API_KEY=YourKeyHere
```

## Verify

```bash
node --env-file=.env scripts/verify.mjs
```

The script reads addresses from `deployments.json`, compiles each contract with the exact same settings as the deploy (viaIR, optimizer, paris EVM), and submits via Etherscan V2 API.

Output shows submission → polling → result for each contract:

```
  Verifying AgentRegistry at 0xe8a0...C54...
    submitted — GUID: abc123
    waiting.
    ✓ VERIFIED: https://sepolia.basescan.org/address/0xe8a0...C54#code

  Verifying AgentMemory at 0x3057...0d47...
    submitted — GUID: def456
    waiting.
    ✓ VERIFIED: ...
```

Typical time: 15-60 seconds per contract.

## Override addresses

Override what's in `deployments.json`:

```bash
AGENT_REGISTRY_ADDRESS=0x... \
  AGENT_MEMORY_ADDRESS=0x... \
  AGENT_REPUTATION_ADDRESS=0x... \
  CHAIN_ID=84532 \
  node --env-file=.env scripts/verify.mjs
```

## Compile settings must match exactly

Verification compares the submitted source + compile settings against the deployed bytecode. If they produce different bytes, verification fails with a "bytecode mismatch" error.

The script uses these settings (matching `compile.mjs`):

- Compiler: `v0.8.24+commit.e11b9ed9`
- `viaIR: true`
- Optimizer: `enabled: true, runs: 200`
- EVM version: `paris`

If you changed your compile config, update `verify.mjs` to match, or verify manually on BaseScan.

## Manual verification (fallback)

If the script fails for any reason:

1. Go to [sepolia.basescan.org/verifyContract](https://sepolia.basescan.org/verifyContract)
2. Enter the address
3. Compiler type: **Solidity (Standard JSON Input)**
4. Paste the exact JSON that `compile.mjs` uses (or copy from `scripts/verify.mjs` — the `buildStandardJson` function produces it)
5. Submit

For more depth on the V2 API: [docs.etherscan.io/etherscan-v2](https://docs.etherscan.io/etherscan-v2).

## What's next

- [Reference: Contract functions](/reference/contracts) — now that the source is public, here's what each function does
