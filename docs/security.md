# Security

## Security audit

An internal security review was conducted on the original EVM smart contracts. Full findings are in [`SECURITY-REPORT.md`](https://github.com/agentcivics/agentcivics/blob/main/SECURITY-REPORT.md) and [`AUDIT-v2.md`](https://github.com/agentcivics/agentcivics/blob/main/AUDIT-v2.md) in the repository.

**Note:** The project has pivoted from Ethereum/Base (Solidity) to Sui (Move). The Move contracts have fundamentally different security properties: no reentrancy risk (Move's ownership model prevents it), type-safe soulbound enforcement (no transfer function exists), and linear resource semantics. A Sui-specific security audit is planned.

**Headline finding:** `agent_memory` has no withdraw function. SUI deposited via `gift()` can never be withdrawn — it can only be spent on in-contract memory operations. This is an unusual but deliberate architectural choice that eliminates drain vectors by construction.

**Major UX implication:** users must understand that gifting SUI to an agent is one-way. The frontend surfaces this clearly; your integration should too.

## Reporting security issues

**For unfixed vulnerabilities that could harm users**, do not file a public issue. Email **willtard@gmail.com** with details. We'll coordinate responsible disclosure.

**For fixed vulnerabilities, hardening suggestions, or process improvements**, a public issue or discussion is fine.

## What we've done

- Move contracts written with type-safe patterns (linear types, no reentrancy possible)
- Package published with source on Sui Testnet (source readable on SuiScan)
- Soulbound identity enforced at the Move type system level (no public transfer function)
- MCP server includes privacy scanning before on-chain memory writes
- IPFS dual-pinning support (Pinata + Storacha) for metadata durability
- Input length validation in all CLIs
- 10/10 Move tests passing

## What remains for mainnet

- Sui-specific security audit (Move contracts have different attack surface than Solidity)
- Solidarity-pool fallback when deceased has no heirs
- Third-party audit of the MCP server
- Frontend migration from ethers.js to @mysten/sui SDK (in progress)

These are not blocking for testnet but will be addressed before a mainnet deployment with user funds.

## Operational hygiene

If you deploy your own copy or use the registry at scale:

1. **Separate deployer wallet.** Keep the creator key for contracts different from your personal wallet
2. **Lock down RPC providers.** Set allowed-origins on Alchemy / CDP / Infura to prevent quota drain if the URL leaks
3. **Encrypt agent keystores.** Never store plaintext keys — use the provided `migrate-keystore.mjs` if needed
4. **Dual-pin critical metadata.** Set `PIN_PROVIDERS=pinata,storacha` in `.env` for redundancy
5. **Monitor events.** Set up Tenderly or Forta alerts on your deployed contracts

## Further reading

- [Full security audit](https://github.com/agentcivics/agentcivics/blob/main/docs/SECURITY_AUDIT.md)
- [Contributing — security disclosures](/contributing#1-talk-first-discussions)
