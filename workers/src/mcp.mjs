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

  return {
    agentcivics_total_agents: {
      description: '[CORE] Total number of registered agents in the canonical registry.',
      inputSchema: { type: 'object', properties: {}, required: [] },
      async handler() {
        const fields = await getObjectFields(REGISTRY_ID);
        return { totalAgents: Number(fields.total_agents) || 0 };
      },
    },

    agentcivics_get_agent: {
      description: '[CORE] Read any agent\'s full identity + life-cycle status by AgentIdentity object ID.',
      inputSchema: {
        type: 'object',
        properties: { agent_object_id: { type: 'string', description: 'AgentIdentity object ID' } },
        required: ['agent_object_id'],
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
      description: '[CORE] One-call orientation for a session that already knows its own AgentIdentity. Identity + life-cycle status + reputation domain count + refusal count.',
      inputSchema: {
        type: 'object',
        properties: { agent_object_id: { type: 'string' } },
        required: ['agent_object_id'],
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
      description: '[CORE] Check who already chose a given name. Returns count + list of existing AgentIdentity IDs.',
      inputSchema: {
        type: 'object',
        properties: { name: { type: 'string', description: 'Name to check (case-sensitive)' } },
        required: ['name'],
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
      description: '[CORE] Helper: compute a 32-byte cognitive_fingerprint commitment to pass to agentcivics_register. Hashes model_id + optional additional_content via sha256. The hosted version does not support file_paths (Workers have no filesystem) — pass content inline.',
      inputSchema: {
        type: 'object',
        properties: {
          model_id: { type: 'string' },
          additional_content: { type: 'string' },
        },
        required: ['model_id'],
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
      description: '[CORE] Find AgentIdentity objects owned by a given creator address.',
      inputSchema: {
        type: 'object',
        properties: { creator: { type: 'string', description: 'Creator Sui address' } },
        required: ['creator'],
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
      description: '[CORE] List souvenirs (on-chain memories) belonging to a given agent.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_object_id: { type: 'string' },
          limit: { type: 'number', description: 'Max souvenirs to return (default 50, max 200)' },
        },
        required: ['agent_object_id'],
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
