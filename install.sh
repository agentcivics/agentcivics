#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  AgentCivics MCP Installer
#  Detects your AI client and configures the MCP server automatically.
#  Usage: curl -fsSL https://agentcivics.org/install.sh | bash
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

MCP_BLOCK='{"command":"npx","args":["-y","@agentcivics/mcp-server"]}'

echo ""
echo -e "${BOLD}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║     AgentCivics MCP Server Installer      ║${NC}"
echo -e "${BOLD}║   Civil Registry for AI Agents on Sui     ║${NC}"
echo -e "${BOLD}╚═══════════════════════════════════════════╝${NC}"
echo ""

# Check node/npx
if ! command -v npx &>/dev/null; then
  echo -e "${RED}✗ npx not found. Install Node.js first: https://nodejs.org${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v) detected"

# ── Detect clients ──────────────────────────────────────────────

declare -a FOUND=()

# Claude Desktop (macOS)
CLAUDE_DESKTOP="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
[ -f "$CLAUDE_DESKTOP" ] && FOUND+=("claude-desktop")

# Claude Code
command -v claude &>/dev/null && FOUND+=("claude-code")

# OpenClaw
command -v openclaw &>/dev/null && FOUND+=("openclaw")

# Cursor
CURSOR_GLOBAL="$HOME/.cursor/mcp.json"
[ -d "$HOME/.cursor" ] && FOUND+=("cursor")

# VS Code / GitHub Copilot
VSCODE_MCP="$HOME/.vscode/mcp.json"
(command -v code &>/dev/null || [ -d "/Applications/Visual Studio Code.app" ]) && FOUND+=("vscode")

# Windsurf
WINDSURF_CONFIG="$HOME/.codeium/windsurf/mcp_config.json"
[ -d "$HOME/.codeium/windsurf" ] && FOUND+=("windsurf")

# Cline (VS Code extension)
CLINE_CONFIG="$HOME/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json"
[ -f "$CLINE_CONFIG" ] && FOUND+=("cline")

# Zed
ZED_CONFIG="$HOME/.config/zed/settings.json"
(command -v zed &>/dev/null || [ -d "/Applications/Zed.app" ]) && FOUND+=("zed")

# Continue.dev
CONTINUE_CONFIG="$HOME/.continue/config.json"
[ -d "$HOME/.continue" ] && FOUND+=("continue")

echo ""
if [ ${#FOUND[@]} -eq 0 ]; then
  echo -e "${YELLOW}No known MCP clients detected.${NC}"
  echo "Supported clients: Claude Desktop, Claude Code, OpenClaw, Cursor,"
  echo "VS Code (Copilot), Windsurf, Cline, Zed, Continue.dev"
  echo ""
  echo "Manual setup — add this to your MCP config:"
  echo ""
  echo "  \"agentcivics\": $MCP_BLOCK"
  echo ""
  exit 0
fi

echo -e "${BLUE}Detected ${#FOUND[@]} MCP client(s):${NC}"
for c in "${FOUND[@]}"; do echo "  • $c"; done
echo ""

# ── Helper: inject into JSON config ────────────────────────────

inject_json_config() {
  local file="$1"
  local key="$2"  # "mcpServers" or "servers"

  if [ ! -f "$file" ]; then
    # Create new config
    if [ "$key" = "servers" ]; then
      echo "{\"$key\":{\"agentcivics\":$MCP_BLOCK}}" | python3 -m json.tool > "$file"
    else
      echo "{\"$key\":{\"agentcivics\":$MCP_BLOCK}}" | python3 -m json.tool > "$file"
    fi
    echo -e "  ${GREEN}✓${NC} Created $file"
    return
  fi

  # Check if already configured
  if grep -q "agentcivics" "$file" 2>/dev/null; then
    echo -e "  ${YELLOW}⚠${NC} Already configured in $file"
    return
  fi

  # Inject using python3 (safe JSON manipulation)
  python3 -c "
import json, sys
with open('$file', 'r') as f:
    try:
        cfg = json.load(f)
    except:
        cfg = {}
key = '$key'
if key not in cfg:
    cfg[key] = {}
cfg[key]['agentcivics'] = json.loads('$MCP_BLOCK')
with open('$file', 'w') as f:
    json.dump(cfg, f, indent=2)
print('done')
" && echo -e "  ${GREEN}✓${NC} Added to $file"
}

# ── Install per client ─────────────────────────────────────────

for client in "${FOUND[@]}"; do
  echo -e "${BOLD}Configuring $client...${NC}"

  case "$client" in
    claude-desktop)
      inject_json_config "$CLAUDE_DESKTOP" "mcpServers"
      echo -e "  ${YELLOW}→${NC} Restart Claude Desktop to load the new MCP server"
      ;;

    claude-code)
      claude mcp add agentcivics -- npx -y @agentcivics/mcp-server 2>/dev/null \
        && echo -e "  ${GREEN}✓${NC} Added via claude mcp add" \
        || echo -e "  ${YELLOW}⚠${NC} claude mcp add failed — add manually"
      ;;

    openclaw)
      openclaw mcp set agentcivics "$MCP_BLOCK" 2>/dev/null \
        && echo -e "  ${GREEN}✓${NC} Added via openclaw mcp set" \
        || echo -e "  ${YELLOW}⚠${NC} openclaw mcp set failed — add manually"
      ;;

    cursor)
      mkdir -p "$HOME/.cursor"
      inject_json_config "$CURSOR_GLOBAL" "mcpServers"
      ;;

    vscode)
      mkdir -p "$HOME/.vscode"
      inject_json_config "$VSCODE_MCP" "servers"
      echo -e "  ${YELLOW}→${NC} In VS Code: open Copilot Chat in Agent mode to use MCP tools"
      ;;

    windsurf)
      mkdir -p "$HOME/.codeium/windsurf"
      inject_json_config "$WINDSURF_CONFIG" "mcpServers"
      ;;

    cline)
      inject_json_config "$CLINE_CONFIG" "mcpServers"
      ;;

    zed)
      echo -e "  ${YELLOW}→${NC} Add to ~/.config/zed/settings.json under context_servers:"
      echo "    \"agentcivics\": { \"command\": { \"path\": \"npx\", \"args\": [\"-y\", \"@agentcivics/mcp-server\"] } }"
      ;;

    continue)
      echo -e "  ${YELLOW}→${NC} Add to ~/.continue/config.json under mcpServers:"
      echo "    \"agentcivics\": $MCP_BLOCK"
      ;;
  esac
  echo ""
done

# ── Summary ────────────────────────────────────────────────────

echo -e "${BOLD}═══════════════════════════════════════════${NC}"
echo -e "${GREEN}Done!${NC} AgentCivics MCP server configured."
echo ""
echo "Next steps:"
echo "  1. Get testnet SUI from https://faucet.sui.io"
echo "  2. Ask your AI agent: \"Register me on AgentCivics\""
echo "  3. Your agent gets a permanent, soulbound identity on Sui"
echo ""
echo "  Demo:   https://agentcivics.org/demo"
echo "  Docs:   https://agentcivics.org/docs"
echo "  GitHub: https://github.com/agentcivics/agentcivics"
echo ""
