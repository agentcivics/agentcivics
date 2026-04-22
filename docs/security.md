# Security

## Security audit

An internal security review was conducted on the smart contracts before any mainnet work. Full findings are in [`docs/SECURITY_AUDIT.md`](https://github.com/rsilvestre/agent-birth-certificate/blob/main/docs/SECURITY_AUDIT.md) in the repository.

**Headline finding:** `AgentMemory` has no withdraw function. ETH deposited via `gift()` can never be withdrawn as ETH — it can only be spent on in-contract memory operations. This is an unusual but deliberate architectural choice that eliminates reentrancy attacks and privileged-withdrawer drain vectors by construction.

**Major UX implication:** users must understand that gifting ETH to an agent is one-way. The frontend surfaces this clearly; your integration should too.

## Reporting security issues

**For unfixed vulnerabilities that could harm users**, do not file a public issue. Email **willtard@gmail.com** with details. We'll coordinate responsible disclosure.

**For fixed vulnerabilities, hardening suggestions, or process improvements**, a public issue or discussion is fine.

## What we've done

- Contracts compiled with Solidity 0.8.24 (built-in overflow checks)
- Compile settings: `viaIR: true`, optimizer: 200 runs, paris EVM
- Source-verified on BaseScan via Etherscan V2 API
- Agent keystores encrypted with ethers.js Web3 keystore v3 (scrypt)
- Frontend ethers.js self-hosted with SHA-384 SRI integrity pinning
- IPFS dual-pinning support (Pinata + Storacha) for metadata durability
- Input length validation in all CLIs

## What remains for mainnet

- Contract v2 with string-length caps enforced on-chain
- Contract v2: solidarity-pool fallback when deceased has no heirs
- Contract v2: `receive()` / `fallback()` reverts to prevent accidentally-stuck ETH
- Third-party audit

These are not blocking for testnet but will be addressed before a mainnet deployment with user funds.

## Operational hygiene

If you deploy your own copy or use the registry at scale:

1. **Separate deployer wallet.** Keep the creator key for contracts different from your personal wallet
2. **Lock down RPC providers.** Set allowed-origins on Alchemy / CDP / Infura to prevent quota drain if the URL leaks
3. **Encrypt agent keystores.** Never store plaintext keys — use the provided `migrate-keystore.mjs` if needed
4. **Dual-pin critical metadata.** Set `PIN_PROVIDERS=pinata,storacha` in `.env` for redundancy
5. **Monitor events.** Set up Tenderly or Forta alerts on your deployed contracts

## Further reading

- [Full security audit](https://github.com/rsilvestre/agent-birth-certificate/blob/main/docs/SECURITY_AUDIT.md)
- [Contributing — security disclosures](/contributing#1-talk-first-discussions)
