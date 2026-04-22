/**
 * IPFS pinning abstraction with multi-provider redundancy.
 *
 * Default provider: Pinata (https://pinata.cloud)
 *   - Free tier: 1 GB, unlimited API calls
 *   - Auth: PINATA_JWT env var (get from https://app.pinata.cloud/keys)
 *
 * Set PIN_PROVIDERS=pinata,storacha for dual-pin redundancy:
 *   - Requires both PINATA_JWT and W3S_TOKEN to be set
 *   - If one fails, the other still succeeds
 *   - Returned CID is from the first success, with all CIDs in result.pins[]
 *
 * Providers supported:
 *   - pinata    — Pinata v3 Files API
 *   - storacha  — Storacha / web3.storage (Filecoin-backed IPFS)
 *   - none      — inline metadata as a data URI (no external service)
 */

const DRIVERS = {
  pinata: pinPinata,
  storacha: pinStoracha,
  none: pinInline,
};

/**
 * Pin a JSON object to IPFS across one or more providers.
 *
 * @param {object} data - JSON-serializable metadata
 * @param {object} [options]
 * @param {string} [options.name] - Human-readable pin name
 * @param {string[]} [options.providers] - Override providers list
 * @returns {Promise<{cid: string, uri: string, gateway: string|null, pins: Array<{provider, cid, gateway, ok, error?}>}>}
 */
export async function pinJSON(data, options = {}) {
  const providers =
    options.providers ||
    (process.env.PIN_PROVIDERS || process.env.PIN_PROVIDER || "pinata")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  // Pin to all providers in parallel; track results
  const results = await Promise.allSettled(
    providers.map(async (p) => {
      const driver = DRIVERS[p];
      if (!driver) throw new Error(`Unknown pin provider: ${p}`);
      const out = await driver(data, options);
      return { provider: p, ok: true, ...out };
    })
  );

  const pins = results.map((r, i) => {
    const provider = providers[i];
    if (r.status === "fulfilled") return r.value;
    return { provider, ok: false, error: r.reason?.message || String(r.reason) };
  });

  const successes = pins.filter((p) => p.ok);
  if (!successes.length) {
    const detail = pins.map((p) => `${p.provider}: ${p.error}`).join("; ");
    throw new Error(`All pin providers failed. ${detail}`);
  }

  // Primary result is the first successful pin
  const primary = successes[0];
  return {
    cid: primary.cid,
    uri: primary.uri,
    gateway: primary.gateway,
    pins, // full breakdown for logging/audit
  };
}

// ── Pinata v3 Files API ────────────────────────────────────────────────
// https://docs.pinata.cloud/api-reference/endpoint/upload-a-file
async function pinPinata(data, { name = "agent-metadata" } = {}) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT not set. Get a free JWT at https://app.pinata.cloud/keys"
    );
  }

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, `${name}.json`);
  form.append("network", "public");
  form.append("name", name);

  const resp = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Pinata ${resp.status}: ${err}`);
  }
  const result = await resp.json();
  const cid = result?.data?.cid;
  if (!cid) throw new Error(`Pinata returned no CID: ${JSON.stringify(result)}`);
  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

// ── Storacha (formerly web3.storage) — Filecoin-backed IPFS ────────────
// https://docs.storacha.network
// Token: get a delegation-based token or a bridge API token at https://console.storacha.network
async function pinStoracha(data, { name = "agent-metadata" } = {}) {
  const token = process.env.W3S_TOKEN || process.env.STORACHA_TOKEN;
  if (!token) {
    throw new Error(
      "W3S_TOKEN / STORACHA_TOKEN not set. Get one at https://console.storacha.network"
    );
  }
  // Storacha bridge upload endpoint (CAR or direct file). For a simple JSON
  // file we use the upload-bridge /bridge endpoint which accepts raw bytes.
  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, `${name}.json`);

  const resp = await fetch("https://up.storacha.network/bridge", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Storacha ${resp.status}: ${err}`);
  }
  const result = await resp.json();
  const cid = result?.cid || result?.root?.cid || result?.data?.cid;
  if (!cid) throw new Error(`Storacha returned no CID: ${JSON.stringify(result)}`);
  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://w3s.link/ipfs/${cid}`,
  };
}

// ── Inline data URI — no external service ──────────────────────────────
async function pinInline(data) {
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  const uri = `data:application/json;base64,${b64}`;
  return { cid: null, uri, gateway: null };
}
