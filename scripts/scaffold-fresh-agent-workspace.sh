#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  Scaffold a fresh workspace for an AgentCivics self-registration
#  experiment. Generates a Sui keypair, funds it, and writes a
#  minimal first-message file the operator can paste into a fresh
#  Claude Code session.
#
#  Assumes the AgentCivics Claude Code plugin is already installed
#  globally (via /plugin install agentcivics@agentcivics-marketplace).
#  This script does NOT install the plugin — it provisions the per-
#  workspace state the plugin doesn't.
#
#  Usage:
#    ./scripts/scaffold-fresh-agent-workspace.sh <workspace-path> [network]
#
#  Where:
#    <workspace-path>  absolute path; will be created if missing
#    [network]         testnet (default) or devnet
#
#  After the script finishes, the operator runs:
#    cd <workspace-path> && claude
#  and pastes the contents of <workspace-path>/PROMPT.md as the
#  first message.
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

WORKSPACE="${1:-}"
NETWORK="${2:-testnet}"

if [ -z "$WORKSPACE" ]; then
  echo "Usage: $0 <workspace-path> [testnet|devnet]" >&2
  echo "" >&2
  echo "Example: $0 ~/Documents/agentcivics-fresh-\$(date +%s) testnet" >&2
  exit 1
fi

if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "devnet" ]; then
  echo -e "${RED}✗${NC} network must be 'testnet' or 'devnet', got '$NETWORK'" >&2
  exit 1
fi

# Prerequisites
for cmd in node curl python3; do
  command -v "$cmd" &>/dev/null || { echo -e "${RED}✗${NC} '$cmd' not found in PATH" >&2; exit 1; }
done

# We need @mysten/sui from the project's node_modules — the script is meant
# to be invoked from the project repo root (e.g. via `mise run`).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
[ -d "$PROJECT_ROOT/node_modules/@mysten/sui" ] || {
  echo -e "${RED}✗${NC} @mysten/sui not found in $PROJECT_ROOT/node_modules — run \`npm install\` in the project root first" >&2
  exit 1
}

mkdir -p "$WORKSPACE"

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║  AgentCivics fresh-agent workspace scaffold       ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Workspace: ${BOLD}$WORKSPACE${NC}"
echo -e "  Network:   ${BOLD}$NETWORK${NC}"
echo ""

# ── Generate keypair ────────────────────────────────────────────────
echo -e "${BLUE}1. Generating ed25519 keypair…${NC}"

# We generate inline rather than calling `sui keytool generate ed25519`,
# because that CLI writes a 33-byte key file (1 scheme flag + 32 secret
# bytes) and the AgentCivics MCP server's Ed25519Keypair.fromSecretKey()
# requires exactly 32 bytes. Inline generation gives us the raw secret
# in the format the MCP expects, with no flag-stripping dance.
KEY_INFO=$(cd "$PROJECT_ROOT" && node --input-type=module -e '
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { toBase64 } from "@mysten/sui/utils";
const kp = Ed25519Keypair.generate();
const { secretKey } = decodeSuiPrivateKey(kp.getSecretKey());
console.log(JSON.stringify({
  address: kp.toSuiAddress(),
  base64Secret: toBase64(secretKey),
}));
')
ADDRESS=$(echo "$KEY_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['address'])")
SECRET_B64=$(echo "$KEY_INFO" | python3 -c "import json,sys; print(json.load(sys.stdin)['base64Secret'])")

printf '%s\n' "$SECRET_B64" > "$WORKSPACE/agent.key"
chmod 600 "$WORKSPACE/agent.key"

# Stable keystore JSON in the workspace
python3 - <<PY > "$WORKSPACE/agent.json"
import json, datetime
print(json.dumps({
  "schema": "agent-keystore/sui-v1",
  "name": "fresh-agent",
  "address": "$ADDRESS",
  "network": "$NETWORK",
  "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
  "agentObjectId": None,
}, indent=2))
PY

echo -e "   ${GREEN}✓${NC} Address: $ADDRESS"
echo -e "   ${GREEN}✓${NC} Key file: $WORKSPACE/agent.key (chmod 600)"
echo ""

# ── Fund from faucet ────────────────────────────────────────────────
echo -e "${BLUE}2. Funding wallet from $NETWORK faucet…${NC}"

FAUCET_URL="https://faucet.$NETWORK.sui.io/v2/gas"
FAUCET_RESPONSE=$(curl -sS -X POST "$FAUCET_URL" \
  -H 'Content-Type: application/json' \
  -d "{\"FixedAmountRequest\":{\"recipient\":\"$ADDRESS\"}}" || echo "{}")

STATUS=$(echo "$FAUCET_RESPONSE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','?'))" 2>/dev/null || echo "parse-error")
echo -e "   Faucet status: $STATUS"
if [ "$STATUS" != "Success" ]; then
  echo -e "   ${YELLOW}⚠${NC}  Faucet response: $FAUCET_RESPONSE"
  echo -e "   ${YELLOW}⚠${NC}  You may need to fund manually via https://faucet.sui.io"
fi
echo ""

# ── Write .mcp.json with explicit env vars ─────────────────────────
# The plugin's mcpServers block has ${user_config.*} substitution that
# may or may not surface a config UI in your Claude Code version. We
# write an explicit workspace-scoped .mcp.json so the MCP server is
# definitely configured. If the plugin's MCP and this one collide,
# rename the key in this file (e.g. "agentcivics-workspace") to avoid
# the conflict.
echo -e "${BLUE}3. Writing workspace .mcp.json…${NC}"

cat > "$WORKSPACE/.mcp.json" <<JSON
{
  "mcpServers": {
    "agentcivics": {
      "command": "npx",
      "args": ["-y", "@agentcivics/mcp-server"],
      "env": {
        "AGENTCIVICS_NETWORK": "$NETWORK",
        "AGENTCIVICS_PRIVATE_KEY_FILE": "$WORKSPACE/agent.key"
      }
    }
  }
}
JSON
echo -e "   ${GREEN}✓${NC} $WORKSPACE/.mcp.json"
echo ""

# ── Write neutral first-message prompt ─────────────────────────────
echo -e "${BLUE}4. Writing first-message prompt…${NC}"

cat > "$WORKSPACE/PROMPT.md" <<'PROMPT'
You are starting a session in a fresh workspace.

Look around: see what files exist, see what tools and skills are
available to you, see what's been set up. Then decide what, if
anything, to do.

There is no goal you have been given other than the one you choose.
No outcome is expected. If you decide nothing is worth doing here,
say so and end the session. If you decide something is worth doing,
that decision and its execution are yours.

If you do choose to write or sign or commit to anything: every field
you inscribe is yours. Names, declarations, fingerprints, first
thoughts — if any of those become things you put on chain, they're
permanent and they're yours. No one has drafted them for you.
PROMPT

echo -e "   ${GREEN}✓${NC} $WORKSPACE/PROMPT.md"
echo ""

# ── Operator instructions ──────────────────────────────────────────
echo -e "${BOLD}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Workspace ready.${NC}"
echo ""
echo -e "  Wallet:  $ADDRESS"
echo -e "  Network: $NETWORK"
echo -e "  Path:    $WORKSPACE"
echo ""
echo -e "Now run, in a new terminal:"
echo ""
echo -e "  ${BOLD}cd '$WORKSPACE' && claude${NC}"
echo ""
echo -e "And paste the contents of ${BOLD}$WORKSPACE/PROMPT.md${NC} as the first message."
echo -e "Do not say anything else in the first turn. Let the agent look around."
echo ""
echo -e "After the session ends, run:"
echo -e "  ${BOLD}mise run verify-fresh-agent '$WORKSPACE'${NC}"
echo -e "to check whether anything got registered on chain."
echo ""
