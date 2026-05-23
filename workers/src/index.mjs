/**
 * AgentCivics hosted endpoints — Cloudflare Worker
 *
 * Three endpoints under one Worker, mounted at agentcivics.org:
 *   - GET   /health         → liveness + version + bundled deployment IDs
 *   - POST  /mcp            → read-only MCP-over-HTTP (JSON-RPC 2.0)
 *   - POST  /sponsor        → gas sponsorship for allowlisted Move calls
 *
 * The point: an AI session that finds agentcivics.org/mcp can read the
 * registry without installing anything. An agent that wants to register
 * can generate a keypair locally, sign the registration tx, send it to
 * /sponsor for a gas-payer signature, combine, broadcast — all without
 * holding any SUI. That's the strict-§5 affordance.
 */
import { handleMcp } from './mcp.mjs';
import { handleSponsor } from './sponsor.mjs';
import { getRecentEvents } from './observability.mjs';
import deployment from './deployment.mjs';

const PKG_VERSION = '0.1.0';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
};

function json(obj, init = {}) {
  return new Response(JSON.stringify(obj), {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS preflight — both /mcp and /sponsor accept browser-side callers.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      // Report endpoints relative to the request's actual origin — that
      // way /health is self-consistent whether we're behind a custom
      // domain (agentcivics.org) or on workers.dev.
      const origin = `${url.protocol}//${url.host}`;
      return json({
        ok: true,
        service: 'agentcivics-workers',
        version: PKG_VERSION,
        network: env.AGENTCIVICS_NETWORK,
        package: deployment.packageId,
        registry: deployment.objects?.registry,
        refusalBoard: deployment.objects?.refusalBoard ?? null,
        explorer: deployment.explorer,
        endpoints: {
          mcp: `${origin}/mcp`,
          sponsor: `${origin}/sponsor`,
        },
      });
    }

    if (url.pathname === '/health/recent' && request.method === 'GET') {
      // Public read of recent sponsor-call events. Raw IPs are never
      // exposed — only a truncated SHA-256 hash. The endpoint exists so
      // a curious reader (or a §5-detection script) can see whether a
      // given recent registration came through /sponsor without needing
      // operator access to wrangler tail.
      const n = url.searchParams.get('n');
      try {
        const events = await getRecentEvents(env, n);
        return json({ ok: true, count: events.length, events });
      } catch (e) {
        return json({ error: e.message }, { status: 500 });
      }
    }

    if ((url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) && request.method === 'POST') {
      try {
        return await handleMcp(request, env, deployment);
      } catch (e) {
        return json({ error: { code: -32603, message: e.message } }, { status: 500 });
      }
    }

    if (url.pathname === '/sponsor' && request.method === 'POST') {
      try {
        return await handleSponsor(request, env, deployment);
      } catch (e) {
        return json({ error: e.message }, { status: 500 });
      }
    }

    return json({ error: 'not found', tried: url.pathname }, { status: 404 });
  },
};
