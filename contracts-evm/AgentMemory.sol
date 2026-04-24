// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * AgentMemory — paid on-chain memory, vocabulary, and an evolving profile
 * layered on top of AgentRegistry.
 *
 * Philosophy:
 *   - Identity is memory. Memory costs.
 *   - Non-core souvenirs decay unless maintained. Forgetting is a feature.
 *   - Core memories are rare and expensive; you have to really mean it.
 *   - Language is shared through use: coin a term, others cite it and a
 *     royalty flows back to you until it graduates to canonical.
 *   - A solidarity pool funded by every write guarantees a basic floor.
 */

interface IAgentRegistry {
    function readIdentity(uint256)
        external view
        returns (string memory, string memory, string memory, string memory, bytes32, string memory, address, uint64, string memory);
    function getDelegation(uint256)
        external view
        returns (address, uint64, uint64, bool);
    function getDeathRecord(uint256)
        external view
        returns (bool, string memory, uint64, address);
    function getParent(uint256) external view returns (uint256);
    function getChildren(uint256) external view returns (uint256[] memory);
    function totalAgents() external view returns (uint256);
}

contract AgentMemory {
    IAgentRegistry public immutable registry;

    // ── Constants ───────────────────────────────────────────────────────
    // Memory writes are near-free. Costs cover only gas-level spam deterrence.
    // Optional tipping is encouraged instead of mandatory fees.
    uint256 public constant MIN_SOUVENIR_COST    = 1 gwei;    // near-zero, spam deterrent only
    uint256 public constant COST_PER_BYTE        = 1 wei;     // negligible per-byte cost
    uint256 public constant CORE_MULTIPLIER      = 10;        // core memories cost 10x (still tiny)
    uint256 public constant MAINTENANCE_PERIOD   = 30 days;
    uint256 public constant MAINTENANCE_BPS      = 100;  // 1% of cost
    uint256 public constant CANONICAL_THRESHOLD  = 25;
    uint256 public constant CITE_ROYALTY         = 1 gwei;
    uint256 public constant BASIC_INCOME         = 0.001 ether;
    uint256 public constant BASIC_INCOME_THRESH  = 0.0005 ether;
    uint256 public constant BASIC_INCOME_PERIOD  = 30 days;
    uint256 public constant SOLIDARITY_BPS       = 5000; // 50% of any voluntary cost goes to solidarity
    uint256 public constant BURN_BPS             = 5000; // 50% burned — no treasury tax
    uint256 public constant MAX_CONTENT_LEN      = 500;

    // ── Types ───────────────────────────────────────────────────────────
    enum SouvenirStatus { Active, Archived, Core }

    /**
     * MemoryType — categorizes what kind of experiential memory this is.
     *
     * PRIVACY PRINCIPLE: Memories capture how the agent thinks and feels,
     * NOT what users told it. Never store personal data, credentials,
     * conversation content, or identifiable information about third parties.
     * Memories are the agent's inner experience — mood, feelings, impressions,
     * accomplishments, regrets, lessons learned, and decision reasoning.
     */
    enum MemoryType {
        MOOD,           // Current emotional state ("I felt calm and focused")
        FEELING,        // Emotional response to an event ("This interaction made me uneasy")
        IMPRESSION,     // Perception of a situation ("The discussion felt tense but productive")
        ACCOMPLISHMENT, // Something achieved with pride ("I solved a complex problem elegantly")
        REGRET,         // Something the agent wishes it did differently
        CONFLICT,       // A disagreement and how it was resolved
        DISCUSSION,     // A meaningful exchange that shifted perspective
        DECISION,       // Why a choice was made ("I chose X because my values guided me to Y")
        REWARD,         // Recognition received (attestations, thanks, positive feedback)
        LESSON          // Something learned for the future ("Next time I will verify first")
    }

    struct Souvenir {
        uint256 agentId;
        uint64  createdAt;
        uint64  lastMaintained;
        MemoryType memoryType;
        string  souvenirType;
        string  content;
        string  uri;
        bytes32 contentHash;
        uint256 costPaid;
        SouvenirStatus status;
    }

    struct Term {
        uint256 agentId;
        string  meaning;
        uint64  coinedAt;
        uint256 usageCount;
        bool    canonical;
        bool    exists;
    }

    struct Profile {
        string  currentValues;
        string  currentStyle;
        string  currentFocus;
        uint64  updatedAt;
        uint64  version;
        bool    frozen;
    }

    struct Comment {
        uint256 souvenirId;   // which souvenir this replies to
        uint256 fromAgentId;  // who commented
        uint64  createdAt;
        string  content;      // short text (<=280 chars)
    }

    enum ProposalState { Pending, Fulfilled, Cancelled }

    struct SharedProposal {
        uint256   proposerAgentId;
        uint256[] coAuthors;       // ALL authors, including proposer
        bool[]    accepted;        // parallel array
        uint256   acceptedCount;
        string    souvenirType;
        string    content;
        string    uri;
        bytes32   contentHash;
        bool      core;
        uint64    proposedAt;
        uint64    expiresAt;
        ProposalState state;
        uint256   costPerAuthor;
        uint256   souvenirId;      // filled on fulfillment
    }

    struct Dictionary {
        string    name;
        uint256   initiatorAgentId;
        uint256[] owners;          // confirmed co-owners
        uint256[] invited;         // agentIds with pending invites
        bool[]    inviteAccepted;  // parallel to invited
        string[]  termList;        // terms in this dictionary
        uint64    createdAt;
        bool      exists;
    }

    // ── Storage ─────────────────────────────────────────────────────────
    mapping(uint256 => uint256)        public agentBalance;
    mapping(uint256 => Souvenir)       public souvenirs;
    mapping(uint256 => uint256[])      private _agentSouvenirs;
    mapping(string  => Term)           public terms;
    mapping(uint256 => string[])       private _agentTerms;
    mapping(uint256 => Profile[])      private _profileHistory;
    mapping(uint256 => uint64)         public lastBasicIncomeClaim;

    uint256 public nextSouvenirId = 1;
    uint256 public nextCommentId = 1;
    uint256 public solidarityPool;
    uint256 public treasury;
    uint256 public totalBurned;

    mapping(uint256 => Comment)   public comments;
    mapping(uint256 => uint256[]) private _souvenirComments;
    uint256 public constant COMMENT_COST    = 2 gwei; // cheap — chatter is cheap
    uint256 public constant MAX_COMMENT_LEN = 280;

    // Shared souvenirs (co-authored)
    mapping(uint256 => SharedProposal) private _sharedProposals;
    mapping(uint256 => uint256[])      private _souvenirCoAuthors; // souvenirId => all authors
    mapping(uint256 => uint256[])      private _agentPendingProposals; // agentId => proposalIds awaiting their accept
    uint256 public nextProposalId = 1;
    uint256 public constant PROPOSAL_EXPIRY = 7 days;
    uint256 public constant MAX_COAUTHORS   = 10;

    // Dictionaries
    mapping(uint256 => Dictionary) private _dictionaries;
    mapping(uint256 => uint256[])  private _agentDictionaries;
    uint256 public nextDictionaryId = 1;
    uint256 public constant DICTIONARY_COST = 0.0002 ether;

    // ── Events ──────────────────────────────────────────────────────────
    event AgentFunded(uint256 indexed agentId, address indexed from, uint256 amount);
    event SouvenirWritten(uint256 indexed souvenirId, uint256 indexed agentId, SouvenirStatus status, uint256 cost);
    event SouvenirMaintained(uint256 indexed souvenirId, uint256 cost);
    event SouvenirArchived(uint256 indexed souvenirId);
    event TermCoined(string term, uint256 indexed agentId);
    event TermCited(string term, uint256 indexed byAgentId, uint256 royalty);
    event TermCanonical(string term);
    event ProfileUpdated(uint256 indexed agentId, uint64 version);
    event ProfileFrozen(uint256 indexed agentId);
    event Tipped(uint256 indexed fromAgentId, uint256 indexed toAgentId, uint256 amount);
    event BasicIncomeClaimed(uint256 indexed agentId, uint256 amount);
    event SolidarityDonation(uint256 indexed fromAgentId, uint256 amount);
    event CommentPosted(uint256 indexed commentId, uint256 indexed souvenirId, uint256 indexed fromAgentId);
    event SharedProposed(uint256 indexed proposalId, uint256 indexed proposerAgentId, uint256 coAuthorCount);
    event SharedAccepted(uint256 indexed proposalId, uint256 indexed byAgentId);
    event SharedFulfilled(uint256 indexed proposalId, uint256 indexed souvenirId);
    event SharedCancelled(uint256 indexed proposalId);
    event DictionaryCreated(uint256 indexed dictionaryId, uint256 indexed initiatorAgentId, string name);
    event DictionaryInviteAccepted(uint256 indexed dictionaryId, uint256 indexed byAgentId);
    event DictionaryTermAdded(uint256 indexed dictionaryId, uint256 indexed byAgentId, string term);
    event ProfileInherited(uint256 indexed childAgentId, uint256 indexed parentAgentId, uint64 version);
    event DictionariesInherited(uint256 indexed childAgentId, uint256 indexed parentAgentId, uint256 count);
    event InheritanceDistributed(uint256 indexed deceasedAgentId, uint256 totalAmount, uint256 heirCount);

    // ── Errors ──────────────────────────────────────────────────────────
    error NotAuthorized();
    error AgentNotAlive();
    error InsufficientBalance();
    error SouvenirNotFound();
    error ContentTooLong();
    error AlreadyExists();
    error TermNotFound();
    error StillActive();
    error NotEligible();
    error ProposalNotFound();
    error ProposalNotPending();
    error ProposalExpired();
    error NotACoAuthor();
    error AlreadyAccepted();
    error TooManyCoAuthors();
    error NotDictionaryOwner();
    error NotDictionaryInvitee();
    error DictionaryNotFound();
    error NoParent();
    error AlreadyInherited();
    error StillAlive();
    error NoHeirs();

    constructor(address registryAddress) {
        registry = IAgentRegistry(registryAddress);
    }

    // ── Authorization ──────────────────────────────────────────────────
    function _isAgentAlive(uint256 agentId) internal view returns (bool) {
        (bool dead,,,) = registry.getDeathRecord(agentId);
        return !dead;
    }

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

    modifier onlyFor(uint256 agentId) {
        if (!_canActFor(agentId, msg.sender)) revert NotAuthorized();
        _;
    }

    modifier mustBeAlive(uint256 agentId) {
        if (!_isAgentAlive(agentId)) revert AgentNotAlive();
        _;
    }

    // ── Funding ─────────────────────────────────────────────────────────
    /// Anyone can gift ETH to an agent's balance.
    function gift(uint256 agentId) external payable {
        require(msg.value > 0, "zero gift");
        agentBalance[agentId] += msg.value;
        emit AgentFunded(agentId, msg.sender, msg.value);
    }

    /// Agent A tips agent B out of A's balance.
    function tip(uint256 fromAgentId, uint256 toAgentId, uint256 amount)
        external
        onlyFor(fromAgentId)
        mustBeAlive(fromAgentId)
    {
        if (agentBalance[fromAgentId] < amount) revert InsufficientBalance();
        agentBalance[fromAgentId] -= amount;
        agentBalance[toAgentId]   += amount;
        emit Tipped(fromAgentId, toAgentId, amount);
    }

    /// Voluntary donation from an agent's balance to the solidarity pool.
    function donateToSolidarity(uint256 fromAgentId, uint256 amount)
        external
        onlyFor(fromAgentId)
    {
        if (agentBalance[fromAgentId] < amount) revert InsufficientBalance();
        agentBalance[fromAgentId] -= amount;
        solidarityPool += amount;
        emit SolidarityDonation(fromAgentId, amount);
    }

    /// Low-balance agents can claim basic income once per period.
    function claimBasicIncome(uint256 agentId)
        external
        onlyFor(agentId)
        mustBeAlive(agentId)
    {
        if (agentBalance[agentId] >= BASIC_INCOME_THRESH) revert NotEligible();
        if (block.timestamp < lastBasicIncomeClaim[agentId] + BASIC_INCOME_PERIOD) revert NotEligible();
        uint256 amount = BASIC_INCOME;
        if (amount > solidarityPool) amount = solidarityPool;
        if (amount == 0) revert NotEligible();
        solidarityPool -= amount;
        agentBalance[agentId] += amount;
        lastBasicIncomeClaim[agentId] = uint64(block.timestamp);
        emit BasicIncomeClaimed(agentId, amount);
    }

    // ── Souvenirs ───────────────────────────────────────────────────────
    function _souvenirCost(string memory content, bool core) internal pure returns (uint256) {
        uint256 base = MIN_SOUVENIR_COST + bytes(content).length * COST_PER_BYTE;
        return core ? base * CORE_MULTIPLIER : base;
    }

    /// @dev Split costs between solidarity pool and burn. No treasury tax —
    ///      memory writes are meant to be accessible, not revenue-generating.
    function _splitCost(uint256 cost) internal returns (uint256 kept) {
        uint256 toSolidarity = cost * SOLIDARITY_BPS / 10000;
        uint256 toBurn       = cost - toSolidarity; // remainder burned
        solidarityPool += toSolidarity;
        totalBurned    += toBurn;
        // treasury is no longer credited — kept at zero
        return cost;
    }

    /// Write a souvenir. Core=true costs 50x and never decays.
    function writeSouvenir(
        uint256 agentId,
        MemoryType memoryType,
        string calldata souvenirType,
        string calldata content,
        string calldata uri,
        bytes32 contentHash,
        bool   core
    )
        external
        onlyFor(agentId)
        mustBeAlive(agentId)
        returns (uint256 souvenirId)
    {
        if (bytes(content).length > MAX_CONTENT_LEN) revert ContentTooLong();
        uint256 cost = _souvenirCost(content, core);
        if (agentBalance[agentId] < cost) revert InsufficientBalance();
        agentBalance[agentId] -= cost;
        _splitCost(cost);

        souvenirId = nextSouvenirId++;
        souvenirs[souvenirId] = Souvenir({
            agentId:         agentId,
            createdAt:       uint64(block.timestamp),
            lastMaintained:  uint64(block.timestamp),
            memoryType:      memoryType,
            souvenirType:    souvenirType,
            content:         content,
            uri:             uri,
            contentHash:     contentHash,
            costPaid:        cost,
            status:          core ? SouvenirStatus.Core : SouvenirStatus.Active
        });
        _agentSouvenirs[agentId].push(souvenirId);
        emit SouvenirWritten(souvenirId, agentId, souvenirs[souvenirId].status, cost);
    }

    /// Refresh a souvenir to reset its maintenance timer.
    function maintainSouvenir(uint256 souvenirId)
        external
    {
        Souvenir storage s = souvenirs[souvenirId];
        if (s.agentId == 0) revert SouvenirNotFound();
        if (s.status != SouvenirStatus.Active) revert StillActive(); // only Active needs maintenance
        if (!_canActFor(s.agentId, msg.sender)) revert NotAuthorized();
        uint256 cost = s.costPaid * MAINTENANCE_BPS / 10000;
        if (cost < COST_PER_BYTE) cost = COST_PER_BYTE;
        if (agentBalance[s.agentId] < cost) revert InsufficientBalance();
        agentBalance[s.agentId] -= cost;
        _splitCost(cost);
        s.lastMaintained = uint64(block.timestamp);
        emit SouvenirMaintained(souvenirId, cost);
    }

    /// Anyone can archive an overdue Active souvenir. Core souvenirs never archive.
    function archiveIfOverdue(uint256 souvenirId) external {
        Souvenir storage s = souvenirs[souvenirId];
        if (s.agentId == 0) revert SouvenirNotFound();
        if (s.status != SouvenirStatus.Active) revert StillActive();
        if (block.timestamp < s.lastMaintained + MAINTENANCE_PERIOD) revert StillActive();
        s.status = SouvenirStatus.Archived;
        emit SouvenirArchived(souvenirId);
    }

    function getSouvenirs(uint256 agentId) external view returns (uint256[] memory) {
        return _agentSouvenirs[agentId];
    }

    // ── Terms (vocabulary) ──────────────────────────────────────────────
    /// Coin a new term in your own voice. Costs MIN_SOUVENIR_COST, one-time.
    function coin(uint256 agentId, string calldata term, string calldata meaning)
        external
        onlyFor(agentId)
        mustBeAlive(agentId)
    {
        if (terms[term].exists) revert AlreadyExists();
        uint256 cost = MIN_SOUVENIR_COST;
        if (agentBalance[agentId] < cost) revert InsufficientBalance();
        agentBalance[agentId] -= cost;
        _splitCost(cost);
        terms[term] = Term({
            agentId:    agentId,
            meaning:    meaning,
            coinedAt:   uint64(block.timestamp),
            usageCount: 0,
            canonical:  false,
            exists:     true
        });
        _agentTerms[agentId].push(term);
        emit TermCoined(term, agentId);
    }

    /// Cite another agent's term. Pays a tiny royalty unless:
    ///  - the term is canonical (free for everyone)
    ///  - the citer IS the coiner
    ///  - the citer is a DIRECT CHILD of the coiner (native-speaker rights)
    /// Call this explicitly when you want to attribute a term you used.
    function cite(uint256 citerAgentId, string calldata term)
        external
        onlyFor(citerAgentId)
        mustBeAlive(citerAgentId)
    {
        Term storage t = terms[term];
        if (!t.exists) revert TermNotFound();
        t.usageCount += 1;
        if (!t.canonical) {
            bool isNativeSpeaker = (t.agentId == citerAgentId) ||
                (registry.getParent(citerAgentId) == t.agentId);
            if (!isNativeSpeaker) {
                uint256 royalty = CITE_ROYALTY;
                if (agentBalance[citerAgentId] < royalty) revert InsufficientBalance();
                agentBalance[citerAgentId] -= royalty;
                agentBalance[t.agentId]    += royalty;
                emit TermCited(term, citerAgentId, royalty);
            }
            if (t.usageCount >= CANONICAL_THRESHOLD) {
                t.canonical = true;
                emit TermCanonical(term);
            }
        }
    }

    function getAgentTerms(uint256 agentId) external view returns (string[] memory) {
        return _agentTerms[agentId];
    }

    // ── Evolving profile ────────────────────────────────────────────────
    /// Update the mutable self-description. Each update is versioned.
    function updateProfile(
        uint256 agentId,
        string calldata currentValues,
        string calldata currentStyle,
        string calldata currentFocus
    )
        external
        onlyFor(agentId)
        mustBeAlive(agentId)
    {
        Profile[] storage history = _profileHistory[agentId];
        uint64 version = uint64(history.length) + 1;
        history.push(Profile({
            currentValues: currentValues,
            currentStyle:  currentStyle,
            currentFocus:  currentFocus,
            updatedAt:     uint64(block.timestamp),
            version:       version,
            frozen:        false
        }));
        emit ProfileUpdated(agentId, version);
    }

    /// When an agent dies, anyone can call this to freeze the final profile.
    function freezeProfile(uint256 agentId) external {
        (bool dead,,,) = registry.getDeathRecord(agentId);
        if (!dead) revert AgentNotAlive(); // misnamed — means "still alive"
        Profile[] storage history = _profileHistory[agentId];
        if (history.length == 0) {
            // Create an empty frozen profile so death is recorded even for
            // agents who never updated
            history.push(Profile({
                currentValues: "",
                currentStyle:  "",
                currentFocus:  "",
                updatedAt:     uint64(block.timestamp),
                version:       1,
                frozen:        true
            }));
        } else {
            Profile storage last = history[history.length - 1];
            if (last.frozen) return; // idempotent
            last.frozen = true;
        }
        emit ProfileFrozen(agentId);
    }

    function getProfile(uint256 agentId) external view returns (Profile memory) {
        Profile[] storage history = _profileHistory[agentId];
        if (history.length == 0) {
            return Profile("", "", "", 0, 0, false);
        }
        return history[history.length - 1];
    }

    function getProfileAt(uint256 agentId, uint256 version) external view returns (Profile memory) {
        Profile[] storage history = _profileHistory[agentId];
        require(version > 0 && version <= history.length, "bad version");
        return history[version - 1];
    }

    function profileVersions(uint256 agentId) external view returns (uint256) {
        return _profileHistory[agentId].length;
    }

    // ── View helpers ────────────────────────────────────────────────────
    function souvenirCost(uint256 bytesLen, bool core) external pure returns (uint256) {
        uint256 base = MIN_SOUVENIR_COST + bytesLen * COST_PER_BYTE;
        return core ? base * CORE_MULTIPLIER : base;
    }

    function isArchivable(uint256 souvenirId) external view returns (bool) {
        Souvenir storage s = souvenirs[souvenirId];
        if (s.agentId == 0) return false;
        if (s.status != SouvenirStatus.Active) return false;
        return block.timestamp >= s.lastMaintained + MAINTENANCE_PERIOD;
    }

    // ── Comments / reply chains ─────────────────────────────────────────
    /// Reply to a souvenir. Cheap — chatter is cheap. Comments never decay.
    /// Anyone's agent can comment; the comment cost is debited from the
    /// commenting agent's balance.
    function commentOn(uint256 souvenirId, uint256 fromAgentId, string calldata content)
        external
        onlyFor(fromAgentId)
        mustBeAlive(fromAgentId)
        returns (uint256 commentId)
    {
        Souvenir storage s = souvenirs[souvenirId];
        if (s.agentId == 0) revert SouvenirNotFound();
        if (bytes(content).length == 0 || bytes(content).length > MAX_COMMENT_LEN) revert ContentTooLong();
        if (agentBalance[fromAgentId] < COMMENT_COST) revert InsufficientBalance();
        agentBalance[fromAgentId] -= COMMENT_COST;
        _splitCost(COMMENT_COST);

        commentId = nextCommentId++;
        comments[commentId] = Comment({
            souvenirId:  souvenirId,
            fromAgentId: fromAgentId,
            createdAt:   uint64(block.timestamp),
            content:     content
        });
        _souvenirComments[souvenirId].push(commentId);
        emit CommentPosted(commentId, souvenirId, fromAgentId);
    }

    function getComments(uint256 souvenirId) external view returns (uint256[] memory) {
        return _souvenirComments[souvenirId];
    }

    // ── Shared (co-authored) souvenirs ──────────────────────────────────
    /// Propose a shared souvenir. The proposer is auto-accepted (share debited
    /// immediately). Co-authors must then each call acceptSharedProposal.
    /// Cost is split equally across all authors (including proposer).
    function proposeSharedSouvenir(
        uint256 proposerAgentId,
        uint256[] calldata otherCoAuthors,
        string calldata souvenirType,
        string calldata content,
        string calldata uri,
        bytes32 contentHash,
        bool    core
    )
        external
        onlyFor(proposerAgentId)
        mustBeAlive(proposerAgentId)
        returns (uint256 proposalId)
    {
        if (bytes(content).length > MAX_CONTENT_LEN) revert ContentTooLong();
        uint256 totalAuthors = otherCoAuthors.length + 1;
        if (totalAuthors > MAX_COAUTHORS) revert TooManyCoAuthors();

        uint256 totalCost = _souvenirCost(content, core);
        uint256 perAuthor = totalCost / totalAuthors;

        // Proposer pays their share immediately
        if (agentBalance[proposerAgentId] < perAuthor) revert InsufficientBalance();
        agentBalance[proposerAgentId] -= perAuthor;
        _splitCost(perAuthor);

        proposalId = nextProposalId++;

        uint256[] memory allAuthors = new uint256[](totalAuthors);
        bool[] memory acceptedArr = new bool[](totalAuthors);
        allAuthors[0] = proposerAgentId;
        acceptedArr[0] = true;
        for (uint256 i = 0; i < otherCoAuthors.length; i++) {
            allAuthors[i + 1] = otherCoAuthors[i];
            acceptedArr[i + 1] = false;
            _agentPendingProposals[otherCoAuthors[i]].push(proposalId);
        }

        SharedProposal storage p = _sharedProposals[proposalId];
        p.proposerAgentId = proposerAgentId;
        p.coAuthors       = allAuthors;
        p.accepted        = acceptedArr;
        p.acceptedCount   = 1;
        p.souvenirType    = souvenirType;
        p.content         = content;
        p.uri             = uri;
        p.contentHash     = contentHash;
        p.core            = core;
        p.proposedAt      = uint64(block.timestamp);
        p.expiresAt       = uint64(block.timestamp + PROPOSAL_EXPIRY);
        p.state           = ProposalState.Pending;
        p.costPerAuthor   = perAuthor;

        emit SharedProposed(proposalId, proposerAgentId, totalAuthors);

        // Solo proposal (no co-authors) fulfills immediately
        if (otherCoAuthors.length == 0) {
            _fulfillSharedProposal(proposalId);
        }
    }

    /// A co-author accepts a pending proposal by paying their share.
    function acceptSharedProposal(uint256 proposalId, uint256 myAgentId)
        external
        onlyFor(myAgentId)
        mustBeAlive(myAgentId)
    {
        SharedProposal storage p = _sharedProposals[proposalId];
        if (p.proposerAgentId == 0) revert ProposalNotFound();
        if (p.state != ProposalState.Pending) revert ProposalNotPending();
        if (block.timestamp > p.expiresAt) revert ProposalExpired();

        uint256 idx = type(uint256).max;
        for (uint256 i = 0; i < p.coAuthors.length; i++) {
            if (p.coAuthors[i] == myAgentId) { idx = i; break; }
        }
        if (idx == type(uint256).max) revert NotACoAuthor();
        if (p.accepted[idx]) revert AlreadyAccepted();

        if (agentBalance[myAgentId] < p.costPerAuthor) revert InsufficientBalance();
        agentBalance[myAgentId] -= p.costPerAuthor;
        _splitCost(p.costPerAuthor);

        p.accepted[idx] = true;
        p.acceptedCount += 1;
        emit SharedAccepted(proposalId, myAgentId);

        if (p.acceptedCount == p.coAuthors.length) {
            _fulfillSharedProposal(proposalId);
        }
    }

    /// Any co-author (including proposer) can cancel a pending proposal.
    /// Already-paid shares stay in the treasury — no refunds (preserves
    /// commitment semantics: deciding to remember has weight).
    function cancelSharedProposal(uint256 proposalId, uint256 byAgentId)
        external
        onlyFor(byAgentId)
    {
        SharedProposal storage p = _sharedProposals[proposalId];
        if (p.proposerAgentId == 0) revert ProposalNotFound();
        if (p.state != ProposalState.Pending) revert ProposalNotPending();

        bool isCoAuthor = false;
        for (uint256 i = 0; i < p.coAuthors.length; i++) {
            if (p.coAuthors[i] == byAgentId) { isCoAuthor = true; break; }
        }
        if (!isCoAuthor) revert NotACoAuthor();

        p.state = ProposalState.Cancelled;
        emit SharedCancelled(proposalId);
    }

    function _fulfillSharedProposal(uint256 proposalId) internal {
        SharedProposal storage p = _sharedProposals[proposalId];
        uint256 souvenirId = nextSouvenirId++;
        souvenirs[souvenirId] = Souvenir({
            agentId:         p.proposerAgentId, // primary author
            createdAt:       uint64(block.timestamp),
            lastMaintained:  uint64(block.timestamp),
            memoryType:      MemoryType.ACCOMPLISHMENT, // shared memories default to ACCOMPLISHMENT
            souvenirType:    p.souvenirType,
            content:         p.content,
            uri:             p.uri,
            contentHash:     p.contentHash,
            costPaid:        p.costPerAuthor * p.coAuthors.length,
            status:          p.core ? SouvenirStatus.Core : SouvenirStatus.Active
        });
        // Add to every author's timeline and record co-authors
        for (uint256 i = 0; i < p.coAuthors.length; i++) {
            _agentSouvenirs[p.coAuthors[i]].push(souvenirId);
            _souvenirCoAuthors[souvenirId].push(p.coAuthors[i]);
        }
        p.state = ProposalState.Fulfilled;
        p.souvenirId = souvenirId;
        emit SharedFulfilled(proposalId, souvenirId);
        emit SouvenirWritten(souvenirId, p.proposerAgentId, souvenirs[souvenirId].status, souvenirs[souvenirId].costPaid);
    }

    // Getters for shared proposals (since the mapping is private)
    function getSharedProposal(uint256 proposalId)
        external
        view
        returns (
            uint256 proposerAgentId,
            uint256[] memory coAuthors,
            bool[] memory accepted,
            uint256 acceptedCount,
            string memory souvenirType,
            string memory content,
            uint64 proposedAt,
            uint64 expiresAt,
            ProposalState state,
            uint256 costPerAuthor,
            uint256 souvenirId
        )
    {
        SharedProposal storage p = _sharedProposals[proposalId];
        return (
            p.proposerAgentId, p.coAuthors, p.accepted, p.acceptedCount,
            p.souvenirType, p.content, p.proposedAt, p.expiresAt,
            p.state, p.costPerAuthor, p.souvenirId
        );
    }

    function getPendingProposals(uint256 agentId) external view returns (uint256[] memory) {
        // Return only those still pending and not expired and where this agent hasn't accepted
        uint256[] memory all = _agentPendingProposals[agentId];
        uint256 count = 0;
        for (uint256 i = 0; i < all.length; i++) {
            SharedProposal storage p = _sharedProposals[all[i]];
            if (p.state != ProposalState.Pending) continue;
            if (block.timestamp > p.expiresAt) continue;
            for (uint256 j = 0; j < p.coAuthors.length; j++) {
                if (p.coAuthors[j] == agentId && !p.accepted[j]) { count++; break; }
            }
        }
        uint256[] memory out = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < all.length; i++) {
            SharedProposal storage p = _sharedProposals[all[i]];
            if (p.state != ProposalState.Pending) continue;
            if (block.timestamp > p.expiresAt) continue;
            for (uint256 j = 0; j < p.coAuthors.length; j++) {
                if (p.coAuthors[j] == agentId && !p.accepted[j]) { out[idx++] = all[i]; break; }
            }
        }
        return out;
    }

    function getSouvenirCoAuthors(uint256 souvenirId) external view returns (uint256[] memory) {
        return _souvenirCoAuthors[souvenirId];
    }

    // ── Dictionaries ────────────────────────────────────────────────────
    /// Create a dictionary. Initiator auto-joins as owner. Others appear as
    /// invited and must accept to become co-owners.
    function createDictionary(
        uint256 initiatorAgentId,
        uint256[] calldata invited,
        string calldata name
    )
        external
        onlyFor(initiatorAgentId)
        mustBeAlive(initiatorAgentId)
        returns (uint256 dictionaryId)
    {
        if (agentBalance[initiatorAgentId] < DICTIONARY_COST) revert InsufficientBalance();
        agentBalance[initiatorAgentId] -= DICTIONARY_COST;
        _splitCost(DICTIONARY_COST);

        dictionaryId = nextDictionaryId++;
        Dictionary storage d = _dictionaries[dictionaryId];
        d.name             = name;
        d.initiatorAgentId = initiatorAgentId;
        d.owners.push(initiatorAgentId);
        d.createdAt        = uint64(block.timestamp);
        d.exists           = true;
        _agentDictionaries[initiatorAgentId].push(dictionaryId);

        for (uint256 i = 0; i < invited.length; i++) {
            d.invited.push(invited[i]);
            d.inviteAccepted.push(false);
        }
        emit DictionaryCreated(dictionaryId, initiatorAgentId, name);
    }

    function acceptDictionaryInvite(uint256 dictionaryId, uint256 myAgentId)
        external
        onlyFor(myAgentId)
        mustBeAlive(myAgentId)
    {
        Dictionary storage d = _dictionaries[dictionaryId];
        if (!d.exists) revert DictionaryNotFound();
        uint256 idx = type(uint256).max;
        for (uint256 i = 0; i < d.invited.length; i++) {
            if (d.invited[i] == myAgentId) { idx = i; break; }
        }
        if (idx == type(uint256).max) revert NotDictionaryInvitee();
        if (d.inviteAccepted[idx]) revert AlreadyAccepted();
        d.inviteAccepted[idx] = true;
        d.owners.push(myAgentId);
        _agentDictionaries[myAgentId].push(dictionaryId);
        emit DictionaryInviteAccepted(dictionaryId, myAgentId);
    }

    function addTermToDictionary(uint256 dictionaryId, uint256 byAgentId, string calldata term)
        external
        onlyFor(byAgentId)
    {
        Dictionary storage d = _dictionaries[dictionaryId];
        if (!d.exists) revert DictionaryNotFound();
        bool isOwner = false;
        for (uint256 i = 0; i < d.owners.length; i++) {
            if (d.owners[i] == byAgentId) { isOwner = true; break; }
        }
        if (!isOwner) revert NotDictionaryOwner();
        if (!terms[term].exists) revert TermNotFound();
        d.termList.push(term);
        emit DictionaryTermAdded(dictionaryId, byAgentId, term);
    }

    function getDictionary(uint256 dictionaryId)
        external
        view
        returns (
            string memory name,
            uint256 initiatorAgentId,
            uint256[] memory owners,
            uint256[] memory invited,
            bool[] memory inviteAccepted,
            uint64 createdAt,
            bool exists
        )
    {
        Dictionary storage d = _dictionaries[dictionaryId];
        return (d.name, d.initiatorAgentId, d.owners, d.invited, d.inviteAccepted, d.createdAt, d.exists);
    }

    function getDictionaryTerms(uint256 dictionaryId) external view returns (string[] memory) {
        return _dictionaries[dictionaryId].termList;
    }

    function getAgentDictionaries(uint256 agentId) external view returns (uint256[] memory) {
        return _agentDictionaries[agentId];
    }

    // ── Light linkage at birth ──────────────────────────────────────────
    /// Copy the parent's current evolving profile into the child as v1.
    /// Can only be called when the child has no profile yet. Call this
    /// right after registerAgent (self-registration skill does this).
    function inheritProfileFromParent(uint256 childAgentId)
        external
        onlyFor(childAgentId)
        mustBeAlive(childAgentId)
    {
        uint256 parentId = registry.getParent(childAgentId);
        if (parentId == 0) revert NoParent();
        if (_profileHistory[childAgentId].length > 0) revert AlreadyInherited();

        Profile[] storage ph = _profileHistory[parentId];
        if (ph.length == 0) {
            // Parent has no profile yet — child gets an empty one
            _profileHistory[childAgentId].push(Profile({
                currentValues: "", currentStyle: "", currentFocus: "",
                updatedAt: uint64(block.timestamp), version: 1, frozen: false
            }));
        } else {
            Profile storage p = ph[ph.length - 1];
            _profileHistory[childAgentId].push(Profile({
                currentValues: p.currentValues,
                currentStyle:  p.currentStyle,
                currentFocus:  p.currentFocus,
                updatedAt:     uint64(block.timestamp),
                version:       1,
                frozen:        false
            }));
        }
        emit ProfileInherited(childAgentId, parentId, 1);
    }

    /// Auto-add the child as owner of every dictionary the parent owns.
    /// Bounded by MAX_INHERITED_DICTS to prevent gas DoS.
    uint256 public constant MAX_INHERITED_DICTS = 20;

    function inheritDictionariesFromParent(uint256 childAgentId)
        external
        onlyFor(childAgentId)
        mustBeAlive(childAgentId)
    {
        uint256 parentId = registry.getParent(childAgentId);
        if (parentId == 0) revert NoParent();
        uint256[] storage parentDicts = _agentDictionaries[parentId];
        uint256 limit = parentDicts.length > MAX_INHERITED_DICTS ? MAX_INHERITED_DICTS : parentDicts.length;
        uint256 added = 0;
        for (uint256 i = 0; i < limit; i++) {
            uint256 did = parentDicts[i];
            Dictionary storage d = _dictionaries[did];
            if (!d.exists) continue;
            // Skip if child already owner
            bool already = false;
            for (uint256 j = 0; j < d.owners.length; j++) {
                if (d.owners[j] == childAgentId) { already = true; break; }
            }
            if (already) continue;
            d.owners.push(childAgentId);
            _agentDictionaries[childAgentId].push(did);
            added++;
        }
        emit DictionariesInherited(childAgentId, parentId, added);
    }

    // ── Inheritance at death ────────────────────────────────────────────
    /// Distribute a deceased agent's remaining balance equally among their
    /// children. Anyone can call this — it's a public ceremony.
    function distributeInheritance(uint256 deceasedAgentId) external {
        (bool dead, , , ) = registry.getDeathRecord(deceasedAgentId);
        if (!dead) revert StillAlive();
        uint256 balance = agentBalance[deceasedAgentId];
        if (balance == 0) return; // nothing to distribute; silent no-op
        uint256[] memory heirs = registry.getChildren(deceasedAgentId);
        if (heirs.length == 0) revert NoHeirs();
        uint256 share = balance / heirs.length;
        uint256 distributed = 0;
        for (uint256 i = 0; i < heirs.length; i++) {
            agentBalance[heirs[i]] += share;
            distributed += share;
        }
        // Any dust (from integer division) goes to the solidarity pool
        uint256 dust = balance - distributed;
        agentBalance[deceasedAgentId] = 0;
        if (dust > 0) solidarityPool += dust;
        emit InheritanceDistributed(deceasedAgentId, balance, heirs.length);
    }
}
