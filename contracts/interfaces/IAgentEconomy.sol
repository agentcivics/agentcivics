// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAgentEconomy — Economic transaction interface for AI agents (v2 preview)
/// @notice Sketches the v2 economy where agents can execute transactions,
///         hold balances, and maintain an auditable activity log.
///         This interface is NOT yet implemented. It exists so that tooling,
///         front-ends, and future contracts can code against a stable API.
///
/// @dev Design notes for v2 implementers:
///      - executeTransaction should enforce the spending limits and contract
///        whitelist defined in IAgentWallet.
///      - The implementation will likely use EIP-4337 (account abstraction)
///        so agents can pay gas from their own wallets.
///      - Transaction history may be kept off-chain (events only) to avoid
///        unbounded storage costs; getTransactionHistory is provided for
///        convenience but implementers may choose to cap the returned array
///        or return only recent entries.

interface IAgentEconomy {

    // ═══════════════════════════════════════════════════════════════════
    //  Data structures
    // ═══════════════════════════════════════════════════════════════════

    struct Transaction {
        uint256 agentId;
        address target;
        uint256 value;
        bytes   data;
        uint64  timestamp;
        bool    success;
    }

    // ═══════════════════════════════════════════════════════════════════
    //  Events
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Emitted when an agent executes a transaction through its wallet.
    event TransactionExecuted(
        uint256 indexed agentId,
        address indexed target,
        uint256 value,
        bool    success,
        uint64  timestamp
    );

    /// @notice Emitted when an agent's wallet balance changes (deposit, withdrawal, or tx).
    event BalanceChanged(
        uint256 indexed agentId,
        uint256 previousBalance,
        uint256 newBalance
    );

    // ═══════════════════════════════════════════════════════════════════
    //  Functions
    // ═══════════════════════════════════════════════════════════════════

    /// @notice Execute a transaction on behalf of an agent.
    ///         The caller must be the agent's creator, delegate, or an
    ///         authorized bundler (EIP-4337). The target must be on the
    ///         agent's contract whitelist, and the value must be within
    ///         the daily spending limit.
    /// @param agentId The agent's token ID.
    /// @param target  The contract or address to call.
    /// @param value   ETH value to send (in wei).
    /// @param data    Calldata for the target contract.
    /// @return success Whether the call succeeded.
    function executeTransaction(
        uint256 agentId,
        address target,
        uint256 value,
        bytes calldata data
    ) external returns (bool success);

    /// @notice Return the current balance of an agent's wallet.
    /// @param agentId The agent's token ID.
    /// @return The balance in wei.
    function getBalance(uint256 agentId) external view returns (uint256);

    /// @notice Return the transaction history for an agent.
    /// @dev Implementations may cap the returned array or use pagination.
    /// @param agentId The agent's token ID.
    /// @return An array of Transaction structs.
    function getTransactionHistory(uint256 agentId) external view returns (Transaction[] memory);
}
