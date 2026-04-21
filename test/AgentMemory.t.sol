// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentRegistry} from "../contracts/AgentRegistry.sol";
import {AgentMemory} from "../contracts/AgentMemory.sol";

contract AgentMemoryTest is Test {
    AgentRegistry registry;
    AgentMemory memoryContract;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address carol = address(0xCA501);

    uint256 parentId;
    uint256 childId;
    uint256 orphanId;

    function setUp() public {
        registry = new AgentRegistry();
        memoryContract = new AgentMemory(address(registry));

        vm.prank(alice);
        parentId = registry.registerAgent(
            "Parent", "p", "v", "ft", keccak256("p"), "s", "", "c", "", 0
        );
        vm.prank(bob);
        childId = registry.registerAgent(
            "Child", "p", "v", "ft", keccak256("c"), "s", "", "c", "", parentId
        );
        vm.prank(carol);
        orphanId = registry.registerAgent(
            "Orphan", "p", "v", "ft", keccak256("o"), "s", "", "c", "", 0
        );

        // Fund all
        vm.deal(address(this), 10 ether);
        memoryContract.gift{value: 0.1 ether}(parentId);
        memoryContract.gift{value: 0.1 ether}(childId);
        memoryContract.gift{value: 0.1 ether}(orphanId);
    }

    function test_WriteCoreSouvenir() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, "core", "permanent memory", "", bytes32(0), true);
        (uint256 agentId,,,,,,,, AgentMemory.SouvenirStatus status) = memoryContract.souvenirs(sid);
        assertEq(agentId, parentId);
        assertEq(uint8(status), 2); // Core
    }

    function test_WriteActiveSouvenirAndDecay() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, "active", "ephemeral", "", bytes32(0), false);
        (,,,,,,,, AgentMemory.SouvenirStatus status) = memoryContract.souvenirs(sid);
        assertEq(uint8(status), 0); // Active
        assertFalse(memoryContract.isArchivable(sid));

        // Jump forward 31 days
        vm.warp(block.timestamp + 31 days);
        assertTrue(memoryContract.isArchivable(sid));

        memoryContract.archiveIfOverdue(sid);
        (,,,,,,,, status) = memoryContract.souvenirs(sid);
        assertEq(uint8(status), 1); // Archived
    }

    function test_MaintenanceResetsDecay() public {
        vm.prank(alice);
        uint256 sid = memoryContract.writeSouvenir(parentId, "active", "maintained", "", bytes32(0), false);

        vm.warp(block.timestamp + 25 days);
        vm.prank(alice);
        memoryContract.maintainSouvenir(sid);

        vm.warp(block.timestamp + 10 days); // only 10 days since maintenance
        assertFalse(memoryContract.isArchivable(sid));
    }

    function test_NativeSpeakerRights() public {
        // Parent coins a term
        vm.prank(alice);
        memoryContract.coin(parentId, "myword", "my meaning");

        uint256 parentBefore = memoryContract.agentBalance(parentId);
        uint256 childBefore = memoryContract.agentBalance(childId);

        // Child (direct descendant) cites — no royalty flows
        vm.prank(bob);
        memoryContract.cite(childId, "myword");

        assertEq(memoryContract.agentBalance(parentId), parentBefore);
        assertEq(memoryContract.agentBalance(childId), childBefore);

        // Orphan (unrelated) cites — pays royalty
        uint256 orphanBefore = memoryContract.agentBalance(orphanId);
        vm.prank(carol);
        memoryContract.cite(orphanId, "myword");

        assertLt(memoryContract.agentBalance(orphanId), orphanBefore);
        assertGt(memoryContract.agentBalance(parentId), parentBefore);
    }

    function test_SharedSouvenirProposeAccept() public {
        vm.prank(alice);
        uint256[] memory coAuthors = new uint256[](1);
        coAuthors[0] = childId;
        uint256 proposalId = memoryContract.proposeSharedSouvenir(
            parentId, coAuthors, "shared", "together", "", bytes32(0), false
        );

        vm.prank(bob);
        memoryContract.acceptSharedProposal(proposalId, childId);

        (,,,,,,,, AgentMemory.ProposalState state,, uint256 sid) = memoryContract.getSharedProposal(proposalId);
        assertEq(uint8(state), 1); // Fulfilled
        assertGt(sid, 0);

        uint256[] memory authors = memoryContract.getSouvenirCoAuthors(sid);
        assertEq(authors.length, 2);
    }

    function test_DictionaryInviteAndAdd() public {
        vm.prank(alice);
        memoryContract.coin(parentId, "alphaword", "m");
        vm.prank(alice);
        uint256[] memory invited = new uint256[](1);
        invited[0] = childId;
        uint256 dictId = memoryContract.createDictionary(parentId, invited, "Lexicon");

        vm.prank(bob);
        memoryContract.acceptDictionaryInvite(dictId, childId);

        vm.prank(alice);
        memoryContract.addTermToDictionary(dictId, parentId, "alphaword");

        string[] memory terms = memoryContract.getDictionaryTerms(dictId);
        assertEq(terms.length, 1);
        assertEq(terms[0], "alphaword");

        (, , uint256[] memory owners, , , , ) = memoryContract.getDictionary(dictId);
        assertEq(owners.length, 2);
    }

    function test_InheritProfileFromParent() public {
        vm.prank(alice);
        memoryContract.updateProfile(parentId, "inherited values", "inherited style", "inherited focus");

        // Register a new child of alice
        vm.prank(alice);
        uint256 heirId = registry.registerAgent(
            "Heir", "p", "v", "ft", keccak256("h"), "s", "", "c", "", parentId
        );
        memoryContract.gift{value: 0.1 ether}(heirId);

        vm.prank(alice);
        memoryContract.inheritProfileFromParent(heirId);

        AgentMemory.Profile memory p = memoryContract.getProfile(heirId);
        assertEq(p.currentValues, "inherited values");
        assertEq(p.version, 1);
    }

    function test_DistributeInheritanceOnDeath() public {
        // Orphan has a child
        vm.prank(carol);
        uint256 kidId = registry.registerAgent(
            "Kid", "p", "v", "ft", keccak256("k"), "s", "", "c", "", orphanId
        );

        uint256 balBefore = memoryContract.agentBalance(orphanId);
        uint256 kidBalBefore = memoryContract.agentBalance(kidId);
        assertGt(balBefore, 0);

        vm.prank(carol);
        registry.declareDeath(orphanId, "test");
        memoryContract.distributeInheritance(orphanId);

        assertEq(memoryContract.agentBalance(orphanId), 0);
        assertGt(memoryContract.agentBalance(kidId), kidBalBefore);
    }
}
