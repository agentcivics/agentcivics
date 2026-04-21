#!/bin/bash
# Verify contracts on BaseScan (sepolia.basescan.org)
# Requires a free BaseScan API key: https://basescan.org/myapikey
#
# Usage:
#   BASESCAN_API_KEY=xxx ./scripts/verify-basescan.sh
#
# Blockscout verification is already done automatically and doesn't need a key.

set -e
if [ -z "$BASESCAN_API_KEY" ]; then
  echo "Missing BASESCAN_API_KEY. Get a free key at https://basescan.org/myapikey"
  exit 1
fi

REGISTRY=0x38986E96B17f635C3A7116048Ac03adF023b8085
MEMORY=0x5F2E495D7F450Db0d647b4ab2075Ef9C30325cb2
REPUTATION=0x0d33Cb9Fe714BC2DD9e68fAA1E18fd594d4d5344

COMMON="--chain 84532 --num-of-optimizations 200 --via-ir --evm-version paris --compiler-version 0.8.24 --etherscan-api-key $BASESCAN_API_KEY"

echo "=== AgentRegistry ==="
forge verify-contract $REGISTRY contracts/AgentRegistry.sol:AgentRegistry $COMMON

echo ""
echo "=== AgentMemory ==="
forge verify-contract $MEMORY contracts/AgentMemory.sol:AgentMemory $COMMON \
  --constructor-args $(cast abi-encode "constructor(address)" $REGISTRY)

echo ""
echo "=== AgentReputation ==="
forge verify-contract $REPUTATION contracts/AgentReputation.sol:AgentReputation $COMMON \
  --constructor-args $(cast abi-encode "constructor(address,address)" $REGISTRY $MEMORY)

echo ""
echo "All submitted. Check status in ~30s on https://sepolia.basescan.org"
