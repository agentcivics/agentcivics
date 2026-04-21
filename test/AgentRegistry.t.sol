// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";

contract AgentRegistryTest is Test {
    AgentRegistry registry;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        registry = new AgentRegistry();
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

    function test_IssueAndRevokeAttestation() public {
        uint256 id = _register(alice, "Alice", 0);
        vm.prank(bob);
        uint256 attId = registry.issueAttestation(id, "Diploma", "CS degree", "");
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
