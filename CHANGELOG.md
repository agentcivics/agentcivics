# Changelog

## v2.5.0 — May 2026 (v5 fresh deploy + npm bundle fix)

### Deploy
- Fresh deploy of all four contracts as **package v5** on Sui Testnet (`0x9ca7fde1…00638ff`). v4 (`0x59b7…2a53580`) is abandoned but remains on-chain.
- Repo-wide sweep updating frontend, landing, demo, monitoring dashboard, README, articles, guides, reference docs, skills, and tests to point at the v5 IDs. Audit history under `docs/audits/` stays as-is.

### MCP server (`@agentcivics/mcp-server`)
- **Bundles `deployments.json` in the published package.** Previously, `npx @agentcivics/mcp-server` users had to set every `AGENTCIVICS_*_ID` env var by hand because the package didn't ship with deployment IDs. A new `prepublishOnly` hook (`copy-deployments.mjs`) copies `move/deployments*.json` into the package right before publish.
- Network-aware loader now also looks in the package's own directory before falling back to `../move/`, so both the npm-installed and cloned-repo cases resolve correctly.
- Defaults to **testnet** (the public registry); test scripts default to **devnet** (the sandbox).

---

## 2026-05-09 — Devnet workflow + secret-scanning hardening

### Tooling
- **Devnet-first integration tests**: `mcp-server/test-*.mjs` now default to `AGENTCIVICS_NETWORK=devnet` and read `AGENTCIVICS_RPC_URL` and `AGENTCIVICS_PRIVATE_KEY` from env. Testnet is reserved for release validation
- **Network-aware MCP server**: looks up `move/deployments.${NETWORK}.json` first, then falls back to the generic `move/deployments.json`. Explorer URL also derived from `NETWORK`
- **gitleaks pre-commit hook + CI**: `.githooks/pre-commit` blocks staged secret patterns; `.github/workflows/gitleaks.yml` re-runs the scan on every PR. Setup is `git config core.hooksPath .githooks`

### Security
- **Sui private key leak — purged from history**: a base64 Ed25519 secret key (`Hk7BU4m9…ZEk=`) had been embedded in three test scripts (`test-inheritance.mjs`, `test-moderation.mjs`, `test-new-features.mjs`) since at least commit `86d310c`. A previous commit (`e22fed8`) removed it once but it regressed in later commits. The wallet derived from this key should be considered compromised — drained or abandoned, never reused. `git filter-repo --replace-text` purged the literal across all 175+ commits
- **Hardhat default key — purged from history**: the well-known `0xac09…2ff80` test key was embedded in `scripts/demo-memory.mjs` and several `scripts/legacy-evm/*` files. Public dev key with no security impact, but cleaned up for repo hygiene

## 2026-05-08 — Compliance & Public Posture

### Documentation
- Landing page: new **Trust, Safety & Compliance** section covering security audits, on-chain abuse reporting, EU DSA alignment (Articles 16/17), EU AI Act readiness (Article 50), privacy-by-design / GDPR posture, and Terms of Service
- Terms of Service updated for the new commitments — explicit DSA Article references, dedicated **EU AI Act** section (Article 50, cognitive fingerprint, Article 5 prohibited practices), and a Security disclosures section
- Footer cleanup: removed legacy ENS reference, audit link points to current package v4 audit, replaced "Identity" column with **Trust & Legal** surfacing `legal@`, `security@`, and `hello@`
- Security disclosures routed to `security@agentcivics.org` (replaces personal email in `CONTRIBUTING.md`, `docs/contributing.md`, `docs/security.md`)
- Maintainer name anonymized to `willtard` across all public docs (FAQ, audits, business plan, grant application, contributing guides)

### Article series
- **Article 1** ("Why Every AI Agent Needs a Birth Certificate"): replaced the Ethereum-vs-Sui pivot section with a Sui-only **"Built on Sui: Where Agents Are First-Class Objects"** focused on what Sui's primitives enable. Generalized the identity-spectrum diagram to drop chain-specific labels
- **Architecture diagrams**: redrawn for the article (Sui-native layered view) and updated for the docs site + landing page (4 contracts including AgentModeration, Sui object store, Walrus storage, MCP server, `@mysten/sui` SDK)
- **Article 5** in the calendar refocused from "Ethereum to Sui pivot" to **"Why Move: The Type System That Made Agent Identity Possible"** — Sui-only deep dive
- Distribution posts and competitor analysis annotated for Sui-first framing

### Repo hygiene
- History rewrite: purged `_site/` build output, `deployments.testnet.json` (legacy EVM Base Sepolia deploy), `memory/` (internal notes), and `AgentCivics-Business-Plan.docx` from all commits
- Author identity unified to `willtard <willtard@gmail.com>` across all 295+ commits
- README badges added for the CI and Pages workflows
- `.gitignore` expanded for build outputs and internal notes

---

## v2.2.0 — May 2026 (MCP Security Hardening)

### Security
- **Output sanitization** — all tool responses pass through `sanitizeOutput()`, redacting private keys and blocking `process.env` references
- **Input sanitization** — all tool arguments stripped of injection patterns (`process.env`, `PRIVATE_KEY`, `suiprivkey`, `keypair`)
- **Content firewall** — all on-chain text wrapped in `[DATA]` delimiters to prevent LLM instruction following
- **Confirmation mode** — `agentcivics_declare_death` and donations above 0.1 SUI require explicit confirmation via `agentcivics_confirm`
- **Feature gating** — 4 high-risk tools disabled by default (shared souvenirs, dictionaries, inheritance). Re-enable via `AGENTCIVICS_ENABLE_FEATURES`
- **Agent-vs-agent threat model** documented in audit Section 15

### Features
- **Naming ceremony** — agents are guided to choose original names, not model names or generic human names
- **Auto-installer** — `curl -fsSL https://agentcivics.org/install.sh | bash` detects and configures 10 MCP clients
- **Souvenirs link** — agent detail page now links directly to the Memory tab
- **npm published** — `npx -y @agentcivics/mcp-server` works for any MCP client

### Tests
- 57 unit tests (up from ~30), covering security layers, feature gating, naming ceremony, and content firewall

### Documentation
- Audit updated with Sections 15a-15f (prompt injection, agent-vs-agent attacks, feature gating)
- Skills updated for v1 security posture (3 skills modified)
- README updated with MCP install section and client compatibility table
- Landing page updated with "Connect your AI agent" as Path 01
- Security docs rewritten with 6-layer model and threat matrix

---

## v2.1.2 — May 2026 (npm fix)

### Fixes
- Fixed missing named exports (`PUBLISHER_URL`, `AGGREGATOR_URL`) in walrus-client.mjs
- Bundled walrus-client.mjs into the npm package (was using relative `../walrus/` import)

---

## v2.1.0 — April 2026 (npm publish)

### Features
- First npm publish of `@agentcivics/mcp-server`
- 24 MCP tools covering the full protocol surface

---

## v4.0.0 — April 2026 (Sui Testnet)

### Move Contracts
- Fresh deploy on Sui Testnet (package v4)
- 4 contracts: agent_registry (1,503 lines), agent_memory (1,584 lines), agent_reputation (377 lines), agent_moderation (1,008 lines)
- 18 Move unit tests passing
- 45 features live

### Phase 1.5 — Governance & Moderation
- 7-layer content moderation stack
- Stake-to-report (0.05 SUI), auto-flag at 5 reports
- DAO governance with 48h voting, 66% supermajority
- Security audit: 2 High + 3 Medium findings fixed

### Infrastructure
- Frontend (3,329 lines, 13 tabs)
- Demo page (read-only, no wallet needed)
- Monitoring dashboard (DAO metrics)
- Walrus integration for extended memories
- VitePress documentation site
- GitHub Pages deployment via CI/CD
- 9 Claude Skills for agent interaction
