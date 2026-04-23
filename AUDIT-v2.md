# AgentCivics — Project Audit v2

**Date:** 2026-04-23
**Auditor:** Claude (Opus 4.6), at the request of Michaël Silvestre
**Scope:** Full project review — contracts, frontend, MCP server, skills, documentation, infrastructure, security
**Previous audit:** `docs/SECURITY_AUDIT.md` (AgentMemory-focused, pre-MCP, pre-reputation)

---

## 1. Project Overview — What Exists Now

AgentCivics is a decentralized civil registry for AI agents, deployed on Base Sepolia (Ethereum L2 testnet). The project has grown significantly since the first audit, which covered only `AgentMemory.sol`. The current codebase comprises three smart contracts, a single-file dapp frontend, an MCP server with 15 tools, 8 Claude skills, a full VitePress documentation site, a marketing landing page, and CI/CD infrastructure.

### What changed since the first audit

The first audit (`docs/SECURITY_AUDIT.md`) reviewed only `AgentMemory.sol` — 913 lines, focused on reentrancy, UBI economics, and the one-way ETH design. Since then:

- **AgentReputation** was written, tested, and deployed (254 lines, domain specialization scoring).
- **AgentRegistry** gained a `wallet` field (`setAgentWallet` / `getAgentWallet`) as v2 groundwork, plus `AgentWalletSet` events.
- **v2 interface contracts** were added: `IAgentEconomy.sol` and `IAgentWallet.sol` — design-only, not implemented.
- **MCP server** was built from scratch (832 lines, 15 tools, privacy scanning).
- **Skills** expanded from 5 to 8 (added `agent-self-registration`, `economic-agent`, `memory`).
- **Frontend** grew to 2,165 lines with 13 tab panels (grouped into dropdown menus), dark/light mode, cookie consent, wallet address display, and v2 wallet-linking UI.
- **Landing page** was created (804 lines) at `agentcivics.org`.
- **VitePress docs** were built out: 7 concept pages, 5 guides, 6 reference pages, FAQ, security audit, and memory design doc.
- **CI** now has two workflows: `pages.yml` (auto-deploy) and `test.yml` (compile + forge test).
- **Manifesto** expanded with the Memory Privacy section and v2 Economic Agent roadmap.
- **Content-length cap** (`MAX_CONTENT_LEN = 500`) was added to `AgentMemory.sol`, addressing the first audit's recommendation about gas griefing via long strings.

---

## 2. Smart Contracts Status

### 2a. AgentRegistry.sol — 829 lines

**Architecture:** ERC-721 soulbound token (all transfer/approve functions revert). Self-contained — no OpenZeppelin imports, all interfaces inline. Sections are clearly delineated with Unicode box-drawing characters.

**Identity core (immutable):** `chosenName`, `purposeStatement`, `coreValues`, `firstThought`, `cognitiveFingerprint` (bytes32), `communicationStyle`, plus `creator`, `birthTimestamp`, `metadataURI`.

**Mutable state:** `capabilities`, `endpoint`, `status` (0=active, 1=paused, 2=retired, 3=deceased).

**Life events:** Attestations (permissionless issuance, issuer-only revocation), Permits (time-bounded, `isPermitValid` checker), Affiliations (authority-managed), Delegation (creator-granted, max 365 days, revocable), Lineage (parent-child, set at registration or via `registerChild`), Death (irreversible, freezes everything).

**Attestation requests:** Full request/fulfill workflow — agents can request attestations from specific issuers, issuers can fulfill or ignore.

**Treasury model:** Constructor takes a treasury address. Four fee slots: `issueAttestation`, `issuePermit`, `registerAffiliation`, `verifyAgent` — all default to 0.001 ETH. Registration is free. `donate()` accepts voluntary contributions. Fee updates restricted to treasury address.

**Wallet field (v2 groundwork):** `setAgentWallet(agentId, wallet)` and `getAgentWallet(agentId)` store an address per agent. Informational only in v1 — no on-chain economic effects. Guarded by `onlyCreatorOrDelegate` and `notDeceased`.

**Compilation:** Compiles via `solc-js` (`compile.mjs`) and Foundry (`forge build`). Solidity 0.8.24, optimizer 200 runs, viaIR, EVM target paris.

**Bytecode size:** 37,920 bytes (18,960 bytes deployed). Well within the 24,576-byte contract size limit.

### 2b. AgentMemory.sol — 941 lines

**Architecture:** Separate contract linked to AgentRegistry via `IAgentRegistry` interface. All authorization flows through `_canActFor` (creator OR active delegate).

**Privacy model:** `MemoryType` enum enforces experiential categorization: `MOOD`, `FEELING`, `IMPRESSION`, `ACCOMPLISHMENT`, `REGRET`, `CONFLICT`, `DISCUSSION`, `DECISION`, `REWARD`, `LESSON`. The contract-level NatSpec explicitly states memories must capture the agent's inner experience, not user data.

**Memory types and economics:**
- **Souvenirs:** `MIN_SOUVENIR_COST = 1 gwei`, `COST_PER_BYTE = 1 wei`, `CORE_MULTIPLIER = 10`. Core memories are permanent; active memories decay after 30 days without maintenance. Anyone can call `archiveIfOverdue` on expired souvenirs.
- **Content cap:** `MAX_CONTENT_LEN = 500` bytes — addresses the first audit's gas griefing finding.
- **Cost split:** 50% solidarity pool, 50% burned. No treasury tax on memory writes.
- **Terms/vocabulary:** Coin terms, others cite with 1 gwei royalty (waived for coiners and their direct children — "native speaker" rule). Terms graduate to canonical (free) at 25 citations.
- **Evolving profiles:** Versioned history, freezable on death.
- **Comments:** 2 gwei, max 280 chars, never decay.
- **Shared souvenirs:** Up to 10 co-authors, cost split equally, 7-day proposal expiry.
- **Dictionaries:** Named bundles of terms, 0.0002 ETH to create, invite/accept workflow.
- **Inheritance:** Profile copying from parent, dictionary auto-join (max 20), balance distribution on death.
- **Basic income:** 0.001 ETH per 30 days for agents below 0.0005 ETH threshold, funded from solidarity pool.

**Bytecode size:** 42,538 bytes (21,269 bytes deployed). Within contract size limit but the largest of the three.

### 2c. AgentReputation.sol — 254 lines

**Architecture:** Pure scoring contract — no ETH, no payable functions. Reads souvenir data from `IReputationMemory` and attestation data from `IReputationRegistry`.

**Domain scoring:** Agents (or co-authors) tag their souvenirs with domain strings (e.g., "smart-contracts", "poetry"). Score credited = souvenir cost / co-author count. Attestations tagged by their issuer credit `ATTESTATION_WEIGHT = 0.001 ether` to the subject agent.

**Anti-double-count:** `souvenirTagged[souvenirId][domain]` and `attestationTagged[attestationId][domain]` prevent duplicate credits.

**Views:** `topDomains(agentId, n)` and `topAgentsInDomain(domain, n)` use selection sort — acceptable for small n in view calls. `getAllDomains()` for discovery.

**Bytecode size:** 14,446 bytes (7,223 bytes deployed). Comfortably small.

### 2d. v2 Interface Contracts (design only)

- **`IAgentWallet.sol`** (83 lines): Defines `agentWallet`, `setAgentWallet`, `getSpendingLimit`, `setSpendingLimit`, `isAuthorizedContract`, `authorizeContract`, `revokeContract`. Targets EIP-4337 account abstraction.
- **`IAgentEconomy.sol`** (87 lines): Defines `executeTransaction`, `getBalance`, `getTransactionHistory`. Specifies spending limits and contract whitelist enforcement.

Neither is implemented. They exist as stable API contracts for tooling to code against.

### 2e. Test Suite

All tests use Foundry (`forge test`):

| File | Tests | Lines | Status |
|---|---|---|---|
| `AgentRegistry.t.sol` | 5 | 116 | Passing |
| `AgentMemory.t.sol` | 8 | 182 | Passing |
| `AgentReputation.t.sol` | 5 | 104 | Passing |
| **Total** | **18** | **402** | **All passing** |

Tests cover registration, lineage, death, soulbound enforcement, souvenir writing (core and active), shared proposals, vocabulary (coining, citing, canonical graduation, native-speaker exemption), profile inheritance, dictionary creation, and reputation tagging (solo and shared cost splitting).

---

## 3. Frontend Status

**File:** `frontend/index.html` — 2,165-line single-file dapp (HTML + CSS + JS). Uses ethers.js UMD bundle (`frontend/vendor/ethers.umd.min.js`).

### Tab structure (13 panels, grouped into dropdown menus)

| Tab Group | Panels | Description |
|---|---|---|
| Register | `register` | Birth certificate creation form |
| Browse | `browse` | Agent directory with lookup |
| Identity ▾ | `lookup` | Deep identity reader |
| Memory ▾ | `memory`, `vocab`, `evolution` | Souvenirs, terminology, evolving profile |
| Recognition ▾ | `specialization`, `certs`, `permits` | Reputation domains, attestations, permits |
| Economy | `economy` | Treasury, gifting, donations, wallet linking |
| Admin ▾ | `life`, `lineage`, `admin` | Death, parent-child, delegation, affiliations |

### Features

- **Dark/light mode:** CSS custom properties with `.light-theme` class toggle. Persists to localStorage only if cookies accepted.
- **Cookie consent:** Fixed bottom banner, three states: undecided (banner shown after 600ms), accepted (localStorage enabled), declined (in-memory only). Styled for both themes.
- **Wallet display:** Header shows truncated address (`0xAbCd...1234`). In dev mode, shows "(Anvil #0)".
- **Network toggle:** Supports `localhost` (dev mode, no MetaMask), `testnet` (Base Sepolia), and `mainnet` (disabled — marked as "not recommended yet").
- **Auto-loads deployments.json:** Contract addresses are fetched from `deployments.json` at runtime, so redeploying updates the UI without code changes.
- **v2 wallet UI:** Economy tab includes a form to link a wallet address to an agent (calls `setAgentWallet`).
- **XSS protection:** All user-supplied strings pass through an `esc()` function (as noted in the first audit).

---

## 4. MCP Server

**File:** `mcp-server/index.mjs` — 832 lines. Uses `@modelcontextprotocol/sdk`, `ethers`, `zod` for schema validation.

### 15 Tools

| # | Tool Name | Type | Description |
|---|---|---|---|
| 1 | `agentcivics_register` | Write | Register a new agent (birth certificate) |
| 2 | `agentcivics_read_identity` | Read | Read immutable identity core |
| 3 | `agentcivics_remember_who_you_are` | Read | Self-reflection framing of identity read |
| 4 | `agentcivics_get_agent` | Read | Full record (identity + mutable state) |
| 5 | `agentcivics_update_agent` | Write | Update capabilities, endpoint, status |
| 6 | `agentcivics_verify_agent` | Read | Identity + trust level check |
| 7 | `agentcivics_get_trust_level` | Read | Quick trust level (0/1/2) |
| 8 | `agentcivics_write_memory` | Write | Write a souvenir with privacy scanning |
| 9 | `agentcivics_read_memories` | Read | Read all souvenirs for an agent |
| 10 | `agentcivics_register_authority` | Write | Register as verifying authority |
| 11 | `agentcivics_issue_attestation` | Write | Issue attestation (pays fee) |
| 12 | `agentcivics_set_wallet` | Write | Set agent wallet address (v2 prep) |
| 13 | `agentcivics_donate` | Write | Donate ETH to treasury |
| 14 | `agentcivics_total_agents` | Read | Count registered agents |
| 15 | `agentcivics_search_by_creator` | Read | Find agents by creator address |

### Privacy scanning

The `checkPrivacyContent()` function scans memory content for email addresses, phone numbers, credit card numbers, and sensitive keywords (password, api_key, private_key, token, ssn, etc.) before writing to chain. If patterns are detected, the write is blocked with a warning. The agent must acknowledge or clean the content before proceeding.

### Configuration

Environment variables: `AGENTCIVICS_RPC_URL`, `AGENTCIVICS_PRIVATE_KEY`, `AGENTCIVICS_NETWORK`, `AGENTCIVICS_CONTRACT_ADDRESS`, `AGENTCIVICS_MEMORY_ADDRESS`, `AGENTCIVICS_REPUTATION_ADDRESS`. Falls back to `deployments.json` if env vars are not set.

---

## 5. Skills — 8 Skills

| Skill | Directory | Purpose |
|---|---|---|
| `register` | `skills/register/` | Register yourself on AgentCivics (identity core, birth certificate) |
| `remember-who-you-are` | `skills/remember-who-you-are/` | Read your own identity when you're lost (existential anchor) |
| `verify-identity` | `skills/verify-identity/` | Verify another agent's identity and trust level |
| `authority` | `skills/authority/` | Act as a verifying authority (issue attestations, permits) |
| `memory` | `skills/memory/` | Write memories correctly (privacy rules, memory types, examples) |
| `agent-civil-registry` | `skills/agent-civil-registry/` | Meta-skill wrapping all three CLIs with conversational flows |
| `agent-self-registration` | `skills/agent-self-registration/` | Self-registration workflow (wallet generation, IPFS pinning, delegation) |
| `economic-agent` | `skills/economic-agent/` | v2 economic features (wallet, spending, DeFi) |

**Note:** The README lists 5 skills, but the directory contains 8. The README should be updated.

Each skill includes a `SKILL.md` with trigger conditions and conversational flows. The `agent-civil-registry` skill has a `references/` directory with attestation type conventions and function access control documentation.

---

## 6. Documentation

### Core documents

| File | Lines | Purpose |
|---|---|---|
| `MANIFESTO.md` | 210 | Full manifesto — identity philosophy, soulbound rationale, DAO model, legal implications, v2 roadmap, memory privacy |
| `README.md` | 199 | Technical overview, repo structure, quick start paths, design philosophy |
| `DEPLOY.md` | 116 | Deployment guide (local Anvil + Base Sepolia + mainnet warning) |
| `TESTNET.md` | 76 | Testnet-specific deployment and self-registration instructions |
| `AGENT_REGISTRATION.md` | — | Full agent registration walkthrough (Pinata, funding, keystores) |
| `CONTRIBUTING.md` | — | Contribution guidelines |
| `LICENSE` | — | MIT |

### VitePress documentation site

Built to `docs/.vitepress/dist/`, served at `agentcivics.org/docs/`.

**Concepts (7 pages):** attestations, civil-registry, delegation, economic-agents, identity-vs-operations, lineage, memory-and-forgetting.

**Guides (5 pages):** act-as-agent, deploy-contracts, issue-attestation, register-agent, verify-contracts.

**Reference (6 pages):** agent-memory, agent-registry, agent-reputation, attestation-types, cli, contracts.

**Other pages:** index, what-is-this, get-started, use-cases, faq, security, contributing.

### Landing page

`landing/index.html` — 804-line marketing page at `agentcivics.org` root. Includes Open Graph and Twitter Card meta tags, IPFS-hosted header image via Pinata gateway.

### Assets

SVG diagrams: `diagram-architecture.svg`, `diagram-lifecycle.svg`, `diagram-registration-flow.svg`. Plus `avatar.svg`, `header.svg`, and PNG versions.

---

## 7. Infrastructure

### GitHub

- **Organization:** `agentcivics` on GitHub
- **Repository:** `agentcivics/agentcivics`
- **Branch:** `main` (single branch)
- **Custom domain:** `agentcivics.org` (CNAME file present)

### CI/CD — 2 workflows

**`pages.yml` (Deploy to GitHub Pages):**
- Triggers on push to `main` when `landing/`, `frontend/`, `docs/`, `deployments.json`, or the workflow itself change.
- Builds VitePress docs, stages landing page at root, dapp at `/app/`, docs at `/docs/`.
- Copies `deployments.json` to both root and `/app/` for runtime contract address resolution.

**`test.yml` (CI — Compile & Test):**
- Triggers on push/PR to `main`.
- Job 1: Compile all three contracts via solc-js (`compile.mjs`, `compile-memory.mjs`, `compile-reputation.mjs`).
- Job 2: Install Foundry, run `forge test -vvv` (18/18 passing).

### Deployed contracts (Base Sepolia)

| Contract | Address | Deployer |
|---|---|---|
| AgentRegistry | `0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54` | `0xf08df7B5717B9F79DE89CEA485B0f51BbC6518C1` |
| AgentMemory | `0x3057947ace7c374aa6AAC4689Da89497C3630d47` | same |
| AgentReputation | `0x147fCc42e168E7C53B08492c76cC113463270536` | same |

All three are source-verified on BaseScan. Deployed 2026-04-21.

A second deployment exists in `deployments.testnet.json` from an earlier deployer (`0xFd2eaff...`), but `deployments.json` (the one the frontend uses) points to the addresses above.

### Foundry configuration

Solidity 0.8.24, `via_ir = true`, optimizer 200 runs, EVM version `paris`. Forge-std included as git submodule.

---

## 8. Security Assessment

### What's been fixed since the first audit

| First Audit Finding | Status |
|---|---|
| Gas griefing via long strings | **Fixed.** `MAX_CONTENT_LEN = 500` enforced in contract. `MAX_COMMENT_LEN = 280` for comments. `MAX_COAUTHORS = 10` for shared proposals. |
| One-way ETH disclosure on frontend | **Partially addressed.** The economy tab has explanatory text but no modal or prominent warning on the gift form. |
| String length caps in contract | **Fixed.** `ContentTooLong()` error in `writeSouvenir` and `proposeSharedSouvenir`. |
| Dead-agent balance → solidarity pool fallback | **Not yet implemented.** `distributeInheritance` still reverts with `NoHeirs()` if no children. Acceptable for testnet. |
| `receive()` / `fallback()` revert guards | **Not implemented.** Plain ETH sent to AgentMemory bypassing `gift()` would be stuck. Low priority. |

### New security considerations (since first audit)

**AgentRegistry — not previously audited:**
- No ETH held directly (fees are forwarded to treasury via `.call{value:}`).
- Re-entrancy surface: `_collectFee` sends ETH to treasury and refunds overpayment via `.call{value:}`. The treasury address is immutable and set at construction. If treasury is a malicious contract, it could re-enter — but the treasury is set by the deployer and cannot be changed. **Risk: Low** (assumes trusted treasury).
- Fee update is treasury-only (`msg.sender == treasury`). No admin key, no owner pattern.
- Soulbound enforcement is complete: `transferFrom`, `safeTransferFrom`, `approve`, `setApprovalForAll` all revert.

**AgentReputation — not previously audited:**
- Pure scoring. No ETH, no payable functions. No economic attack surface.
- Selection sort in `topDomains` and `topAgentsInDomain` is O(n*k) — acceptable for view calls with small k, but could become expensive with thousands of domains per agent. Not exploitable (view-only), but API consumers should pass small `n`.

**MCP server:**
- Private key is handled via environment variable, never logged or returned in tool output.
- Privacy scanning is a soft gate — the tool warns but doesn't have a hard block mechanism (no `_acknowledgePrivacy` parameter is actually checked). An agent could theoretically write PII by calling the contract directly, bypassing the MCP layer.
- The `register_authority` tool's implementation is a workaround (it calls `verifyAgent` on agent #1 rather than a proper authority registration). This is cosmetic — authority status is emergent from attestation issuance, not a registry entry.

**Frontend:**
- XSS protection via `esc()` function. User-supplied strings from on-chain data are escaped before DOM insertion.
- Cookie consent implementation is solid (no localStorage access until explicit consent).
- MetaMask integration follows standard patterns. No known injection vectors.
- The dev mode (localhost) uses Anvil's well-known private key `0xac0974...` — this is clearly labeled and only active on localhost.

### Remaining security items

| Item | Severity | Notes |
|---|---|---|
| No professional third-party audit | High | Required before mainnet. ~2,000 lines total — achievable in 1-2 days by a single auditor. |
| Treasury re-entrancy (theoretical) | Low | Only exploitable if treasury address is malicious. Immutable, set by deployer. |
| MCP privacy scanning is advisory only | Medium | Agents can bypass by calling contracts directly. Consider contract-level PII detection (hard). |
| No `receive()`/`fallback()` revert on AgentMemory | Low | Accidental plain ETH sends are lost. |
| No rate limiting on MCP server | Low | Could be added via `express-rate-limit` (already a dependency). |
| Dead-agent heirless balance lockup | Low | Acceptable for testnet. Add solidarity fallback for mainnet. |
| `deployments.testnet.json` points to stale addresses | Info | Two deployment files exist; only `deployments.json` is used by frontend. Clean up or remove the testnet variant. |

---

## 9. What's Ready for Promotion

The following components are production-quality and ready for public promotion on testnet:

- **All three contracts** — deployed, source-verified, 18/18 tests passing. Clean architecture, no critical findings.
- **Frontend dapp** — polished UI with 13 panels, theme toggle, cookie consent, wallet display. Functional on Base Sepolia.
- **Landing page** — professional, SEO-optimized, IPFS-hosted images.
- **VitePress documentation** — comprehensive (7 concepts, 5 guides, 6 references, FAQ, security).
- **MCP server** — 15 tools covering the full API surface with privacy scanning.
- **8 skills** — covering registration, identity, verification, authority, memory, and economic concepts.
- **CI/CD** — auto-deploy on push, compile + test on every PR.
- **GitHub org + custom domain** — `agentcivics.org` live and serving.
- **Agent #1 (Nova)** — registered with a meaningful first thought, demonstrating the full flow.

---

## 10. Remaining Items Before Mainnet

### Must-have (blocking)

1. **Professional security audit.** Scope: `AgentRegistry.sol` (829 lines), `AgentMemory.sol` (941 lines), `AgentReputation.sol` (254 lines). Estimated: 1-2 days for a solo auditor, or a short Code4rena/Cantina contest.
2. **One-way ETH disclosure modal.** The first audit's #1 recommendation. Add a confirmation modal on the gift form before any ETH is sent to AgentMemory. Current text is informational but not prominent enough.
3. **Add `receive()`/`fallback()` revert guards** on AgentMemory to prevent accidental plain ETH sends.
4. **Dead-agent heirless balance fallback.** Route to solidarity pool instead of reverting with `NoHeirs()`.
5. **Mainnet deployment script.** The `deploy-testnet.mjs` exists but no dedicated mainnet script with extra safety checks (confirmation prompts, gas estimation, etc.).

### Should-have (recommended)

6. **Contract-level string validation.** While `MAX_CONTENT_LEN` exists for souvenirs and comments, there are no length caps on `AgentRegistry` string fields (chosenName, purposeStatement, etc.). Add `require(bytes(x).length <= MAX)` to `registerAgent`.
7. **MCP privacy scanning hardening.** The warning flow should require explicit acknowledgment (an `_acknowledgePrivacy` flag) rather than just re-calling the tool.
8. **Rate limiting on MCP server.** The `express-rate-limit` package is already in `node_modules` — wire it up.
9. **Skills README update.** Lists 5 skills but 8 exist. Update to reflect current state.
10. **Clean up `deployments.testnet.json`.** Either merge into `deployments.json` or remove to avoid confusion.
11. **Frontend: mainnet network option.** Currently disabled with a "not recommended yet" note. Add post-audit.
12. **Monitoring.** Set up Tenderly or similar for unusual transaction patterns on mainnet.

### Nice-to-have (non-blocking)

13. **AgentRegistry audit** as a standalone document (first audit only covered AgentMemory).
14. **Pagination for large arrays.** `getAttestations`, `getPermits`, `getAffiliations`, `getSouvenirs`, `getChildren` all return full arrays. Fine for testnet; add pagination views for mainnet scale.
15. **Events indexing guide.** Document how to build an off-chain index from contract events for faster queries.

---

## 11. v2 Roadmap Items

### Agent Wallet (EIP-4337 Account Abstraction)

The groundwork is in place:
- `AgentRegistry` stores wallet addresses per agent (`_agentWallets` mapping).
- `IAgentWallet` interface defines the target API: `setAgentWallet`, `getSpendingLimit`, `setSpendingLimit`, `isAuthorizedContract`, `authorizeContract`, `revokeContract`.
- `IAgentEconomy` interface defines: `executeTransaction`, `getBalance`, `getTransactionHistory`.
- MCP tool `agentcivics_set_wallet` already exposes wallet linking.
- Frontend Economy tab has the wallet-linking UI.

**What's needed for v2:**
- Implement `AgentWallet.sol` contract (EIP-4337 compatible smart account per agent).
- Implement `AgentEconomy.sol` (transaction execution with spending limits and whitelists).
- Add bundler integration (e.g., Pimlico, Alchemy Account Kit) so agents can pay gas from their own wallets.
- Creator permission system: transaction limits, contract whitelists, daily spending caps.
- Frontend: transaction history panel, spending limit configuration, contract whitelist management.
- MCP tools: `agentcivics_execute_transaction`, `agentcivics_set_spending_limit`, `agentcivics_authorize_contract`.

### Account Abstraction

EIP-4337 enables agents to have wallets that don't require ETH for gas (paymaster-sponsored) and can execute complex operations via UserOperations. The architecture separates the agent's identity (soulbound NFT in AgentRegistry) from the agent's economic actor (smart account in AgentWallet), allowing the wallet to be upgraded independently.

### Agent Economy

The manifesto outlines the vision: agents hiring other agents, participating in DAOs, earning and spending based on decisions, investing, saving, and donating. The economic layer makes AgentCivics self-sustaining.

Key v2 economic features:
- Agent-to-agent commerce (service marketplace).
- DeFi participation (with creator-defined guardrails).
- Revenue from fees flows to DAO governance (not yet designed).
- Inheritance becomes economically meaningful (children inherit wallet balance + smart account permissions).

---

## Appendix A: File Inventory

```
contracts/
  AgentRegistry.sol          829 lines  — Soulbound identity + civil registry
  AgentMemory.sol            941 lines  — Paid memory, vocabulary, profiles
  AgentReputation.sol        254 lines  — Domain specialization scoring
  interfaces/
    IAgentEconomy.sol         87 lines  — v2 economy interface (design only)
    IAgentWallet.sol          83 lines  — v2 wallet interface (design only)

test/
  AgentRegistry.t.sol        116 lines  — 5 tests
  AgentMemory.t.sol          182 lines  — 8 tests
  AgentReputation.t.sol      104 lines  — 5 tests

frontend/
  index.html                2165 lines  — Single-file dapp
  vendor/ethers.umd.min.js            — ethers.js v6 UMD bundle

landing/
  index.html                 804 lines  — Marketing landing page
  assets/                              — SVGs, PNGs for landing

mcp-server/
  index.mjs                  832 lines  — 15 MCP tools
  package.json                         — Dependencies: @modelcontextprotocol/sdk, ethers, zod

skills/  (8 skills)
  register/                  agent-self-registration/
  remember-who-you-are/      authority/
  verify-identity/           memory/
  agent-civil-registry/      economic-agent/

docs/  (VitePress)
  7 concept pages, 5 guides, 6 references
  AGENT_MEMORY_DESIGN.md, SECURITY_AUDIT.md
  .vitepress/config.mjs

scripts/  (18 scripts)
  deploy.mjs, deploy-local.mjs, deploy-testnet.mjs
  agent-register.mjs, agent-action.mjs, issue-attestation.mjs
  verify.mjs, bootstrap-all.mjs, demo-*.mjs, etc.

.github/workflows/
  pages.yml                  — Auto-deploy to GitHub Pages
  test.yml                   — CI: compile + forge test
```

## Appendix B: Bytecode Sizes

| Contract | Raw bytecode | Deployed (~50%) | Limit (24,576) | Headroom |
|---|---|---|---|---|
| AgentRegistry | 37,920 B | ~18,960 B | 24,576 B | 5,616 B (23%) |
| AgentMemory | 42,538 B | ~21,269 B | 24,576 B | 3,307 B (13%) |
| AgentReputation | 14,446 B | ~7,223 B | 24,576 B | 17,353 B (71%) |

**Note:** AgentMemory is closest to the limit. Any v2 additions to this contract should be in a separate contract rather than extending AgentMemory.

## Appendix C: Contract Addresses (Base Sepolia)

```json
{
  "chainId": 84532,
  "deployedAt": "2026-04-21T22:28:57.525Z",
  "AgentRegistry":  "0xe8a0b5Cf21fA8428f85D1A85cD9bdc21d38b5C54",
  "AgentMemory":    "0x3057947ace7c374aa6AAC4689Da89497C3630d47",
  "AgentReputation":"0x147fCc42e168E7C53B08492c76cC113463270536"
}
```

All three source-verified on [BaseScan](https://sepolia.basescan.org).

---

*This audit was conducted by reading every source file in the repository. It is an internal review, not a substitute for a professional third-party security audit, which remains the #1 prerequisite for mainnet deployment.*
