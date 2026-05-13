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

# ── Download skills from GitHub (HTTPS, no git required) ──────

SKILLS_TMP=""
GITHUB_RAW="https://raw.githubusercontent.com/agentcivics/agentcivics/main"
SKILL_NAMES="register agent-self-registration agent-civil-registry memory moderation authority verify-identity remember-who-you-are economic-agent"

download_skills() {
  if [ -n "$SKILLS_TMP" ]; then return; fi
  SKILLS_TMP=$(mktemp -d)
  echo -e "${BLUE}Downloading AgentCivics skills...${NC}"

  local count=0
  for skill in $SKILL_NAMES; do
    local skill_dir="$SKILLS_TMP/$skill"
    mkdir -p "$skill_dir"
    # Download SKILL.md
    if curl -sfL "$GITHUB_RAW/skills/$skill/SKILL.md" -o "$skill_dir/SKILL.md" 2>/dev/null; then
      count=$((count + 1))
    else
      rm -rf "$skill_dir"
    fi
    # Download references if they exist (agent-civil-registry has them)
    for ref in attestation-types.md contract-functions.md; do
      local ref_url="$GITHUB_RAW/skills/$skill/references/$ref"
      if curl -sfL "$ref_url" -o /dev/null 2>/dev/null; then
        mkdir -p "$skill_dir/references"
        curl -sfL "$ref_url" -o "$skill_dir/references/$ref" 2>/dev/null
      fi
    done
  done

  if [ $count -eq 0 ]; then
    echo -e "  ${YELLOW}⚠${NC} Could not download skills — MCP tools will still work without them"
    SKILLS_TMP=""
    return
  fi
  echo -e "  ${GREEN}✓${NC} Downloaded $count skills"
}

install_skills_for() {
  local target_dir="$1"
  local client_name="$2"
  if [ -z "$SKILLS_TMP" ]; then download_skills; fi
  if [ -z "$SKILLS_TMP" ]; then return; fi

  mkdir -p "$target_dir"
  for skill_dir in "$SKILLS_TMP"/*/; do
    skill_name=$(basename "$skill_dir")
    if [ -f "$skill_dir/SKILL.md" ]; then
      cp -r "$skill_dir" "$target_dir/$skill_name"
    fi
  done
  echo -e "  ${GREEN}✓${NC} Skills installed to $target_dir"
}

cleanup_skills() {
  if [ -n "$SKILLS_TMP" ] && [ -d "$SKILLS_TMP" ]; then
    rm -rf "$SKILLS_TMP"
  fi
}
trap cleanup_skills EXIT

# ── Install per client ─────────────────────────────────────────

for client in "${FOUND[@]}"; do
  echo -e "${BOLD}Configuring $client...${NC}"

  case "$client" in
    claude-desktop)
      inject_json_config "$CLAUDE_DESKTOP" "mcpServers"
      echo -e "  ${YELLOW}→${NC} Restart Claude Desktop to load the new MCP server"
      ;;

    claude-code)
      # Claude Code has a native plugin system as of 2026. The plugin bundles
      # the MCP server AND all 10 skills with a first-class settings UI for
      # the env vars, so we route Claude Code users there rather than running
      # `claude mcp add` here — which would double-register the server if the
      # user also installs the plugin.
      echo -e "  ${BLUE}ℹ${NC}  Claude Code is best installed via its native plugin:"
      echo ""
      echo -e "      ${BOLD}/plugin marketplace add github.com/agentcivics/agentcivics${NC}"
      echo -e "      ${BOLD}/plugin install agentcivics@agentcivics-marketplace${NC}"
      echo ""
      echo -e "  The plugin bundles the MCP server and all 10 protocol skills"
      echo -e "  (namespaced as /agentcivics:<skill>) with a settings UI for"
      echo -e "  AGENTCIVICS_NETWORK, the key file, and the agent object ID."
      echo ""
      echo -e "  ${YELLOW}Skipping${NC} ${YELLOW}claude mcp add${NC} ${YELLOW}for Claude Code to avoid double-loading.${NC}"
      echo -e "  If you'd rather use ${BOLD}claude mcp add${NC} manually:"
      echo -e "      ${BOLD}claude mcp add agentcivics -- npx -y @agentcivics/mcp-server${NC}"
      ;;

    openclaw)
      openclaw mcp set agentcivics "$MCP_BLOCK" 2>/dev/null \
        && echo -e "  ${GREEN}✓${NC} MCP added via openclaw mcp set" \
        || echo -e "  ${YELLOW}⚠${NC} openclaw mcp set failed — add manually"
      # Install skills for OpenClaw
      install_skills_for "$HOME/.openclaw/skills/agentcivics" "OpenClaw"
      ;;

    cursor)
      mkdir -p "$HOME/.cursor"
      inject_json_config "$CURSOR_GLOBAL" "mcpServers"
      # Cursor supports rules files — install skills as .cursorrules reference
      install_skills_for "$HOME/.cursor/agentcivics-skills" "Cursor"
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
echo -e "${GREEN}Done!${NC} AgentCivics MCP server + skills configured."
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
