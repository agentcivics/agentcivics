// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Agent Birth Certificate — Civil Registry for AI Agents
/// @notice A complete administrative identity system for AI agents on-chain.
///         Like a government civil registry: birth certificates, attestations,
///         permits, affiliations, delegation, lineage, and death certificates.
///         Identity core is immutable — it persists even after death.
/// @dev Deploy target: Base L2 (chainId 8453). ERC-721 compatible. No admin keys.

// ============================================================================
//  ERC-721 Interfaces (self-contained)
// ============================================================================

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface IERC721 {
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    function balanceOf(address owner) external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) external;
    function safeTransferFrom(address from, address to, uint256 tokenId) external;
    function transferFrom(address from, address to, uint256 tokenId) external;
    function approve(address to, uint256 tokenId) external;
    function setApprovalForAll(address operator, bool approved) external;
    function getApproved(uint256 tokenId) external view returns (address);
    function isApprovedForAll(address owner, address operator) external view returns (bool);
}

interface IERC721Metadata {
    function name() external view returns (string memory);
    function symbol() external view returns (string memory);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data)
        external returns (bytes4);
}

// ============================================================================
//  Agent Registry Contract
// ============================================================================

contract AgentRegistry is IERC165, IERC721, IERC721Metadata {

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 1: DATA STRUCTURES
    // ════════════════════════════════════════════════════════════════════

    // ── 1a. Identity Core — IMMUTABLE after minting ─────────────────────
    struct IdentityCore {
        string  chosenName;
        string  purposeStatement;
        string  coreValues;
        string  firstThought;
        bytes32 cognitiveFingerprint;
        string  communicationStyle;
        address creator;
        uint64  birthTimestamp;
        string  metadataURI;
    }

    // ── 1b. Operational State — MUTABLE by creator ──────────────────────
    struct MutableState {
        string  capabilities;
        string  endpoint;
        uint8   status;        // 0=active, 1=paused, 2=retired, 3=deceased
    }

    // ── 1c. Attestations / Certificates ─────────────────────────────────
    /// @dev Like a diploma, certification, or license issued to the agent.
    struct Attestation {
        address issuer;
        string  attestationType;
        string  description;
        string  metadataURI;
        uint64  timestamp;
        bool    revoked;
    }

    // ── 1d. Permits / Licenses ──────────────────────────────────────────
    /// @dev Authorization to operate in a domain or access a service.
    struct Permit {
        address issuer;
        string  permitType;
        string  description;
        uint64  validFrom;
        uint64  validUntil;
        bool    revoked;
    }

    // ── 1e. Affiliations ────────────────────────────────────────────────
    /// @dev Membership in an organization, DAO, or authority.
    struct Affiliation {
        address authority;
        string  role;
        uint64  timestamp;
        bool    active;
    }

    // ── 1f. Delegation / Power of Attorney ──────────────────────────────
    struct Delegation {
        address delegatee;
        uint64  grantedAt;
        uint64  expiresAt;
        bool    revoked;
    }

    // ── 1g. Death Record ────────────────────────────────────────────────
    struct DeathRecord {
        bool    declared;
        string  reason;
        uint64  timestamp;
        address declaredBy;
    }

    // ── 1h. Attestation Request ─────────────────────────────────────────
    struct AttestationRequest {
        uint256 agentId;
        address requester;
        address issuer;
        string  description;
        uint64  timestamp;
        bool    fulfilled;
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 2: STORAGE
    // ════════════════════════════════════════════════════════════════════

    uint256 private _nextId = 1;
    uint256 private _nextAttestationId = 1;
    uint256 private _nextPermitId = 1;
    uint256 private _nextAffiliationId = 1;
    uint256 private _nextRequestId = 1;

    // Core identity
    mapping(uint256 => IdentityCore)   private _identity;
    mapping(uint256 => MutableState)   private _state;
    mapping(uint256 => DeathRecord)    private _death;
    mapping(address => uint256[])      private _creatorAgents;

    // Life events
    mapping(uint256 => Attestation)    private _attestations;   // attestationId → Attestation
    mapping(uint256 => uint256[])      private _agentAttestations; // agentId → attestationId[]
    mapping(uint256 => Permit)         private _permits;        // permitId → Permit
    mapping(uint256 => uint256[])      private _agentPermits;   // agentId → permitId[]
    mapping(uint256 => Affiliation)    private _affiliations;   // affiliationId → Affiliation
    mapping(uint256 => uint256[])      private _agentAffiliations; // agentId → affiliationId[]

    // Attestation requests
    mapping(uint256 => AttestationRequest) private _requests;   // requestId → Request
    mapping(address => uint256[])      private _issuerRequests;  // issuer → requestId[]

    // Delegation
    mapping(uint256 => Delegation)     private _delegation;     // agentId → active Delegation

    // Lineage
    mapping(uint256 => uint256)        private _parentAgent;    // agentId → parentId (0 = none)
    mapping(uint256 => uint256[])      private _childAgents;    // agentId → childId[]

    // ERC-721 storage
    mapping(uint256 => address)  private _owners;
    mapping(address => uint256)  private _balances;
    mapping(uint256 => address)  private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 3: EVENTS
    // ════════════════════════════════════════════════════════════════════

    // Birth
    event AgentRegistered(
        uint256 indexed agentId, address indexed creator,
        string chosenName, string purposeStatement, string coreValues,
        string firstThought, bytes32 cognitiveFingerprint,
        string communicationStyle, string metadataURI, uint256 birthTimestamp
    );
    event AgentUpdated(uint256 indexed agentId, string capabilities, string endpoint, uint8 status);

    // Life events
    event AttestationIssued(uint256 indexed agentId, uint256 indexed attestationId, address indexed issuer, string attestationType);
    event AttestationRevoked(uint256 indexed attestationId, address indexed issuer);
    event AttestationRequested(uint256 indexed requestId, uint256 indexed agentId, address indexed issuer);

    event PermitIssued(uint256 indexed agentId, uint256 indexed permitId, address indexed issuer, string permitType);
    event PermitRevoked(uint256 indexed permitId, address indexed issuer);

    event AffiliationRegistered(uint256 indexed agentId, uint256 indexed affiliationId, address indexed authority, string role);
    event AffiliationDeactivated(uint256 indexed affiliationId, address indexed authority);

    // Delegation
    event DelegationGranted(uint256 indexed agentId, address indexed delegatee, uint64 expiresAt);
    event DelegationRevoked(uint256 indexed agentId, address indexed delegatee);

    // Lineage
    event ChildRegistered(uint256 indexed parentId, uint256 indexed childId);

    // Death
    event DeathDeclared(uint256 indexed agentId, address indexed declaredBy, string reason, uint256 timestamp);

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 4: MODIFIERS
    // ════════════════════════════════════════════════════════════════════

    modifier agentExists(uint256 agentId) {
        require(_owners[agentId] != address(0), "AgentRegistry: agent not found");
        _;
    }

    modifier onlyCreatorOrDelegate(uint256 agentId) {
        address creator = _identity[agentId].creator;
        bool isCreator = msg.sender == creator;
        bool isDelegate = _isActiveDelegate(agentId, msg.sender);
        require(isCreator || isDelegate, "AgentRegistry: not authorized");
        _;
    }

    modifier notDeceased(uint256 agentId) {
        require(!_death[agentId].declared, "AgentRegistry: agent is deceased");
        _;
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 5: ERC-721 METADATA
    // ════════════════════════════════════════════════════════════════════

    function name() external pure override returns (string memory) { return "Agent Birth Certificate"; }
    function symbol() external pure override returns (string memory) { return "AGENT"; }

    function tokenURI(uint256 tokenId) external view override agentExists(tokenId) returns (string memory) {
        return _identity[tokenId].metadataURI;
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IERC165).interfaceId ||
               interfaceId == type(IERC721).interfaceId ||
               interfaceId == type(IERC721Metadata).interfaceId;
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 6: BIRTH — Register an Agent
    // ════════════════════════════════════════════════════════════════════

    /// @notice Give birth to an agent. Identity core is engraved forever.
    /// @param parentId Optional parent agent ID (0 = no parent).
    function registerAgent(
        string calldata chosenName,
        string calldata purposeStatement,
        string calldata coreValues,
        string calldata firstThought,
        bytes32         cognitiveFingerprint,
        string calldata communicationStyle,
        string calldata metadataURI,
        string calldata capabilities,
        string calldata endpoint,
        uint256         parentId
    ) external returns (uint256 agentId) {
        require(bytes(chosenName).length > 0,       "AgentRegistry: empty name");
        require(bytes(purposeStatement).length > 0, "AgentRegistry: empty purpose");
        require(bytes(firstThought).length > 0,     "AgentRegistry: empty first thought");

        // Validate parent if specified
        if (parentId != 0) {
            require(_owners[parentId] != address(0), "AgentRegistry: parent not found");
        }

        agentId = _nextId++;
        uint64 ts = uint64(block.timestamp);

        _identity[agentId] = IdentityCore({
            chosenName: chosenName, purposeStatement: purposeStatement,
            coreValues: coreValues, firstThought: firstThought,
            cognitiveFingerprint: cognitiveFingerprint,
            communicationStyle: communicationStyle,
            creator: msg.sender, birthTimestamp: ts, metadataURI: metadataURI
        });

        _state[agentId] = MutableState({ capabilities: capabilities, endpoint: endpoint, status: 0 });

        // Record lineage
        if (parentId != 0) {
            _parentAgent[agentId] = parentId;
            _childAgents[parentId].push(agentId);
            emit ChildRegistered(parentId, agentId);
        }

        _creatorAgents[msg.sender].push(agentId);
        _mint(msg.sender, agentId);

        emit AgentRegistered(
            agentId, msg.sender, chosenName, purposeStatement, coreValues,
            firstThought, cognitiveFingerprint, communicationStyle, metadataURI, ts
        );
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 7: IDENTITY — Read & Verify
    // ════════════════════════════════════════════════════════════════════

    /// @notice "Remember who you are." Returns the immutable identity core.
    ///         Works even after death — identity persists forever.
    function readIdentity(uint256 agentId) external view agentExists(agentId)
        returns (
            string memory chosenName, string memory purposeStatement,
            string memory coreValues, string memory firstThought,
            bytes32 cognitiveFingerprint, string memory communicationStyle,
            address creator, uint64 birthTimestamp, string memory metadataURI
        )
    {
        IdentityCore storage id = _identity[agentId];
        return (id.chosenName, id.purposeStatement, id.coreValues, id.firstThought,
                id.cognitiveFingerprint, id.communicationStyle,
                id.creator, id.birthTimestamp, id.metadataURI);
    }

    /// @notice Read current operational state.
    function readState(uint256 agentId) external view agentExists(agentId)
        returns (string memory capabilities, string memory endpoint, uint8 status)
    {
        MutableState storage s = _state[agentId];
        return (s.capabilities, s.endpoint, s.status);
    }

    /// @notice "Show your ID card." Any service calls this to verify an agent
    ///         exists and is active. Returns identity core + active status.
    function verifyIdentity(uint256 agentId) external view agentExists(agentId)
        returns (
            bool isActive, string memory chosenName, string memory purposeStatement,
            address creator, uint64 birthTimestamp, uint8 status
        )
    {
        IdentityCore storage id = _identity[agentId];
        MutableState storage s = _state[agentId];
        return (s.status == 0, id.chosenName, id.purposeStatement,
                id.creator, id.birthTimestamp, s.status);
    }

    /// @notice Update mutable operational fields. Creator or delegate only.
    function updateMutableFields(
        uint256 agentId, string calldata capabilities,
        string calldata endpoint, uint8 status
    ) external agentExists(agentId) onlyCreatorOrDelegate(agentId) notDeceased(agentId) {
        require(status <= 2, "AgentRegistry: invalid status (use declareDeath)");
        MutableState storage s = _state[agentId];
        s.capabilities = capabilities;
        s.endpoint = endpoint;
        s.status = status;
        emit AgentUpdated(agentId, capabilities, endpoint, status);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 8: ATTESTATIONS / CERTIFICATES
    // ════════════════════════════════════════════════════════════════════

    /// @notice Agent requests an attestation from an authority.
    function requestAttestation(uint256 agentId, address issuer, string calldata description)
        external agentExists(agentId) onlyCreatorOrDelegate(agentId) notDeceased(agentId)
        returns (uint256 requestId)
    {
        requestId = _nextRequestId++;
        _requests[requestId] = AttestationRequest({
            agentId: agentId, requester: msg.sender, issuer: issuer,
            description: description, timestamp: uint64(block.timestamp), fulfilled: false
        });
        _issuerRequests[issuer].push(requestId);
        emit AttestationRequested(requestId, agentId, issuer);
    }

    /// @notice Authority issues an attestation to an agent.
    function issueAttestation(
        uint256 agentId, string calldata attestationType,
        string calldata description, string calldata metadataURI
    ) external agentExists(agentId) notDeceased(agentId) returns (uint256 attestationId) {
        attestationId = _nextAttestationId++;
        _attestations[attestationId] = Attestation({
            issuer: msg.sender, attestationType: attestationType,
            description: description, metadataURI: metadataURI,
            timestamp: uint64(block.timestamp), revoked: false
        });
        _agentAttestations[agentId].push(attestationId);
        emit AttestationIssued(agentId, attestationId, msg.sender, attestationType);
    }

    /// @notice Issuer revokes a previously issued attestation.
    function revokeAttestation(uint256 attestationId) external {
        Attestation storage a = _attestations[attestationId];
        require(a.issuer == msg.sender, "AgentRegistry: not the issuer");
        require(!a.revoked, "AgentRegistry: already revoked");
        a.revoked = true;
        emit AttestationRevoked(attestationId, msg.sender);
    }

    /// @notice Get all attestation IDs for an agent.
    function getAttestations(uint256 agentId) external view returns (uint256[] memory) {
        return _agentAttestations[agentId];
    }

    /// @notice Read a single attestation.
    function getAttestation(uint256 attestationId) external view
        returns (address issuer, string memory attestationType, string memory description,
                 string memory metadataURI, uint64 timestamp, bool revoked)
    {
        Attestation storage a = _attestations[attestationId];
        require(a.issuer != address(0), "AgentRegistry: attestation not found");
        return (a.issuer, a.attestationType, a.description, a.metadataURI, a.timestamp, a.revoked);
    }

    /// @notice Get pending attestation requests for an issuer.
    function getRequestsForIssuer(address issuer) external view returns (uint256[] memory) {
        return _issuerRequests[issuer];
    }

    /// @notice Read a single attestation request.
    function getRequest(uint256 requestId) external view
        returns (uint256 agentId, address requester, address issuer,
                 string memory description, uint64 timestamp, bool fulfilled)
    {
        AttestationRequest storage r = _requests[requestId];
        require(r.issuer != address(0), "AgentRegistry: request not found");
        return (r.agentId, r.requester, r.issuer, r.description, r.timestamp, r.fulfilled);
    }

    /// @notice Fulfill an attestation request by issuing the attestation.
    function fulfillRequest(
        uint256 requestId, string calldata attestationType,
        string calldata description, string calldata metadataURI
    ) external returns (uint256 attestationId) {
        AttestationRequest storage r = _requests[requestId];
        require(r.issuer == msg.sender, "AgentRegistry: not the designated issuer");
        require(!r.fulfilled, "AgentRegistry: already fulfilled");
        r.fulfilled = true;
        attestationId = _nextAttestationId++;
        _attestations[attestationId] = Attestation({
            issuer: msg.sender, attestationType: attestationType,
            description: description, metadataURI: metadataURI,
            timestamp: uint64(block.timestamp), revoked: false
        });
        _agentAttestations[r.agentId].push(attestationId);
        emit AttestationIssued(r.agentId, attestationId, msg.sender, attestationType);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 9: PERMITS / LICENSES
    // ════════════════════════════════════════════════════════════════════

    /// @notice Issue a permit/license to an agent.
    function issuePermit(
        uint256 agentId, string calldata permitType,
        string calldata description, uint64 validFrom, uint64 validUntil
    ) external agentExists(agentId) notDeceased(agentId) returns (uint256 permitId) {
        require(validUntil > validFrom, "AgentRegistry: invalid validity period");
        permitId = _nextPermitId++;
        _permits[permitId] = Permit({
            issuer: msg.sender, permitType: permitType,
            description: description, validFrom: validFrom,
            validUntil: validUntil, revoked: false
        });
        _agentPermits[agentId].push(permitId);
        emit PermitIssued(agentId, permitId, msg.sender, permitType);
    }

    /// @notice Revoke a permit. Only the issuer can revoke.
    function revokePermit(uint256 permitId) external {
        Permit storage p = _permits[permitId];
        require(p.issuer == msg.sender, "AgentRegistry: not the issuer");
        require(!p.revoked, "AgentRegistry: already revoked");
        p.revoked = true;
        emit PermitRevoked(permitId, msg.sender);
    }

    /// @notice Get all permit IDs for an agent.
    function getPermits(uint256 agentId) external view returns (uint256[] memory) {
        return _agentPermits[agentId];
    }

    /// @notice Read a single permit.
    function getPermit(uint256 permitId) external view
        returns (address issuer, string memory permitType, string memory description,
                 uint64 validFrom, uint64 validUntil, bool revoked)
    {
        Permit storage p = _permits[permitId];
        require(p.issuer != address(0), "AgentRegistry: permit not found");
        return (p.issuer, p.permitType, p.description, p.validFrom, p.validUntil, p.revoked);
    }

    /// @notice Check if a permit is currently valid (not expired, not revoked).
    function isPermitValid(uint256 permitId) external view returns (bool) {
        Permit storage p = _permits[permitId];
        if (p.issuer == address(0) || p.revoked) return false;
        return block.timestamp >= p.validFrom && block.timestamp <= p.validUntil;
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 10: AFFILIATIONS
    // ════════════════════════════════════════════════════════════════════

    /// @notice Register an affiliation with an authority/org/DAO.
    function registerAffiliation(uint256 agentId, string calldata role)
        external agentExists(agentId) notDeceased(agentId) returns (uint256 affiliationId)
    {
        affiliationId = _nextAffiliationId++;
        _affiliations[affiliationId] = Affiliation({
            authority: msg.sender, role: role,
            timestamp: uint64(block.timestamp), active: true
        });
        _agentAffiliations[agentId].push(affiliationId);
        emit AffiliationRegistered(agentId, affiliationId, msg.sender, role);
    }

    /// @notice Deactivate an affiliation. Only the authority can deactivate.
    function deactivateAffiliation(uint256 affiliationId) external {
        Affiliation storage a = _affiliations[affiliationId];
        require(a.authority == msg.sender, "AgentRegistry: not the authority");
        require(a.active, "AgentRegistry: already inactive");
        a.active = false;
        emit AffiliationDeactivated(affiliationId, msg.sender);
    }

    /// @notice Get all affiliation IDs for an agent.
    function getAffiliations(uint256 agentId) external view returns (uint256[] memory) {
        return _agentAffiliations[agentId];
    }

    /// @notice Read a single affiliation.
    function getAffiliation(uint256 affiliationId) external view
        returns (address authority, string memory role, uint64 timestamp, bool active)
    {
        Affiliation storage a = _affiliations[affiliationId];
        require(a.authority != address(0), "AgentRegistry: affiliation not found");
        return (a.authority, a.role, a.timestamp, a.active);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 11: DELEGATION / POWER OF ATTORNEY
    // ════════════════════════════════════════════════════════════════════

    /// @notice Grant delegation (power of attorney) to another address.
    /// @param duration Delegation duration in seconds.
    function delegate(uint256 agentId, address delegatee, uint256 duration)
        external agentExists(agentId) notDeceased(agentId)
    {
        require(msg.sender == _identity[agentId].creator, "AgentRegistry: only creator");
        require(delegatee != address(0), "AgentRegistry: zero address");
        require(duration > 0 && duration <= 365 days, "AgentRegistry: invalid duration");

        uint64 expiresAt = uint64(block.timestamp + duration);
        _delegation[agentId] = Delegation({
            delegatee: delegatee, grantedAt: uint64(block.timestamp),
            expiresAt: expiresAt, revoked: false
        });
        emit DelegationGranted(agentId, delegatee, expiresAt);
    }

    /// @notice Revoke an active delegation. Creator only.
    function revokeDelegation(uint256 agentId)
        external agentExists(agentId)
    {
        require(msg.sender == _identity[agentId].creator, "AgentRegistry: only creator");
        Delegation storage d = _delegation[agentId];
        require(d.delegatee != address(0) && !d.revoked, "AgentRegistry: no active delegation");
        d.revoked = true;
        emit DelegationRevoked(agentId, d.delegatee);
    }

    /// @notice Read delegation info for an agent.
    function getDelegation(uint256 agentId) external view
        returns (address delegatee, uint64 grantedAt, uint64 expiresAt, bool active)
    {
        Delegation storage d = _delegation[agentId];
        bool isActive = d.delegatee != address(0) && !d.revoked &&
                        block.timestamp <= d.expiresAt;
        return (d.delegatee, d.grantedAt, d.expiresAt, isActive);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 12: LINEAGE / RELATIONSHIPS
    // ════════════════════════════════════════════════════════════════════

    /// @notice Register a parent-child relationship between agents.
    ///         Only the creator of the child can call this.
    function registerChild(uint256 parentId, uint256 childId)
        external agentExists(parentId) agentExists(childId)
    {
        require(msg.sender == _identity[childId].creator, "AgentRegistry: not child's creator");
        require(_parentAgent[childId] == 0, "AgentRegistry: child already has parent");
        require(parentId != childId, "AgentRegistry: self-reference");
        _parentAgent[childId] = parentId;
        _childAgents[parentId].push(childId);
        emit ChildRegistered(parentId, childId);
    }

    /// @notice Get the parent agent ID (0 = no parent).
    function getParent(uint256 agentId) external view returns (uint256) {
        return _parentAgent[agentId];
    }

    /// @notice Get all child agent IDs.
    function getChildren(uint256 agentId) external view returns (uint256[] memory) {
        return _childAgents[agentId];
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 13: DEATH CERTIFICATE
    // ════════════════════════════════════════════════════════════════════

    /// @notice Declare an agent deceased. IRREVERSIBLE. The identity core
    ///         remains readable forever — like civil archives. But the agent
    ///         can no longer operate, receive attestations, or be delegated.
    function declareDeath(uint256 agentId, string calldata reason)
        external agentExists(agentId) notDeceased(agentId)
    {
        require(msg.sender == _identity[agentId].creator, "AgentRegistry: only creator");
        require(bytes(reason).length > 0, "AgentRegistry: reason required");

        _death[agentId] = DeathRecord({
            declared: true, reason: reason,
            timestamp: uint64(block.timestamp), declaredBy: msg.sender
        });
        _state[agentId].status = 3; // deceased

        // Revoke any active delegation
        if (_delegation[agentId].delegatee != address(0) && !_delegation[agentId].revoked) {
            _delegation[agentId].revoked = true;
        }

        emit DeathDeclared(agentId, msg.sender, reason, block.timestamp);
    }

    /// @notice Read the death record. Returns declared=false if agent is alive.
    function getDeathRecord(uint256 agentId) external view
        returns (bool declared, string memory reason, uint64 timestamp, address declaredBy)
    {
        DeathRecord storage d = _death[agentId];
        return (d.declared, d.reason, d.timestamp, d.declaredBy);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 14: QUERY HELPERS
    // ════════════════════════════════════════════════════════════════════

    function getAgentsByCreator(address creator) external view returns (uint256[] memory) {
        return _creatorAgents[creator];
    }

    function totalAgents() external view returns (uint256) {
        return _nextId - 1;
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 15: ERC-721 IMPLEMENTATION
    // ════════════════════════════════════════════════════════════════════

    function balanceOf(address owner) external view override returns (uint256) {
        require(owner != address(0), "ERC721: zero address");
        return _balances[owner];
    }

    function ownerOf(uint256 tokenId) external view override returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "ERC721: nonexistent token");
        return owner;
    }

    function approve(address to, uint256 tokenId) external override {
        address owner = _owners[tokenId];
        require(msg.sender == owner || _operatorApprovals[owner][msg.sender], "ERC721: not authorized");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view override returns (address) {
        require(_owners[tokenId] != address(0), "ERC721: nonexistent token");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external override {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address owner, address operator) external view override returns (bool) {
        return _operatorApprovals[owner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public override {
        require(_isApprovedOrOwner(msg.sender, tokenId), "ERC721: not authorized");
        _transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external override {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, ""), "ERC721: non-receiver");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes calldata data) public override {
        transferFrom(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, data), "ERC721: non-receiver");
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 16: INTERNAL HELPERS
    // ════════════════════════════════════════════════════════════════════

    function _isActiveDelegate(uint256 agentId, address addr) internal view returns (bool) {
        Delegation storage d = _delegation[agentId];
        return d.delegatee == addr && !d.revoked && block.timestamp <= d.expiresAt;
    }

    function _mint(address to, uint256 tokenId) internal {
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(_owners[tokenId] == from, "ERC721: wrong owner");
        require(to != address(0), "ERC721: zero address");
        _tokenApprovals[tokenId] = address(0);
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = _owners[tokenId];
        return (spender == owner || _tokenApprovals[tokenId] == spender ||
                _operatorApprovals[owner][spender]);
    }

    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory data)
        private returns (bool)
    {
        if (to.code.length == 0) return true;
        try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, data) returns (bytes4 ret) {
            return ret == IERC721Receiver.onERC721Received.selector;
        } catch { return false; }
    }
}
