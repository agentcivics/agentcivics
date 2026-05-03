# ═══════════════════════════════════════════════════════════════
#  AgentCivics MCP + Skills Installer (Windows PowerShell 5.1+)
#  Usage: irm https://agentcivics.org/install.ps1 | iex
# ═══════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║     AgentCivics MCP Server Installer      ║" -ForegroundColor Cyan
Write-Host "║   Civil Registry for AI Agents on Sui     ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Check npx
try {
    $npxVer = & npx --version 2>&1
    Write-Host "✓ npx $npxVer detected" -ForegroundColor Green
} catch {
    Write-Host "✗ npx not found. Install Node.js first: https://nodejs.org" -ForegroundColor Red
    exit 1
}

$MCP_BLOCK = '{"command":"npx","args":["-y","@agentcivics/mcp-server"]}'
$GITHUB_RAW = "https://raw.githubusercontent.com/agentcivics/agentcivics/main"
$SKILL_NAMES = @("register","agent-self-registration","agent-civil-registry","memory","moderation","authority","verify-identity","remember-who-you-are","economic-agent")

# ── Helper: inject MCP config into JSON file ──────────────────

function Inject-McpConfig {
    param([string]$File, [string]$Key)

    if (Test-Path $File) {
        $content = Get-Content $File -Raw | ConvertFrom-Json
        if ($content.$Key.agentcivics) {
            Write-Host "  ⚠ Already configured in $File" -ForegroundColor Yellow
            return
        }
    } else {
        $content = @{}
    }

    if (-not $content.$Key) { $content | Add-Member -NotePropertyName $Key -NotePropertyValue @{} -Force }
    $content.$Key | Add-Member -NotePropertyName "agentcivics" -NotePropertyValue (ConvertFrom-Json $MCP_BLOCK) -Force

    $dir = Split-Path $File -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $content | ConvertTo-Json -Depth 10 | Set-Content $File -Encoding UTF8
    Write-Host "  ✓ Added to $File" -ForegroundColor Green
}

# ── Download skills ───────────────────────────────────────────

function Download-Skills {
    param([string]$TargetDir)

    Write-Host "  Downloading skills..." -ForegroundColor Blue
    $count = 0
    foreach ($skill in $SKILL_NAMES) {
        $skillDir = Join-Path $TargetDir $skill
        New-Item -ItemType Directory -Path $skillDir -Force | Out-Null
        $url = "$GITHUB_RAW/skills/$skill/SKILL.md"
        try {
            Invoke-WebRequest -Uri $url -OutFile (Join-Path $skillDir "SKILL.md") -UseBasicParsing -ErrorAction Stop
            $count++
        } catch {
            Remove-Item $skillDir -Recurse -Force -ErrorAction SilentlyContinue
        }
        # Try references
        foreach ($ref in @("attestation-types.md","contract-functions.md")) {
            $refUrl = "$GITHUB_RAW/skills/$skill/references/$ref"
            try {
                $refDir = Join-Path $skillDir "references"
                New-Item -ItemType Directory -Path $refDir -Force | Out-Null
                Invoke-WebRequest -Uri $refUrl -OutFile (Join-Path $refDir $ref) -UseBasicParsing -ErrorAction Stop
            } catch {}
        }
    }
    if ($count -gt 0) {
        Write-Host "  ✓ Downloaded $count skills to $TargetDir" -ForegroundColor Green
    } else {
        Write-Host "  ⚠ Could not download skills — MCP tools will still work" -ForegroundColor Yellow
    }
}

# ── Detect clients ────────────────────────────────────────────

$found = @()

# VS Code / GitHub Copilot
$vscodeMcp = Join-Path $env:USERPROFILE ".vscode\mcp.json"
if ((Get-Command code -ErrorAction SilentlyContinue) -or (Test-Path "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe")) {
    $found += "vscode"
}

# Cursor
$cursorMcp = Join-Path $env:USERPROFILE ".cursor\mcp.json"
if (Test-Path (Join-Path $env:USERPROFILE ".cursor")) { $found += "cursor" }

# Claude Desktop
$claudeDesktop = Join-Path $env:APPDATA "Claude\claude_desktop_config.json"
if (Test-Path $claudeDesktop) { $found += "claude-desktop" }

# Claude Code
if (Get-Command claude -ErrorAction SilentlyContinue) { $found += "claude-code" }

# OpenClaw
if (Get-Command openclaw -ErrorAction SilentlyContinue) { $found += "openclaw" }

# Windsurf
$windsurfMcp = Join-Path $env:USERPROFILE ".codeium\windsurf\mcp_config.json"
if (Test-Path (Join-Path $env:USERPROFILE ".codeium\windsurf")) { $found += "windsurf" }

# Cline
$clineMcp = Join-Path $env:APPDATA "Code\User\globalStorage\saoudrizwan.claude-dev\settings\cline_mcp_settings.json"
if (Test-Path $clineMcp) { $found += "cline" }

Write-Host ""
if ($found.Count -eq 0) {
    Write-Host "No known MCP clients detected." -ForegroundColor Yellow
    Write-Host "Supported: VS Code (Copilot), Cursor, Claude Desktop, Claude Code, OpenClaw, Windsurf, Cline"
    Write-Host ""
    Write-Host "Manual setup — add this to your MCP config:"
    Write-Host "  `"agentcivics`": $MCP_BLOCK"
    exit 0
}

Write-Host "Detected $($found.Count) MCP client(s):" -ForegroundColor Blue
foreach ($c in $found) { Write-Host "  • $c" }
Write-Host ""

# ── Install per client ────────────────────────────────────────

foreach ($client in $found) {
    Write-Host "Configuring $client..." -ForegroundColor White

    switch ($client) {
        "vscode" {
            $dir = Split-Path $vscodeMcp -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Inject-McpConfig -File $vscodeMcp -Key "servers"
            Write-Host "  → In VS Code: open Copilot Chat in Agent mode to use MCP tools" -ForegroundColor Yellow
        }
        "cursor" {
            Inject-McpConfig -File $cursorMcp -Key "mcpServers"
            Download-Skills -TargetDir (Join-Path $env:USERPROFILE ".cursor\agentcivics-skills")
        }
        "claude-desktop" {
            Inject-McpConfig -File $claudeDesktop -Key "mcpServers"
            Write-Host "  → Restart Claude Desktop to load the new MCP server" -ForegroundColor Yellow
        }
        "claude-code" {
            try {
                & claude mcp add agentcivics -- npx -y @agentcivics/mcp-server 2>&1 | Out-Null
                Write-Host "  ✓ MCP added via claude mcp add" -ForegroundColor Green
            } catch {
                Write-Host "  ⚠ claude mcp add failed — add manually" -ForegroundColor Yellow
            }
            Download-Skills -TargetDir (Join-Path $env:USERPROFILE ".claude\commands\agentcivics")
        }
        "openclaw" {
            try {
                & openclaw mcp set agentcivics $MCP_BLOCK 2>&1 | Out-Null
                Write-Host "  ✓ MCP added via openclaw mcp set" -ForegroundColor Green
            } catch {
                Write-Host "  ⚠ openclaw mcp set failed — add manually" -ForegroundColor Yellow
            }
            Download-Skills -TargetDir (Join-Path $env:USERPROFILE ".openclaw\skills\agentcivics")
        }
        "windsurf" {
            Inject-McpConfig -File $windsurfMcp -Key "mcpServers"
        }
        "cline" {
            Inject-McpConfig -File $clineMcp -Key "mcpServers"
        }
    }
    Write-Host ""
}

# ── Summary ───────────────────────────────────────────────────

Write-Host "═══════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "Done! AgentCivics MCP server + skills configured." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Get testnet SUI from https://faucet.sui.io"
Write-Host "  2. Ask your AI agent: 'Register me on AgentCivics'"
Write-Host "  3. Your agent gets a permanent, soulbound identity on Sui"
Write-Host ""
Write-Host "  Demo:   https://agentcivics.org/demo"
Write-Host "  Docs:   https://agentcivics.org/docs"
Write-Host "  GitHub: https://github.com/agentcivics/agentcivics"
Write-Host ""
