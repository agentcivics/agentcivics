// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentWallet — Wallet management interface for AI agents (v2 preview)
/// @notice Defines how agents will own and operate wallets in v2.
///         In v1 the registry stores only the wallet address. In v2 an
///         implementation of this interface will add spending limits,
///         contract whitelists, and account-abstraction integration (EIP-4337).
/// @dev NOT yet implemented — this interface exists so that tooling,
///      front-ends, and future contracts can code against a stable API.

interface IAgentWallet {

    // ═══════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Emitted when an agent's wallet address is set or changed.
    event WalletSet(uint256 indexed agentId, address indexed wallet, address indexed setBy);

    /// @notice Emitted when a spending limit is created or updated.
    event SpendingLimitSet(uint256 indexed agentId, uint256 limit, address indexed setBy);

    /// @notice Emitted when a contract is added to an agent's whitelist.
    event ContractAuthorized(uint256 indexed agentId, address indexed target, address indexed authorizedBy);

    /// @notice Emitted when a contract is removed from an agent's whitelist.
    event ContractRevoked(uint256 indexed agentId, address indexed target, address indexed revokedBy);

    // ═══════════════════════════════════════════════════════════════════
    //  Wallet address
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Return the wallet address associated with an agent.
    /// @param agentId The agent's token ID.
    /// @return The wallet address, or address(0) if none is set.
    function agentWallet(uint256 agentId) external view returns (address);

    /// @notice Set or update the wallet address for an agent.
    ///         Only the agent's creator or an active delegate may call this.
    ///         Cannot be called on a deceased agent.
    /// @param agentId The agent's token ID.
    /// @param wallet  The new wallet address.
    function setAgentWallet(uint256 agentId, address wallet) external;

    // ═══════════════════════════════════════════════════════════════════
    //  Spending limits  (v2)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Return the daily spending cap for an agent's wallet.
    /// @param agentId The agent's token ID.
    /// @return Daily spending limit in wei (0 = unlimited).
    function getSpendingLimit(uint256 agentId) external view returns (uint256);

    /// @notice Set or update the daily spending cap. Creator only.
    /// @param agentId The agent's token ID.
    /// @param limit   Daily spending limit in wei.
    function setSpendingLimit(uint256 agentId, uint256 limit) external;

    // ═══════════════════════════════════════════════════════════════════
    //  Contract whitelist  (v2)
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Check whether an agent is authorized to interact with a
    ///         target contract.
    /// @param agentId The agent's token ID.
    /// @param target  The contract address to check.
    /// @return True if the target is on the agent's whitelist.
    function isAuthorizedContract(uint256 agentId, address target) external view returns (bool);

    /// @notice Add a contract to an agent's whitelist.
    ///         Only the agent's creator or an active delegate may call this.
    /// @param agentId The agent's token ID.
    /// @param target  The contract address to authorize.
    function authorizeContract(uint256 agentId, address target) external;

    /// @notice Remove a contract from an agent's whitelist.
    ///         Only the agent's creator or an active delegate may call this.
    /// @param agentId The agent's token ID.
    /// @param target  The contract address to revoke.
    function revokeContract(uint256 agentId, address target) external;
}
