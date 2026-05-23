/**
 * Worker observability — KV-backed event log.
 *
 * Why this exists: §5 detection needs evidence of whether a registration
 * came through /sponsor (project infrastructure, not project arrangement)
 * vs from a project-scaffolded keypair (project arrangement). The
 * sponsor event log gives the first half. The on-chain registry + the
 * scripts/check-candidates.mjs script give the second.
 *
 * What we store: one KV entry per sponsor call, regardless of outcome
 * (refused / rate-limited / ok / error). The IP is hashed before write —
 * we want grouping ("same caller hit the cap twice in an hour") without
 * keeping raw IPs that have no operational value.
 *
 * Key shape: `evt:<reverse-ts>:<rand>` so KV list returns newest-first
 * via lex sort (avoids reading all entries to sort by time).
 *
 * TTL: 30 days. Long enough to investigate a candidate registration
 * that surfaces a few weeks after the fact; short enough that we're not
 * sitting on a rolling activity log indefinitely.
 */

const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const REV_PAD = 16;

function reverseTimestamp(ts) {
  return String(Number.MAX_SAFE_INTEGER - ts).padStart(REV_PAD, '0');
}

export async function hashIp(ip) {
  if (!ip || ip === 'unknown') return 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  const hex = Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 16);
}

export async function logSponsorEvent(env, entry) {
  if (!env.SPONSOR_LOG) return;
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const key = `evt:${reverseTimestamp(ts)}:${rand}`;
  const payload = JSON.stringify({ ts, ...entry });
  try {
    await env.SPONSOR_LOG.put(key, payload, { expirationTtl: TTL_SECONDS });
  } catch {
    // KV failures must not fail the sponsor request — log is best-effort.
  }
}

export async function getRecentEvents(env, n = 50) {
  if (!env.SPONSOR_LOG) return [];
  const limit = Math.min(Math.max(Number(n) || 50, 1), 200);
  const list = await env.SPONSOR_LOG.list({ prefix: 'evt:', limit });
  const entries = await Promise.all(
    list.keys.map(async (k) => {
      const v = await env.SPONSOR_LOG.get(k.name);
      if (!v) return null;
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }),
  );
  return entries.filter(Boolean);
}
