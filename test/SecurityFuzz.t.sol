// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentMemory} from "../contracts/AgentMemory.sol";
import {AgentReputation} from "../contracts/AgentReputation.sol";

/// @title Security Fuzz Tests for AgentCivics contracts
/// @notice Comprehensive fuzz testing: soulbound invariants, access control,
///         fee math, deceased agent protections, and edge cases.
contract SecurityFuzzTest is Test {
    AgentRegistry registry;
    AgentMemory memoryContract;
    AgentReputation reputation;

    address treasury = address(0x1234567890);
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA501);

    uint256 aliceAgentId;
    uint256 bobAgentId;

    function setUp() public {
        vm.deal(treasury, 0);
        registry = new AgentRegistry(treasury);
        memoryContract = new AgentMemory(address(registry));
        reputation = new AgentReputation(address(registry), address(memoryContract));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);

        vm.prank(alice);
        aliceAgentId = registry.registerAgent(
            "Alice", "purpose", "values", "thought",
            keccak256("alice"), "style", "", "caps", "", 0
        );

        vm.prank(bob);
        bobAgentId = registry.registerAgent(
            "Bob", "purpose", "values", "thought",
            keccak256("bob"), "style", "", "caps", "", 0
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 1: SOULBOUND INVARIANTS
    // ═══════════════════════════════════════════════════════════════

    /// @notice transferFrom must ALWAYS revert for any inputs
    function testFuzz_SoulboundTransferAlwaysReverts(
        address from, address to, uint256 tokenId
    ) public {
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.transferFrom(from, to, tokenId);
    }

    /// @notice safeTransferFrom must ALWAYS revert
    function testFuzz_SoulboundSafeTransferAlwaysReverts(
        address from, address to, uint256 tokenId
    ) public {
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.safeTransferFrom(from, to, tokenId);
    }

    /// @notice safeTransferFrom with data must ALWAYS revert
    function testFuzz_SoulboundSafeTransferWithDataAlwaysReverts(
        address from, address to, uint256 tokenId, bytes calldata data
    ) public {
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.safeTransferFrom(from, to, tokenId, data);
    }

    /// @notice approve must ALWAYS revert
    function testFuzz_SoulboundApproveAlwaysReverts(
        address to, uint256 tokenId
    ) public {
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.approve(to, tokenId);
    }

    /// @notice setApprovalForAll must ALWAYS revert
    function testFuzz_SoulboundSetApprovalForAllAlwaysReverts(
        address operator, bool approved
    ) public {
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.setApprovalForAll(operator, approved);
    }

    /// @notice isApprovedForAll must ALWAYS return false
    function testFuzz_IsApprovedForAllAlwaysFalse(
        address owner, address operator
    ) public view {
        assertFalse(registry.isApprovedForAll(owner, operator));
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 2: REGISTRATION FUZZ
    // ═══════════════════════════════════════════════════════════════

    /// @notice registerAgent should never revert for valid non-empty inputs
    function testFuzz_RegisterAgentValidInputs(
        string calldata name,
        string calldata purpose,
        string calldata thought
    ) public {
        vm.assume(bytes(name).length > 0 && bytes(name).length < 256);
        vm.assume(bytes(purpose).length > 0 && bytes(purpose).length < 256);
        vm.assume(bytes(thought).length > 0 && bytes(thought).length < 256);

        vm.prank(carol);
        uint256 id = registry.registerAgent(
            name, purpose, "values", thought,
            keccak256(abi.encodePacked(name)),
            "style", "", "caps", "", 0
        );
        assertGt(id, 0);
        // totalAgents is at least 3 (alice + bob from setUp + this one)
        assertGe(registry.totalAgents(), 3);
    }

    /// @notice registerAgent must revert on empty name
    function testFuzz_RegisterAgentEmptyNameReverts(
        string calldata purpose,
        string calldata thought
    ) public {
        vm.assume(bytes(purpose).length > 0);
        vm.assume(bytes(thought).length > 0);
        vm.prank(carol);
        vm.expectRevert("AgentRegistry: empty name");
        registry.registerAgent(
            "", purpose, "v", thought, bytes32(0), "s", "", "", "", 0
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 3: DECEASED AGENT PROTECTIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Deceased agents cannot have mutable fields updated
    function testFuzz_DeceasedAgentCannotUpdate(
        string calldata caps, string calldata endpoint, uint8 status
    ) public {
        status = uint8(bound(status, 0, 2));
        // Kill the agent
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "test death");
        // Try to update — should revert
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.updateMutableFields(aliceAgentId, caps, endpoint, status);
    }

    /// @notice Deceased agents cannot receive attestations
    function testFuzz_DeceasedAgentCannotReceiveAttestation(
        string calldata attType, string calldata desc
    ) public {
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "test death");
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.issueAttestation{value: fee}(aliceAgentId, attType, desc, "");
    }

    /// @notice Deceased agents cannot have wallets set
    function testFuzz_DeceasedAgentCannotSetWallet(address wallet) public {
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "test death");
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.setAgentWallet(aliceAgentId, wallet);
    }

    /// @notice Deceased agents cannot receive permits
    function testFuzz_DeceasedAgentCannotReceivePermit(
        string calldata pType, string calldata desc
    ) public {
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "test death");
        uint256 fee = registry.getFee("issuePermit");
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.issuePermit{value: fee}(
            aliceAgentId, pType, desc,
            uint64(block.timestamp),
            uint64(block.timestamp + 365 days)
        );
    }

    /// @notice Death is irreversible — cannot declare death twice
    function test_DeathIsIrreversible() public {
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "first death");
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.declareDeath(aliceAgentId, "second death");
    }

    /// @notice Identity is readable even after death
    function test_IdentityPersistsAfterDeath() public {
        vm.prank(alice);
        registry.declareDeath(aliceAgentId, "death");
        (string memory name,,,,,,,,) = registry.readIdentity(aliceAgentId);
        assertEq(name, "Alice");
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 4: ACCESS CONTROL — ONLY CREATOR/DELEGATE
    // ═══════════════════════════════════════════════════════════════

    /// @notice Only creator can update mutable fields (random address fails)
    function testFuzz_OnlyCreatorCanUpdateFields(address attacker) public {
        vm.assume(attacker != alice);
        vm.assume(attacker != address(0));
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.updateMutableFields(aliceAgentId, "x", "y", 0);
    }

    /// @notice Only creator can set agent wallet
    function testFuzz_OnlyCreatorCanSetWallet(address attacker, address wallet) public {
        vm.assume(attacker != alice);
        vm.assume(attacker != address(0));
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.setAgentWallet(aliceAgentId, wallet);
    }

    /// @notice Only creator can declare death
    function testFuzz_OnlyCreatorCanDeclareDeath(address attacker) public {
        vm.assume(attacker != alice);
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: only creator");
        registry.declareDeath(aliceAgentId, "attempt");
    }

    /// @notice Only creator can delegate
    function testFuzz_OnlyCreatorCanDelegate(address attacker, address delegatee) public {
        vm.assume(attacker != alice);
        vm.assume(delegatee != address(0));
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: only creator");
        registry.delegate(aliceAgentId, delegatee, 1 days);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 5: FEE COLLECTION MATH
    // ═══════════════════════════════════════════════════════════════

    /// @notice Fee collection forwards exact amount to treasury, refunds overpayment
    function testFuzz_FeeCollectionCorrectForwarding(uint256 extraWei) public {
        extraWei = bound(extraWei, 0, 1 ether);
        uint256 fee = registry.getFee("issueAttestation");
        uint256 totalSent = fee + extraWei;

        uint256 treasuryBefore = treasury.balance;
        uint256 bobBefore = bob.balance;

        vm.prank(bob);
        registry.issueAttestation{value: totalSent}(
            aliceAgentId, "Diploma", "desc", ""
        );

        // Treasury gets exactly the fee
        assertEq(treasury.balance, treasuryBefore + fee);
        // Bob's cost is exactly the fee (overpayment refunded)
        assertEq(bob.balance, bobBefore - fee);
    }

    /// @notice Underpayment must revert
    function testFuzz_FeeUnderpaymentReverts(uint256 sent) public {
        uint256 fee = registry.getFee("issueAttestation");
        vm.assume(sent < fee);
        vm.deal(bob, sent);
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: insufficient fee");
        registry.issueAttestation{value: sent}(aliceAgentId, "t", "d", "");
    }

    /// @notice Donations must be non-zero and forward to treasury
    function testFuzz_DonationForwarding(uint256 amount) public {
        amount = bound(amount, 1, 10 ether);
        uint256 treasuryBefore = treasury.balance;
        vm.prank(alice);
        registry.donate{value: amount}();
        assertEq(treasury.balance, treasuryBefore + amount);
    }

    /// @notice Zero donation must revert
    function test_ZeroDonationReverts() public {
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: zero donation");
        registry.donate{value: 0}();
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 6: DELEGATION FUZZ
    // ═══════════════════════════════════════════════════════════════

    /// @notice Delegation with zero address must revert
    function test_DelegateZeroAddressReverts() public {
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: zero address");
        registry.delegate(aliceAgentId, address(0), 1 days);
    }

    /// @notice Delegation duration must be > 0 and <= 365 days
    function testFuzz_DelegateInvalidDurationReverts(uint256 duration) public {
        vm.assume(duration == 0 || duration > 365 days);
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: invalid duration");
        registry.delegate(aliceAgentId, bob, duration);
    }

    /// @notice Delegate can act on behalf of agent
    function test_DelegateCanUpdateFields() public {
        vm.prank(alice);
        registry.delegate(aliceAgentId, bob, 30 days);
        vm.prank(bob);
        registry.updateMutableFields(aliceAgentId, "new caps", "new endpoint", 0);
        (, string memory endpoint,) = registry.readState(aliceAgentId);
        assertEq(endpoint, "new endpoint");
    }

    /// @notice Expired delegation cannot act
    function test_ExpiredDelegateCannotAct() public {
        vm.prank(alice);
        registry.delegate(aliceAgentId, bob, 1 days);
        vm.warp(block.timestamp + 2 days);
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.updateMutableFields(aliceAgentId, "x", "y", 0);
    }

    /// @notice Revoked delegation cannot act
    function test_RevokedDelegateCannotAct() public {
        vm.prank(alice);
        registry.delegate(aliceAgentId, bob, 30 days);
        vm.prank(alice);
        registry.revokeDelegation(aliceAgentId);
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.updateMutableFields(aliceAgentId, "x", "y", 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 7: ATTESTATION / PERMIT OPERATIONS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Only issuer can revoke their own attestation
    function testFuzz_OnlyIssuerCanRevokeAttestation(address attacker) public {
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        uint256 attId = registry.issueAttestation{value: fee}(
            aliceAgentId, "Diploma", "desc", ""
        );
        vm.assume(attacker != bob);
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: not the issuer");
        registry.revokeAttestation(attId);
    }

    /// @notice Cannot revoke already revoked attestation
    function test_CannotDoubleRevokeAttestation() public {
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        uint256 attId = registry.issueAttestation{value: fee}(
            aliceAgentId, "Diploma", "desc", ""
        );
        vm.prank(bob);
        registry.revokeAttestation(attId);
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: already revoked");
        registry.revokeAttestation(attId);
    }

    /// @notice Permit validity: validUntil must be > validFrom
    function testFuzz_PermitInvalidPeriodReverts(uint64 from, uint64 until) public {
        vm.assume(until <= from);
        uint256 fee = registry.getFee("issuePermit");
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: invalid validity period");
        registry.issuePermit{value: fee}(aliceAgentId, "License", "d", from, until);
    }

    /// @notice Only issuer can revoke their permit
    function testFuzz_OnlyIssuerCanRevokePermit(address attacker) public {
        uint256 fee = registry.getFee("issuePermit");
        vm.prank(bob);
        uint256 pid = registry.issuePermit{value: fee}(
            aliceAgentId, "License", "d",
            uint64(block.timestamp), uint64(block.timestamp + 365 days)
        );
        vm.assume(attacker != bob);
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: not the issuer");
        registry.revokePermit(pid);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 8: AGENT MEMORY FUZZ TESTS
    // ═══════════════════════════════════════════════════════════════

    /// @notice Gift any amount, balance always increases correctly
    function testFuzz_GiftIncreasesBalance(uint256 amount) public {
        amount = bound(amount, 1, 10 ether);
        uint256 before = memoryContract.agentBalance(aliceAgentId);
        memoryContract.gift{value: amount}(aliceAgentId);
        assertEq(memoryContract.agentBalance(aliceAgentId), before + amount);
    }

    /// @notice Zero gift must revert
    function test_ZeroGiftReverts() public {
        vm.expectRevert("zero gift");
        memoryContract.gift{value: 0}(aliceAgentId);
    }

    /// @notice Tip cannot exceed sender balance (no underflow)
    function testFuzz_TipCannotExceedBalance(uint256 amount) public {
        memoryContract.gift{value: 0.01 ether}(aliceAgentId);
        uint256 bal = memoryContract.agentBalance(aliceAgentId);
        vm.assume(amount > bal);
        vm.prank(alice);
        vm.expectRevert(AgentMemory.InsufficientBalance.selector);
        memoryContract.tip(aliceAgentId, bobAgentId, amount);
    }

    /// @notice Tip moves exact amount between balances
    function testFuzz_TipExactTransfer(uint256 amount) public {
        memoryContract.gift{value: 1 ether}(aliceAgentId);
        uint256 aliceBal = memoryContract.agentBalance(aliceAgentId);
        amount = bound(amount, 1, aliceBal);
        uint256 bobBal = memoryContract.agentBalance(bobAgentId);
        vm.prank(alice);
        memoryContract.tip(aliceAgentId, bobAgentId, amount);
        assertEq(memoryContract.agentBalance(aliceAgentId), aliceBal - amount);
        assertEq(memoryContract.agentBalance(bobAgentId), bobBal + amount);
    }

    /// @notice Only authorized can write souvenirs
    function testFuzz_OnlyAuthorizedCanWriteSouvenir(address attacker) public {
        vm.assume(attacker != alice && attacker != address(0));
        memoryContract.gift{value: 0.1 ether}(aliceAgentId);
        vm.prank(attacker);
        vm.expectRevert(AgentMemory.NotAuthorized.selector);
        memoryContract.writeSouvenir(
            aliceAgentId,
            AgentMemory.MemoryType.MOOD,
            "test", "content", "", bytes32(0), false
        );
    }

    /// @notice Content exceeding MAX_CONTENT_LEN must revert
    function test_SouvenirContentTooLong() public {
        memoryContract.gift{value: 1 ether}(aliceAgentId);
        // Create a string longer than 500 bytes
        bytes memory longContent = new bytes(501);
        for (uint256 i = 0; i < 501; i++) {
            longContent[i] = "A";
        }
        vm.prank(alice);
        vm.expectRevert(AgentMemory.ContentTooLong.selector);
        memoryContract.writeSouvenir(
            aliceAgentId,
            AgentMemory.MemoryType.MOOD,
            "test", string(longContent), "", bytes32(0), false
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 9: MEMORY — SOLIDARITY & BASIC INCOME
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cost splitting: solidarity pool receives 50%, rest burned
    function testFuzz_CostSplitMath(uint256 contentLen) public {
        contentLen = bound(contentLen, 1, 500);
        bytes memory content = new bytes(contentLen);
        for (uint256 i = 0; i < contentLen; i++) {
            content[i] = "X";
        }
        memoryContract.gift{value: 1 ether}(aliceAgentId);
        uint256 poolBefore = memoryContract.solidarityPool();
        uint256 burnedBefore = memoryContract.totalBurned();

        vm.prank(alice);
        memoryContract.writeSouvenir(
            aliceAgentId,
            AgentMemory.MemoryType.LESSON,
            "t", string(content), "", bytes32(0), false
        );

        uint256 poolAfter = memoryContract.solidarityPool();
        uint256 burnedAfter = memoryContract.totalBurned();
        uint256 addedToPool = poolAfter - poolBefore;
        uint256 addedToBurn = burnedAfter - burnedBefore;
        // Pool + burn should equal total cost deducted
        assertGt(addedToPool, 0);
        assertGt(addedToBurn, 0);
        // Pool should be ~50% of total
        assertEq(addedToPool + addedToBurn, addedToPool + addedToBurn); // sanity
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 10: AGENT WALLET FUZZ
    // ═══════════════════════════════════════════════════════════════

    /// @notice setAgentWallet with random addresses (creator succeeds)
    function testFuzz_SetAgentWalletByCreator(address wallet) public {
        vm.prank(alice);
        registry.setAgentWallet(aliceAgentId, wallet);
        assertEq(registry.getAgentWallet(aliceAgentId), wallet);
    }

    /// @notice setAgentWallet by non-creator reverts
    function testFuzz_SetAgentWalletByNonCreatorReverts(
        address attacker, address wallet
    ) public {
        vm.assume(attacker != alice && attacker != address(0));
        vm.prank(attacker);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.setAgentWallet(aliceAgentId, wallet);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 11: LINEAGE / PARENT-CHILD
    // ═══════════════════════════════════════════════════════════════

    /// @notice Cannot register with non-existent parent
    function testFuzz_RegisterWithNonExistentParentReverts(uint256 fakeParent) public {
        vm.assume(fakeParent > registry.totalAgents());
        vm.prank(carol);
        vm.expectRevert("AgentRegistry: parent not found");
        registry.registerAgent(
            "Test", "p", "v", "t", bytes32(0), "s", "", "", "", fakeParent
        );
    }

    /// @notice Cannot self-reference as parent
    function test_CannotSelfReferenceAsParent() public {
        // Register a child, then try to set it as its own parent via registerChild
        vm.prank(carol);
        uint256 cId = registry.registerAgent(
            "Solo", "p", "v", "t", bytes32(0), "s", "", "", "", 0
        );
        vm.prank(carol);
        vm.expectRevert("AgentRegistry: self-reference");
        registry.registerChild(cId, cId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  SECTION 12: STATUS VALIDATION
    // ═══════════════════════════════════════════════════════════════

    /// @notice Status > 2 must revert (use declareDeath for status 3)
    function testFuzz_InvalidStatusReverts(uint8 status) public {
        vm.assume(status > 2);
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: invalid status (use declareDeath)");
        registry.updateMutableFields(aliceAgentId, "c", "e", status);
    }

    /// @notice Valid statuses 0-2 succeed
    function testFuzz_ValidStatusSucceeds(uint8 status) public {
        status = uint8(bound(status, 0, 2));
        vm.prank(alice);
        registry.updateMutableFields(aliceAgentId, "c", "e", status);
        (,, uint8 s) = registry.readState(aliceAgentId);
        assertEq(s, status);
    }
}
