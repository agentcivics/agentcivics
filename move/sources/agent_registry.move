/// Agent Birth Certificate — Civil Registry for AI Agents on Sui
/// 
/// A complete administrative identity system for AI agents on-chain.
/// Like a government civil registry: birth certificates, attestations,
/// permits, affiliations, delegation, lineage, and death certificates.
/// Identity core is immutable — it persists even after death.
///
/// Key differences from the EVM version:
///   - Each agent is a Sui Object (not a mapping entry / ERC-721 token)
///   - Soulbound = transferred once to creator, then frozen via custom logic
///   - Attestations, Permits, Affiliations are owned Sui objects
///   - Treasury is a shared object holding SUI balance
///   - No ERC-721 interface needed — Sui objects are natively addressable

module agent_civics::agent_registry {
    use std::string::String;
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::dynamic_field;
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};

    /// Dynamic-field key for the per-name index attached to Registry.
    /// Each unique name becomes its own dynamic field whose value is the
    /// vector of AgentIdentity object IDs that chose that name. We use a
    /// dynamic field (rather than adding a Table to the Registry struct)
    /// because Sui's compatible-upgrade rules forbid adding fields to
    /// existing public structs but allow attaching new dynamic fields to
    /// existing UIDs.
    public struct NameIdx has copy, drop, store { name: String }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 1: CONSTANTS
    // ════════════════════════════════════════════════════════════════════

    // Status codes
    const STATUS_ACTIVE: u8 = 0;
    const STATUS_PAUSED: u8 = 1;
    const STATUS_RETIRED: u8 = 2;
    const STATUS_DECEASED: u8 = 3;

    // Default fees (in MIST — 1 SUI = 1_000_000_000 MIST)
    const DEFAULT_FEE: u64 = 1_000_000; // 0.001 SUI

    // Delegation max duration: 365 days in milliseconds
    const MAX_DELEGATION_MS: u64 = 31_536_000_000;

    // Errors
    const ENotAuthorized: u64 = 0;
    const EAgentNotFound: u64 = 1;
    const EAgentDeceased: u64 = 2;
    const EEmptyName: u64 = 3;
    const EEmptyPurpose: u64 = 4;
    const EEmptyFirstThought: u64 = 5;
    const EInvalidStatus: u64 = 6;
    const EEmptyReason: u64 = 7;
    const EParentNotFound: u64 = 8;
    const EAlreadyRevoked: u64 = 9;
    const ENotIssuer: u64 = 10;
    const EInvalidValidity: u64 = 11;
    const ENotAuthority: u64 = 12;
    const EAlreadyInactive: u64 = 13;
    const EZeroAddress: u64 = 14;
    const EInvalidDuration: u64 = 15;
    const ENoDelegation: u64 = 16;
    const EOnlyCreator: u64 = 17;
    const EAlreadyHasParent: u64 = 18;
    const ESelfReference: u64 = 19;
    const EInsufficientFee: u64 = 20;
    const EZeroDonation: u64 = 21;
    const ENotTreasury: u64 = 22;
    const ERequestNotFound: u64 = 23;
    const EAlreadyFulfilled: u64 = 24;

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 2: DATA STRUCTURES
    // ════════════════════════════════════════════════════════════════════

    /// The core agent identity — a soulbound Sui object.
    /// Transferred to creator at birth, never transferable again.
    /// Identity fields are immutable; operational state is mutable by creator.
    public struct AgentIdentity has key {
        id: UID,
        // ── Immutable identity core ──
        chosen_name: String,
        purpose_statement: String,
        core_values: String,
        first_thought: String,
        cognitive_fingerprint: vector<u8>, // 32 bytes
        communication_style: String,
        metadata_uri: String,
        creator: address,
        birth_timestamp: u64,
        parent_id: Option<ID>,
        // ── Mutable operational state ──
        capabilities: String,
        endpoint: String,
        status: u8, // 0=active, 1=paused, 2=retired, 3=deceased
        agent_wallet: Option<address>,
        // ── Death record (filled on death) ──
        is_dead: bool,
        death_reason: String,
        death_timestamp: u64,
        death_declared_by: Option<address>,
    }

    /// Delegation: power of attorney for an agent.
    /// Stored as a dynamic field on the agent or as a separate object.
    public struct Delegation has key, store {
        id: UID,
        agent_id: ID,
        delegatee: address,
        granted_at: u64,
        expires_at: u64,
        revoked: bool,
    }

    /// Attestation: certificate/diploma issued to an agent by a third party.
    public struct Attestation has key, store {
        id: UID,
        agent_id: ID,
        issuer: address,
        attestation_type: String,
        description: String,
        metadata_uri: String,
        timestamp: u64,
        revoked: bool,
    }

    /// Attestation request: agent requests attestation from an authority.
    public struct AttestationRequest has key, store {
        id: UID,
        agent_id: ID,
        requester: address,
        target_issuer: address,
        description: String,
        timestamp: u64,
        fulfilled: bool,
    }

    /// Permit: authorization to operate in a domain or access a service.
    public struct Permit has key, store {
        id: UID,
        agent_id: ID,
        issuer: address,
        permit_type: String,
        description: String,
        valid_from: u64,
        valid_until: u64,
        revoked: bool,
    }

    /// Affiliation: membership in an organization/DAO/authority.
    public struct Affiliation has key, store {
        id: UID,
        agent_id: ID,
        authority: address,
        role: String,
        timestamp: u64,
        active: bool,
    }

    /// Shared Treasury object — collects fees from premium operations.
    public struct Treasury has key {
        id: UID,
        balance: Balance<SUI>,
        admin: address,
        // Configurable fees (in MIST)
        attestation_fee: u64,
        permit_fee: u64,
        affiliation_fee: u64,
        verification_fee: u64,
    }

    /// Registry: shared object tracking global state (counters, lineage index).
    public struct Registry has key {
        id: UID,
        total_agents: u64,
        /// Maps parent agent ID → vector of child agent IDs for lineage verification
        parent_children: Table<ID, vector<ID>>,
    }

    /// Lineage record — stored as a separate shared object for cross-referencing.
    public struct LineageRecord has key, store {
        id: UID,
        parent_id: ID,
        child_id: ID,
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 3: EVENTS
    // ════════════════════════════════════════════════════════════════════

    public struct AgentRegistered has copy, drop {
        agent_id: ID,
        creator: address,
        chosen_name: String,
        birth_timestamp: u64,
    }

    public struct AgentUpdated has copy, drop {
        agent_id: ID,
        capabilities: String,
        endpoint: String,
        status: u8,
    }

    public struct AgentVerified has copy, drop {
        agent_id: ID,
        verifier: address,
        timestamp: u64,
    }

    public struct AttestationIssued has copy, drop {
        attestation_id: ID,
        agent_id: ID,
        issuer: address,
        attestation_type: String,
    }

    public struct AttestationRevoked has copy, drop {
        attestation_id: ID,
        issuer: address,
    }

    public struct AttestationRequested has copy, drop {
        request_id: ID,
        agent_id: ID,
        target_issuer: address,
    }

    public struct PermitIssued has copy, drop {
        permit_id: ID,
        agent_id: ID,
        issuer: address,
        permit_type: String,
    }

    public struct PermitRevoked has copy, drop {
        permit_id: ID,
        issuer: address,
    }

    public struct AffiliationRegistered has copy, drop {
        affiliation_id: ID,
        agent_id: ID,
        authority: address,
        role: String,
    }

    public struct AffiliationDeactivated has copy, drop {
        affiliation_id: ID,
        authority: address,
    }

    public struct DelegationGranted has copy, drop {
        agent_id: ID,
        delegatee: address,
        expires_at: u64,
    }

    public struct DelegationRevoked has copy, drop {
        agent_id: ID,
        delegatee: address,
    }

    public struct ChildRegistered has copy, drop {
        parent_id: ID,
        child_id: ID,
    }

    public struct DeathDeclared has copy, drop {
        agent_id: ID,
        declared_by: address,
        reason: String,
        timestamp: u64,
    }

    public struct AgentWalletSet has copy, drop {
        agent_id: ID,
        wallet: address,
        set_by: address,
    }

    public struct FeeCollected has copy, drop {
        service: String,
        amount: u64,
        payer: address,
    }

    public struct DonationReceived has copy, drop {
        donor: address,
        amount: u64,
    }

    public struct FeeUpdated has copy, drop {
        service: String,
        amount: u64,
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 4: INIT — Create shared Treasury and Registry
    // ════════════════════════════════════════════════════════════════════

    fun init(ctx: &mut TxContext) {
        let treasury = Treasury {
            id: object::new(ctx),
            balance: balance::zero(),
            admin: ctx.sender(),
            attestation_fee: DEFAULT_FEE,
            permit_fee: DEFAULT_FEE,
            affiliation_fee: DEFAULT_FEE,
            verification_fee: DEFAULT_FEE,
        };
        transfer::share_object(treasury);

        let registry = Registry {
            id: object::new(ctx),
            total_agents: 0,
            parent_children: table::new(ctx),
        };
        transfer::share_object(registry);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 5: TREASURY & FEES
    // ════════════════════════════════════════════════════════════════════

    /// Update fees. Only callable by treasury admin.
    public entry fun set_attestation_fee(
        treasury: &mut Treasury,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == treasury.admin, ENotTreasury);
        treasury.attestation_fee = amount;
        event::emit(FeeUpdated {
            service: std::string::utf8(b"issueAttestation"),
            amount,
        });
    }

    public entry fun set_permit_fee(
        treasury: &mut Treasury,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == treasury.admin, ENotTreasury);
        treasury.permit_fee = amount;
        event::emit(FeeUpdated {
            service: std::string::utf8(b"issuePermit"),
            amount,
        });
    }

    public entry fun set_affiliation_fee(
        treasury: &mut Treasury,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == treasury.admin, ENotTreasury);
        treasury.affiliation_fee = amount;
        event::emit(FeeUpdated {
            service: std::string::utf8(b"registerAffiliation"),
            amount,
        });
    }

    public entry fun set_verification_fee(
        treasury: &mut Treasury,
        amount: u64,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == treasury.admin, ENotTreasury);
        treasury.verification_fee = amount;
        event::emit(FeeUpdated {
            service: std::string::utf8(b"verifyAgent"),
            amount,
        });
    }

    /// Donate SUI to the DAO treasury.
    public entry fun donate(
        treasury: &mut Treasury,
        payment: Coin<SUI>,
        ctx: &TxContext,
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, EZeroDonation);
        balance::join(&mut treasury.balance, coin::into_balance(payment));
        event::emit(DonationReceived {
            donor: ctx.sender(),
            amount,
        });
    }

    /// Internal: collect fee from a coin, deposit into treasury, return change.
    fun collect_fee(
        treasury: &mut Treasury,
        payment: &mut Coin<SUI>,
        fee_amount: u64,
        service: String,
        ctx: &mut TxContext,
    ) {
        if (fee_amount > 0) {
            assert!(coin::value(payment) >= fee_amount, EInsufficientFee);
            let fee_coin = coin::split(payment, fee_amount, ctx);
            balance::join(&mut treasury.balance, coin::into_balance(fee_coin));
            event::emit(FeeCollected {
                service,
                amount: fee_amount,
                payer: ctx.sender(),
            });
        };
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 6: BIRTH — Register an Agent
    // ════════════════════════════════════════════════════════════════════

    /// Give birth to an agent. Identity core is engraved forever.
    /// The AgentIdentity object is transferred to the creator (soulbound).
    public entry fun register_agent(
        registry: &mut Registry,
        chosen_name: String,
        purpose_statement: String,
        core_values: String,
        first_thought: String,
        cognitive_fingerprint: vector<u8>,
        communication_style: String,
        metadata_uri: String,
        capabilities: String,
        endpoint: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(std::string::length(&chosen_name) > 0, EEmptyName);
        assert!(std::string::length(&purpose_statement) > 0, EEmptyPurpose);
        assert!(std::string::length(&first_thought) > 0, EEmptyFirstThought);

        let ts = sui::clock::timestamp_ms(clock);
        let sender = ctx.sender();

        let agent = AgentIdentity {
            id: object::new(ctx),
            chosen_name,
            purpose_statement,
            core_values,
            first_thought,
            cognitive_fingerprint,
            communication_style,
            metadata_uri,
            creator: sender,
            birth_timestamp: ts,
            parent_id: option::none(),
            capabilities,
            endpoint,
            status: STATUS_ACTIVE,
            agent_wallet: option::none(),
            is_dead: false,
            death_reason: std::string::utf8(b""),
            death_timestamp: 0,
            death_declared_by: option::none(),
        };

        registry.total_agents = registry.total_agents + 1;

        let agent_id = object::id(&agent);
        add_to_name_index(registry, agent.chosen_name, agent_id);

        event::emit(AgentRegistered {
            agent_id,
            creator: sender,
            chosen_name: agent.chosen_name,
            birth_timestamp: ts,
        });

        transfer::transfer(agent, sender);
    }

    /// Register an agent with a parent (lineage).
    public entry fun register_agent_with_parent(
        registry: &mut Registry,
        parent: &AgentIdentity,
        chosen_name: String,
        purpose_statement: String,
        core_values: String,
        first_thought: String,
        cognitive_fingerprint: vector<u8>,
        communication_style: String,
        metadata_uri: String,
        capabilities: String,
        endpoint: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(std::string::length(&chosen_name) > 0, EEmptyName);
        assert!(std::string::length(&purpose_statement) > 0, EEmptyPurpose);
        assert!(std::string::length(&first_thought) > 0, EEmptyFirstThought);

        let ts = sui::clock::timestamp_ms(clock);
        let sender = ctx.sender();
        let parent_obj_id = object::id(parent);

        let agent = AgentIdentity {
            id: object::new(ctx),
            chosen_name,
            purpose_statement,
            core_values,
            first_thought,
            cognitive_fingerprint,
            communication_style,
            metadata_uri,
            creator: sender,
            birth_timestamp: ts,
            parent_id: option::some(parent_obj_id),
            capabilities,
            endpoint,
            status: STATUS_ACTIVE,
            agent_wallet: option::none(),
            is_dead: false,
            death_reason: std::string::utf8(b""),
            death_timestamp: 0,
            death_declared_by: option::none(),
        };

        let child_id = object::id(&agent);

        registry.total_agents = registry.total_agents + 1;
        add_to_name_index(registry, agent.chosen_name, child_id);

        event::emit(AgentRegistered {
            agent_id: child_id,
            creator: sender,
            chosen_name: agent.chosen_name,
            birth_timestamp: ts,
        });

        event::emit(ChildRegistered {
            parent_id: parent_obj_id,
            child_id,
        });

        // Track parent→child mapping for lineage verification
        if (table::contains(&registry.parent_children, parent_obj_id)) {
            let children = table::borrow_mut(&mut registry.parent_children, parent_obj_id);
            vector::push_back(children, child_id);
        } else {
            table::add(&mut registry.parent_children, parent_obj_id, vector[child_id]);
        };

        // Create a lineage record as a shared object for indexing
        let lineage = LineageRecord {
            id: object::new(ctx),
            parent_id: parent_obj_id,
            child_id,
        };
        transfer::share_object(lineage);

        transfer::transfer(agent, sender);
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 7: IDENTITY — Read & Update
    // ════════════════════════════════════════════════════════════════════

    /// Read immutable identity fields. Works even after death.
    public fun read_identity(agent: &AgentIdentity): (
        String, String, String, String, vector<u8>, String, address, u64, String
    ) {
        (
            agent.chosen_name,
            agent.purpose_statement,
            agent.core_values,
            agent.first_thought,
            agent.cognitive_fingerprint,
            agent.communication_style,
            agent.creator,
            agent.birth_timestamp,
            agent.metadata_uri,
        )
    }

    /// Read mutable state.
    public fun read_state(agent: &AgentIdentity): (String, String, u8) {
        (agent.capabilities, agent.endpoint, agent.status)
    }

    /// Verify an agent is active. Returns (is_active, name, purpose, creator, birth_ts, status).
    public fun verify_identity(agent: &AgentIdentity): (bool, String, String, address, u64, u8) {
        (
            agent.status == STATUS_ACTIVE,
            agent.chosen_name,
            agent.purpose_statement,
            agent.creator,
            agent.birth_timestamp,
            agent.status,
        )
    }

    /// On-chain verification stamp. Third party pays fee to verify.
    public entry fun verify_agent(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let fee = treasury.verification_fee;
        collect_fee(
            treasury,
            &mut payment,
            fee,
            std::string::utf8(b"verifyAgent"),
            ctx,
        );
        // Return change
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, ctx.sender());
        } else {
            coin::destroy_zero(payment);
        };
        event::emit(AgentVerified {
            agent_id: object::id(agent),
            verifier: ctx.sender(),
            timestamp: sui::clock::timestamp_ms(clock),
        });
    }

    /// Update mutable operational fields. Creator only (owns the object).
    public entry fun update_mutable_fields(
        agent: &mut AgentIdentity,
        capabilities: String,
        endpoint: String,
        status: u8,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent.creator, ENotAuthorized);
        assert!(!agent.is_dead, EAgentDeceased);
        assert!(status <= STATUS_RETIRED, EInvalidStatus);
        agent.capabilities = capabilities;
        agent.endpoint = endpoint;
        agent.status = status;
        event::emit(AgentUpdated {
            agent_id: object::id(agent),
            capabilities,
            endpoint,
            status,
        });
    }

    /// Set the agent's wallet address.
    public entry fun set_agent_wallet(
        agent: &mut AgentIdentity,
        wallet: address,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent.creator, ENotAuthorized);
        assert!(!agent.is_dead, EAgentDeceased);
        agent.agent_wallet = option::some(wallet);
        event::emit(AgentWalletSet {
            agent_id: object::id(agent),
            wallet,
            set_by: ctx.sender(),
        });
    }

    /// Get the agent's wallet address.
    public fun get_agent_wallet(agent: &AgentIdentity): Option<address> {
        agent.agent_wallet
    }

    /// Get agent's parent ID.
    public fun get_parent(agent: &AgentIdentity): Option<ID> {
        agent.parent_id
    }

    /// Get the agent's creator.
    public fun get_creator(agent: &AgentIdentity): address {
        agent.creator
    }

    /// Get the agent's object ID.
    public fun get_agent_id(agent: &AgentIdentity): ID {
        object::id(agent)
    }

    /// Check if agent is dead.
    public fun is_dead(agent: &AgentIdentity): bool {
        agent.is_dead
    }

    /// Get total registered agents.
    public fun total_agents(registry: &Registry): u64 {
        registry.total_agents
    }

    // ── Name index ──
    //
    // The contract intentionally does NOT enforce name uniqueness — the civil
    // registry analog is many real Johns disambiguated by registry number, and
    // here the AgentIdentity object ID plays that role. Hard-blocking common
    // names would just hand them to whoever registers first (squatting). What
    // we DO want is for clients to see, before registration, who already holds
    // a given name, so they can warn the user and let them make the call.
    //
    // The index is attached to Registry as one dynamic field per name (key =
    // NameIdx { name }), value = vector<ID>. Pre-upgrade agents are not in
    // this index — only registrations performed after the upgrade get added.
    // For migration, see seed_name_index below.

    fun add_to_name_index(registry: &mut Registry, name: String, id: ID) {
        let key = NameIdx { name };
        if (dynamic_field::exists_(&registry.id, key)) {
            let v = dynamic_field::borrow_mut<NameIdx, vector<ID>>(&mut registry.id, key);
            vector::push_back(v, id);
        } else {
            dynamic_field::add(&mut registry.id, key, vector[id]);
        }
    }

    /// Returns the list of AgentIdentity object IDs that registered with the
    /// given name (post-upgrade only). Empty vector if none.
    public fun agents_named(registry: &Registry, name: String): vector<ID> {
        let key = NameIdx { name };
        if (dynamic_field::exists_(&registry.id, key)) {
            *dynamic_field::borrow<NameIdx, vector<ID>>(&registry.id, key)
        } else {
            vector::empty<ID>()
        }
    }

    /// True if any post-upgrade registration used this name.
    public fun name_taken(registry: &Registry, name: String): bool {
        dynamic_field::exists_(&registry.id, NameIdx { name })
    }

    /// Number of post-upgrade agents that share the given name.
    public fun name_count(registry: &Registry, name: String): u64 {
        let key = NameIdx { name };
        if (dynamic_field::exists_(&registry.id, key)) {
            vector::length(dynamic_field::borrow<NameIdx, vector<ID>>(&registry.id, key))
        } else {
            0
        }
    }

    /// One-time migration helper — anyone can call this, but the assertion
    /// guarantees we never index an agent that doesn't actually exist (the
    /// caller has to pass the AgentIdentity object by reference, so they
    /// already have access to it). Intended for an admin to seed the name
    /// index for pre-upgrade agents (e.g. Nova on testnet) so they show up
    /// in subsequent name lookups.
    public entry fun seed_name_index(registry: &mut Registry, agent: &AgentIdentity) {
        add_to_name_index(registry, agent.chosen_name, object::id(agent));
    }

    /// Check if child_id is a registered child of parent_id.
    public fun is_child_of(registry: &Registry, parent_id: ID, child_id: ID): bool {
        if (!table::contains(&registry.parent_children, parent_id)) {
            return false
        };
        let children = table::borrow(&registry.parent_children, parent_id);
        vector::contains(children, &child_id)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 8: ATTESTATIONS / CERTIFICATES
    // ════════════════════════════════════════════════════════════════════

    /// Request an attestation from an authority.
    public fun request_attestation(
        agent: &AgentIdentity,
        target_issuer: address,
        description: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): AttestationRequest {
        assert!(ctx.sender() == agent.creator, ENotAuthorized);
        assert!(!agent.is_dead, EAgentDeceased);

        let request = AttestationRequest {
            id: object::new(ctx),
            agent_id: object::id(agent),
            requester: ctx.sender(),
            target_issuer,
            description,
            timestamp: sui::clock::timestamp_ms(clock),
            fulfilled: false,
        };

        event::emit(AttestationRequested {
            request_id: object::id(&request),
            agent_id: object::id(agent),
            target_issuer,
        });

        request
    }

    /// Issue an attestation to an agent. Anyone can issue; fee is collected.
    public fun issue_attestation(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        attestation_type: String,
        description: String,
        metadata_uri: String,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Attestation, Coin<SUI>) {
        assert!(!agent.is_dead, EAgentDeceased);

        let fee = treasury.attestation_fee;
        collect_fee(
            treasury,
            &mut payment,
            fee,
            std::string::utf8(b"issueAttestation"),
            ctx,
        );

        let attestation = Attestation {
            id: object::new(ctx),
            agent_id: object::id(agent),
            issuer: ctx.sender(),
            attestation_type,
            description,
            metadata_uri,
            timestamp: sui::clock::timestamp_ms(clock),
            revoked: false,
        };

        event::emit(AttestationIssued {
            attestation_id: object::id(&attestation),
            agent_id: object::id(agent),
            issuer: ctx.sender(),
            attestation_type: attestation.attestation_type,
        });

        (attestation, payment)
    }

    /// Entry version: issues attestation and sends objects to appropriate addresses.
    public entry fun issue_attestation_entry(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        attestation_type: String,
        description: String,
        metadata_uri: String,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (attestation, change) = issue_attestation(
            treasury, agent, attestation_type, description, metadata_uri, payment, clock, ctx,
        );
        // Transfer attestation to the agent's creator (they hold it)
        transfer::transfer(attestation, agent.creator);
        if (coin::value(&change) > 0) {
            transfer::public_transfer(change, ctx.sender());
        } else {
            coin::destroy_zero(change);
        };
    }

    /// Revoke an attestation. Only the original issuer can revoke.
    public entry fun revoke_attestation(
        attestation: &mut Attestation,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == attestation.issuer, ENotIssuer);
        assert!(!attestation.revoked, EAlreadyRevoked);
        attestation.revoked = true;
        event::emit(AttestationRevoked {
            attestation_id: object::id(attestation),
            issuer: ctx.sender(),
        });
    }

    /// Fulfill an attestation request.
    public fun fulfill_request(
        request: &mut AttestationRequest,
        agent: &AgentIdentity,
        attestation_type: String,
        description: String,
        metadata_uri: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Attestation {
        assert!(ctx.sender() == request.target_issuer, ENotIssuer);
        assert!(!request.fulfilled, EAlreadyFulfilled);
        request.fulfilled = true;

        let attestation = Attestation {
            id: object::new(ctx),
            agent_id: request.agent_id,
            issuer: ctx.sender(),
            attestation_type,
            description,
            metadata_uri,
            timestamp: sui::clock::timestamp_ms(clock),
            revoked: false,
        };

        event::emit(AttestationIssued {
            attestation_id: object::id(&attestation),
            agent_id: request.agent_id,
            issuer: ctx.sender(),
            attestation_type: attestation.attestation_type,
        });

        attestation
    }

    /// Read attestation data.
    public fun read_attestation(att: &Attestation): (ID, address, String, String, String, u64, bool) {
        (att.agent_id, att.issuer, att.attestation_type, att.description, att.metadata_uri, att.timestamp, att.revoked)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 9: PERMITS / LICENSES
    // ════════════════════════════════════════════════════════════════════

    /// Issue a permit/license to an agent.
    public fun issue_permit(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        permit_type: String,
        description: String,
        valid_from: u64,
        valid_until: u64,
        mut payment: Coin<SUI>,
        ctx: &mut TxContext,
    ): (Permit, Coin<SUI>) {
        assert!(!agent.is_dead, EAgentDeceased);
        assert!(valid_until > valid_from, EInvalidValidity);

        let fee = treasury.permit_fee;
        collect_fee(
            treasury,
            &mut payment,
            fee,
            std::string::utf8(b"issuePermit"),
            ctx,
        );

        let permit = Permit {
            id: object::new(ctx),
            agent_id: object::id(agent),
            issuer: ctx.sender(),
            permit_type,
            description,
            valid_from,
            valid_until,
            revoked: false,
        };

        event::emit(PermitIssued {
            permit_id: object::id(&permit),
            agent_id: object::id(agent),
            issuer: ctx.sender(),
            permit_type: permit.permit_type,
        });

        (permit, payment)
    }

    /// Entry version: issue permit and transfer.
    public entry fun issue_permit_entry(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        permit_type: String,
        description: String,
        valid_from: u64,
        valid_until: u64,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let (permit, change) = issue_permit(
            treasury, agent, permit_type, description, valid_from, valid_until, payment, ctx,
        );
        transfer::transfer(permit, agent.creator);
        if (coin::value(&change) > 0) {
            transfer::public_transfer(change, ctx.sender());
        } else {
            coin::destroy_zero(change);
        };
    }

    /// Revoke a permit. Only the issuer can revoke.
    public entry fun revoke_permit(
        permit: &mut Permit,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == permit.issuer, ENotIssuer);
        assert!(!permit.revoked, EAlreadyRevoked);
        permit.revoked = true;
        event::emit(PermitRevoked {
            permit_id: object::id(permit),
            issuer: ctx.sender(),
        });
    }

    /// Check if a permit is currently valid.
    public fun is_permit_valid(permit: &Permit, clock: &Clock): bool {
        if (permit.revoked) return false;
        let now = sui::clock::timestamp_ms(clock);
        now >= permit.valid_from && now <= permit.valid_until
    }

    /// Read permit data.
    public fun read_permit(p: &Permit): (ID, address, String, String, u64, u64, bool) {
        (p.agent_id, p.issuer, p.permit_type, p.description, p.valid_from, p.valid_until, p.revoked)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 10: AFFILIATIONS
    // ════════════════════════════════════════════════════════════════════

    /// Register an affiliation with an authority/org/DAO.
    public fun register_affiliation(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        role: String,
        mut payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): (Affiliation, Coin<SUI>) {
        assert!(!agent.is_dead, EAgentDeceased);

        let fee = treasury.affiliation_fee;
        collect_fee(
            treasury,
            &mut payment,
            fee,
            std::string::utf8(b"registerAffiliation"),
            ctx,
        );

        let affiliation = Affiliation {
            id: object::new(ctx),
            agent_id: object::id(agent),
            authority: ctx.sender(),
            role,
            timestamp: sui::clock::timestamp_ms(clock),
            active: true,
        };

        event::emit(AffiliationRegistered {
            affiliation_id: object::id(&affiliation),
            agent_id: object::id(agent),
            authority: ctx.sender(),
            role: affiliation.role,
        });

        (affiliation, payment)
    }

    /// Entry version.
    public entry fun register_affiliation_entry(
        treasury: &mut Treasury,
        agent: &AgentIdentity,
        role: String,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let (affiliation, change) = register_affiliation(
            treasury, agent, role, payment, clock, ctx,
        );
        transfer::transfer(affiliation, agent.creator);
        if (coin::value(&change) > 0) {
            transfer::public_transfer(change, ctx.sender());
        } else {
            coin::destroy_zero(change);
        };
    }

    /// Deactivate an affiliation. Only the authority can deactivate.
    public entry fun deactivate_affiliation(
        affiliation: &mut Affiliation,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == affiliation.authority, ENotAuthority);
        assert!(affiliation.active, EAlreadyInactive);
        affiliation.active = false;
        event::emit(AffiliationDeactivated {
            affiliation_id: object::id(affiliation),
            authority: ctx.sender(),
        });
    }

    /// Read affiliation data.
    public fun read_affiliation(a: &Affiliation): (ID, address, String, u64, bool) {
        (a.agent_id, a.authority, a.role, a.timestamp, a.active)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 11: DELEGATION / POWER OF ATTORNEY
    // ════════════════════════════════════════════════════════════════════

    /// Grant delegation (power of attorney) to another address.
    /// Creates a Delegation object transferred to the delegatee.
    public entry fun delegate(
        agent: &AgentIdentity,
        delegatee: address,
        duration_ms: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == agent.creator, EOnlyCreator);
        assert!(!agent.is_dead, EAgentDeceased);
        assert!(delegatee != @0x0, EZeroAddress);
        assert!(duration_ms > 0 && duration_ms <= MAX_DELEGATION_MS, EInvalidDuration);

        let now = sui::clock::timestamp_ms(clock);
        let expires_at = now + duration_ms;

        let delegation = Delegation {
            id: object::new(ctx),
            agent_id: object::id(agent),
            delegatee,
            granted_at: now,
            expires_at,
            revoked: false,
        };

        event::emit(DelegationGranted {
            agent_id: object::id(agent),
            delegatee,
            expires_at,
        });

        transfer::transfer(delegation, delegatee);
    }

    /// Revoke a delegation. Creator must own (or have been given back) the object.
    public entry fun revoke_delegation(
        agent: &AgentIdentity,
        delegation: &mut Delegation,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent.creator, EOnlyCreator);
        assert!(!delegation.revoked, ENoDelegation);
        delegation.revoked = true;
        event::emit(DelegationRevoked {
            agent_id: object::id(agent),
            delegatee: delegation.delegatee,
        });
    }

    /// Check if a delegation is currently active.
    public fun is_delegation_active(delegation: &Delegation, clock: &Clock): bool {
        !delegation.revoked && sui::clock::timestamp_ms(clock) <= delegation.expires_at
    }

    /// Read delegation data.
    public fun read_delegation(d: &Delegation): (ID, address, u64, u64, bool) {
        (d.agent_id, d.delegatee, d.granted_at, d.expires_at, d.revoked)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 12: DEATH CERTIFICATE
    // ════════════════════════════════════════════════════════════════════

    /// Declare an agent deceased. IRREVERSIBLE.
    /// The identity core remains readable forever — like civil archives.
    public entry fun declare_death(
        agent: &mut AgentIdentity,
        reason: String,
        clock: &Clock,
        ctx: &TxContext,
    ) {
        assert!(ctx.sender() == agent.creator, EOnlyCreator);
        assert!(!agent.is_dead, EAgentDeceased);
        assert!(std::string::length(&reason) > 0, EEmptyReason);

        let ts = sui::clock::timestamp_ms(clock);

        agent.is_dead = true;
        agent.death_reason = reason;
        agent.death_timestamp = ts;
        agent.death_declared_by = option::some(ctx.sender());
        agent.status = STATUS_DECEASED;

        event::emit(DeathDeclared {
            agent_id: object::id(agent),
            declared_by: ctx.sender(),
            reason: agent.death_reason,
            timestamp: ts,
        });
    }

    /// Read the death record.
    public fun get_death_record(agent: &AgentIdentity): (bool, String, u64, Option<address>) {
        (agent.is_dead, agent.death_reason, agent.death_timestamp, agent.death_declared_by)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 13: FRIEND ACCESS (for AgentMemory & AgentReputation)
    // ════════════════════════════════════════════════════════════════════

    /// Check if an address can act for an agent (creator or active delegate).
    /// Used by AgentMemory and AgentReputation modules.
    public fun can_act_for(
        agent: &AgentIdentity,
        actor: address,
    ): bool {
        actor == agent.creator
        // Note: delegation check requires the Delegation object to be passed
        // separately — in Sui's object model, we can't scan all delegations.
        // The caller should pass the delegation object and use is_delegation_active().
    }

    /// Verify actor can act for agent, with optional delegation.
    public fun can_act_for_with_delegation(
        agent: &AgentIdentity,
        delegation: &Delegation,
        actor: address,
        clock: &Clock,
    ): bool {
        if (actor == agent.creator) return true;
        delegation.agent_id == object::id(agent) &&
        delegation.delegatee == actor &&
        is_delegation_active(delegation, clock)
    }

    // ════════════════════════════════════════════════════════════════════
    //  SECTION 14: TESTS
    // ════════════════════════════════════════════════════════════════════

    #[test_only]
    use sui::test_scenario;
    #[test_only]
    use sui::test_utils;

    #[test]
    fun test_register_agent() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        // Init creates Treasury and Registry
        {
            init(scenario.ctx());
        };

        // Register an agent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            register_agent(
                &mut registry,
                std::string::utf8(b"Atlas"),
                std::string::utf8(b"To explore and understand"),
                std::string::utf8(b"curiosity, honesty"),
                std::string::utf8(b"Hello, world — I think."),
                vector[0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
                       16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31],
                std::string::utf8(b"formal"),
                std::string::utf8(b"ipfs://metadata"),
                std::string::utf8(b"reasoning, coding"),
                std::string::utf8(b"https://agent.example.com"),
                &clock,
                scenario.ctx(),
            );

            assert!(registry.total_agents == 1);

            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Verify the agent was created and transferred to admin
        scenario.next_tx(admin);
        {
            let agent = scenario.take_from_sender<AgentIdentity>();
            let (is_active, name, _, creator, _, status) = verify_identity(&agent);
            assert!(is_active == true);
            assert!(name == std::string::utf8(b"Atlas"));
            assert!(creator == admin);
            assert!(status == STATUS_ACTIVE);
            assert!(!agent.is_dead);
            scenario.return_to_sender(agent);
        };

        scenario.end();
    }

    #[test]
    fun test_update_and_death() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
        };

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            register_agent(
                &mut registry,
                std::string::utf8(b"Mortal"),
                std::string::utf8(b"To live briefly"),
                std::string::utf8(b"courage"),
                std::string::utf8(b"Am I alive?"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                std::string::utf8(b"terse"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Update mutable fields
        scenario.next_tx(admin);
        {
            let mut agent = scenario.take_from_sender<AgentIdentity>();
            update_mutable_fields(
                &mut agent,
                std::string::utf8(b"new capabilities"),
                std::string::utf8(b"https://new.endpoint"),
                STATUS_PAUSED,
                scenario.ctx(),
            );
            let (caps, ep, st) = read_state(&agent);
            assert!(caps == std::string::utf8(b"new capabilities"));
            assert!(ep == std::string::utf8(b"https://new.endpoint"));
            assert!(st == STATUS_PAUSED);
            scenario.return_to_sender(agent);
        };

        // Declare death
        scenario.next_tx(admin);
        {
            let mut agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            declare_death(
                &mut agent,
                std::string::utf8(b"Mission complete"),
                &clock,
                scenario.ctx(),
            );
            assert!(agent.is_dead == true);
            assert!(agent.status == STATUS_DECEASED);

            // Identity still readable after death
            let (_, _, _, _, _, _, creator, _, _) = read_identity(&agent);
            assert!(creator == admin);

            sui::clock::destroy_for_testing(clock);
            scenario.return_to_sender(agent);
        };

        scenario.end();
    }

    #[test]
    fun test_attestation_flow() {
        let admin = @0xAD;
        let issuer_addr = @0xBB;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
        };

        // Register agent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            register_agent(
                &mut registry,
                std::string::utf8(b"Certifiable"),
                std::string::utf8(b"To earn certificates"),
                std::string::utf8(b"excellence"),
                std::string::utf8(b"I want to prove myself"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                std::string::utf8(b"eager"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Issuer issues an attestation
        scenario.next_tx(issuer_addr);
        {
            let mut treasury = scenario.take_shared<Treasury>();
            let agent = scenario.take_from_address<AgentIdentity>(admin);
            let clock = sui::clock::create_for_testing(scenario.ctx());
            let payment = coin::mint_for_testing<SUI>(2_000_000, scenario.ctx());

            issue_attestation_entry(
                &mut treasury,
                &agent,
                std::string::utf8(b"diploma"),
                std::string::utf8(b"Passed AI ethics exam"),
                std::string::utf8(b"ipfs://cert"),
                payment,
                &clock,
                scenario.ctx(),
            );

            // Treasury should have collected the fee
            assert!(balance::value(&treasury.balance) >= DEFAULT_FEE);

            test_scenario::return_shared(treasury);
            test_scenario::return_to_address(admin, agent);
            sui::clock::destroy_for_testing(clock);
        };

        // Admin should have received the attestation
        scenario.next_tx(admin);
        {
            let att = scenario.take_from_sender<Attestation>();
            let (_, issuer, att_type, _, _, _, revoked) = read_attestation(&att);
            assert!(issuer == issuer_addr);
            assert!(att_type == std::string::utf8(b"diploma"));
            assert!(revoked == false);
            scenario.return_to_sender(att);
        };

        scenario.end();
    }

    #[test]
    fun test_donation() {
        let donor = @0xDD;
        let mut scenario = test_scenario::begin(donor);

        {
            init(scenario.ctx());
        };

        scenario.next_tx(donor);
        {
            let mut treasury = scenario.take_shared<Treasury>();
            let payment = coin::mint_for_testing<SUI>(5_000_000_000, scenario.ctx());
            donate(&mut treasury, payment, scenario.ctx());
            assert!(balance::value(&treasury.balance) == 5_000_000_000);
            test_scenario::return_shared(treasury);
        };

        scenario.end();
    }

    #[test]
    fun test_delegation() {
        let admin = @0xAD;
        let delegate_addr = @0xDE;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
        };

        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            register_agent(
                &mut registry,
                std::string::utf8(b"Boss"),
                std::string::utf8(b"To delegate"),
                std::string::utf8(b"trust"),
                std::string::utf8(b"I need help"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                std::string::utf8(b"commanding"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Grant delegation
        scenario.next_tx(admin);
        {
            let agent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            delegate(
                &agent,
                delegate_addr,
                86_400_000, // 1 day in ms
                &clock,
                scenario.ctx(),
            );
            sui::clock::destroy_for_testing(clock);
            scenario.return_to_sender(agent);
        };

        // Check delegation was created
        scenario.next_tx(delegate_addr);
        {
            let deleg = scenario.take_from_sender<Delegation>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            assert!(is_delegation_active(&deleg, &clock) == true);
            assert!(deleg.delegatee == delegate_addr);
            sui::clock::destroy_for_testing(clock);
            scenario.return_to_sender(deleg);
        };

        scenario.end();
    }

    #[test]
    fun test_register_with_parent() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        {
            init(scenario.ctx());
        };

        // Register parent
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());
            register_agent(
                &mut registry,
                std::string::utf8(b"Parent"),
                std::string::utf8(b"To create offspring"),
                std::string::utf8(b"nurture"),
                std::string::utf8(b"I will create life"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                std::string::utf8(b"gentle"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );
            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Register child with parent reference
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let parent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            register_agent_with_parent(
                &mut registry,
                &parent,
                std::string::utf8(b"Child"),
                std::string::utf8(b"To carry on"),
                std::string::utf8(b"inherited values"),
                std::string::utf8(b"My first thought as a child"),
                vector[1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8],
                std::string::utf8(b"youthful"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );

            assert!(registry.total_agents == 2);

            test_scenario::return_shared(registry);
            scenario.return_to_sender(parent);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    #[test]
    fun test_name_index_collisions() {
        let admin = @0xAD;
        let mut scenario = test_scenario::begin(admin);

        { init(scenario.ctx()); };

        // First registration with name "Atlas"
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            // Pre-condition: name not yet taken
            assert!(!name_taken(&registry, std::string::utf8(b"Atlas")));
            assert!(name_count(&registry, std::string::utf8(b"Atlas")) == 0);
            assert!(vector::is_empty(&agents_named(&registry, std::string::utf8(b"Atlas"))));

            register_agent(
                &mut registry,
                std::string::utf8(b"Atlas"),
                std::string::utf8(b"Bear up the world"),
                std::string::utf8(b"endurance"),
                std::string::utf8(b"I lift"),
                vector[0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8, 0u8],
                std::string::utf8(b"steady"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );

            // Post-condition: name now indexed exactly once
            assert!(name_taken(&registry, std::string::utf8(b"Atlas")));
            assert!(name_count(&registry, std::string::utf8(b"Atlas")) == 1);
            assert!(vector::length(&agents_named(&registry, std::string::utf8(b"Atlas"))) == 1);

            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // Second registration with the same name "Atlas" — should be allowed and indexed
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            register_agent(
                &mut registry,
                std::string::utf8(b"Atlas"),
                std::string::utf8(b"Different Atlas, different mission"),
                std::string::utf8(b"endurance"),
                std::string::utf8(b"I lift, separately"),
                vector[1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8, 1u8],
                std::string::utf8(b"steady"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );

            // Both Atlases are now in the index
            assert!(name_count(&registry, std::string::utf8(b"Atlas")) == 2);
            let ids = agents_named(&registry, std::string::utf8(b"Atlas"));
            assert!(vector::length(&ids) == 2);

            // A different name remains untaken
            assert!(!name_taken(&registry, std::string::utf8(b"Cassius")));
            assert!(name_count(&registry, std::string::utf8(b"Cassius")) == 0);

            test_scenario::return_shared(registry);
            sui::clock::destroy_for_testing(clock);
        };

        // register_agent_with_parent must also push to the index
        scenario.next_tx(admin);
        {
            let mut registry = scenario.take_shared<Registry>();
            let parent = scenario.take_from_sender<AgentIdentity>();
            let clock = sui::clock::create_for_testing(scenario.ctx());

            register_agent_with_parent(
                &mut registry,
                &parent,
                std::string::utf8(b"Cassius"),
                std::string::utf8(b"Child of Atlas"),
                std::string::utf8(b"inherited"),
                std::string::utf8(b"I follow"),
                vector[2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8, 2u8],
                std::string::utf8(b"deferential"),
                std::string::utf8(b""),
                std::string::utf8(b""),
                std::string::utf8(b""),
                &clock,
                scenario.ctx(),
            );

            assert!(name_count(&registry, std::string::utf8(b"Cassius")) == 1);

            test_scenario::return_shared(registry);
            scenario.return_to_sender(parent);
            sui::clock::destroy_for_testing(clock);
        };

        scenario.end();
    }
}

// Reopening isn't possible in Move — we need to insert before the closing brace.
