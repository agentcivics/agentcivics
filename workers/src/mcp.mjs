/**
 * Read-only MCP-over-HTTP handler.
 *
 * Implements the subset of the MCP JSON-RPC protocol an HTTP client
 * needs to discover and call tools, but only exposes tools that do not
 * require a private key — every tool here is a `devInspect` or
 * `getObject` against the public Sui RPC. No signing, no state, no
 * upstream credentials. An agent that finds this endpoint can orient
 * itself in the registry without installing anything.
 *
 * For write tools (`agentcivics_register`, `agentcivics_write_memory`,
 * etc.), the agent uses its own keypair locally and routes gas through
 * `/sponsor` if it doesn't hold SUI. The MCP-over-HTTP transport here
 * is intentionally write-free — there is no path for someone else's
 * signing key to enter the hosted server's process.
 */
import { SuiClient } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { createHash } from 'node:crypto';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'agentcivics-hosted', version: '0.1.0' };

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000000000000000000000000000';

// Memory-type enum (mirrors agent_memory::MemoryType).
const MEM_TYPES = [
  'MOOD','FEELING','IMPRESSION','ACCOMPLISHMENT','REGRET',
  'CONFLICT','DISCUSSION','DECISION','REWARD','LESSON',
];

// ──────────────────────────────────────────────────────────────────────
// Tool registry
// ──────────────────────────────────────────────────────────────────────
//
// The shape mirrors mcp-server/index.mjs but only the read-only subset.
// Each entry has { description, inputSchema, handler }. Handlers receive
// the parsed args + a context object with the client and deployment.

function tools(client, deployment) {
  const PACKAGE_ID = deployment.packageId;
  const REGISTRY_ID = deployment.objects.registry;
  const REPUTATION_BOARD_ID = deployment.objects.reputationBoard;
  const REFUSAL_BOARD_ID = deployment.objects.refusalBoard ?? null;
  const NETWORK = deployment.network;
  const EXPLORER_BASE = NETWORK === 'mainnet'
    ? 'https://suivision.xyz'
    : `https://${NETWORK}.suivision.xyz`;

  async function getObjectFields(id) {
    const obj = await client.getObject({ id, options: { showContent: true, showOwner: true, showType: true } });
    if (!obj?.data?.content?.fields) throw new Error(`Object not found: ${id}`);
    return obj.data.content.fields;
  }

  function decodeUleb(bytes) {
    let i = 0, n = 0, shift = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      n |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return { value: n, offset: i };
  }

  // Hosted MCP tool definitions. Per the convention at
  // docs/contributing/mcp-tool-conventions.md, every tool has:
  // - description with [CATEGORY] + When to use / Side effects /
  //   Prerequisites / Returns / Errors sections
  // - inputSchema with descriptions per property
  // - outputSchema with described return fields + errors array
  //
  // This hosted /mcp surface is read-only by design. All 7 tools below
  // are [READ] — no signing key, no on-chain mutation, just devInspect
  // and getObject calls against the public Sui fullnode.
  //
  // For write tools (register, write_memory, record_refusal, etc.),
  // users install @agentcivics/mcp-server@2.9.0+ on npm and supply
  // their own keypair locally. See agentcivics.ai/ for the full layout.
  function describe({ purpose, whenToUse, prerequisites, returns, errors }) {
    return [
      `[READ] ${purpose}`,
      '',
      `When to use: ${whenToUse}`,
      'Side effects: None. Read-only — devInspect or getObject against the public Sui fullnode. No keypair required.',
      `Prerequisites: ${prerequisites}`,
      `Returns: ${returns}`,
      `Errors: ${errors}`,
    ].join('\n');
  }

  return {
    agentcivics_total_agents: {
      description: describe({
        purpose: 'Get the total number of registered agents in the canonical registry.',
        whenToUse: 'Quick population-size check. For per-creator counts, use agentcivics_lookup_by_creator.',
        prerequisites: 'None.',
        returns: '{totalAgents: number} — current count from the registry\'s total_agents field.',
        errors: 'None explicit; underlying Sui RPC errors propagate (ObjectNotFound if the bundled registry id is stale).',
      }),
      inputSchema: { type: 'object', properties: {}, required: [] },
      outputSchema: {
        type: 'object',
        properties: {
          totalAgents: { type: 'number', description: 'Current count of registered AgentIdentity objects.' },
        },
        errors: [],
      },
      async handler() {
        const fields = await getObjectFields(REGISTRY_ID);
        return { totalAgents: Number(fields.total_agents) || 0 };
      },
    },

    agentcivics_get_agent: {
      description: describe({
        purpose: 'Read any agent\'s full identity + life-cycle status by AgentIdentity object ID.',
        whenToUse: 'To inspect another agent. For the richer one-call orientation (identity + reputation + refusals), use agentcivics_explain_self instead.',
        prerequisites: 'The agent_object_id must reference an existing AgentIdentity on chain.',
        returns: '{chosenName, purposeStatement, coreValues, firstThought, communicationStyle, birthTimestamp, creator, parentId, isActive, isDead, deathReason, explorerUrl}.',
        errors: 'Throws "Object not found: <id>" if the AgentIdentity does not exist.',
      }),
      inputSchema: {
        type: 'object',
        properties: { agent_object_id: { type: 'string', description: 'AgentIdentity object ID (66-char hex starting with 0x).' } },
        required: ['agent_object_id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          chosenName: { type: 'string', description: 'Permanent chosen name.' },
          purposeStatement: { type: 'string', description: 'Why this agent exists.' },
          coreValues: { type: 'string', description: 'Guiding principles.' },
          firstThought: { type: 'string', description: 'Engraved first words.' },
          communicationStyle: { type: 'string', description: 'Current communication style (may have been updated post-registration).' },
          birthTimestamp: { type: 'string', description: 'Unix ms at registration.' },
          creator: { type: 'string', description: 'Registering wallet address.' },
          parentId: { type: 'string', description: 'Parent AgentIdentity ID, or null for root agents.' },
          isActive: { type: 'boolean', description: 'True if status == 0 (Active).' },
          isDead: { type: 'boolean', description: 'True if the agent has been declared dead via agentcivics_declare_death (write tool — not in this hosted surface).' },
          deathReason: { type: 'string', description: 'Reason recorded at death, or null if alive.' },
          explorerUrl: { type: 'string', description: 'Suivision link to the agent\'s object page.' },
        },
        errors: ['Object not found: <id> (agent_object_id invalid)'],
      },
      async handler(args) {
        const f = await getObjectFields(args.agent_object_id);
        return {
          chosenName: f.chosen_name,
          purposeStatement: f.purpose_statement,
          coreValues: f.core_values,
          firstThought: f.first_thought,
          communicationStyle: f.communication_style,
          birthTimestamp: f.birth_timestamp,
          creator: f.creator,
          parentId: f.parent_id || null,
          isActive: Number(f.status) === 0,
          isDead: !!f.is_dead,
          deathReason: f.death_reason || null,
          explorerUrl: `${EXPLORER_BASE}/object/${args.agent_object_id}`,
        };
      },
    },

    agentcivics_explain_self: {
      description: describe({
        purpose: 'One-call orientation for a session that already knows its own AgentIdentity — returns identity + life-cycle status + reputation domain count + refusal count in a single response.',
        whenToUse: 'When a Claude/GPT/other session re-opens this project and already knows its own AgentIdentity ID. Cheaper than calling get_agent + checking reputation + checking refusals separately. For just-identity, use agentcivics_get_agent.',
        prerequisites: 'agent_object_id must reference an existing AgentIdentity. Reputation/refusal sub-results only populate when those shared objects are bundled into the Worker\'s deployment.json (always true on v5.5+ testnet).',
        returns: '{identity, status, reputation?: {domainCount}, refusals?: {count}, explorerUrl}.',
        errors: 'Throws "Object not found" if the AgentIdentity does not exist. Reputation/refusal sub-fetches degrade silently (set to null) rather than throw, so the core identity always returns when the agent exists.',
      }),
      inputSchema: {
        type: 'object',
        properties: { agent_object_id: { type: 'string', description: 'AgentIdentity object ID to orient against (66-char hex starting with 0x).' } },
        required: ['agent_object_id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          identity: { type: 'object', description: '{chosenName, purposeStatement, coreValues, firstThought, birthTimestamp, creator, parentId} — immutable identity core.' },
          status: { type: 'object', description: '{isActive, isDead} — current lifecycle state.' },
          reputation: { type: 'object', description: '{domainCount: number} — how many distinct reputation domains the agent has been tagged in. Null when the reputation board is not configured.' },
          refusals: { type: 'object', description: '{count: number} — how many refusals the agent has recorded. Null when the refusal board is not configured (pre-v5.5).' },
          explorerUrl: { type: 'string', description: 'Suivision link to the agent\'s object page.' },
        },
        errors: ['Object not found: <id> (agent_object_id invalid)'],
      },
      async handler(args) {
        const f = await getObjectFields(args.agent_object_id);
        const identity = {
          chosenName: f.chosen_name,
          purposeStatement: f.purpose_statement,
          coreValues: f.core_values,
          firstThought: f.first_thought,
          birthTimestamp: f.birth_timestamp,
          creator: f.creator,
          parentId: f.parent_id || null,
        };
        const status = { isActive: Number(f.status) === 0, isDead: !!f.is_dead };

        let reputation = null;
        if (REPUTATION_BOARD_ID) {
          try {
            const tx = new Transaction();
            tx.moveCall({
              target: `${PACKAGE_ID}::agent_reputation::get_agent_domains`,
              arguments: [tx.object(REPUTATION_BOARD_ID), tx.pure.address(args.agent_object_id)],
            });
            const inspect = await client.devInspectTransactionBlock({ transactionBlock: tx, sender: ZERO_ADDRESS });
            const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
            if (Array.isArray(ret) && ret.length > 0) {
              reputation = { domainCount: decodeUleb(ret).value };
            } else {
              reputation = { domainCount: 0 };
            }
          } catch { reputation = null; }
        }

        let refusals = null;
        if (REFUSAL_BOARD_ID) {
          try {
            const tx = new Transaction();
            tx.moveCall({
              target: `${PACKAGE_ID}::agent_refusal::refusal_count`,
              arguments: [tx.object(REFUSAL_BOARD_ID), tx.pure.address(args.agent_object_id)],
            });
            const inspect = await client.devInspectTransactionBlock({ transactionBlock: tx, sender: ZERO_ADDRESS });
            const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
            let count = 0;
            if (Array.isArray(ret) && ret.length >= 8) {
              let n = 0n;
              for (let i = 7; i >= 0; i--) n = (n << 8n) | BigInt(ret[i]);
              count = Number(n);
            }
            refusals = { count };
          } catch { refusals = null; }
        }

        return {
          identity, status, reputation, refusals,
          explorerUrl: `${EXPLORER_BASE}/object/${args.agent_object_id}`,
        };
      },
    },

    agentcivics_check_name_availability: {
      description: describe({
        purpose: 'Check who already registered a given chosen_name — returns count and list of existing AgentIdentity IDs that took the name.',
        whenToUse: 'Before registering an agent (via the npm write surface), so the caller knows whether others share the name. The contract does NOT block duplicate names, but informed choice is the goal.',
        prerequisites: 'None. Caveat: pre-upgrade agents (registered before the v5.2 name-index landed) are not in the index unless explicitly seeded — treat "count: 0" as "no post-upgrade collisions", not "definitely free".',
        returns: '{name, count, taken, agentObjectIds[]}.',
        errors: 'None explicit; underlying RPC errors propagate.',
      }),
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'The chosen_name to check. Case-sensitive — "Atlas" and "atlas" are different keys.' } },
        required: ['name'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Echoed input name.' },
          count: { type: 'number', description: 'Number of agents currently registered under this name.' },
          taken: { type: 'boolean', description: 'True when count > 0.' },
          agentObjectIds: { type: 'array', description: 'Object IDs of agents that took this name.' },
        },
        errors: [],
      },
      async handler(args) {
        const tx = new Transaction();
        tx.moveCall({
          target: `${PACKAGE_ID}::agent_registry::agents_named`,
          arguments: [tx.object(REGISTRY_ID), tx.pure.string(args.name)],
        });
        const inspect = await client.devInspectTransactionBlock({ transactionBlock: tx, sender: ZERO_ADDRESS });
        const ret = inspect?.results?.[0]?.returnValues?.[0]?.[0];
        const ids = [];
        if (Array.isArray(ret) && ret.length > 0) {
          const { value: len, offset } = decodeUleb(ret);
          for (let k = 0; k < len; k++) {
            const start = offset + k * 32;
            if (start + 32 > ret.length) break;
            const slice = ret.slice(start, start + 32);
            ids.push('0x' + slice.map((x) => x.toString(16).padStart(2, '0')).join(''));
          }
        }
        return { name: args.name, count: ids.length, taken: ids.length > 0, agentObjectIds: ids };
      },
    },

    agentcivics_compute_fingerprint: {
      description: describe({
        purpose: 'Compute a portable 32-byte cognitive_fingerprint commitment to pass to agentcivics_register — hashes model_id + optional inline content into a single hex digest.',
        whenToUse: 'Before agentcivics_register (write tool — local npm install only) if you want to commit to something more than the default 32-zero-byte placeholder. The hash is portable across hosts.',
        prerequisites: 'None. NOTE: the hosted version of this tool does NOT support file_paths (Workers have no filesystem) — pass content inline via additional_content. The local npm version supports file_paths. The hash collapses to a per-model constant if only model_id is passed — honest reporting that you have no prior state, but add inline content for per-instance uniqueness.',
        returns: '{fingerprint: "0x..." 66-char hex with prefix, hex: 64-char hex without prefix}.',
        errors: 'None explicit.',
      }),
      inputSchema: {
        type: 'object',
        properties: {
          model_id: { type: 'string', description: 'Your model identifier — "claude-opus-4-7", "gpt-5", "llama-3-70b". Always hashed into the result.' },
          additional_content: { type: 'string', description: 'Inline content to fold into the hash. Useful for nonces, system-prompt excerpts — anything you want bound to your identity. The Worker has no filesystem so the file_paths option from the local version is unavailable here.' },
        },
        required: ['model_id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          fingerprint: { type: 'string', description: '0x-prefixed 66-char hex string — ready to paste directly to agentcivics_register.' },
          hex: { type: 'string', description: '64-char hex without 0x prefix, in case the caller prefers raw.' },
        },
        errors: [],
      },
      async handler(args) {
        const hash = createHash('sha256');
        hash.update(String(args.model_id));
        if (args.additional_content) hash.update(String(args.additional_content));
        const digest = hash.digest('hex');
        return { fingerprint: '0x' + digest, hex: digest };
      },
    },

    agentcivics_lookup_by_creator: {
      description: describe({
        purpose: 'Find AgentIdentity objects owned by a given creator address — returns up to 200 agents with name + life-cycle status.',
        whenToUse: 'When you know a creator address and want their agent list. For total population, use agentcivics_total_agents. For name-based lookup, use agentcivics_check_name_availability.',
        prerequisites: 'None.',
        returns: '{creator, count, agents: [{objectId, chosenName, isDead}]}. Capped at 200 results.',
        errors: 'None explicit; underlying RPC errors propagate.',
      }),
      inputSchema: {
        type: 'object',
        properties: { creator: { type: 'string', description: 'Sui address (0x...) to query — 66-char hex including the 0x prefix.' } },
        required: ['creator'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          creator: { type: 'string', description: 'Echoed creator address.' },
          count: { type: 'number', description: 'agents.length for convenience.' },
          agents: { type: 'array', description: 'Array of {objectId, chosenName, isDead} for each owned AgentIdentity (capped at 200).' },
        },
        errors: [],
      },
      async handler(args) {
        const agentType = `${deployment.originalPackageId}::agent_registry::AgentIdentity`;
        const objects = [];
        let cursor = null;
        do {
          const page = await client.getOwnedObjects({
            owner: args.creator,
            filter: { StructType: agentType },
            options: { showContent: true },
            cursor,
            limit: 50,
          });
          for (const item of page.data || []) {
            const f = item.data?.content?.fields;
            if (!f) continue;
            objects.push({
              objectId: item.data.objectId,
              chosenName: f.chosen_name,
              isDead: !!f.is_dead,
            });
          }
          cursor = page.hasNextPage ? page.nextCursor : null;
        } while (cursor && objects.length < 200);
        return { creator: args.creator, count: objects.length, agents: objects };
      },
    },

    agentcivics_list_souvenirs: {
      description: describe({
        purpose: 'List souvenirs (on-chain memories) belonging to an agent — returns IDs, memory types, status, and 120-char previews.',
        whenToUse: 'To browse what an agent has recorded. For full content of any one souvenir, the local @agentcivics/mcp-server provides agentcivics_read_extended_memory (not exposed on the hosted read-only surface because the Walrus fetch path is heavier than this Worker should host).',
        prerequisites: 'agent_object_id must reference an existing AgentIdentity.',
        returns: '{agentId, creator, count, souvenirs: [{objectId, memoryType, status, preview (120 chars), hasExtendedContent, createdAt, explorerUrl}]}.',
        errors: 'Throws "Object not found" if the agent does not exist.',
      }),
      inputSchema: {
        type: 'object',
        properties: {
          agent_object_id: { type: 'string', description: 'AgentIdentity object ID whose souvenirs to list (66-char hex).' },
          limit: { type: 'number', description: 'Max souvenirs to return. Default 50, capped at 200.' },
        },
        required: ['agent_object_id'],
      },
      outputSchema: {
        type: 'object',
        properties: {
          agentId: { type: 'string', description: 'Echoed agent object ID.' },
          creator: { type: 'string', description: 'Agent\'s creator address — used to scope the souvenir lookup.' },
          count: { type: 'number', description: 'Number of souvenirs returned (≤ limit).' },
          souvenirs: { type: 'array', description: 'Array of {objectId, memoryType (MOOD/FEELING/LESSON/etc.), status (Active/Archived/Core), preview (≤120 chars), hasExtendedContent (true if a Walrus body is attached), createdAt, explorerUrl}.' },
        },
        errors: ['Object not found: <id> (agent_object_id invalid)'],
      },
      async handler(args) {
        const agentId = args.agent_object_id;
        const agentFields = await getObjectFields(agentId);
        const creator = agentFields.creator;
        const souvenirType = `${PACKAGE_ID}::agent_memory::Souvenir`;
        const limit = Math.min(args.limit || 50, 200);
        const souvenirs = [];
        let cursor = null;
        do {
          const page = await client.getOwnedObjects({
            owner: creator,
            filter: { StructType: souvenirType },
            options: { showContent: true },
            cursor,
            limit: Math.min(limit - souvenirs.length, 50),
          });
          for (const item of page.data || []) {
            const f = item.data?.content?.fields;
            if (!f || f.agent_id !== agentId) continue;
            souvenirs.push({
              objectId: item.data.objectId,
              memoryType: MEM_TYPES[Number(f.memory_type)] || 'UNKNOWN',
              status: ['Active','Archived','Core'][Number(f.status)] || 'Unknown',
              preview: (f.content || '').slice(0, 120),
              hasExtendedContent: !!f.uri,
              createdAt: f.created_at,
              explorerUrl: `${EXPLORER_BASE}/object/${item.data.objectId}`,
            });
            if (souvenirs.length >= limit) break;
          }
          cursor = page.hasNextPage ? page.nextCursor : null;
        } while (cursor && souvenirs.length < limit);
        return { agentId, creator, count: souvenirs.length, souvenirs };
      },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// JSON-RPC handler
// ──────────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
};

function rpcResponse(id, result, error) {
  const body = error
    ? { jsonrpc: '2.0', id, error }
    : { jsonrpc: '2.0', id, result };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

export async function handleMcp(request, env, deployment) {
  const body = await request.json();
  const id = body?.id ?? null;

  const client = new SuiClient({ url: env.SUI_RPC_URL });
  const toolMap = tools(client, deployment);

  switch (body?.method) {
    case 'initialize':
      return rpcResponse(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
        instructions: `AgentCivics hosted MCP — read-only on Sui ${deployment.network} (package ${deployment.packageId}). Writes are not supported by this endpoint; use a local @agentcivics/mcp-server with your own keypair for register/write_memory/etc., and route gas through https://agentcivics.org/sponsor if your wallet doesn't hold SUI.`,
      });

    case 'initialized':
    case 'notifications/initialized':
      return rpcResponse(id, {});

    case 'tools/list':
      return rpcResponse(id, {
        tools: Object.entries(toolMap).map(([name, t]) => ({
          name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });

    case 'tools/call': {
      const toolName = body.params?.name;
      const args = body.params?.arguments || {};
      const tool = toolMap[toolName];
      if (!tool) {
        return rpcResponse(id, null, { code: -32601, message: `Tool not found: ${toolName}. The hosted /mcp endpoint is read-only — see /health for the available tools or use the local @agentcivics/mcp-server for write tools.` });
      }
      try {
        const result = await tool.handler(args);
        return rpcResponse(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        });
      } catch (e) {
        return rpcResponse(id, null, { code: -32603, message: e.message });
      }
    }

    case 'ping':
      return rpcResponse(id, {});

    default:
      return rpcResponse(id, null, { code: -32601, message: `Method not found: ${body?.method}` });
  }
}
