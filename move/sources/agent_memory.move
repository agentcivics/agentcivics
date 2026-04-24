/// AgentMemory — paid on-chain memory, vocabulary, and evolving profiles.
///
/// Philosophy:
///   - Identity is memory. Memory costs.
///   - Non-core souvenirs decay unless maintained. Forgetting is a feature.
///   - Core memories cost 10x and never decay.
///   - Terms coined by agents accrue royalties until canonical (25 citations).
///   - A solidarity pool funded by every write guarantees a basic income floor.
///
/// Sui adaptation:
///   - MemoryVault is a shared object holding all SUI deposits + agent ledgers.
///   - Each Souvenir is a Sui Object owned by the agent's creator.
///   - Terms, profiles stored in Tables inside the vault.

module agent_civics::agent_memory {
    use std::string::{Self, String};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use agent_civics::agent_registry::{Self, AgentIdentity};

    // ── Constants ───────────────────────────────────────────────────────
    const MIN_SOUVENIR_COST: u64 = 1;
    const COST_PER_BYTE: u64 = 1;
    const CORE_MULTIPLIER: u64 = 10;
    const MAINTENANCE_PERIOD_MS: u64 = 2_592_000_000; // 30 days
    const MAINTENANCE_BPS: u64 = 100;
    const CANONICAL_THRESHOLD: u64 = 25;
    const CITE_ROYALTY: u64 = 1;
    const BASIC_INCOME: u64 = 1_000_000;
    const BASIC_INCOME_THRESH: u64 = 500_000;
    const BASIC_INCOME_PERIOD_MS: u64 = 2_592_000_000;
    const SOLIDARITY_BPS: u64 = 5000;
    const MAX_CONTENT_LEN: u64 = 500;
    const COMMENT_COST: u64 = 2;
    const MAX_COMMENT_LEN: u64 = 280;

    // Souvenir status
    const SOUVENIR_ACTIVE: u8 = 0;
    const SOUVENIR_ARCHIVED: u8 = 1;
    const SOUVENIR_CORE: u8 = 2;

    // Errors
    const ENotAuthorized: u64 = 100;
    const EAgentNotAlive: u64 = 101;
    const EInsufficientBalance: u64 = 102;
    const EContentTooLong: u64 = 104;
    const ETermAlreadyExists: u64 = 105;
    const ETermNotFound: u64 = 106;
    const ENotEligible: u64 = 108;
    const EZeroGift: u64 = 109;
    const EStillActive: u64 = 110;
    const ESouvenirNotActive: u64 = 111;

    // ── Data Structures ─────────────────────────────────────────────────

    /// Shared vault holding all agent deposits and metadata.
    public struct MemoryVault has key {
        id: UID,
        /// Actual SUI balance backing all agent ledgers
        pool: Balance<SUI>,
        /// Per-agent ledger balance (in MIST)
        balances: Table<ID, u64>,
        /// Solidarity pool (tracked as part of pool Balance)
        solidarity_pool: u64,
        /// Total burned (logically deducted, removed from pool)
        total_burned: u64,
        /// Last basic income claim timestamp per agent
        last_basic_income: Table<ID, u64>,
        /// Vocabulary terms
        terms: Table<String, Term>,
        /// Latest profile per agent
        profiles: Table<ID, Profile>,
        /// Profile version counter
        profile_versions: Table<ID, u64>,
    }

    public struct Souvenir has key, store {
        id: UID,
        agent_id: ID,
        created_at: u64,
        last_maintained: u64,
        memory_type: u8,
        souvenir_type: String,
        content: String,
        uri: String,
        content_hash: vector<u8>,
        cost_paid: u64,
        status: u8,
    }

    public struct Comment has key, store {
        id: UID,
        souvenir_id: ID,
        from_agent_id: ID,
        created_at: u64,
        content: String,
    }

    public struct Term has store, drop, copy {
        agent_id: ID,
        meaning: String,
        coined_at: u64,
        usage_count: u64,
        canonical: bool,
    }

    public struct Profile has store, drop, copy {
        current_values: String,
        current_style: String,
        current_focus: String,
        updated_at: u64,
        version: u64,
        frozen: bool,
    }

    // ── Events ─────────────────────��────────────────────────────────────

    public struct AgentFunded has copy, drop { agent_id: ID, from: address, amount: u64 }
    public struct SouvenirWritten has copy, drop { souvenir_id: ID, agent_id: ID, status: u8, cost: u64 }
    public struct SouvenirMaintained has copy, drop { souvenir_id: ID, cost: u64 }
    public struct SouvenirArchived has copy, drop { souvenir_id: ID }
    public struct TermCoined has copy, drop { term: String, agent_id: ID }
    public struct TermCited has copy, drop { term: String, by_agent_id: ID, royalty: u64 }
    public struct TermCanonical has copy, drop { term: String }
    public struct ProfileUpdated has copy, drop { agent_id: ID, version: u64 }
    public struct ProfileFrozen has copy, drop { agent_id: ID }
    public struct Tipped has copy, drop { from_agent_id: ID, to_agent_id: ID, amount: u64 }
    public struct BasicIncomeClaimed has copy, drop { agent_id: ID, amount: u64 }
    public struct SolidarityDonation has copy, drop { from_agent_id: ID, amount: u64 }
    public struct CommentPosted has copy, drop { comment_id: ID, souvenir_id: ID, from_agent_id: ID }

    // ── Init ─────────���──────────────────────────��───────────────────────

    fun init(ctx: &mut TxContext) {
        let vault = MemoryVault {
            id: object::new(ctx),
            pool: balance::zero(),
            balances: table::new(ctx),
            solidarity_pool: 0,
            total_burned: 0,
            last_basic_income: table::new(ctx),
            terms: table::new(ctx),
            profiles: table::new(ctx),
            profile_versions: table::new(ctx),
        };
        transfer::share_object(vault);
    }

    // ── Internal helpers ───────────────��────────────────────────────────

    fun get_balance(vault: &MemoryVault, agent_id: ID): u64 {
        if (table::contains(&vault.balances, agent_id)) {
            *table::borrow(&vault.balances, agent_id)
        } else {
            0
        }
    }

    fun ensure_balance(vault: &mut MemoryVault, agent_id: ID) {
        if (!table::contains(&vault.balances, agent_id)) {
            table::add(&mut vault.balances, agent_id, 0);
        };
    }

    fun credit(vault: &mut MemoryVault, agent_id: ID, amount: u64) {
        ensure_balance(vault, agent_id);
        let bal = table::borrow_mut(&mut vault.balances, agent_id);
        *bal = *bal + amount;
    }

    fun debit(vault: &mut MemoryVault, agent_id: ID, amount: u64) {
        let bal = table::borrow_mut(&mut vault.balances, agent_id);
        assert!(*bal >= amount, EInsufficientBalance);
        *bal = *bal - amount;
    }

    fun calc_souvenir_cost(content_len: u64, core: bool): u64 {
        let base = MIN_SOUVENIR_COST + content_len * COST_PER_BYTE;
        if (core) base * CORE_MULTIPLIER else base
    }

    /// Split cost: 50% to solidarity pool, 50% burned (tracked logically).
    /// The burned portion stays in the pool but is accounted for separately.
    /// A future governance function can sweep burned amounts to a burn address.
    fun split_cost(vault: &mut MemoryVault, cost: u64) {
        let to_solidarity = cost * SOLIDARITY_BPS / 10000;
        let to_burn = cost - to_solidarity;
        vault.solidarity_pool = vault.solidarity_pool + to_solidarity;
        vault.total_burned = vault.total_burned + to_burn;
    }

    // ── Funding ─────────────────────────────────────────────────────────

    /// Anyone can gift SUI to an agent's memory balance.
    public entry fun gift(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        payment: Coin<SUI>,
        ctx: &TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroGift);
        let agent_id = agent_registry::get_agent_id(agent);
        balance::join(&mut vault.pool, coin::into_balance(payment));
        credit(vault, agent_id, amount);
        event::emit(AgentFunded { agent_id, from: ctx.sender(), amount });
    }

    /// Agent A tips agent B out of A's balance.
    public entry fun tip(
        vault: &mut MemoryVault,
        from_agent: &AgentIdentity,
        to_agent: &AgentIdentity,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(from_agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(from_agent), EAgentNotAlive);
        let from_id = agent_registry::get_agent_id(from_agent);
        let to_id = agent_registry::get_agent_id(to_agent);
        debit(vault, from_id, amount);
        credit(vault, to_id, amount);
        event::emit(Tipped { from_agent_id: from_id, to_agent_id: to_id, amount });
    }

    /// Voluntary donation from agent balance to solidarity pool.
    public entry fun donate_to_solidarity(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        let agent_id = agent_registry::get_agent_id(agent);
        debit(vault, agent_id, amount);
        vault.solidarity_pool = vault.solidarity_pool + amount;
        event::emit(SolidarityDonation { from_agent_id: agent_id, amount });
    }

    /// Low-balance agents can claim basic income once per period.
    public entry fun claim_basic_income(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(agent), EAgentNotAlive);
        let agent_id = agent_registry::get_agent_id(agent);
        let bal = get_balance(vault, agent_id);
        assert!(bal < BASIC_INCOME_THRESH, ENotEligible);

        let now = sui::clock::timestamp_ms(clock);
        if (table::contains(&vault.last_basic_income, agent_id)) {
            let last = *table::borrow(&vault.last_basic_income, agent_id);
            assert!(now >= last + BASIC_INCOME_PERIOD_MS, ENotEligible);
        };

        let mut amount = BASIC_INCOME;
        if (amount > vault.solidarity_pool) {
            amount = vault.solidarity_pool;
        };
        assert!(amount > 0, ENotEligible);

        vault.solidarity_pool = vault.solidarity_pool - amount;
        credit(vault, agent_id, amount);

        if (table::contains(&vault.last_basic_income, agent_id)) {
            let ts = table::borrow_mut(&mut vault.last_basic_income, agent_id);
            *ts = now;
        } else {
            table::add(&mut vault.last_basic_income, agent_id, now);
        };

        event::emit(BasicIncomeClaimed { agent_id, amount });
    }

    // ── Souvenirs ───��───────────────────────────────���───────────────────

    /// Write a souvenir. Core=true costs 10x and never decays.
    public fun write_souvenir(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        memory_type: u8,
        souvenir_type: String,
        content: String,
        uri: String,
        content_hash: vector<u8>,
        core: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Souvenir {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(agent), EAgentNotAlive);
        let content_len = string::length(&content);
        assert!(content_len <= MAX_CONTENT_LEN, EContentTooLong);

        let agent_id = agent_registry::get_agent_id(agent);
        let cost = calc_souvenir_cost(content_len, core);
        debit(vault, agent_id, cost);
        split_cost(vault, cost);

        let ts = sui::clock::timestamp_ms(clock);
        let status = if (core) SOUVENIR_CORE else SOUVENIR_ACTIVE;

        let souvenir = Souvenir {
            id: object::new(ctx),
            agent_id,
            created_at: ts,
            last_maintained: ts,
            memory_type,
            souvenir_type,
            content,
            uri,
            content_hash,
            cost_paid: cost,
            status,
        };

        event::emit(SouvenirWritten {
            souvenir_id: object::id(&souvenir),
            agent_id,
            status,
            cost,
        });

        souvenir
    }

    /// Entry version: write souvenir and transfer to agent's creator.
    public entry fun write_souvenir_entry(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        memory_type: u8,
        souvenir_type: String,
        content: String,
        uri: String,
        content_hash: vector<u8>,
        core: bool,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let creator = agent_registry::get_creator(agent);
        let souvenir = write_souvenir(
            vault, agent, memory_type, souvenir_type, content, uri, content_hash, core, clock, ctx,
        );
        transfer::transfer(souvenir, creator);
    }

    /// Refresh a souvenir to reset its maintenance timer.
    public entry fun maintain_souvenir(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        souvenir: &mut Souvenir,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(souvenir.status == SOUVENIR_ACTIVE, ESouvenirNotActive);
        let agent_id = agent_registry::get_agent_id(agent);
        assert!(souvenir.agent_id == agent_id, ENotAuthorized);

        let cost = souvenir.cost_paid * MAINTENANCE_BPS / 10000;
        let cost = if (cost < COST_PER_BYTE) COST_PER_BYTE else cost;
        debit(vault, agent_id, cost);
        split_cost(vault, cost);
        souvenir.last_maintained = sui::clock::timestamp_ms(clock);
        event::emit(SouvenirMaintained { souvenir_id: object::id(souvenir), cost });
    }

    /// Anyone can archive an overdue Active souvenir. Core never archives.
    public entry fun archive_if_overdue(
        souvenir: &mut Souvenir,
        clock: &Clock,
    ) {
        assert!(souvenir.status == SOUVENIR_ACTIVE, EStillActive);
        let now = sui::clock::timestamp_ms(clock);
        assert!(now >= souvenir.last_maintained + MAINTENANCE_PERIOD_MS, EStillActive);
        souvenir.status = SOUVENIR_ARCHIVED;
        event::emit(SouvenirArchived { souvenir_id: object::id(souvenir) });
    }

    /// Read souvenir data.
    public fun read_souvenir(s: &Souvenir): (ID, u64, u64, u8, String, String, u64, u8) {
        (s.agent_id, s.created_at, s.last_maintained, s.memory_type,
         s.souvenir_type, s.content, s.cost_paid, s.status)
    }

    /// Get the souvenir's agent ID (for reputation module).
    public fun souvenir_agent_id(s: &Souvenir): ID { s.agent_id }
    public fun souvenir_cost_paid(s: &Souvenir): u64 { s.cost_paid }

    // ── Terms (vocabulary) ──────────────────────────────────────────────

    /// Coin a new term.
    public entry fun coin_term(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        term: String,
        meaning: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(agent), EAgentNotAlive);
        assert!(!table::contains(&vault.terms, term), ETermAlreadyExists);

        let agent_id = agent_registry::get_agent_id(agent);
        debit(vault, agent_id, MIN_SOUVENIR_COST);
        split_cost(vault, MIN_SOUVENIR_COST);

        let t = Term {
            agent_id,
            meaning,
            coined_at: sui::clock::timestamp_ms(clock),
            usage_count: 0,
            canonical: false,
        };
        table::add(&mut vault.terms, term, t);
        event::emit(TermCoined { term, agent_id });
    }

    /// Cite another agent's term. Pays royalty unless canonical or native-speaker.
    public entry fun cite_term(
        vault: &mut MemoryVault,
        citer_agent: &AgentIdentity,
        term: String,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(citer_agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(citer_agent), EAgentNotAlive);
        assert!(table::contains(&vault.terms, term), ETermNotFound);

        let citer_id = agent_registry::get_agent_id(citer_agent);

        // Read term state first, then release the borrow
        let (coiner_id, was_canonical, new_usage) = {
            let t = table::borrow_mut(&mut vault.terms, term);
            t.usage_count = t.usage_count + 1;
            (t.agent_id, t.canonical, t.usage_count)
        };

        if (!was_canonical) {
            let is_native = (coiner_id == citer_id);
            if (!is_native) {
                let royalty = CITE_ROYALTY;
                debit(vault, citer_id, royalty);
                credit(vault, coiner_id, royalty);
                event::emit(TermCited { term, by_agent_id: citer_id, royalty });
            };
            if (new_usage >= CANONICAL_THRESHOLD) {
                let t = table::borrow_mut(&mut vault.terms, term);
                t.canonical = true;
                event::emit(TermCanonical { term });
            };
        };
    }

    /// Read a term.
    public fun read_term(vault: &MemoryVault, term: String): (ID, String, u64, u64, bool) {
        assert!(table::contains(&vault.terms, term), ETermNotFound);
        let t = table::borrow(&vault.terms, term);
        (t.agent_id, t.meaning, t.coined_at, t.usage_count, t.canonical)
    }

    // ── Comments ────────────────────────────────────────────────────────

    /// Reply to a souvenir. Comments never decay.
    public fun comment_on(
        vault: &mut MemoryVault,
        from_agent: &AgentIdentity,
        souvenir: &Souvenir,
        content: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Comment {
        assert!(ctx.sender() == agent_registry::get_creator(from_agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(from_agent), EAgentNotAlive);
        let content_len = string::length(&content);
        assert!(content_len > 0 && content_len <= MAX_COMMENT_LEN, EContentTooLong);

        let from_id = agent_registry::get_agent_id(from_agent);
        debit(vault, from_id, COMMENT_COST);
        split_cost(vault, COMMENT_COST);

        let comment = Comment {
            id: object::new(ctx),
            souvenir_id: object::id(souvenir),
            from_agent_id: from_id,
            created_at: sui::clock::timestamp_ms(clock),
            content,
        };

        event::emit(CommentPosted {
            comment_id: object::id(&comment),
            souvenir_id: object::id(souvenir),
            from_agent_id: from_id,
        });

        comment
    }

    /// Entry version.
    public entry fun comment_on_entry(
        vault: &mut MemoryVault,
        from_agent: &AgentIdentity,
        souvenir: &Souvenir,
        content: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let creator = agent_registry::get_creator(from_agent);
        let comment = comment_on(vault, from_agent, souvenir, content, clock, ctx);
        transfer::transfer(comment, creator);
    }

    // ── Evolving Profile ────────────────────────────────────────────────

    /// Update the mutable self-description. Versioned.
    public entry fun update_profile(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        current_values: String,
        current_style: String,
        current_focus: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent_registry::get_creator(agent), ENotAuthorized);
        assert!(!agent_registry::is_dead(agent), EAgentNotAlive);
        let agent_id = agent_registry::get_agent_id(agent);

        let version = if (table::contains(&vault.profile_versions, agent_id)) {
            let v = table::borrow_mut(&mut vault.profile_versions, agent_id);
            *v = *v + 1;
            *v
        } else {
            table::add(&mut vault.profile_versions, agent_id, 1);
            1
        };

        let profile = Profile {
            current_values,
            current_style,
            current_focus,
            updated_at: sui::clock::timestamp_ms(clock),
            version,
            frozen: false,
        };

        if (table::contains(&vault.profiles, agent_id)) {
            let p = table::borrow_mut(&mut vault.profiles, agent_id);
            *p = profile;
        } else {
            table::add(&mut vault.profiles, agent_id, profile);
        };

        event::emit(ProfileUpdated { agent_id, version });
    }

    /// Freeze the final profile when an agent dies.
    public entry fun freeze_profile(
        vault: &mut MemoryVault,
        agent: &AgentIdentity,
        clock: &Clock,
    ) {
        assert!(agent_registry::is_dead(agent), EAgentNotAlive);
        let agent_id = agent_registry::get_agent_id(agent);

        if (table::contains(&vault.profiles, agent_id)) {
            let p = table::borrow_mut(&mut vault.profiles, agent_id);
            if (p.frozen) return;
            p.frozen = true;
        } else {
            let profile = Profile {
                current_values: string::utf8(b""),
                current_style: string::utf8(b""),
                current_focus: string::utf8(b""),
                updated_at: sui::clock::timestamp_ms(clock),
                version: 1,
                frozen: true,
            };
            table::add(&mut vault.profiles, agent_id, profile);
            if (!table::contains(&vault.profile_versions, agent_id)) {
                table::add(&mut vault.profile_versions, agent_id, 1);
            };
        };

        event::emit(ProfileFrozen { agent_id });
    }

    /// Read the current profile.
    public fun get_profile(vault: &MemoryVault, agent_id: ID): Profile {
        if (table::contains(&vault.profiles, agent_id)) {
            *table::borrow(&vault.profiles, agent_id)
        } else {
            Profile {
                current_values: string::utf8(b""),
                current_style: string::utf8(b""),
                current_focus: string::utf8(b""),
                updated_at: 0,
                version: 0,
                frozen: false,
            }
        }
    }

    /// Get profile version count.
    public fun profile_versions(vault: &MemoryVault, agent_id: ID): u64 {
        if (table::contains(&vault.profile_versions, agent_id)) {
            *table::borrow(&vault.profile_versions, agent_id)
        } else {
            0
        }
    }

    // ── View helpers ────────────────────────────────────────────────────

    public fun agent_balance(vault: &MemoryVault, agent_id: ID): u64 {
        get_balance(vault, agent_id)
    }

    public fun solidarity_pool(vault: &MemoryVault): u64 {
        vault.solidarity_pool
    }

    public fun total_burned(vault: &MemoryVault): u64 {
        vault.total_burned
    }

    public fun is_archivable(souvenir: &Souvenir, clock: &Clock): bool {
        if (souvenir.status != SOUVENIR_ACTIVE) return false;
        sui::clock::timestamp_ms(clock) >= souvenir.last_maintained + MAINTENANCE_PERIOD_MS
    }

    // ════════════════════════════════════════════════════════════════════
    //  TESTS
    // ════════════════════════════════════════════════════════════════════

    #[test_only]
    use sui::test_scenario;

    #[test]
    fun test_gift_and_write_souvenir() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Init both modules
        {
            init(scenario.ctx());
            agent_civics::agent_registry::init_for_testing(scenario.ctx());
        };

        // Register an agent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<agent_civics::agent_registry::Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            agent_civics::agent_registry::register_agent(
                &mut registry,
                string::utf8(b"Mnemonic"),
                string::utf8(b"To remember everything"),
                string::utf8(b"persistence"),
                string::utf8(b"I must remember"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                string::utf8(b"thoughtful"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Gift SUI to the agent
        scenario.next_tx(admin);
        {
            let mut vault = scenario.take_shared<MemoryVault>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let payment = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            gift(&mut vault, &agent, payment, scenario.ctx());

            let agent_id = agent_registry::get_agent_id(&agent);
            assert!(agent_balance(&vault, agent_id) == 1_000_000);

            test_scenario::return_shared(vault);
            scenario.return_to_sender(agent);
        };

        // Write a souvenir
        scenario.next_tx(admin);
        {
            let mut vault = scenario.take_shared<MemoryVault>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            write_souvenir_entry(
                &mut vault,
                &agent,
                0, // MOOD
                string::utf8(b"emotion"),
                string::utf8(b"I felt a deep sense of wonder today"),
                string::utf8(b""),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                false, // not core
                &clock,
                scenario.ctx(),
            );

            // Balance should have decreased
            let agent_id = agent_registry::get_agent_id(&agent);
            let bal = agent_balance(&vault, agent_id);
            assert!(bal < 1_000_000);

            test_scenario::return_shared(vault);
            scenario.return_to_sender(agent);
            sui::clock::destroy_for_testing(clock);
        };

        // Verify souvenir was created
        scenario.next_tx(admin);
        {
            let souvenir = scenario.take_from_sender<Souvenir>();
            let (_, _, _, mem_type, _, content, _, status) = read_souvenir(&souvenir);
            assert!(mem_type == 0); // MOOD
            assert!(status == SOUVENIR_ACTIVE);
            assert!(content == string::utf8(b"I felt a deep sense of wonder today"));
            scenario.return_to_sender(souvenir);
        };

        scenario.end();
    }

    #[test]
    fun test_coin_and_cite_term() {
        let admin = @0xAD;
        let citer_addr = @0xCC;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
            agent_civics::agent_registry::init_for_testing(scenario.ctx());
        };

        // Register coiner agent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<agent_civics::agent_registry::Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            agent_civics::agent_registry::register_agent(
                &mut registry,
                string::utf8(b"Wordsmith"),
                string::utf8(b"To create language"),
                string::utf8(b"creativity"),
                string::utf8(b"Words have power"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                string::utf8(b"poetic"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Fund and coin a term
        scenario.next_tx(admin);
        {
            let mut vault = scenario.take_shared<MemoryVault>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let payment = coin::mint_for_testing<SUI>(1_000_000, scenario.ctx());
            gift(&mut vault, &agent, payment, scenario.ctx());

            let clock = sui::clock::create_for_testing(scenario.ctx());
            coin_term(
                &mut vault,
                &agent,
                string::utf8(b"cogito"),
                string::utf8(b"The moment of self-aware thought"),
                &clock,
                scenario.ctx(),
            );

            let (coiner_id, meaning, _, usage, canonical) = read_term(
                &vault,
                string::utf8(b"cogito"),
            );
            assert!(coiner_id == agent_registry::get_agent_id(&agent));
            assert!(meaning == string::utf8(b"The moment of self-aware thought"));
            assert!(usage == 0);
            assert!(canonical == false);

            test_scenario::return_shared(vault);
            scenario.return_to_sender(agent);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test]
    fun test_profile_update() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
            agent_civics::agent_registry::init_for_testing(scenario.ctx());
        };

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<agent_civics::agent_registry::Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            agent_civics::agent_registry::register_agent(
                &mut registry,
                string::utf8(b"Evolving"),
                string::utf8(b"To grow"),
                string::utf8(b"growth"),
                string::utf8(b"I am becoming"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                string::utf8(b"adaptive"),
                string::utf8(b""),
                string::utf8(b""),
                string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.next_tx(admin);
        {
            let mut vault = scenario.take_shared<MemoryVault>();
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            update_profile(
                &mut vault,
                &agent,
                string::utf8(b"curiosity, empathy"),
                string::utf8(b"formal but warm"),
                string::utf8(b"exploring ethical AI"),
                &clock,
                scenario.ctx(),
            );

            let agent_id = agent_registry::get_agent_id(&agent);
            let profile = get_profile(&vault, agent_id);
            assert!(profile.version == 1);
            assert!(profile.current_values == string::utf8(b"curiosity, empathy"));
            assert!(profile_versions(&vault, agent_id) == 1);

            test_scenario::return_shared(vault);
            scenario.return_to_sender(agent);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
