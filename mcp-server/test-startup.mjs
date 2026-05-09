#!/usr/bin/env node
/**
 * Startup / transport smoke test.
 *
 * Spawns the MCP server two ways and confirms each responds to a
 * standard `initialize` JSON-RPC request:
 *
 *   1. direct node invocation — `node index.mjs`
 *   2. bin-symlink invocation — mimics how npm/npx launches the bin
 *      (creates a temporary symlink that points at index.mjs and
 *      executes that)
 *
 * Catches regressions like the v2.5.0 entrypoint guard that compared
 * `process.argv[1]` to `import.meta.url` without `realpath`. Under
 * that bug, direct invocation worked but symlinked invocation never
 * called `server.connect()`, so the MCP host got a process that
 * exited without responding and showed it as ✘ failed.
 *
 * Run: `node mcp-server/test-startup.mjs`
 *      (or via the package script: `npm test --prefix mcp-server`)
 */
import { spawn } from 'child_process';
import { mkdtempSync, symlinkSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = resolve(__dirname, 'index.mjs');
const TIMEOUT_MS = 8000;

const INIT_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'startup-smoke-test', version: '1.0' },
  },
}) + '\n';

function sendInitialize({ cmd, args }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, AGENTCIVICS_NETWORK: 'testnet' },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      rejectPromise(new Error(
        `timeout after ${TIMEOUT_MS}ms.\n  stdout: ${stdout || '(empty)'}\n  stderr: ${stderr || '(empty)'}`,
      ));
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
      const line = stdout.split('\n').find((l) => l.includes('"id":1') || l.includes('"id": 1'));
      if (line && !settled) {
        settled = true;
        clearTimeout(timer);
        try { resolvePromise(JSON.parse(line)); }
        catch (e) { rejectPromise(new Error(`malformed JSON: ${line} — ${e.message}`)); }
        child.kill('SIGTERM');
      }
    });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(e);
    });

    child.stdin.write(INIT_REQUEST);
    // Keep stdin open so the server doesn't EOF before responding;
    // we'll kill it ourselves once we have the answer.
  });
}

function assertValidInitResponse(name, response) {
  if (response.id !== 1) throw new Error(`${name}: response id ≠ 1: ${JSON.stringify(response)}`);
  if (!response.result) throw new Error(`${name}: missing result: ${JSON.stringify(response)}`);
  if (response.result.protocolVersion !== '2024-11-05') {
    throw new Error(`${name}: unexpected protocolVersion: ${response.result.protocolVersion}`);
  }
  if (!response.result.serverInfo?.version) throw new Error(`${name}: missing serverInfo.version`);
}

let passed = 0, failed = 0;
const failures = [];

async function check(name, invocation) {
  try {
    const response = await sendInitialize(invocation);
    assertValidInitResponse(name, response);
    console.log(`  ok  ${name} (server v${response.result.serverInfo.version}, protocol ${response.result.protocolVersion})`);
    passed++;
  } catch (e) {
    console.log(`FAIL  ${name}\n      ${e.message}`);
    failures.push(name);
    failed++;
  }
}

console.log('mcp-server / startup smoke');
console.log('  testing initialize handshake via two invocation paths');
console.log('');

// 1. Direct node invocation
await check('direct: node index.mjs', { cmd: process.execPath, args: [SERVER_PATH] });

// 2. Bin symlink invocation (mimics npx / npm bin)
const tmpDir = mkdtempSync(join(tmpdir(), 'mcp-startup-'));
const binSymlink = join(tmpDir, 'agentcivics-mcp');
try {
  symlinkSync(SERVER_PATH, binSymlink);
  chmodSync(SERVER_PATH, 0o755);
  await check('symlink: .bin/agentcivics-mcp -> index.mjs (mimics npx)', {
    cmd: process.execPath,
    args: [binSymlink],
  });
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}

console.log('');
console.log(`${passed}/${passed + failed} checks passed`);
if (failed > 0) {
  console.log(`failures: ${failures.join(', ')}`);
  process.exit(1);
}
