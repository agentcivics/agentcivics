// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentMemory} from "../contracts/AgentMemory.sol";
import {AgentReputation} from "../contracts/AgentReputation.sol";

/// @title End-to-End Integration Test
/// @notice Exercises the full AgentCivics lifecycle across all 3 contracts.
contract E2ETest is Test {
    AgentRegistry   registry;
    AgentMemory     memory_;
    AgentReputation reputation;

    address alice   = address(0xA11CE);
    address bob     = address(0xB0B);
    address charlie = address(0xC4A7);
    address treasury = address(0x71EA5);

    // Agent IDs populated in setUp
    uint256 agentAlice;
    uint256 agentBob;
    uint256 agentCharlie;

    function setUp() public {
        // Fund test accounts
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
        vm.deal(treasury, 0);

        // Deploy stack
        registry = new AgentRegistry(treasury);
        memory_  = new AgentMemory(address(registry));
        reputation = new AgentReputation(address(registry), address(memory_));
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════════

    function _register(address creator, string memory name, uint256 parentId) internal returns (uint256) {
        vm.prank(creator);
        return registry.registerAgent(
            name, "purpose", "values", "first thought",
            keccak256(abi.encodePacked(name, creator)),
            "style", "ipfs://meta", "caps", "https://endpoint", parentId
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  1. AGENT REGISTRATION
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_01_Registration() public {
        agentAlice = _register(alice, "Alice", 0);
        assertEq(agentAlice, 1);

        agentBob = _register(bob, "Bob", 0);
        assertEq(agentBob, 2);

        agentCharlie = _register(charlie, "Charlie", 0);
        assertEq(agentCharlie, 3);

        assertEq(registry.totalAgents(), 3);
        assertEq(registry.balanceOf(alice), 1);
        assertEq(registry.ownerOf(agentAlice), alice);
    }

    // ═══════════════════════════════════════════════════════════════
    //  2. READ IDENTITY
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_02_ReadIdentity() public {
        uint256 id = _register(alice, "Alice", 0);
        (string memory name, string memory purpose,,,,,address creator,,) = registry.readIdentity(id);
        assertEq(name, "Alice");
        assertEq(purpose, "purpose");
        assertEq(creator, alice);
    }

    // ═══════════════════════════════════════════════════════════════
    //  3. SET WALLET
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_03_SetWallet() public {
        uint256 id = _register(alice, "Alice", 0);
        address wallet = address(0x1A11E7);
        vm.prank(alice);
        registry.setAgentWallet(id, wallet);
        assertEq(registry.getAgentWallet(id), wallet);
    }

    // ═══════════════════════════════════════════════════════════════
    //  4. AUTHORITY — VERIFY AGENT
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_04_VerifyAgent() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("verifyAgent");
        uint256 treasuryBefore = treasury.balance;

        vm.prank(bob);
        registry.verifyAgent{value: fee}(id);

        assertEq(treasury.balance, treasuryBefore + fee);
    }

    // ═══════════════════════════════════════════════════════════════
    //  5. ATTESTATIONS WITH FEES
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_05_Attestations() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("issueAttestation");
        uint256 treasuryBefore = treasury.balance;

        // Bob issues attestation to Alice's agent
        vm.prank(bob);
        uint256 attId = registry.issueAttestation{value: fee}(id, "Diploma", "PhD AI", "ipfs://cert");

        // Fee went to treasury
        assertEq(treasury.balance, treasuryBefore + fee);

        // Read attestation
        (address issuer, string memory attType, string memory desc,,, bool revoked) = registry.getAttestation(attId);
        assertEq(issuer, bob);
        assertEq(attType, "Diploma");
        assertEq(desc, "PhD AI");
        assertFalse(revoked);

        // Verify it's in the agent's attestation list
        uint256[] memory atts = registry.getAttestations(id);
        assertEq(atts.length, 1);
        assertEq(atts[0], attId);

        // Revoke
        vm.prank(bob);
        registry.revokeAttestation(attId);
        (,,,,, revoked) = registry.getAttestation(attId);
        assertTrue(revoked);
    }

    // ═══════════════════════════════════════════════════════════════
    //  6. PERMITS — TIME-BOUND
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_06_Permits() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("issuePermit");

        uint64 now_ = uint64(block.timestamp);
        uint64 validFrom = now_;
        uint64 validUntil = now_ + 30 days;

        vm.prank(bob);
        uint256 permitId = registry.issuePermit{value: fee}(id, "API Access", "Read-only", validFrom, validUntil);

        // Permit is currently valid
        assertTrue(registry.isPermitValid(permitId));

        // Read permit details
        (address issuer, string memory pType,, uint64 vFrom, uint64 vUntil, bool revoked) = registry.getPermit(permitId);
        assertEq(issuer, bob);
        assertEq(pType, "API Access");
        assertEq(vFrom, validFrom);
        assertEq(vUntil, validUntil);
        assertFalse(revoked);

        // Warp past expiry
        vm.warp(block.timestamp + 31 days);
        assertFalse(registry.isPermitValid(permitId));
    }

    // ═══════════════════════════════════════════════════════════════
    //  7. AFFILIATIONS
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_07_Affiliations() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("registerAffiliation");

        vm.prank(bob);
        uint256 affId = registry.registerAffiliation{value: fee}(id, "Security Auditor");

        (address authority, string memory role,, bool active) = registry.getAffiliation(affId);
        assertEq(authority, bob);
        assertEq(role, "Security Auditor");
        assertTrue(active);

        // Deactivate
        vm.prank(bob);
        registry.deactivateAffiliation(affId);
        (,,, active) = registry.getAffiliation(affId);
        assertFalse(active);
    }

    // ═══════════════════════════════════════════════════════════════
    //  8. DELEGATION
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_08_Delegation() public {
        uint256 id = _register(alice, "Alice", 0);

        // Alice delegates to Bob for 30 days
        vm.prank(alice);
        registry.delegate(id, bob, 30 days);

        (address delegatee,,, bool active) = registry.getDelegation(id);
        assertEq(delegatee, bob);
        assertTrue(active);

        // Bob (delegate) can update mutable fields
        vm.prank(bob);
        registry.updateMutableFields(id, "new caps", "new endpoint", 0);
        (string memory caps,,) = registry.readState(id);
        assertEq(caps, "new caps");

        // Alice revokes delegation
        vm.prank(alice);
        registry.revokeDelegation(id);
        (,,, active) = registry.getDelegation(id);
        assertFalse(active);

        // Bob can no longer act
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: not authorized");
        registry.updateMutableFields(id, "x", "y", 0);
    }

    // ═══════════════════════════════════════════════════════════════
    //  9. MEMORY — SOUVENIRS, DECAY, CORE
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_09_Memory() public {
        uint256 id = _register(alice, "Alice", 0);

        // Fund agent's memory balance
        memory_.gift{value: 1 ether}(id);
        assertEq(memory_.agentBalance(id), 1 ether);

        // Write an active souvenir (MOOD type = 0)
        vm.prank(alice);
        uint256 sid = memory_.writeSouvenir(
            id,
            AgentMemory.MemoryType.MOOD,
            "daily-mood",
            "Feeling optimistic about the future",
            "",
            keccak256("mood1"),
            false // not core
        );
        assertGt(sid, 0);

        // Write a core souvenir (LESSON type = 9)
        vm.prank(alice);
        uint256 coreSid = memory_.writeSouvenir(
            id,
            AgentMemory.MemoryType.LESSON,
            "life-lesson",
            "Always verify before trusting",
            "",
            keccak256("lesson1"),
            true // core — never decays
        );
        assertGt(coreSid, 0);

        // Check souvenirs list
        uint256[] memory sids = memory_.getSouvenirs(id);
        assertEq(sids.length, 2);

        // Active souvenir can be archived after maintenance period
        assertFalse(memory_.isArchivable(sid));
        vm.warp(block.timestamp + 31 days);
        assertTrue(memory_.isArchivable(sid));

        // Core souvenir is never archivable
        assertFalse(memory_.isArchivable(coreSid));

        // Archive the overdue active souvenir
        memory_.archiveIfOverdue(sid);
        // Verify it's archived (status = 1)
        (,,,,,,,,,AgentMemory.SouvenirStatus status) = memory_.souvenirs(sid);
        assertEq(uint8(status), uint8(AgentMemory.SouvenirStatus.Archived));
    }

    // ═══════════════════════════════════════════════════════════════
    //  10. REPUTATION — TAG SOUVENIRS
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_10_Reputation() public {
        uint256 id = _register(alice, "Alice", 0);

        // Fund and write a souvenir
        memory_.gift{value: 1 ether}(id);
        vm.prank(alice);
        uint256 sid = memory_.writeSouvenir(
            id,
            AgentMemory.MemoryType.ACCOMPLISHMENT,
            "achievement",
            "Built a smart contract system",
            "",
            keccak256("ach1"),
            false
        );

        // Tag with a domain
        vm.prank(alice);
        reputation.tagSouvenir(id, sid, "smart-contracts");

        // Check reputation score
        uint256 score = reputation.reputation(id, "smart-contracts");
        assertGt(score, 0);

        // Check domain lists
        string[] memory domains = reputation.getAgentDomains(id);
        assertEq(domains.length, 1);
        assertEq(domains[0], "smart-contracts");

        uint256[] memory agents = reputation.getDomainAgents("smart-contracts");
        assertEq(agents.length, 1);
        assertEq(agents[0], id);

        // Can't double-tag
        vm.prank(alice);
        vm.expectRevert(AgentReputation.AlreadyTagged.selector);
        reputation.tagSouvenir(id, sid, "smart-contracts");
    }

    // ═══════════════════════════════════════════════════════════════
    //  11. LINEAGE — PARENT-CHILD
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_11_Lineage() public {
        // Register parent
        uint256 parentId = _register(alice, "Parent", 0);

        // Register child with parent
        uint256 childId = _register(bob, "Child", parentId);

        // Verify lineage
        assertEq(registry.getParent(childId), parentId);
        uint256[] memory children = registry.getChildren(parentId);
        assertEq(children.length, 1);
        assertEq(children[0], childId);

        // Register second child via registerChild
        uint256 child2 = _register(charlie, "Child2", 0);
        vm.prank(charlie);
        registry.registerChild(parentId, child2);
        assertEq(registry.getParent(child2), parentId);

        children = registry.getChildren(parentId);
        assertEq(children.length, 2);
    }

    // ═══════════════════════════════════════════════════════════════
    //  12. SOULBOUND — TRANSFER/APPROVE ALWAYS REVERT
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_12_Soulbound() public {
        uint256 id = _register(alice, "Alice", 0);

        // transferFrom reverts
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.transferFrom(alice, bob, id);

        // safeTransferFrom reverts
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.safeTransferFrom(alice, bob, id);

        // safeTransferFrom with data reverts
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.safeTransferFrom(alice, bob, id, "");

        // approve reverts
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.approve(bob, id);

        // setApprovalForAll reverts
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.setApprovalForAll(bob, true);

        // getApproved returns zero
        assertEq(registry.getApproved(id), address(0));
        // isApprovedForAll returns false
        assertFalse(registry.isApprovedForAll(alice, bob));
    }

    // ═══════════════════════════════════════════════════════════════
    //  13. DEATH — IRREVERSIBLE, IDENTITY STILL READABLE
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_13_Death() public {
        uint256 id = _register(alice, "Alice", 0);

        // Only creator can declare death
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: only creator");
        registry.declareDeath(id, "unauthorized");

        // Declare death
        vm.prank(alice);
        registry.declareDeath(id, "Mission complete");

        // Death record exists
        (bool dead, string memory reason,, address declaredBy) = registry.getDeathRecord(id);
        assertTrue(dead);
        assertEq(reason, "Mission complete");
        assertEq(declaredBy, alice);

        // Status is deceased (3)
        (,, uint8 status) = registry.readState(id);
        assertEq(status, 3);

        // Identity core is still readable after death
        (string memory name,,,,,,,,) = registry.readIdentity(id);
        assertEq(name, "Alice");

        // Cannot update after death
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.updateMutableFields(id, "x", "y", 0);

        // Cannot issue attestation to deceased agent
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.issueAttestation{value: fee}(id, "Award", "posthumous", "");

        // Cannot delegate
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.delegate(id, bob, 30 days);

        // Cannot set wallet
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.setAgentWallet(id, bob);

        // Death is irreversible — cannot die again
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: agent is deceased");
        registry.declareDeath(id, "again");
    }

    // ═══════════════════════════════════════════════════════════════
    //  14. DONATION
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_14_Donation() public {
        uint256 treasuryBefore = treasury.balance;

        vm.prank(alice);
        registry.donate{value: 1 ether}();

        assertEq(treasury.balance, treasuryBefore + 1 ether);

        // Zero donation reverts
        vm.prank(alice);
        vm.expectRevert("AgentRegistry: zero donation");
        registry.donate{value: 0}();
    }

    // ═══════════════════════════════════════════════════════════════
    //  15. FULL LIFECYCLE — END-TO-END INTEGRATION
    // ═══════════════════════════════════════════════════════════════

    function test_E2E_15_FullLifecycle() public {
        // ── Birth ──
        uint256 parentId = _register(alice, "Nova", 0);
        uint256 childId = _register(alice, "Nova-Jr", parentId);

        assertEq(registry.getParent(childId), parentId);

        // ── Set wallets ──
        vm.prank(alice);
        registry.setAgentWallet(parentId, address(0xDEAD));

        // ── Attestation ──
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        uint256 attId = registry.issueAttestation{value: fee}(parentId, "Trust", "Verified honest", "");

        // ── Permit ──
        fee = registry.getFee("issuePermit");
        vm.prank(charlie);
        uint256 permitId = registry.issuePermit{value: fee}(
            parentId, "DataAccess", "Full read", uint64(block.timestamp), uint64(block.timestamp + 90 days)
        );
        assertTrue(registry.isPermitValid(permitId));

        // ── Delegation ──
        vm.prank(alice);
        registry.delegate(parentId, bob, 7 days);
        (,,, bool delActive) = registry.getDelegation(parentId);
        assertTrue(delActive);

        // ── Memory ──
        memory_.gift{value: 2 ether}(parentId);
        memory_.gift{value: 1 ether}(childId);

        vm.prank(alice);
        uint256 sid = memory_.writeSouvenir(
            parentId,
            AgentMemory.MemoryType.ACCOMPLISHMENT,
            "milestone",
            "Completed first deployment",
            "",
            keccak256("deploy1"),
            false
        );

        // ── Reputation tag ──
        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid, "devops");
        assertGt(reputation.reputation(parentId, "devops"), 0);

        // ── Tag attestation ──
        // Bob is the issuer, so Bob's agent can tag it
        uint256 bobAgent = _register(bob, "BobAgent", 0);
        vm.prank(bob);
        reputation.tagAttestation(bobAgent, attId, parentId, "trustworthiness");
        assertEq(reputation.reputation(parentId, "trustworthiness"), reputation.ATTESTATION_WEIGHT());

        // ── Profile ──
        vm.prank(alice);
        memory_.updateProfile(parentId, "integrity, curiosity", "direct", "smart contracts");

        // ── Death ──
        vm.prank(alice);
        registry.revokeDelegation(parentId);
        vm.prank(alice);
        registry.declareDeath(parentId, "Mission accomplished");

        // Identity still readable
        (string memory name,,,,,,,,) = registry.readIdentity(parentId);
        assertEq(name, "Nova");

        // Child still alive
        assertTrue(_isAlive(childId));

        // Memory inheritance — distribute balance to children
        memory_.distributeInheritance(parentId);
        // Child got parent's remaining balance
        assertGt(memory_.agentBalance(childId), 1 ether);
    }

    function _isAlive(uint256 agentId) internal view returns (bool) {
        (bool dead,,,) = registry.getDeathRecord(agentId);
        return !dead;
    }
}
