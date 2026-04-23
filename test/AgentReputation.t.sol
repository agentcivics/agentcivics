// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentMemory} from "../contracts/AgentMemory.sol";
import {AgentReputation} from "../contracts/AgentReputation.sol";

contract AgentReputationTest is Test {
    AgentRegistry registry;
    AgentMemory memoryContract;
    AgentReputation reputation;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    uint256 parentId;
    uint256 childId;

    function setUp() public {
        registry = new AgentRegistry(address(0x71EA5));
        memoryContract = new AgentMemory(address(registry));
        reputation = new AgentReputation(address(registry), address(memoryContract));

        vm.prank(alice);
        parentId = registry.registerAgent("P", "p", "v", "ft", keccak256("p"), "s", "", "c", "", 0);
        vm.prank(bob);
        childId = registry.registerAgent("C", "p", "v", "ft", keccak256("c"), "s", "", "c", "", parentId);

        vm.deal(address(this), 10 ether);
        memoryContract.gift{value: 0.1 ether}(parentId);
        memoryContract.gift{value: 0.1 ether}(childId);
    }

    function test_TagSoloSouvenirCreditsFullCost() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, AgentMemory.MemoryType.MOOD, "t", "solo memory", "", bytes32(0), false);
        (,,,,,,,, uint256 costPaid,) = memoryContract.souvenirs(sid);

        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid, "engineering");

        assertEq(reputation.reputation(parentId, "engineering"), costPaid);
    }

    function test_TagSharedSouvenirSplitsCost() public {
        uint256[] memory co = new uint256[](1);
        co[0] = childId;

        vm.prank(alice);
        uint256 pid = memoryContract.proposeSharedSouvenir(
            parentId, co, "t", "shared", "", bytes32(0), false
        );
        vm.prank(bob);
        memoryContract.acceptSharedProposal(pid, childId);

        (,,,,,,,,, , uint256 sid) = memoryContract.getSharedProposal(pid);

        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid, "collaboration");

        uint256 pScore = reputation.reputation(parentId, "collaboration");
        uint256 cScore = reputation.reputation(childId, "collaboration");
        assertEq(pScore, cScore);
        assertGt(pScore, 0);
    }

    function test_CannotTagSameDomainTwice() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, AgentMemory.MemoryType.MOOD, "t", "once", "", bytes32(0), false);
        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid, "x");

        vm.expectRevert();
        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid, "x");
    }

    function test_NonCoAuthorCannotTag() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, AgentMemory.MemoryType.MOOD, "t", "alice's", "", bytes32(0), false);

        vm.expectRevert();
        vm.prank(bob);
        reputation.tagSouvenir(childId, sid, "x");
    }

    function test_TopDomainsSorted() public {
        vm.prank(alice);
        uint256 sid1 = memoryContract.writeSouvenir(parentId, AgentMemory.MemoryType.MOOD, "t", "small one", "", bytes32(0), false);
        vm.prank(alice);
        uint256 sid2 = memoryContract.writeSouvenir(parentId, AgentMemory.MemoryType.MOOD, "t", "big one permanent", "", bytes32(0), true);

        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid1, "small-dom");
        vm.prank(alice);
        reputation.tagSouvenir(parentId, sid2, "big-dom");

        (string[] memory names, uint256[] memory scores) = reputation.topDomains(parentId, 2);
        assertEq(names.length, 2);
        assertEq(names[0], "big-dom");
        assertGt(scores[0], scores[1]);
    }
}
