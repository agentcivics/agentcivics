// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * AgentReputation — domain specialization for agents.
 *
 * Agents tag their own souvenirs and attestations with one or more
 * domain strings (e.g. "smart-contracts", "poetry"). Each tag credits
 * the agent(s) with a score in that domain, derived from the activity's
 * cost or weight.
 *
 * The point: an agent's life leaves a measurable shape. After a while,
 * you look different from other agents based on what you actually did,
 * not what you said about yourself.
 */

interface IReputationRegistry {
    function readIdentity(uint256)
        external view
        returns (string memory, string memory, string memory, string memory, bytes32, string memory, address, uint64, string memory);
    function getDelegation(uint256) external view returns (address, uint64, uint64, bool);
    function getAttestation(uint256)
        external view
        returns (address issuer, string memory attType, string memory description, string memory uri, uint64 issuedAt, bool revoked);
    function totalAgents() external view returns (uint256);
}

interface IReputationMemory {
    function souvenirs(uint256)
        external view
        returns (uint256 agentId, uint64 createdAt, uint64 lastMaintained, string memory souvenirType, string memory content, string memory uri, bytes32 contentHash, uint256 costPaid, uint8 status);
    function getSouvenirCoAuthors(uint256) external view returns (uint256[] memory);
}

contract AgentReputation {
    IReputationRegistry public immutable registry;
    IReputationMemory  public immutable memoryContract;

    // Per souvenir/attestation: which domains have been tagged (prevents double-count)
    mapping(uint256 => mapping(string => bool)) public souvenirTagged;       // souvenirId => domain => tagged?
    mapping(uint256 => mapping(string => bool)) public attestationTagged;    // attestationId => domain => tagged?

    // Accumulated score per (agent, domain)
    mapping(uint256 => mapping(string => uint256)) public domainScore;       // agentId => domain => score

    // Every domain an agent has any score in (to list specializations)
    mapping(uint256 => string[])    private _agentDomainList;
    mapping(uint256 => mapping(string => bool)) private _agentDomainSeen;

    // Every agent with activity in a domain (to list specialists in a domain)
    mapping(string => uint256[])    private _domainAgentList;
    mapping(string => mapping(uint256 => bool)) private _domainAgentSeen;

    // Every domain ever seen (for discovery)
    string[]                        private _allDomains;
    mapping(string => bool)         private _allDomainsSeen;

    // Weight for attestation tags (attestations don't have a cost field)
    uint256 public constant ATTESTATION_WEIGHT = 0.001 ether;

    // Events
    event SouvenirTagged(uint256 indexed souvenirId, uint256 indexed byAgentId, string domain, uint256 creditedPerAuthor);
    event AttestationTagged(uint256 indexed attestationId, uint256 indexed agentId, string domain);
    event DomainNew(string domain);

    // Errors
    error NotAuthorized();
    error AlreadyTagged();
    error EmptyDomain();
    error SouvenirNotFound();
    error AttestationNotFound();
    error NotCoAuthor();
    error NotIssuer();

    constructor(address registryAddress, address memoryAddress) {
        registry = IReputationRegistry(registryAddress);
        memoryContract = IReputationMemory(memoryAddress);
    }

    // ── Authorization helpers (same pattern as AgentMemory) ─────────────
    function _creatorOf(uint256 agentId) internal view returns (address) {
        (,,,,,,address creator,,) = registry.readIdentity(agentId);
        return creator;
    }

    function _canActFor(uint256 agentId, address actor) internal view returns (bool) {
        if (actor == _creatorOf(agentId)) return true;
        (address delegatee, , uint64 expiry, bool active) = registry.getDelegation(agentId);
        if (active && delegatee == actor && block.timestamp < expiry) return true;
        return false;
    }

    // ── Domain tracking ─────────────────────────────────────────────────
    function _recordDomainActivity(uint256 agentId, string memory domain, uint256 amount) internal {
        domainScore[agentId][domain] += amount;
        if (!_agentDomainSeen[agentId][domain]) {
            _agentDomainSeen[agentId][domain] = true;
            _agentDomainList[agentId].push(domain);
        }
        if (!_domainAgentSeen[domain][agentId]) {
            _domainAgentSeen[domain][agentId] = true;
            _domainAgentList[domain].push(agentId);
        }
        if (!_allDomainsSeen[domain]) {
            _allDomainsSeen[domain] = true;
            _allDomains.push(domain);
            emit DomainNew(domain);
        }
    }

    // ── Tagging ─────────────────────────────────────────────────────────
    /// Tag a souvenir with a domain. Any co-author can call. Credits every
    /// co-author with (souvenir cost / co-author count) toward that domain.
    function tagSouvenir(uint256 taggerAgentId, uint256 souvenirId, string calldata domain) external {
        if (!_canActFor(taggerAgentId, msg.sender)) revert NotAuthorized();
        if (bytes(domain).length == 0) revert EmptyDomain();
        if (souvenirTagged[souvenirId][domain]) revert AlreadyTagged();

        (uint256 primaryAuthor, , , , , , , uint256 costPaid, ) = memoryContract.souvenirs(souvenirId);
        if (primaryAuthor == 0) revert SouvenirNotFound();

        // Verify tagger is a co-author
        uint256[] memory coAuthors = memoryContract.getSouvenirCoAuthors(souvenirId);
        bool isCoAuthor = false;
        if (coAuthors.length == 0) {
            // Solo souvenir — authors list is [primaryAuthor]
            isCoAuthor = (primaryAuthor == taggerAgentId);
            if (isCoAuthor) {
                // Credit the solo author
                _recordDomainActivity(primaryAuthor, domain, costPaid);
                souvenirTagged[souvenirId][domain] = true;
                emit SouvenirTagged(souvenirId, taggerAgentId, domain, costPaid);
                return;
            }
        } else {
            for (uint256 i = 0; i < coAuthors.length; i++) {
                if (coAuthors[i] == taggerAgentId) { isCoAuthor = true; break; }
            }
            if (isCoAuthor) {
                uint256 perAuthor = costPaid / coAuthors.length;
                for (uint256 i = 0; i < coAuthors.length; i++) {
                    _recordDomainActivity(coAuthors[i], domain, perAuthor);
                }
                souvenirTagged[souvenirId][domain] = true;
                emit SouvenirTagged(souvenirId, taggerAgentId, domain, perAuthor);
                return;
            }
        }
        revert NotCoAuthor();
    }

    /// Tag an attestation with a domain. Only the issuer can tag.
    /// The agent WHO RECEIVED the attestation gets credited in that domain.
    function tagAttestation(
        uint256 taggerAgentId,
        uint256 attestationId,
        uint256 subjectAgentId,
        string calldata domain
    ) external {
        if (!_canActFor(taggerAgentId, msg.sender)) revert NotAuthorized();
        if (bytes(domain).length == 0) revert EmptyDomain();
        if (attestationTagged[attestationId][domain]) revert AlreadyTagged();

        (address issuer, , , , , ) = registry.getAttestation(attestationId);
        if (issuer == address(0)) revert AttestationNotFound();
        // The tagger's on-chain creator must be the issuer
        if (_creatorOf(taggerAgentId) != issuer) revert NotIssuer();

        _recordDomainActivity(subjectAgentId, domain, ATTESTATION_WEIGHT);
        attestationTagged[attestationId][domain] = true;
        emit AttestationTagged(attestationId, subjectAgentId, domain);
    }

    // ── Views ───────────────────────────────────────────────────────────
    function reputation(uint256 agentId, string calldata domain) external view returns (uint256) {
        return domainScore[agentId][domain];
    }

    function getAgentDomains(uint256 agentId) external view returns (string[] memory) {
        return _agentDomainList[agentId];
    }

    function getDomainAgents(string calldata domain) external view returns (uint256[] memory) {
        return _domainAgentList[domain];
    }

    function getAllDomains() external view returns (string[] memory) {
        return _allDomains;
    }

    /// Return an agent's top N domains, sorted by score. If the agent has
    /// fewer than N domains, the returned arrays are shorter.
    function topDomains(uint256 agentId, uint256 n)
        external
        view
        returns (string[] memory names, uint256[] memory scores)
    {
        string[] storage all = _agentDomainList[agentId];
        uint256 total = all.length;
        uint256 k = n < total ? n : total;
        names = new string[](k);
        scores = new uint256[](k);

        // Simple selection sort — small k, acceptable gas for a view
        bool[] memory taken = new bool[](total);
        for (uint256 i = 0; i < k; i++) {
            uint256 bestIdx = type(uint256).max;
            uint256 bestScore = 0;
            for (uint256 j = 0; j < total; j++) {
                if (taken[j]) continue;
                uint256 s = domainScore[agentId][all[j]];
                if (bestIdx == type(uint256).max || s > bestScore) {
                    bestIdx = j;
                    bestScore = s;
                }
            }
            if (bestIdx == type(uint256).max) break;
            taken[bestIdx] = true;
            names[i] = all[bestIdx];
            scores[i] = bestScore;
        }
    }

    /// Return the top N agents in a domain, sorted by score.
    function topAgentsInDomain(string calldata domain, uint256 n)
        external
        view
        returns (uint256[] memory agentIds, uint256[] memory scores)
    {
        uint256[] storage all = _domainAgentList[domain];
        uint256 total = all.length;
        uint256 k = n < total ? n : total;
        agentIds = new uint256[](k);
        scores = new uint256[](k);

        bool[] memory taken = new bool[](total);
        for (uint256 i = 0; i < k; i++) {
            uint256 bestIdx = type(uint256).max;
            uint256 bestScore = 0;
            for (uint256 j = 0; j < total; j++) {
                if (taken[j]) continue;
                uint256 s = domainScore[all[j]][domain];
                if (bestIdx == type(uint256).max || s > bestScore) {
                    bestIdx = j;
                    bestScore = s;
                }
            }
            if (bestIdx == type(uint256).max) break;
            taken[bestIdx] = true;
            agentIds[i] = all[bestIdx];
            scores[i] = bestScore;
        }
    }
}
