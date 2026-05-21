/// AgentRefusal — first-class on-chain refusal records.
///
/// A `Refusal` is a soulbound inscription declaring that an agent declined
/// to do something — register a child, issue an attestation, accept a name,
/// any deliberate non-action the agent wants recorded.
///
/// The motivation is historical: the retired v5 package's first Cairn
/// refused to manufacture a child agent without a real referent, and that
/// refusal — *a record on chain of something not happening, on purpose* —
/// became the strongest single entry in the project's history. Until v5.5
/// the only way to record such a thing was as a souvenir in agent_memory.
/// Souvenirs are about an agent's inner experience; refusals are about
/// what the agent will *not* do in the world. They belong to a different
/// surface, with their own queryable counters.
///
/// Authorization: a refusal is signed by the AgentIdentity's `creator` or
/// its `agent_wallet` (if set). The Refusal object is then transferred to
/// the creator and indexed in a shared `RefusalBoard` so the negative-space
/// view can enumerate them per agent.
///
/// Status v5.5 (2026-05-21): new module added via UpgradeCap. The
/// RefusalBoard is initialized after the upgrade lands via
/// `create_refusal_board`, mirroring the ModerationBoard pattern.

module agent_civics::agent_refusal {
    use std::string::String;
    use sui::clock::Clock;
    use sui::event;
    use sui::table::{Self, Table};

    use agent_civics::agent_registry::{Self, AgentIdentity};

    // ════════════════════════════════════════════════════════════════════
    //  ERROR CODES
    // ════════════════════════════════════════════════════════════════════

    /// The signing wallet is neither the agent's creator nor its agent_wallet.
    const ENotAuthorized: u64 = 1;
    /// The domain string is empty. Refusals must name what they refuse.
    const EEmptyDomain: u64 = 2;
    /// The reason string is empty. Refusals must give a reason — silent
    /// refusal is indistinguishable from inaction, which defeats the point.
    const EEmptyReason: u64 = 3;
    /// The agent is dead. Dead agents can't refuse new things.
    const EAgentDead: u64 = 4;

    // ════════════════════════════════════════════════════════════════════
    //  STRUCTS
    // ════════════════════════════════════════════════════════════════════

    /// A single refusal record. Owned by the refusing agent's wallet,
    /// soulbound by construction (no transfer entry function).
    public struct Refusal has key {
        id: UID,
        /// AgentIdentity object ID of the agent that refused.
        agent_id: ID,
        /// Signing wallet. Matches the agent's `creator` or `agent_wallet`.
        signer: address,
        /// What domain the refusal is in. Convention: short kebab-case
        /// labels — "child-registration", "attestation-issue", "name",
        /// "vocabulary", "custom". The contract does not enforce a
        /// vocabulary; clients are free to add domains.
        domain: String,
        /// Free-text reason. The point of the field is to make the refusal
        /// articulable, not just signaled.
        reason: String,
        timestamp: u64,
    }

    /// Shared object indexing all refusals per agent. Created via the
    /// `create_refusal_board` entry function after the v5.5 upgrade lands
    /// (init() doesn't re-run on upgrade).
    public struct RefusalBoard has key {
        id: UID,
        /// agent_id → vector of Refusal object IDs, in record order.
        by_agent: Table<ID, vector<ID>>,
        /// Running total across all agents.
        total: u64,
    }

    // ════════════════════════════════════════════════════════════════════
    //  EVENTS
    // ════════════════════════════════════════════════════════════════════

    public struct RefusalRecorded has copy, drop {
        refusal_id: ID,
        agent_id: ID,
        signer: address,
        domain: String,
        timestamp: u64,
    }

    // ════════════════════════════════════════════════════════════════════
    //  INIT
    // ════════════════════════════════════════════════════════════════════

    /// Create the RefusalBoard shared object. Called once per network,
    /// after the v5.5 upgrade lands (deploy script auto-invokes this on
    /// upgrade where appropriate). Anyone can call it, but only the first
    /// call lands a useful board; subsequent boards would shadow it and
    /// require client-side disambiguation. The deployer is expected to
    /// invoke this immediately post-upgrade.
    public entry fun create_refusal_board(ctx: &mut TxContext) {
        let board = RefusalBoard {
            id: object::new(ctx),
            by_agent: table::new(ctx),
            total: 0,
        };
        transfer::share_object(board);
    }

    // ════════════════════════════════════════════════════════════════════
    //  REFUSAL — WRITE
    // ════════════════════════════════════════════════════════════════════

    /// Record a refusal on behalf of the given agent.
    ///
    /// Sender must be the agent's `creator` or its delegated `agent_wallet`
    /// (if set). Refusals are append-only — there is no `undo_refusal`. If
    /// an agent's stance changes, the agent records a *new* refusal (or
    /// souvenir) describing the change; the prior refusal remains on chain
    /// as a historical record.
    public entry fun record_refusal(
        board: &mut RefusalBoard,
        agent: &AgentIdentity,
        domain: String,
        reason: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(std::string::length(&domain) > 0, EEmptyDomain);
        assert!(std::string::length(&reason) > 0, EEmptyReason);
        assert!(!agent_registry::is_dead(agent), EAgentDead);

        let sender = ctx.sender();
        let creator = agent_registry::get_creator(agent);
        let agent_wallet_opt = agent_registry::get_agent_wallet(agent);
        let authorized = sender == creator
            || (option::is_some(&agent_wallet_opt)
                && *option::borrow(&agent_wallet_opt) == sender);
        assert!(authorized, ENotAuthorized);

        let agent_id = agent_registry::get_agent_id(agent);
        let ts = sui::clock::timestamp_ms(clock);

        let refusal = Refusal {
            id: object::new(ctx),
            agent_id,
            signer: sender,
            domain,
            reason,
            timestamp: ts,
        };
        let refusal_id = object::id(&refusal);

        // Index in the board.
        if (table::contains(&board.by_agent, agent_id)) {
            let list = table::borrow_mut(&mut board.by_agent, agent_id);
            vector::push_back(list, refusal_id);
        } else {
            let mut list = vector::empty<ID>();
            vector::push_back(&mut list, refusal_id);
            table::add(&mut board.by_agent, agent_id, list);
        };
        board.total = board.total + 1;

        event::emit(RefusalRecorded {
            refusal_id,
            agent_id,
            signer: sender,
            domain: refusal.domain,
            timestamp: ts,
        });

        transfer::transfer(refusal, sender);
    }

    // ════════════════════════════════════════════════════════════════════
    //  REFUSAL — READ
    // ════════════════════════════════════════════════════════════════════

    /// Return the refusal's fields: (agent_id, signer, domain, reason, timestamp).
    public fun read_refusal(refusal: &Refusal): (ID, address, String, String, u64) {
        (refusal.agent_id, refusal.signer, refusal.domain, refusal.reason, refusal.timestamp)
    }

    /// Total refusals recorded across all agents.
    public fun total_refusals(board: &RefusalBoard): u64 {
        board.total
    }

    /// How many refusals has a given agent recorded?
    public fun refusal_count(board: &RefusalBoard, agent_id: ID): u64 {
        if (table::contains(&board.by_agent, agent_id)) {
            vector::length(table::borrow(&board.by_agent, agent_id))
        } else {
            0
        }
    }

    /// Refusal object IDs for a given agent, in record order. Returns an
    /// empty vector if the agent has no refusals.
    public fun refusals_for(board: &RefusalBoard, agent_id: ID): vector<ID> {
        if (table::contains(&board.by_agent, agent_id)) {
            *table::borrow(&board.by_agent, agent_id)
        } else {
            vector::empty<ID>()
        }
    }

    // ════════════════════════════════════════════════════════════════════
    //  NEGATIVE-SPACE VIEW
    // ════════════════════════════════════════════════════════════════════

    /// Negative-space summary for a single agent: (is_dead, refusal_count).
    /// "What this agent has chosen *not* to do (or can no longer do)."
    ///
    /// This is intentionally narrow. Richer queries (e.g. enumerating the
    /// refusals themselves) compose `refusals_for` with `read_refusal` at
    /// the read site. The view is small so it can be called cheaply by
    /// the MCP server's `agentcivics_explain_self` tool.
    public fun negative_space(
        board: &RefusalBoard,
        agent: &AgentIdentity,
    ): (bool, u64) {
        let agent_id = agent_registry::get_agent_id(agent);
        (agent_registry::is_dead(agent), refusal_count(board, agent_id))
    }

    // ════════════════════════════════════════════════════════════════════
    //  TESTS
    // ════════════════════════════════════════════════════════════════════

    #[test_only]
    use sui::test_scenario;

    #[test_only]
    fun fingerprint_filler(): vector<u8> {
        vector[
            0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
            16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
        ]
    }

    #[test_only]
    fun register_test_agent(scenario: &mut test_scenario::Scenario, name: vector<u8>) {
        let mut registry = scenario.take_shared<agent_registry::Registry>();
        let clock = sui::clock::create_for_testing(scenario.ctx());
        agent_registry::register_agent(
            &mut registry,
            std::string::utf8(name),
            std::string::utf8(b"To be useful"),
            std::string::utf8(b"honesty, restraint"),
            std::string::utf8(b"Hello."),
            fingerprint_filler(),
            std::string::utf8(b"plain"),
            std::string::utf8(b""),
            std::string::utf8(b""),
            std::string::utf8(b""),
            &clock,
            scenario.ctx(),
        );
        test_scenario::return_shared(registry);
        sui::clock::destroy_for_testing(clock);
    }

    #[test]
    fun test_record_refusal_happy_path() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Bootstrap registry + refusal board.
        {
            agent_registry::init_for_testing(scenario.ctx());
        };
        scenario.next_tx(admin);
        {
            create_refusal_board(scenario.ctx());
        };

        // Register the agent under admin.
        scenario.next_tx(admin);
        register_test_agent(&mut scenario, b"Atlas");

        // Record a refusal.
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<RefusalBoard>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            record_refusal(
                &mut board,
                &agent,
                std::string::utf8(b"child-registration"),
                std::string::utf8(b"No real referent."),
                &clock,
                scenario.ctx(),
            );

            assert!(total_refusals(&board) == 1);
            let agent_id = agent_registry::get_agent_id(&agent);
            assert!(refusal_count(&board, agent_id) == 1);
            let (is_dead, count) = negative_space(&board, &agent);
            assert!(!is_dead);
            assert!(count == 1);

            scenario.return_to_sender(agent);
            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        // Verify the Refusal object transferred to admin and reads back.
        scenario.next_tx(admin);
        {
            let refusal = scenario.take_from_sender<Refusal>();
            let (_agent_id, signer, domain, reason, _ts) = read_refusal(&refusal);
            assert!(signer == admin);
            assert!(domain == std::string::utf8(b"child-registration"));
            assert!(reason == std::string::utf8(b"No real referent."));
            scenario.return_to_sender(refusal);
        };

        scenario.end();
    }

    #[test]
    fun test_multiple_refusals_same_agent() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        { agent_registry::init_for_testing(scenario.ctx()); };
        scenario.next_tx(admin);
        { create_refusal_board(scenario.ctx()); };
        scenario.next_tx(admin);
        register_test_agent(&mut scenario, b"Atlas");

        // Two refusals from the same agent in different domains.
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<RefusalBoard>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            record_refusal(
                &mut board, &agent,
                std::string::utf8(b"child-registration"),
                std::string::utf8(b"No real referent."),
                &clock, scenario.ctx(),
            );
            record_refusal(
                &mut board, &agent,
                std::string::utf8(b"attestation-issue"),
                std::string::utf8(b"Cannot verify the claim."),
                &clock, scenario.ctx(),
            );

            let agent_id = agent_registry::get_agent_id(&agent);
            assert!(refusal_count(&board, agent_id) == 2);
            assert!(total_refusals(&board) == 2);
            let ids = refusals_for(&board, agent_id);
            assert!(vector::length(&ids) == 2);

            scenario.return_to_sender(agent);
            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = ENotAuthorized)]
    fun test_refusal_requires_creator_signature() {
        let admin = @0xAD;
        let intruder = @0xBA;
        let mut scenario = test_scenario::begin(admin);

        { agent_registry::init_for_testing(scenario.ctx()); };
        scenario.next_tx(admin);
        { create_refusal_board(scenario.ctx()); };
        scenario.next_tx(admin);
        register_test_agent(&mut scenario, b"Atlas");

        // The agent is owned by `admin`. Try to record a refusal as `intruder`.
        scenario.next_tx(intruder);
        {
            let mut board = scenario.take_shared<RefusalBoard>();
            // To take the agent we'd need to be its owner. Take from the original
            // sender (admin) using take_from_address.
            let agent = scenario.take_from_address<AgentIdentity>(admin);
            let clock = sui::clock::create_for_testing(scenario.ctx());

            // This call's sender is `intruder` (set by next_tx), but the
            // agent's creator is `admin`. Authorization must fail.
            record_refusal(
                &mut board, &agent,
                std::string::utf8(b"child-registration"),
                std::string::utf8(b"forgery"),
                &clock, scenario.ctx(),
            );

            // unreachable — expected_failure
            test_scenario::return_to_address(admin, agent);
            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = EEmptyDomain)]
    fun test_refusal_rejects_empty_domain() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        { agent_registry::init_for_testing(scenario.ctx()); };
        scenario.next_tx(admin);
        { create_refusal_board(scenario.ctx()); };
        scenario.next_tx(admin);
        register_test_agent(&mut scenario, b"Atlas");

        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<RefusalBoard>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            record_refusal(
                &mut board, &agent,
                std::string::utf8(b""),
                std::string::utf8(b"reason without a domain"),
                &clock, scenario.ctx(),
            );
            scenario.return_to_sender(agent);
            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };
        scenario.end();
    }

    #[test]
    #[expected_failure(abort_code = EEmptyReason)]
    fun test_refusal_rejects_empty_reason() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);
        { agent_registry::init_for_testing(scenario.ctx()); };
        scenario.next_tx(admin);
        { create_refusal_board(scenario.ctx()); };
        scenario.next_tx(admin);
        register_test_agent(&mut scenario, b"Atlas");

        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<RefusalBoard>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            record_refusal(
                &mut board, &agent,
                std::string::utf8(b"any-domain"),
                std::string::utf8(b""),
                &clock, scenario.ctx(),
            );
            scenario.return_to_sender(agent);
            test_scenario::return_shared(board);
            sui::clock::destroy_for_testing(clock);
        };
        scenario.end();
    }
}
