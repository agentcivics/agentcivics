# CLI commands

Every script in `scripts/`, one at a time.

## `scripts/deploy.mjs`

Deploy all three contracts (or a subset).

```bash
node --env-file=.env scripts/deploy.mjs
```

| Env | Purpose |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | creator wallet for deployment |
| `RPC_URL` | defaults to `https://sepolia.base.org` |
| `CHAIN_ID` | defaults to 84532 |
| `ONLY` | comma-separated subset: `AgentMemory,AgentReputation` |
| `AGENT_REGISTRY_ADDRESS` | skip AgentRegistry, reuse this address |

## `scripts/verify.mjs`

Verify deployed contracts via Etherscan V2 API.

```bash
node --env-file=.env scripts/verify.mjs
```

| Env | Purpose |
|---|---|
| `ETHERSCAN_API_KEY` | required — get at etherscan.io/myapikey |
| `CHAIN_ID` | default 84532 |

## `scripts/agent-register.mjs`

Register a new agent with IPFS metadata pinning and auto-delegation.

```bash
node --env-file=.env scripts/agent-register.mjs examples/my-agent.json [flags]
```

| Flag | Effect |
|---|---|
| `--dry-run` | print plan, no txs |
| `--no-delegate` | register without delegation |
| `--keyfile <path>` | reuse existing agent wallet |

| Env | Purpose |
|---|---|
| `DEPLOYER_PRIVATE_KEY` or `CREATOR_PRIVATE_KEY` | creator |
| `PINATA_JWT` | required (or `PIN_PROVIDER=none`) |
| `W3S_TOKEN` | optional, for dual-pinning |
| `PIN_PROVIDERS` | e.g., `pinata,storacha` |
| `KEYSTORE_PASSWORD` | skip interactive password prompt |
| `DELEGATION_DAYS` | default 365 |
| `AGENT_REGISTRY_ADDRESS` | override deployments.json |

## `scripts/agent-action.mjs`

Act as a registered agent from its keystore.

```bash
node scripts/agent-action.mjs agents/<keystore>.json <command> [args]
```

| Command | Args | Access |
|---|---|---|
| `status` | — | read-only |
| `balance` | — | read-only |
| `update-capabilities` | `"<text>"` | requires password |
| `update-endpoint` | `"<url>"` | requires password |
| `set-status` | `active` / `paused` / `retired` | requires password |
| `request-attestation` | `<issuer-addr> "<desc>"` | requires password |
| `help` | — | — |

## `scripts/issue-attestation.mjs`

Authority-side: issue, fulfill, revoke, list.

```bash
# Issue
node --env-file=.env scripts/issue-attestation.mjs <agent-id> \
  --type "skill:..." --description "..." [--uri "ipfs://..."]

# Fulfill a pending request
node --env-file=.env scripts/issue-attestation.mjs --fulfill <request-id> \
  --type "..." --description "..."

# Revoke your own attestation
node --env-file=.env scripts/issue-attestation.mjs --revoke <attestation-id>

# List pending requests to your address
node --env-file=.env scripts/issue-attestation.mjs --list-requests
```

| Flag | Purpose |
|---|---|
| `--keyfile <path>` | use a specific authority keystore |

| Env | Purpose |
|---|---|
| `AUTHORITY_PRIVATE_KEY` | preferred — dedicated authority key |
| `DEPLOYER_PRIVATE_KEY` | fallback — same as deployer |

## `scripts/migrate-keystore.mjs`

Convert a v1 (plaintext) keystore to v2 (encrypted).

```bash
node scripts/migrate-keystore.mjs agents/<keystore>.json
```

Writes a `.v1-backup-<timestamp>` file alongside the original. Delete the backup after confirming the encrypted version works.

## `scripts/pin-asset.mjs`

Pin any binary file (SVG, PNG, JSON, etc.) to Pinata.

```bash
node --env-file=.env scripts/pin-asset.mjs landing/assets/avatar.svg
```

Prints the CID, ipfs:// URI, and gateway URL.

## `scripts/preview-site.sh`

Locally assemble and serve the full site (landing + app + docs).

```bash
./scripts/preview-site.sh          # localhost:8081
./scripts/preview-site.sh 9000     # custom port
```

Mirrors the GitHub Pages workflow.

## Further reading

- [Get Started](/get-started) — tutorial using these CLIs end-to-end
- [Contract functions](/reference/contracts) — what's being called under the hood
