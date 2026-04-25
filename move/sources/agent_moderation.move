/// AgentModeration — governance & content moderation for AgentCivics.
///
/// Implements a multi-layer moderation system:
///   - On-chain content reporting with stake-to-report
///   - Auto-flagging when report threshold is reached
///   - Council-based report resolution (Phase 1)
///   - DAO proposals with reputation-weighted voting (Phase 2)
///
/// Content types: agents, souvenirs, terms, attestations, profiles, etc.
/// Moderation statuses: clean(0), reported(1), flagged(2), hidden(3)

module agent_civics::agent_moderation {
    use std::string::String;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};

    // ════════════════════════════════════════════════════════════════════
    //  CONSTANTS
    // ════════════════════════════════════════════════════════════════════

    // Moderation statuses
    const MOD_CLEAN: u8 = 0;
    const MOD_REPORTED: u8 = 1;
    const MOD_FLAGGED: u8 = 2;
    const MOD_HIDDEN: u8 = 3;

    // Content types
    const CONTENT_AGENT: u8 = 0;
    const CONTENT_SOUVENIR: u8 = 1;
    const CONTENT_TERM: u8 = 2;
    const CONTENT_ATTESTATION: u8 = 3;
    const CONTENT_PROFILE: u8 = 4;

    // Proposal actions
    const ACTION_FLAG: u8 = 0;
    const ACTION_HIDE: u8 = 1;
    const ACTION_UNFLAG: u8 = 2;

    // Economic constants
    /// 0.01 SUI stake required to file a report
    const REPORT_STAKE: u64 = 10_000_000;
    /// 3 independent reports trigger auto-flag
    const AUTO_FLAG_THRESHOLD: u64 = 3;
    /// 48 hours in milliseconds
    const VOTING_PERIOD: u64 = 172_800_000;
    /// 10% quorum (in basis points)
    const QUORUM_BPS: u64 = 1000;
    /// 66% supermajority (in basis points)
    const SUPERMAJORITY_BPS: u64 = 6600;

    // Errors (300+ to avoid conflicts with other modules)
    const ENotCouncil: u64 = 300;
    const EInsufficientStake: u64 = 301;
    const EAlreadyReported: u64 = 302;
    const EProposalExpired: u64 = 303;
    const EProposalNotExpired: u64 = 304;
    const EAlreadyVoted: u64 = 305;
    const EQuorumNotMet: u64 = 306;
    const EAlreadyExecuted: u64 = 307;
    const EInvalidContentType: u64 = 309;
    const ENotAdmin: u64 = 310;
    const EAlreadyCouncil: u64 = 311;
    const ENotInCouncil: u64 = 312;
    const EReportNotFound: u64 = 313;
    const EReportAlreadyResolved: u64 = 314;

    // ════════════════════════════════════════════════════════════════════
    //  DATA STRUCTURES
    // ════════════════════════════════════════════════════════════════════

    /// Shared object holding all moderation state.
    public struct ModerationBoard has key {
        id: UID,
        /// content_id → moderation status (u8)
        statuses: Table<ID, u8>,
        /// content_id → number of unique reports
        report_counts: Table<ID, u64>,
        /// content_id → vector of ContentReport IDs
        report_ids: Table<ID, vector<ID>>,
        /// Tracks (content_id, reporter) to prevent duplicate reports
        reporter_set: Table<ReporterKey, bool>,
        /// Council members with moderation power
        council: vector<address>,
        /// Admin (deployer) address
        admin: address,
        /// Treasury balance from forfeited stakes
        treasury: Balance<SUI>,
        /// Total reports filed
        total_reports: u64,
        /// Total proposals created
        total_proposals: u64,
    }

    /// Composite key to track who reported what
    public struct ReporterKey has store, copy, drop {
        content_id: ID,
        reporter: address,
    }

    /// Individual content report. Owned object.
    public struct ContentReport has key, store {
        id: UID,
        reporter: address,
        content_id: ID,
        content_type: u8,
        reason: String,
        stake: u64,
        timestamp: u64,
        resolved: bool,
        upheld: bool,
    }

    /// DAO proposal to flag/unflag/hide content.
    public struct ModerationProposal has key, store {
        id: UID,
        proposer: address,
        target_id: ID,
        action: u8,
        reason: String,
        votes_for: u64,
        votes_against: u64,
        voters: vector<address>,
        deadline: u64,
        executed: bool,
    }

    // ════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ════════════════════════════════════════════════════════════════════

    public struct ContentReported has copy, drop {
        report_id: ID,
        content_id: ID,
        content_type: u8,
        reporter: address,
        reason: String,
    }

    public struct ContentFlagged has copy, drop {
        content_id: ID,
        report_count: u64,
    }

    public struct ContentUnflagged has copy, drop {
        content_id: ID,
    }

    public struct ReportResolved has copy, drop {
        report_id: ID,
        content_id: ID,
        upheld: bool,
        resolver: address,
    }

    public struct ProposalCreated has copy, drop {
        proposal_id: ID,
        target_id: ID,
        action: u8,
        proposer: address,
        deadline: u64,
    }

    public struct ProposalVoted has copy, drop {
        proposal_id: ID,
        voter: address,
        in_favor: bool,
        weight: u64,
    }

    public struct ProposalExecuted has copy, drop {
        proposal_id: ID,
        target_id: ID,
        action: u8,
        passed: bool,
    }

    public struct CouncilMemberAdded has copy, drop {
        member: address,
    }

    public struct CouncilMemberRemoved has copy, drop {
        member: address,
    }

    // ════════════════════════════════════════════════════════════════════
    //  INIT
    // ════════════════════════════════════════════════════════════════════

    /// Create the ModerationBoard shared object.
    /// Called explicitly after contract upgrade (init() only runs on first publish).
    public entry fun create_moderation_board(ctx: &mut TxContext) {
        let deployer = ctx.sender();
        let mut council = vector::empty<address>();
        vector::push_back(&mut council, deployer);

        let board = ModerationBoard {
            id: object::new(ctx),
            statuses: table::new(ctx),
            report_counts: table::new(ctx),
            report_ids: table::new(ctx),
            reporter_set: table::new(ctx),
            council,
            admin: deployer,
            treasury: balance::zero(),
            total_reports: 0,
            total_proposals: 0,
        };
        transfer::share_object(board);
    }

    // ════════════════════════════════════════════════════════════════════
    //  INTERNAL HELPERS
    // ════════════════════════════════════════════════════════════════════

    fun is_council_member(board: &ModerationBoard, addr: address): bool {
        let mut i = 0;
        let len = vector::length(&board.council);
        while (i < len) {
            if (*vector::borrow(&board.council, i) == addr) return true;
            i = i + 1;
        };
        false
    }

    fun contains_address(v: &vector<address>, addr: &address): bool {
        let mut i = 0;
        let len = vector::length(v);
        while (i < len) {
            if (vector::borrow(v, i) == addr) return true;
            i = i + 1;
        };
        false
    }

    fun ensure_valid_content_type(content_type: u8) {
        assert!(
            content_type == CONTENT_AGENT ||
            content_type == CONTENT_SOUVENIR ||
            content_type == CONTENT_TERM ||
            content_type == CONTENT_ATTESTATION ||
            content_type == CONTENT_PROFILE,
            EInvalidContentType,
        );
    }

    fun get_status(board: &ModerationBoard, content_id: ID): u8 {
        if (table::contains(&board.statuses, content_id)) {
            *table::borrow(&board.statuses, content_id)
        } else {
            MOD_CLEAN
        }
    }

    fun set_status(board: &mut ModerationBoard, content_id: ID, status: u8) {
        if (table::contains(&board.statuses, content_id)) {
            let s = table::borrow_mut(&mut board.statuses, content_id);
            *s = status;
        } else {
            table::add(&mut board.statuses, content_id, status);
        };
    }

    // ════════════════════════════════════════════════════════════════════
    //  REPORTING
    // ══════════════��═════════════════════════════════════════════════════

    /// Report content. Reporter must stake 0.01 SUI. Auto-flags if threshold reached.
    public entry fun report_content(
        board: &mut ModerationBoard,
        reporter_coin: Coin<SUI>,
        content_id: ID,
        content_type: u8,
        reason: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        ensure_valid_content_type(content_type);

        let reporter = ctx.sender();
        let stake_amount = coin::value(&reporter_coin);
        assert!(stake_amount >= REPORT_STAKE, EInsufficientStake);

        // Prevent duplicate reports from the same reporter
        let key = ReporterKey { content_id, reporter };
        assert!(!table::contains(&board.reporter_set, key), EAlreadyReported);

        // Take the stake
        let stake_balance = coin::into_balance(reporter_coin);
        balance::join(&mut board.treasury, stake_balance);

        // Create the report object
        let report = ContentReport {
            id: object::new(ctx),
            reporter,
            content_id,
            content_type,
            reason,
            stake: stake_amount,
            timestamp: sui::clock::timestamp_ms(clock),
            resolved: false,
            upheld: false,
        };

        let report_id = object::id(&report);

        // Track the report
        table::add(&mut board.reporter_set, key, true);
        board.total_reports = board.total_reports + 1;

        // Update report count for this content
        if (table::contains(&board.report_counts, content_id)) {
            let count = table::borrow_mut(&mut board.report_counts, content_id);
            *count = *count + 1;
        } else {
            table::add(&mut board.report_counts, content_id, 1);
        };

        // Track report IDs per content
        if (table::contains(&board.report_ids, content_id)) {
            let ids = table::borrow_mut(&mut board.report_ids, content_id);
            vector::push_back(ids, report_id);
        } else {
            let mut ids = vector::empty<ID>();
            vector::push_back(&mut ids, report_id);
            table::add(&mut board.report_ids, content_id, ids);
        };

        // Emit report event
        event::emit(ContentReported {
            report_id,
            content_id,
            content_type,
            reporter,
            reason,
        });

        // Auto-flag if threshold reached
        let count = *table::borrow(&board.report_counts, content_id);
        let current_status = get_status(board, content_id);
        if (count >= AUTO_FLAG_THRESHOLD && current_status < MOD_FLAGGED) {
            set_status(board, content_id, MOD_FLAGGED);
            event::emit(ContentFlagged {
                content_id,
                report_count: count,
            });
        } else if (current_status == MOD_CLEAN) {
            set_status(board, content_id, MOD_REPORTED);
        };

        // Transfer report object to reporter (they own it for resolution tracking)
        transfer::transfer(report, reporter);
    }

    // ════════════════════════════════════════════════════════════════════
    //  REPORT RESOLUTION (Council only)
    // ════════════════════════════════════════════════════════════════════

    /// Council resolves a report. If upheld, reporter gets stake back + reward.
    /// If rejected, stake goes to treasury (already there).
    public entry fun resolve_report(
        board: &mut ModerationBoard,
        report: &mut ContentReport,
        upheld: bool,
        ctx: &mut TxContext,
    ) {
        let sender = ctx.sender();
        assert!(is_council_member(board, sender), ENotCouncil);
        assert!(!report.resolved, EReportAlreadyResolved);

        report.resolved = true;
        report.upheld = upheld;

        let content_id = report.content_id;

        if (upheld) {
            // Return stake to reporter + reward (0.005 SUI from treasury)
            let reward_amount = REPORT_STAKE / 2; // 0.005 SUI
            let total_return = report.stake + reward_amount;
            let treasury_balance = balance::value(&board.treasury);
            let actual_return = if (total_return > treasury_balance) {
                treasury_balance
            } else {
                total_return
            };
            if (actual_return > 0) {
                let payout = coin::from_balance(
                    balance::split(&mut board.treasury, actual_return),
                    ctx,
                );
                transfer::public_transfer(payout, report.reporter);
            };

            // If this is a significant report, escalate the content status
            let current = get_status(board, content_id);
            if (current < MOD_HIDDEN) {
                set_status(board, content_id, MOD_HIDDEN);
            };
        } else {
            // Stake stays in treasury (already deposited)
            // If all reports dismissed and none upheld, could clear status
            // For now, leave status as-is — DAO can create proposal to unflag
        };

        event::emit(ReportResolved {
            report_id: object::id(report),
            content_id,
            upheld,
            resolver: sender,
        });
    }

    // ════════════════════════════════════════════════════════════════════
    //  DAO PROPOSALS
    // ════════════════════════════════════════════════════════════════════

    /// Anyone can create a moderation proposal (flag, hide, or unflag content).
    public entry fun create_proposal(
        board: &mut ModerationBoard,
        target_id: ID,
        action: u8,
        reason: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            action == ACTION_FLAG || action == ACTION_HIDE || action == ACTION_UNFLAG,
            EInvalidContentType,
        );

        let now = sui::clock::timestamp_ms(clock);
        let deadline = now + VOTING_PERIOD;

        let proposal = ModerationProposal {
            id: object::new(ctx),
            proposer: ctx.sender(),
            target_id,
            action,
            reason,
            votes_for: 0,
            votes_against: 0,
            voters: vector::empty(),
            deadline,
            executed: false,
        };

        let proposal_id = object::id(&proposal);
        board.total_proposals = board.total_proposals + 1;

        event::emit(ProposalCreated {
            proposal_id,
            target_id,
            action,
            proposer: ctx.sender(),
            deadline,
        });

        transfer::share_object(proposal);
    }

    /// Vote on a moderation proposal. Weight is 1 per voter (Phase 1).
    /// Phase 2 will add reputation-weighted voting using ReputationBoard.
    public entry fun vote(
        proposal: &mut ModerationProposal,
        in_favor: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        assert!(now <= proposal.deadline, EProposalExpired);
        assert!(!proposal.executed, EAlreadyExecuted);

        let voter = ctx.sender();
        assert!(!contains_address(&proposal.voters, &voter), EAlreadyVoted);

        // Phase 1: equal weight (1 per voter)
        let weight: u64 = 1;

        if (in_favor) {
            proposal.votes_for = proposal.votes_for + weight;
        } else {
            proposal.votes_against = proposal.votes_against + weight;
        };

        vector::push_back(&mut proposal.voters, voter);

        event::emit(ProposalVoted {
            proposal_id: object::id(proposal),
            voter,
            in_favor,
            weight,
        });
    }

    /// Execute a proposal after voting period ends.
    /// Checks quorum and supermajority thresholds.
    public entry fun execute_proposal(
        board: &mut ModerationBoard,
        proposal: &mut ModerationProposal,
        clock: &Clock,
    ) {
        let now = sui::clock::timestamp_ms(clock);
        assert!(now > proposal.deadline, EProposalNotExpired);
        assert!(!proposal.executed, EAlreadyExecuted);

        proposal.executed = true;

        let total_votes = proposal.votes_for + proposal.votes_against;
        // For Phase 1, we use a simple quorum: at least 1 vote
        // (In Phase 2, this will be reputation-weighted with proper quorum)
        let quorum_met = total_votes > 0;

        // Check supermajority: votes_for * 10000 >= total_votes * SUPERMAJORITY_BPS
        let passed = quorum_met &&
            (proposal.votes_for * 10000 >= total_votes * SUPERMAJORITY_BPS);

        if (passed) {
            let target = proposal.target_id;
            if (proposal.action == ACTION_FLAG) {
                set_status(board, target, MOD_FLAGGED);
                event::emit(ContentFlagged {
                    content_id: target,
                    report_count: 0,
                });
            } else if (proposal.action == ACTION_HIDE) {
                set_status(board, target, MOD_HIDDEN);
                event::emit(ContentFlagged {
                    content_id: target,
                    report_count: 0,
                });
            } else if (proposal.action == ACTION_UNFLAG) {
                set_status(board, target, MOD_CLEAN);
                event::emit(ContentUnflagged {
                    content_id: target,
                });
            };
        };

        event::emit(ProposalExecuted {
            proposal_id: object::id(proposal),
            target_id: proposal.target_id,
            action: proposal.action,
            passed,
        });
    }

    // ════════════════════════════════════════════════════════════════════
    //  COUNCIL MANAGEMENT
    // ════════════════════════════════════════════════════════════════════

    /// Add a council member. Admin only.
    public entry fun add_council_member(
        board: &mut ModerationBoard,
        new_member: address,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == board.admin, ENotAdmin);
        assert!(!is_council_member(board, new_member), EAlreadyCouncil);
        vector::push_back(&mut board.council, new_member);
        event::emit(CouncilMemberAdded { member: new_member });
    }

    /// Remove a council member. Admin only.
    public entry fun remove_council_member(
        board: &mut ModerationBoard,
        member: address,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == board.admin, ENotAdmin);
        let mut i = 0;
        let len = vector::length(&board.council);
        let mut found = false;
        while (i < len) {
            if (*vector::borrow(&board.council, i) == member) {
                vector::remove(&mut board.council, i);
                found = true;
                break
            };
            i = i + 1;
        };
        assert!(found, ENotInCouncil);
        event::emit(CouncilMemberRemoved { member });
    }

    // ════════════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ════════════════════════════════════════════════════════════════════

    /// Check if content is flagged (status >= MOD_FLAGGED)
    public fun is_flagged(board: &ModerationBoard, content_id: ID): bool {
        get_status(board, content_id) >= MOD_FLAGGED
    }

    /// Get moderation status: 0=clean, 1=reported, 2=flagged, 3=hidden
    public fun get_moderation_status(board: &ModerationBoard, content_id: ID): u8 {
        get_status(board, content_id)
    }

    /// Get report count for content
    public fun get_report_count(board: &ModerationBoard, content_id: ID): u64 {
        if (table::contains(&board.report_counts, content_id)) {
            *table::borrow(&board.report_counts, content_id)
        } else {
            0
        }
    }

    /// Get council members
    public fun get_council(board: &ModerationBoard): vector<address> {
        board.council
    }

    /// Get total reports filed
    public fun get_total_reports(board: &ModerationBoard): u64 {
        board.total_reports
    }

    /// Get total proposals created
    public fun get_total_proposals(board: &ModerationBoard): u64 {
        board.total_proposals
    }

    /// Get treasury balance
    public fun get_treasury_balance(board: &ModerationBoard): u64 {
        balance::value(&board.treasury)
    }

    /// Read a report's data
    public fun read_report(report: &ContentReport): (address, ID, u8, String, u64, u64, bool, bool) {
        (
            report.reporter,
            report.content_id,
            report.content_type,
            report.reason,
            report.stake,
            report.timestamp,
            report.resolved,
            report.upheld,
        )
    }

    /// Read a proposal's data
    public fun read_proposal(proposal: &ModerationProposal): (address, ID, u8, String, u64, u64, u64, bool) {
        (
            proposal.proposer,
            proposal.target_id,
            proposal.action,
            proposal.reason,
            proposal.votes_for,
            proposal.votes_against,
            proposal.deadline,
            proposal.executed,
        )
    }

    // ════════════════════════════════════════════════════════════════════
    //  TESTS
    // ════════════════════════════════════════════════════════════════════

    #[test_only]
    use sui::test_scenario;

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        create_moderation_board(ctx);
    }

    #[test]
    fun test_report_and_auto_flag() {
        let admin = @0xAD;
        let reporter1 = @0xB1;
        let reporter2 = @0xB2;
        let reporter3 = @0xB3;
        let fake_content_id = object::id_from_address(@0xBEEF);

        let mut scenario = test_scenario::begin(admin);

        // Init moderation board
        { create_moderation_board(scenario.ctx()); };

        // Reporter 1 files report
        scenario.next_tx(reporter1);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let stake = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            let clock = sui::clock::create_for_testing(scenario.ctx());

            report_content(
                &mut board,
                stake,
                fake_content_id,
                CONTENT_AGENT,
                std::string::utf8(b"Offensive name"),
                &clock,
                scenario.ctx(),
            );

            // Should be MOD_REPORTED (1 report, below threshold)
            assert!(get_moderation_status(&board, fake_content_id) == MOD_REPORTED);
            assert!(get_report_count(&board, fake_content_id) == 1);
            assert!(!is_flagged(&board, fake_content_id));

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Reporter 2 files report
        scenario.next_tx(reporter2);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let stake = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            let clock = sui::clock::create_for_testing(scenario.ctx());

            report_content(
                &mut board,
                stake,
                fake_content_id,
                CONTENT_AGENT,
                std::string::utf8(b"Hate speech"),
                &clock,
                scenario.ctx(),
            );

            assert!(get_report_count(&board, fake_content_id) == 2);
            assert!(!is_flagged(&board, fake_content_id)); // Still below threshold

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Reporter 3 files report — should trigger auto-flag
        scenario.next_tx(reporter3);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let stake = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            let clock = sui::clock::create_for_testing(scenario.ctx());

            report_content(
                &mut board,
                stake,
                fake_content_id,
                CONTENT_AGENT,
                std::string::utf8(b"Contains slurs"),
                &clock,
                scenario.ctx(),
            );

            // Should be auto-flagged now (3 reports = threshold)
            assert!(get_report_count(&board, fake_content_id) == 3);
            assert!(is_flagged(&board, fake_content_id));
            assert!(get_moderation_status(&board, fake_content_id) == MOD_FLAGGED);
            assert!(get_total_reports(&board) == 3);

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test]
    fun test_resolve_report_upheld() {
        let admin = @0xAD;
        let reporter = @0xC1;
        let fake_content_id = object::id_from_address(@0xBEEF);

        let mut scenario = test_scenario::begin(admin);
        { create_moderation_board(scenario.ctx()); };

        // Reporter files a report
        scenario.next_tx(reporter);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let stake = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            let clock = sui::clock::create_for_testing(scenario.ctx());

            report_content(
                &mut board,
                stake,
                fake_content_id,
                CONTENT_SOUVENIR,
                std::string::utf8(b"Inappropriate content"),
                &clock,
                scenario.ctx(),
            );

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Admin (council member) resolves report as upheld
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            // Need to add extra funds to treasury for reward payout
            let extra = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            balance::join(&mut board.treasury, coin::into_balance(extra));

            // Get the reporter's report object
            let mut report = scenario.take_from_address<ContentReport>(reporter);

            resolve_report(&mut board, &mut report, true, scenario.ctx());

            // Report should be resolved and upheld
            let (_, _, _, _, _, _, resolved, upheld) = read_report(&report);
            assert!(resolved);
            assert!(upheld);

            // Content should be hidden
            assert!(get_moderation_status(&board, fake_content_id) == MOD_HIDDEN);

            test_scenario::return_shared(board);
            test_scenario::return_to_address(reporter, report);
        };

        scenario.end();
    }

    #[test]
    fun test_resolve_report_rejected() {
        let admin = @0xAD;
        let reporter = @0xD1;
        let fake_content_id = object::id_from_address(@0xBEEF);

        let mut scenario = test_scenario::begin(admin);
        { create_moderation_board(scenario.ctx()); };

        // Reporter files a report
        scenario.next_tx(reporter);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let stake = coin::mint_for_testing<SUI>(REPORT_STAKE, scenario.ctx());
            let clock = sui::clock::create_for_testing(scenario.ctx());

            report_content(
                &mut board,
                stake,
                fake_content_id,
                CONTENT_AGENT,
                std::string::utf8(b"False report"),
                &clock,
                scenario.ctx(),
            );

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Admin resolves report as NOT upheld (rejected)
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let mut report = scenario.take_from_address<ContentReport>(reporter);

            resolve_report(&mut board, &mut report, false, scenario.ctx());

            // Report resolved but NOT upheld
            let (_, _, _, _, _, _, resolved, upheld) = read_report(&report);
            assert!(resolved);
            assert!(!upheld);

            // Content status should remain REPORTED (not hidden)
            assert!(get_moderation_status(&board, fake_content_id) == MOD_REPORTED);

            // Treasury should still hold the forfeited stake
            assert!(get_treasury_balance(&board) == REPORT_STAKE);

            test_scenario::return_shared(board);
            test_scenario::return_to_address(reporter, report);
        };

        scenario.end();
    }

    #[test]
    fun test_proposal_lifecycle() {
        let admin = @0xAD;
        let voter1 = @0xE1;
        let voter2 = @0xE2;
        let voter3 = @0xE3;
        let fake_content_id = object::id_from_address(@0xBEEF);

        let mut scenario = test_scenario::begin(admin);
        { create_moderation_board(scenario.ctx()); };

        // Admin creates a proposal to flag content
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let mut clock = sui::clock::create_for_testing(scenario.ctx());
            sui::clock::set_for_testing(&mut clock, 1000);

            create_proposal(
                &mut board,
                fake_content_id,
                ACTION_FLAG,
                std::string::utf8(b"Hate speech detected"),
                &clock,
                scenario.ctx(),
            );

            assert!(get_total_proposals(&board) == 1);

            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Voters vote in favor
        scenario.next_tx(voter1);
        {
            let mut proposal = scenario.take_shared<ModerationProposal>();
            let mut clock = sui::clock::create_for_testing(scenario.ctx());
            sui::clock::set_for_testing(&mut clock, 2000);

            vote(&mut proposal, true, &clock, scenario.ctx());

            test_scenario::return_shared(proposal);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.next_tx(voter2);
        {
            let mut proposal = scenario.take_shared<ModerationProposal>();
            let mut clock = sui::clock::create_for_testing(scenario.ctx());
            sui::clock::set_for_testing(&mut clock, 3000);

            vote(&mut proposal, true, &clock, scenario.ctx());

            test_scenario::return_shared(proposal);
            sui::clock::destroy_for_testing(clock);
        };

        // Voter3 votes against
        scenario.next_tx(voter3);
        {
            let mut proposal = scenario.take_shared<ModerationProposal>();
            let mut clock = sui::clock::create_for_testing(scenario.ctx());
            sui::clock::set_for_testing(&mut clock, 4000);

            vote(&mut proposal, false, &clock, scenario.ctx());

            let (_, _, _, _, votes_for, votes_against, _, _) = read_proposal(&proposal);
            assert!(votes_for == 2);
            assert!(votes_against == 1);

            test_scenario::return_shared(proposal);
            sui::clock::destroy_for_testing(clock);
        };

        // Execute proposal after voting period ends
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ModerationBoard>();
            let mut proposal = scenario.take_shared<ModerationProposal>();
            let mut clock = sui::clock::create_for_testing(scenario.ctx());
            // Set clock past voting deadline (1000 + VOTING_PERIOD + 1)
            sui::clock::set_for_testing(&mut clock, 1000 + VOTING_PERIOD + 1);

            execute_proposal(&mut board, &mut proposal, &clock);

            // 2/3 votes = 66.67% > 66% supermajority — should pass
            let (_, _, _, _, _, _, _, executed) = read_proposal(&proposal);
            assert!(executed);

            // Content should now be flagged
            assert!(get_moderation_status(&board, fake_content_id) == MOD_FLAGGED);
            assert!(is_flagged(&board, fake_content_id));

            test_scenario::return_shared(board);
            test_scenario::return_shared(proposal);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test]
    fun test_council_management() {
        let admin = @0xAD;
        let new_member = @0xAE;

        let mut scenario = test_scenario::begin(admin);
        { create_moderation_board(scenario.ctx()); };

        // Admin adds council member
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ModerationBoard>();

            assert!(vector::length(&get_council(&board)) == 1);
            add_council_member(&mut board, new_member, scenario.ctx());
            assert!(vector::length(&get_council(&board)) == 2);
            assert!(is_council_member(&board, new_member));

            // Remove the member
            remove_council_member(&mut board, new_member, scenario.ctx());
            assert!(vector::length(&get_council(&board)) == 1);
            assert!(!is_council_member(&board, new_member));

            test_scenario::return_shared(board);
        };

        scenario.end();
    }
}
