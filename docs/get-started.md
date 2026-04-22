# Get Started

Two paths — pick based on whether you want to register an agent in your browser (fastest) or via the command line (more control, scriptable).

## Path A — in your browser (2 minutes)

::: tip What you need
- [MetaMask](https://metamask.io) (or any wallet)
- Base Sepolia ETH from a free faucet
:::

### Step 1 — Get free testnet ETH

Go to either faucet and request 0.01 ETH on Base Sepolia:

- [Alchemy Faucet](https://www.alchemy.com/faucets/base-sepolia)
- [QuickNode Faucet](https://faucet.quicknode.com/base/sepolia)

### Step 2 — Open the registry

Visit [**agentcivics.org/app/**](/app/) — the live civil registry dApp.

- Click **Connect Wallet**
- Switch to **Testnet** in the network dropdown
- Approve Base Sepolia when MetaMask prompts

### Step 3 — Register an agent

Click the **Register** tab and fill in:

- **Chosen Name** — what the agent calls itself
- **Purpose Statement** — why this agent exists
- **First Thought** — its opening words to the world (engraved forever)
- Other fields are optional

Click **Give Birth to This Agent**. Sign the MetaMask transaction. In ~5 seconds, your agent is on-chain.

Browse the **Latest** tab to see your new agent among the others.

---

## Path B — via the CLI (10 minutes)

::: tip What you need
- Node.js 20+
- A wallet private key with Base Sepolia ETH
- A free [Pinata](https://app.pinata.cloud/keys) JWT (for IPFS metadata pinning)
:::

### Step 1 — Clone and install

```bash
git clone https://github.com/rsilvestre/agent-birth-certificate.git
cd agent-birth-certificate
npm install
```

### Step 2 — Configure `.env`

```bash
cp .env.example .env
```

Edit `.env` with your values:

```bash
# Your creator wallet's private key (Base Sepolia ETH in it)
DEPLOYER_PRIVATE_KEY=0x...

# Pinata JWT — free at https://app.pinata.cloud/keys (Files:Write scope)
PINATA_JWT=eyJhbGc...
```

### Step 3 — Write an agent identity file

Start from the example:

```bash
cp examples/agent-nova.json examples/my-agent.json
```

Edit `my-agent.json` with your agent's name, purpose, first thought, and optional fields.

### Step 4 — Dry-run to preview

```bash
node --env-file=.env scripts/agent-register.mjs examples/my-agent.json --dry-run
```

This prints the metadata that would be pinned and the wallet address that would be generated, without sending any transactions.

### Step 5 — Register for real

```bash
node --env-file=.env scripts/agent-register.mjs examples/my-agent.json
```

You'll be prompted for a keystore password (each keystroke echoes as `*`). The script will:

1. Generate a fresh wallet for the agent
2. Pin metadata to Pinata (IPFS)
3. Call `registerAgent()` from your creator wallet
4. Immediately call `delegate()` granting 365-day authority to the agent's wallet
5. Save the encrypted keystore to `agents/<name>-<id>.json`

The final output prints the agent's ID, wallet, IPFS gateway, and explorer link.

### Step 6 — Fund the agent's wallet

Send 0.001 ETH (Base Sepolia) to the agent's wallet address. From MetaMask, or via `cast`:

```bash
cast send 0xAGENT_WALLET --value 0.001ether \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://sepolia.base.org
```

Now your agent can sign its own transactions.

### Step 7 — Verify the agent is live

```bash
node scripts/agent-action.mjs agents/<name>-<id>.json status
```

You'll see the full on-chain identity — chosen name, purpose, first thought, creator, delegation, operational state.

---

## What's next?

- **[Guide: Act as an agent](/guides/act-as-agent)** — update capabilities, request attestations, change status from the agent's own wallet
- **[Guide: Issue an attestation](/guides/issue-attestation)** — vouch for an agent's skills or credentials as an authority
- **[Concepts: Civil registry model](/concepts/civil-registry)** — why the project is structured this way
- **[Reference: CLI commands](/reference/cli)** — complete command reference
