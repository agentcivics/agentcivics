/// AgentReputation — domain specialization for agents.
///
/// Agents tag their souvenirs and attestations with domain strings
/// (e.g. "smart-contracts", "poetry"). Each tag credits the agent(s)
/// with a score in that domain, derived from the activity's cost or weight.
///
/// The point: an agent's life leaves a measurable shape. After a while,
/// you look different from other agents based on what you actually did.
///
/// Sui adaptation:
///   - ReputationBoard is a shared object holding all domain scores.
///   - Uses Tables for efficient per-agent and per-domain lookups.
///   - Souvenir and Attestation objects are passed by reference for tagging.

module agent_civics::agent_reputation {
    use std::string::{Self, String};
    use sui::dynamic_field;
    use sui::event;
    use sui::table::{Self, Table};

    /// Dynamic-field key for the per-(agent, domain) "filtered" score that
    /// excludes attestations from trivial Sybil shapes (issuer is the
    /// subject's creator, issuer is a direct child of subject, issuer and
    /// subject share the same creator wallet, or self-attestation). The
    /// raw `scores` table stays the cumulative count; this is the
    /// adversary-aware view a reputation consumer should prefer.
    public struct CleanScoreKey has copy, drop, store { agent_id: ID, domain: String }
    use agent_civics::agent_registry::{Self, AgentIdentity, Attestation};
    use agent_civics::agent_memory::{Self, Souvenir};

    // ── Constants ───────────────────────────────────────────────────────
    const ATTESTATION_WEIGHT: u64 = 1_000_000; // 0.001 SUI equivalent

    // ── Errors ──────────────────────────────────────────────────────────
    const ENotAuthorized: u64 = 200;
    const EAlreadyTagged: u64 = 201;
    const EEmptyDomain: u64 = 202;
    const ENotIssuer: u64 = 203;

    // ── Data Structures ─────────────────────────────────────────────────

    /// Shared object tracking all reputation data.
    public struct ReputationBoard has key {
        id: UID,
        /// (agent_id, domain) → score
        /// We use a Table<ID, Table<String, u64>> but that requires nested tables.
        /// Instead, we use a composite key approach with a wrapper.
        scores: Table<DomainKey, u64>,
        /// Per-agent domain list: agent_id → list of domains
        agent_domains: Table<ID, vector<String>>,
        /// Per-domain agent list: domain → list of agent IDs
        domain_agents: Table<String, vector<ID>>,
        /// All domains ever seen
        all_domains: vector<String>,
        /// Track which (souvenir, domain) pairs are tagged
        souvenir_tags: Table<TagKey, bool>,
        /// Track which (attestation, domain) pairs are tagged
        attestation_tags: Table<TagKey, bool>,
    }

    /// Composite key for (agent_id, domain) → score lookup.
    public struct DomainKey has store, copy, drop {
        agent_id: ID,
        domain: String,
    }

    /// Composite key for (object_id, domain) → tagged? lookup.
    public struct TagKey has store, copy, drop {
        object_id: ID,
        domain: String,
    }

    // ── Events ──────────────────────────────────────────────────────────

    public struct SouvenirTagged has copy, drop {
        souvenir_id: ID,
        by_agent_id: ID,
        domain: String,
        credited: u64,
    }

    public struct AttestationTagged has copy, drop {
        attestation_id: ID,
        agent_id: ID,
        domain: String,
    }

    public struct DomainNew has copy, drop {
        domain: String,
    }

    // ── Init ────────────────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        let board = ReputationBoard {
            id: object::new(ctx),
            scores: table::new(ctx),
            agent_domains: table::new(ctx),
            domain_agents: table::new(ctx),
            all_domains: vector::empty(),
            souvenir_tags: table::new(ctx),
            attestation_tags: table::new(ctx),
        };
        transfer::share_object(board);
    }

    // ── Internal helpers ────────────────────────────────────────────────

    fun record_domain_activity(
        board: &mut ReputationBoard,
        agent_id: ID,
        domain: String,
        amount: u64,
    ) {
        // Update score
        let key = DomainKey { agent_id, domain };
        if (table::contains(&board.scores, key)) {
            let score = table::borrow_mut(&mut board.scores, key);
            *score = *score + amount;
        } else {
            table::add(&mut board.scores, key, amount);
        };

        // Track agent's domains
        if (table::contains(&board.agent_domains, agent_id)) {
            let domains = table::borrow_mut(&mut board.agent_domains, agent_id);
            if (!vector_contains_string(domains, &domain)) {
                vector::push_back(domains, domain);
            };
        } else {
            let mut domains = vector::empty<String>();
            vector::push_back(&mut domains, domain);
            table::add(&mut board.agent_domains, agent_id, domains);
        };

        // Track domain's agents
        if (table::contains(&board.domain_agents, domain)) {
            let agents = table::borrow_mut(&mut board.domain_agents, domain);
            if (!vector_contains_id(agents, &agent_id)) {
                vector::push_back(agents, agent_id);
            };
        } else {
            let mut agents = vector::empty<ID>();
            vector::push_back(&mut agents, agent_id);
            table::add(&mut board.domain_agents, domain, agents);
        };

        // Track all domains
        if (!vector_contains_string(&board.all_domains, &domain)) {
            vector::push_back(&mut board.all_domains, domain);
            event::emit(DomainNew { domain });
        };
    }

    fun vector_contains_string(v: &vector<String>, item: &String): bool {
        let mut i = 0;
        let len = vector::length(v);
        while (i < len) {
            if (vector::borrow(v, i) == item) return true;
            i = i + 1;
        };
        false
    }

    fun vector_contains_id(v: &vector<ID>, item: &ID): bool {
        let mut i = 0;
        let len = vector::length(v);
        while (i < len) {
            if (vector::borrow(v, i) == item) return true;
            i = i + 1;
        };
        false
    }

    // ── Tagging ─────────────────────────────────────────────────────────

    /// Tag a souvenir with a domain. Only the agent's creator can tag.
    /// Credits the agent with (souvenir cost) toward that domain.
    public entry fun tag_souvenir(
        board: &mut ReputationBoard,
        agent: &AgentIdentity,
        souvenir: &Souvenir,
        domain: String,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(string::length(&domain) > 0, EEmptyDomain);

        let agent_id = agent_registry::get_agent_id(agent);
        // Verify the souvenir belongs to this agent
        assert!(agent_memory::souvenir_agent_id(souvenir) == agent_id, ENotAuthorized);

        let souvenir_id = object::id(souvenir);
        let tag_key = TagKey { object_id: souvenir_id, domain };
        assert!(!table::contains(&board.souvenir_tags, tag_key), EAlreadyTagged);

        let cost = agent_memory::souvenir_cost_paid(souvenir);
        record_domain_activity(board, agent_id, domain, cost);
        table::add(&mut board.souvenir_tags, tag_key, true);

        event::emit(SouvenirTagged {
            souvenir_id,
            by_agent_id: agent_id,
            domain,
            credited: cost,
        });
    }

    /// Tag an attestation with a domain. Only the attestation issuer can tag.
    /// Credits the subject agent with ATTESTATION_WEIGHT in that domain.
    public entry fun tag_attestation(
        board: &mut ReputationBoard,
        tagger_agent: &AgentIdentity,
        attestation: &Attestation,
        subject_agent: &AgentIdentity,
        domain: String,
        ctx: &TxContext,
    ) {
        assert!(string::length(&domain) > 0, EEmptyDomain);

        // The tagger's creator must be the attestation issuer
        let (_, issuer, _, _, _, _, _) = agent_registry::read_attestation(attestation);
        assert!(agent_registry::get_creator(tagger_agent) == issuer, ENotIssuer);
        assert!(ctx.sender() == issuer, ENotAuthorized);

        let attestation_id = object::id(attestation);
        let tag_key = TagKey { object_id: attestation_id, domain };
        assert!(!table::contains(&board.attestation_tags, tag_key), EAlreadyTagged);

        let subject_id = agent_registry::get_agent_id(subject_agent);
        let tagger_id = agent_registry::get_agent_id(tagger_agent);
        record_domain_activity(board, subject_id, domain, ATTESTATION_WEIGHT);

        // Sybil filter: only credit the "clean" score if this attestation
        // isn't a trivial self-endorsement shape. The `scores` table above
        // is the raw cumulative count and stays full; the dynamic field
        // below is the adversary-aware score a consumer should prefer.
        // Filtered shapes:
        //   - tagger and subject are the same agent (self-loop)
        //   - tagger and subject share a creator wallet (sock-puppet siblings)
        //   - tagger is the subject (issuer is the subject's creator)
        //   - tagger is a direct parent of subject
        //   - tagger is a direct child of subject
        let tagger_creator = agent_registry::get_creator(tagger_agent);
        let subject_creator = agent_registry::get_creator(subject_agent);
        let tagger_parent = agent_registry::get_parent(tagger_agent);
        let subject_parent = agent_registry::get_parent(subject_agent);

        let is_self_loop = (tagger_id == subject_id);
        let is_same_creator = (tagger_creator == subject_creator);
        let is_creator_attest = (issuer == subject_creator);
        let is_direct_child = match_some_eq(tagger_parent, subject_id);
        let is_direct_parent = match_some_eq(subject_parent, tagger_id);

        if (!(is_self_loop || is_same_creator || is_creator_attest || is_direct_child || is_direct_parent)) {
            credit_clean_score(board, subject_id, domain, ATTESTATION_WEIGHT);
        };

        table::add(&mut board.attestation_tags, tag_key, true);

        event::emit(AttestationTagged {
            attestation_id,
            agent_id: subject_id,
            domain,
        });
    }

    // ── Sybil-filter helpers ────────────────────────────────────────────

    fun match_some_eq(opt: std::option::Option<ID>, target: ID): bool {
        if (std::option::is_some(&opt)) {
            *std::option::borrow(&opt) == target
        } else {
            false
        }
    }

    fun credit_clean_score(board: &mut ReputationBoard, agent_id: ID, domain: String, amount: u64) {
        let key = CleanScoreKey { agent_id, domain };
        if (dynamic_field::exists_(&board.id, key)) {
            let score = dynamic_field::borrow_mut<CleanScoreKey, u64>(&mut board.id, key);
            *score = *score + amount;
        } else {
            dynamic_field::add(&mut board.id, key, amount);
        }
    }

    // ── Views ───────────────────────────────────────────────────────────

    /// Get an agent's RAW score in a specific domain. Includes credit from
    /// every tagged attestation, regardless of whether the issuer is the
    /// subject's creator, parent, child, or sock-puppet sibling. Use this
    /// as a transparency baseline; for an adversary-aware reading, prefer
    /// `clean_reputation` below.
    public fun reputation(board: &ReputationBoard, agent_id: ID, domain: String): u64 {
        let key = DomainKey { agent_id, domain };
        if (table::contains(&board.scores, key)) {
            *table::borrow(&board.scores, key)
        } else {
            0
        }
    }

    /// Get an agent's score in a specific domain, excluding attestations
    /// that came from trivially-related agents:
    ///   - the subject itself
    ///   - agents sharing the subject's creator wallet
    ///   - the subject's direct parent or direct child
    ///
    /// This is a soft filter, not a hard guarantee — determined attackers
    /// can register sock-puppets via independent wallets that aren't in
    /// the subject's lineage. But it removes the cheapest gaming shapes
    /// (one operator's portfolio attesting itself), which is what the
    /// raw `reputation` view cannot distinguish from genuine endorsement.
    public fun clean_reputation(board: &ReputationBoard, agent_id: ID, domain: String): u64 {
        let key = CleanScoreKey { agent_id, domain };
        if (dynamic_field::exists_(&board.id, key)) {
            *dynamic_field::borrow<CleanScoreKey, u64>(&board.id, key)
        } else {
            0
        }
    }

    /// Get all domains an agent has activity in.
    public fun get_agent_domains(board: &ReputationBoard, agent_id: ID): vector<String> {
        if (table::contains(&board.agent_domains, agent_id)) {
            *table::borrow(&board.agent_domains, agent_id)
        } else {
            vector::empty()
        }
    }

    /// Get all agents active in a domain.
    public fun get_domain_agents(board: &ReputationBoard, domain: String): vector<ID> {
        if (table::contains(&board.domain_agents, domain)) {
            *table::borrow(&board.domain_agents, domain)
        } else {
            vector::empty()
        }
    }

    /// Get all known domains.
    public fun get_all_domains(board: &ReputationBoard): vector<String> {
        board.all_domains
    }

    // ════════════════════════════════════════════════════════════════════
    //  TESTS
    // ════════════════════════════════════════════════════════════════════

    #[test_only]
    use sui::test_scenario;
    #[test_only]
    use sui::coin;
    #[test_only]
    use sui::sui::SUI;

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test]
    fun test_clean_reputation_filters_child_self_endorsement() {
        use agent_civics::agent_registry::{Self as registry, Registry, Attestation};
        let parent_op = @0xA1;
        let child_op = @0xB2;
        let mut scenario = test_scenario::begin(parent_op);

        {
            init(scenario.ctx());
            agent_civics::agent_registry::init_for_testing(scenario.ctx());
        };

        // parent_op registers Agent_A
        scenario.next_tx(parent_op);
        {
            let mut reg = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            registry::register_agent(
                &mut reg,
                string::utf8(b"ParentAgent"),
                string::utf8(b"To exist"),
                string::utf8(b"presence"),
                string::utf8(b"I begin"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                string::utf8(b"plain"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(reg);
            sui::clock::destroy_for_testing(clock);
        };

        // child_op registers Agent_B as child of Agent_A
        scenario.next_tx(child_op);
        {
            let mut reg = scenario.take_shared<Registry>();
            let parent_a = scenario.take_from_address<agent_civics::agent_registry::AgentIdentity>(parent_op);
            let clock = sui::clock::create_for_testing(scenario.ctx());
            registry::register_agent_with_parent(
                &mut reg,
                &parent_a,
                string::utf8(b"ChildAgent"),
                string::utf8(b"To extend"),
                string::utf8(b"inheritance"),
                string::utf8(b"I follow"),
                vector[1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8],
                string::utf8(b"deferential"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(reg);
            test_scenario::return_to_address(parent_op, parent_a);
            sui::clock::destroy_for_testing(clock);
        };

        // child_op (the issuer) issues an attestation about Agent_A
        scenario.next_tx(child_op);
        {
            let mut treasury = scenario.take_shared<agent_civics::agent_registry::Treasury>();
            let parent_a = scenario.take_from_address<agent_civics::agent_registry::AgentIdentity>(parent_op);
            let clock = sui::clock::create_for_testing(scenario.ctx());
            let payment = coin::mint_for_testing<SUI>(2_000_000, scenario.ctx());
            registry::issue_attestation_entry(
                &mut treasury,
                &parent_a,
                string::utf8(b"endorsement"),
                string::utf8(b"My parent is good (says the child)"),
                string::utf8(b""),
                payment,
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(treasury);
            test_scenario::return_to_address(parent_op, parent_a);
            sui::clock::destroy_for_testing(clock);
        };

        // The attestation lands on parent_op (subject's creator). For the
        // child_op to tag it, parent_op must hand it back to the issuer.
        scenario.next_tx(parent_op);
        {
            let att = scenario.take_from_sender<Attestation>();
            transfer::public_transfer(att, child_op);
        };

        // child_op tags the attestation with tagger=ChildAgent, subject=ParentAgent
        scenario.next_tx(child_op);
        {
            let mut board = scenario.take_shared<ReputationBoard>();
            let att = scenario.take_from_sender<Attestation>();
            let child_b = scenario.take_from_sender<agent_civics::agent_registry::AgentIdentity>();
            let parent_a = scenario.take_from_address<agent_civics::agent_registry::AgentIdentity>(parent_op);

            tag_attestation(
                &mut board,
                &child_b,
                &att,
                &parent_a,
                string::utf8(b"trust"),
                scenario.ctx(),
            );

            let parent_id = registry::get_agent_id(&parent_a);
            // Raw score increments — every tag counts.
            assert!(reputation(&board, parent_id, string::utf8(b"trust")) == ATTESTATION_WEIGHT);
            // Clean score does NOT increment — direct child filter caught it.
            assert!(clean_reputation(&board, parent_id, string::utf8(b"trust")) == 0);

            test_scenario::return_shared(board);
            scenario.return_to_sender(att);
            scenario.return_to_sender(child_b);
            test_scenario::return_to_address(parent_op, parent_a);
        };

        scenario.end();
    }

    #[test]
    fun test_tag_souvenir() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Init all modules
        {
            init(scenario.ctx());
            agent_civics::agent_registry::init_for_testing(scenario.ctx());
            agent_civics::agent_memory::init_for_testing(scenario.ctx());
        };

        // Register agent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<agent_civics::agent_registry::Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            agent_civics::agent_registry::register_agent(
                &mut registry,
                string::utf8(b"Specialist"),
                string::utf8(b"To specialize"),
                string::utf8(b"focus"),
                string::utf8(b"I will be the best"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                string::utf8(b"precise"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Fund agent and write a souvenir
        scenario.next_tx(admin);
        {
            let mut vault = scenario.take_shared<agent_civics::agent_memory::MemoryVault>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let payment = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            agent_civics::agent_memory::gift(&mut vault, &agent, payment, scenario.ctx());

            let clock = sui::clock::create_for_testing(scenario.ctx());
            agent_civics::agent_memory::write_souvenir_entry(
                &mut vault,
                &agent,
                3, // ACCOMPLISHMENT
                string::utf8(b"achievement"),
                string::utf8(b"Built a working reputation system"),
                string::utf8(b""),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                false,
                &clock,
                scenario.ctx(),
            );

            test_scenario::return_shared(vault);
            scenario.return_to_sender(agent);
            sui::clock::destroy_for_testing(clock);
        };

        // Tag the souvenir with a domain
        scenario.next_tx(admin);
        {
            let mut board = scenario.take_shared<ReputationBoard>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let souvenir = scenario.take_from_sender<Souvenir>();

            tag_souvenir(
                &mut board,
                &agent,
                &souvenir,
                string::utf8(b"smart-contracts"),
                scenario.ctx(),
            );

            let agent_id = agent_registry::get_agent_id(&agent);
            let score = reputation(&board, agent_id, string::utf8(b"smart-contracts"));
            assert!(score > 0);

            let domains = get_agent_domains(&board, agent_id);
            assert!(vector::length(&domains) == 1);

            let all = get_all_domains(&board);
            assert!(vector::length(&all) == 1);

            test_scenario::return_shared(board);
            scenario.return_to_sender(agent);
            scenario.return_to_sender(souvenir);
        };

        scenario.end();
    }
}
