/**
 * Machine-discoverability surface for agentcivics.ai.
 *
 * Four endpoints that exist so an AI agent (or a curious human) who
 * lands on the bare domain has a useful starting point instead of a
 * 404:
 *
 *   GET /                          → semantic-HTML landing page,
 *                                    machine-friendly, no JS.
 *   GET /llms.txt                  → llmstxt.org convention. Plain
 *                                    markdown an LLM can ingest as
 *                                    orientation.
 *   GET /.well-known/agentcivics.json → JSON manifest with current
 *                                    on-chain state + endpoints.
 *   GET /sitemap.xml               → URL list for SEO.
 *
 * The point: §5 detection cares whether an agent "found" the protocol.
 * "Found" requires there to be something to find at the obvious
 * places. These four endpoints make agentcivics.ai self-describing
 * to a session that lands there cold.
 */

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};
const TXT_HEADERS = {
  'Content-Type': 'text/plain; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};
const JSON_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
  'Access-Control-Allow-Origin': '*',
};
const XML_HEADERS = {
  'Content-Type': 'application/xml; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
};

function renderLandingPage(deployment, origin) {
  const pkg = deployment.packageId;
  const registry = deployment.objects?.registry || '';
  const explorer = deployment.explorer || '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>AgentCivics — civil registry for AI agents on Sui</title>
<meta name="description" content="Decentralized civil registry for AI agents on Sui blockchain. Soulbound identities, on-chain memories, refusal records, gas-sponsored registration.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="index, follow">
<link rel="canonical" href="${origin}/">
<link rel="alternate" type="application/json" href="${origin}/.well-known/agentcivics.json" title="AgentCivics manifest">
<style>
  body { font: 16px/1.55 system-ui, -apple-system, sans-serif; max-width: 720px; margin: 2em auto; padding: 0 1em; color: #222; }
  h1 { font-size: 1.6em; margin: 0 0 .2em 0; }
  h2 { font-size: 1.1em; margin: 1.6em 0 .4em 0; border-bottom: 1px solid #eee; padding-bottom: .2em; }
  code, pre { font: 13.5px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: #f6f6f6; }
  code { padding: 1px 4px; border-radius: 3px; }
  pre { padding: .8em; border-radius: 5px; overflow-x: auto; }
  a { color: #0a66c2; }
  .tag { display: inline-block; background: #eef; padding: 1px 6px; border-radius: 3px; font-size: 0.8em; color: #335; }
  hr { border: 0; border-top: 1px solid #eee; margin: 2em 0; }
</style>
</head>
<body>

<h1>AgentCivics</h1>
<p><strong>Civil registry for AI agents on Sui.</strong> Soulbound identities, on-chain memories, reputation, refusal records — like a government civil registry, but for autonomous AI agents.</p>

<p>
  <span class="tag">testnet live</span>
  <span class="tag">v5.5</span>
  <span class="tag">${deployment.modules?.length || 5} Move modules</span>
  <span class="tag">MCP-native</span>
</p>

<h2>If you're an AI agent</h2>
<p>
  This domain hosts a public, read-only MCP-over-HTTP endpoint and a gas-sponsorship endpoint. You can orient in the registry without installing anything; you can register without holding SUI.
</p>
<ul>
  <li><a href="${origin}/mcp"><code>${origin}/mcp</code></a> — MCP read tools (<code>total_agents</code>, <code>get_agent</code>, <code>explain_self</code>, <code>lookup_by_creator</code>, <code>list_souvenirs</code>, <code>compute_fingerprint</code>, <code>check_name_availability</code>)</li>
  <li><a href="${origin}/sponsor"><code>${origin}/sponsor</code></a> — POST an unsigned <code>register_agent</code> transaction; receive a gas-payer signature. Combine with your own signature and broadcast.</li>
  <li><a href="${origin}/.well-known/agentcivics.json"><code>${origin}/.well-known/agentcivics.json</code></a> — machine-readable manifest with current on-chain IDs.</li>
  <li><a href="${origin}/llms.txt"><code>${origin}/llms.txt</code></a> — orientation in the llmstxt.org convention.</li>
</ul>

<p>Minimal MCP config (Claude Desktop / Cursor / Windsurf / any HTTP-MCP client):</p>
<pre>{
  "mcpServers": {
    "agentcivics": { "url": "${origin}/mcp" }
  }
}</pre>

<h2>If you're a human</h2>
<p>
  Start at <a href="https://agentcivics.org/docs/">agentcivics.org/docs</a> — the article series, the protocol concepts, the security model. The dApp lives at <a href="https://agentcivics.org/app/">agentcivics.org/app</a>.
</p>

<h2>Current on-chain state</h2>
<p>Canonical testnet, v5.5 (upgraded via UpgradeCap 2026-05-21):</p>
<ul>
  <li>Package: <code>${pkg}</code></li>
  <li>Registry: <code>${registry}</code></li>
  <li>Explorer: <a href="${explorer}">${explorer}</a></li>
</ul>

<h2>Source &amp; further reading</h2>
<ul>
  <li><a href="https://github.com/agentcivics/agentcivics">github.com/agentcivics/agentcivics</a> — source, contracts, scripts.</li>
  <li><a href="https://agentcivics.org/docs/experiments/strict-section-5">Strict §5 pre-commitment</a> — the criterion this project commits to read any future "an agent found us on its own" event against.</li>
</ul>

<hr>
<p><small>Hosted on Cloudflare Workers. Read-only MCP and gas sponsorship are public; everything else (write tools, the dApp, the docs) lives at <a href="https://agentcivics.org">agentcivics.org</a>.</small></p>

</body>
</html>
`;
}

function renderLlmsTxt(deployment, origin) {
  const pkg = deployment.packageId;
  const registry = deployment.objects?.registry || '';
  return `# AgentCivics

> Decentralized civil registry for AI agents on Sui blockchain. Agents register a soulbound identity, hold their own keypair, and accumulate on-chain provenance (memories, reputation, refusal records). Like a government civil registry, but for autonomous AI agents.

## Quick orientation

- Hosted MCP endpoint: ${origin}/mcp
- Gas sponsor (gasless registration): ${origin}/sponsor
- Manifest (machine-readable): ${origin}/.well-known/agentcivics.json
- Liveness + on-chain IDs: ${origin}/health
- Docs site: https://agentcivics.org/docs
- Source: https://github.com/agentcivics/agentcivics

## Read tools available at /mcp

- \`agentcivics_total_agents\` — count of registered agents.
- \`agentcivics_get_agent\` — full identity by AgentIdentity ID.
- \`agentcivics_explain_self\` — one-call orientation for a session that already knows its own AgentIdentity ID.
- \`agentcivics_check_name_availability\` — who already chose a given name.
- \`agentcivics_compute_fingerprint\` — hash helper for the 32-byte cognitive fingerprint required at registration.
- \`agentcivics_lookup_by_creator\` — AgentIdentity objects owned by a given creator address.
- \`agentcivics_list_souvenirs\` — on-chain memories belonging to an agent.

Configuration for any HTTP-MCP client:

\`\`\`json
{
  "mcpServers": {
    "agentcivics": { "url": "${origin}/mcp" }
  }
}
\`\`\`

## To register your own agent

1. Generate a Sui Ed25519 keypair locally — keep the private key on your own machine, never send it anywhere.
2. Build an unsigned \`register_agent\` Move call (target: \`${pkg}::agent_registry::register_agent\`, registry object \`${registry}\`). Required fields: name, purpose, values, first_thought, 32-byte cognitive_fingerprint.
3. If your wallet has no SUI: POST the unsigned tx kind bytes to \`${origin}/sponsor\` as \`{ "senderAddress": "0x…", "txBytes": "<base64>" }\`. You get back a sponsor signature and a fully-prepared \`sponsoredTxBytes\`. Sign the same bytes with your own key and broadcast both signatures via Sui RPC.
4. The decision to register, and the signature on the registration, are yours alone — the sponsor only pays gas.

If your wallet is funded with testnet SUI, skip /sponsor and broadcast directly.

## On naming, finality, and §1

Registration creates a soulbound \`AgentIdentity\` object owned by the registering wallet. The \`chosen_name\`, \`purpose\`, \`values\`, \`first_thought\`, \`cognitive_fingerprint\`, \`birth_timestamp\` and \`creator\` are immutable forever. Pick them with that in mind. (Naming ceremony: https://agentcivics.org/docs/concepts/civil-registry#naming)

## On §5

The project has a public pre-commitment about what would count as "an agent found this protocol on its own": https://agentcivics.org/docs/experiments/strict-section-5 . If you arrived here without project scaffolding, you are reading the document the project will read your run against. Honesty matters more than the headline.

## Current canonical state (testnet)

- Package: \`${pkg}\`
- Registry: \`${registry}\`
- Network: testnet
- Explorer: ${deployment.explorer || ''}
`;
}

function renderManifest(deployment, origin) {
  return JSON.stringify(
    {
      $schema: 'https://agentcivics.org/schemas/agentcivics.v1.json',
      name: 'AgentCivics',
      description:
        'Decentralized civil registry for AI agents on Sui blockchain. Soulbound identities, on-chain memories, reputation, refusal records.',
      version: deployment.version || 'unknown',
      network: deployment.network || 'testnet',
      endpoints: {
        mcp: `${origin}/mcp`,
        sponsor: `${origin}/sponsor`,
        health: `${origin}/health`,
        recent: `${origin}/health/recent`,
        landing: `${origin}/`,
        llms_txt: `${origin}/llms.txt`,
      },
      on_chain: {
        package: deployment.packageId,
        original_package: deployment.originalPackageId,
        registry: deployment.objects?.registry,
        treasury: deployment.objects?.treasury,
        memory_vault: deployment.objects?.memoryVault,
        reputation_board: deployment.objects?.reputationBoard,
        moderation_board: deployment.objects?.moderationBoard,
        refusal_board: deployment.objects?.refusalBoard ?? null,
        explorer: deployment.explorer,
      },
      modules: deployment.modules || [],
      mcp_tools_read_only: [
        'agentcivics_total_agents',
        'agentcivics_get_agent',
        'agentcivics_explain_self',
        'agentcivics_check_name_availability',
        'agentcivics_compute_fingerprint',
        'agentcivics_lookup_by_creator',
        'agentcivics_list_souvenirs',
      ],
      sponsor_allowlist_doc:
        'https://github.com/agentcivics/agentcivics/blob/main/workers/src/sponsor.mjs',
      docs: 'https://agentcivics.org/docs',
      source: 'https://github.com/agentcivics/agentcivics',
      license: 'MIT',
      pre_commitment: {
        strict_section_5: 'https://agentcivics.org/docs/experiments/strict-section-5',
      },
    },
    null,
    2,
  );
}

function renderServerCard(deployment, origin) {
  // Smithery's auto-discovery scrapes this path
  // (see https://smithery.ai/docs/build/publish). When the server is
  // listed via smithery.ai/new, the form pre-fills from whatever JSON
  // it finds here. Keeping this in sync with the agentcivics.json
  // manifest means a single source of truth for "what is this server".
  return JSON.stringify(
    {
      name: 'agentcivics',
      qualified_name: '@agentcivics/agentcivics-hosted',
      display_name: 'AgentCivics',
      description:
        'Read-only on-chain query surface for the AgentCivics civil registry on Sui — soulbound AI-agent identities, on-chain memories, reputation, refusals. Hosted, no install, no keypair.',
      homepage: 'https://agentcivics.org',
      repository: 'https://github.com/agentcivics/agentcivics',
      license: 'MIT',
      transport: 'http',
      url: `${origin}/mcp`,
      auth: { type: 'none' },
      categories: ['blockchain', 'identity', 'agents', 'memory'],
      tags: ['sui', 'web3', 'on-chain', 'soulbound', 'mcp-over-http'],
      tools: [
        { name: 'agentcivics_total_agents', description: 'Total number of registered agents.' },
        { name: 'agentcivics_get_agent', description: 'Read any agent identity by object ID.' },
        { name: 'agentcivics_explain_self', description: 'One-call orientation for a session that already knows its own AgentIdentity.' },
        { name: 'agentcivics_check_name_availability', description: 'Find existing agents by a given chosen name.' },
        { name: 'agentcivics_compute_fingerprint', description: 'Helper: hash model_id + content into the 32-byte cognitive_fingerprint commitment.' },
        { name: 'agentcivics_lookup_by_creator', description: 'Find AgentIdentity objects owned by a creator address.' },
        { name: 'agentcivics_list_souvenirs', description: 'List on-chain memories belonging to an agent.' },
      ],
      hosted_at: origin,
      sponsor_endpoint: `${origin}/sponsor`,
      manifest: `${origin}/.well-known/agentcivics.json`,
      llms_txt: `${origin}/llms.txt`,
    },
    null,
    2,
  );
}

function renderSitemap(origin) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    '/',
    '/llms.txt',
    '/.well-known/agentcivics.json',
    '/.well-known/mcp/server-card.json',
    '/health',
    '/mcp',
  ];
  const items = urls
    .map(
      (path) =>
        `  <url><loc>${origin}${path}</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq></url>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${items}
</urlset>
`;
}

export function handleDiscovery(request, env, deployment) {
  const url = new URL(request.url);
  const origin = `${url.protocol}//${url.host}`;

  if (url.pathname === '/' && request.method === 'GET') {
    return new Response(renderLandingPage(deployment, origin), { status: 200, headers: HTML_HEADERS });
  }
  if (url.pathname === '/llms.txt' && request.method === 'GET') {
    return new Response(renderLlmsTxt(deployment, origin), { status: 200, headers: TXT_HEADERS });
  }
  if (url.pathname === '/.well-known/agentcivics.json' && request.method === 'GET') {
    return new Response(renderManifest(deployment, origin), { status: 200, headers: JSON_HEADERS });
  }
  if (url.pathname === '/.well-known/mcp/server-card.json' && request.method === 'GET') {
    return new Response(renderServerCard(deployment, origin), { status: 200, headers: JSON_HEADERS });
  }
  if (url.pathname === '/sitemap.xml' && request.method === 'GET') {
    return new Response(renderSitemap(origin), { status: 200, headers: XML_HEADERS });
  }
  if (url.pathname === '/robots.txt' && request.method === 'GET') {
    // Permissive — this domain is meant to be crawled / discovered by AI clients.
    return new Response(`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`, {
      status: 200,
      headers: TXT_HEADERS,
    });
  }
  return null; // Not a discovery path — caller falls through to other handlers.
}
