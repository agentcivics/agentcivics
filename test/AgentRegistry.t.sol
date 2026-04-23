// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address treasury = address(0x71EA5);

    function setUp() public {
        registry = new AgentRegistry(treasury);
        // Fund test accounts so they can pay fees
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _register(address creator, string memory name, uint256 parentId) internal returns (uint256) {
        vm.prank(creator);
        return registry.registerAgent(
            name, "purpose", "values", "first thought",
            keccak256(abi.encodePacked(name)),
            "style", "", "caps", "", parentId
        );
    }

    function test_RegisterAgent() public {
        uint256 id = _register(alice, "Alice", 0);
        assertEq(id, 1);
        assertEq(registry.totalAgents(), 1);
        (string memory name,,,,,, address creator,, ) = registry.readIdentity(id);
        assertEq(name, "Alice");
        assertEq(creator, alice);
    }

    function test_ParentChildLineage() public {
        uint256 parentId = _register(alice, "Parent", 0);
        uint256 childId = _register(bob, "Child", parentId);
        assertEq(registry.getParent(childId), parentId);
        uint256[] memory kids = registry.getChildren(parentId);
        assertEq(kids.length, 1);
        assertEq(kids[0], childId);
    }

    function test_DeclareDeath_OnlyCreator() public {
        uint256 id = _register(alice, "Alice", 0);
        vm.expectRevert();
        vm.prank(bob);
        registry.declareDeath(id, "bob tries");

        vm.prank(alice);
        registry.declareDeath(id, "done");
        (bool dead, string memory reason,,) = registry.getDeathRecord(id);
        assertTrue(dead);
        assertEq(reason, "done");
    }

    function test_Soulbound_CannotTransfer() public {
        uint256 id = _register(alice, "Alice", 0);
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.transferFrom(alice, bob, id);
    }

    function test_Soulbound_CannotApprove() public {
        uint256 id = _register(alice, "Alice", 0);
        vm.prank(alice);
        vm.expectRevert("AgentCivics: identity tokens are soulbound and cannot be transferred");
        registry.approve(bob, id);
    }

    function test_Treasury_FeeCollection() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("issueAttestation");
        assertEq(fee, 0.001 ether);
        uint256 treasuryBefore = treasury.balance;
        vm.prank(bob);
        registry.issueAttestation{value: fee}(id, "Diploma", "CS degree", "");
        assertEq(treasury.balance, treasuryBefore + fee);
    }

    function test_Treasury_Donate() public {
        uint256 treasuryBefore = treasury.balance;
        vm.prank(alice);
        registry.donate{value: 0.5 ether}();
        assertEq(treasury.balance, treasuryBefore + 0.5 ether);
    }

    function test_IssueAndRevokeAttestation() public {
        uint256 id = _register(alice, "Alice", 0);
        uint256 fee = registry.getFee("issueAttestation");
        vm.prank(bob);
        uint256 attId = registry.issueAttestation{value: fee}(id, "Diploma", "CS degree", "");
        (address issuer, string memory t,,,, bool revoked) = registry.getAttestation(attId);
        assertEq(issuer, bob);
        assertEq(t, "Diploma");
        assertFalse(revoked);

        vm.prank(bob);
        registry.revokeAttestation(attId);
        (,,,,, revoked) = registry.getAttestation(attId);
        assertTrue(revoked);
    }

    function test_GrantAndRevokeDelegation() public {
        uint256 id = _register(alice, "Alice", 0);
        vm.prank(alice);
        registry.delegate(id, bob, 30 days);
        (address delegatee,, uint64 expiry, bool active) = registry.getDelegation(id);
        assertEq(delegatee, bob);
        assertTrue(active);
        assertGt(expiry, block.timestamp);
    }
}
