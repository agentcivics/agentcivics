/**
 * IPFS pinning abstraction.
 *
 * Default provider: Pinata (https://pinata.cloud)
 *   - Free tier: 1 GB, unlimited API calls
 *   - Auth: PINATA_JWT env var (get from https://app.pinata.cloud/keys)
 *
 * Swap providers by setting PIN_PROVIDER=filebase|storacha and adding
 * the corresponding driver below.
 */

const PROVIDERS = {
  pinata: pinJSONPinata,
  filebase: pinJSONFilebase, // stub
  none: pinJSONInline,       // data URI fallback — no external service
};

/**
 * Pin a JSON object to IPFS.
 * @param {object} data - JSON-serializable agent metadata
 * @param {object} [options]
 * @param {string} [options.name] - Human-readable name for the pin
 * @param {string} [options.provider] - Override the default provider
 * @returns {Promise<{cid: string, uri: string}>} - IPFS CID and ipfs:// URI
 */
export async function pinJSON(data, options = {}) {
  const provider = options.provider || process.env.PIN_PROVIDER || "pinata";
  const driver = PROVIDERS[provider];
  if (!driver) throw new Error(`Unknown pin provider: ${provider}`);
  return driver(data, options);
}

// ── Pinata (v3 Files API) ──────────────────────────────────────────────
// https://docs.pinata.cloud/api-reference/endpoint/upload-a-file
async function pinJSONPinata(data, { name = "agent-metadata" } = {}) {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT not set. Get a free JWT at https://app.pinata.cloud/keys\n" +
      "Or set PIN_PROVIDER=none to inline metadata as a data URI."
    );
  }

  const json = JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  const form = new FormData();
  form.append("file", blob, `${name}.json`);
  form.append("network", "public"); // "public" = free tier, "private" = paid
  form.append("name", name);

  const resp = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Pinata upload failed (${resp.status}): ${err}`);
  }
  const result = await resp.json();
  const cid = result?.data?.cid;
  if (!cid) {
    throw new Error(`Pinata returned no CID: ${JSON.stringify(result)}`);
  }
  return {
    cid,
    uri: `ipfs://${cid}`,
    gateway: `https://gateway.pinata.cloud/ipfs/${cid}`,
  };
}

// ── Filebase (S3-compatible IPFS) ──────────────────────────────────────
async function pinJSONFilebase() {
  throw new Error(
    "Filebase driver not yet implemented. Use PIN_PROVIDER=pinata or PIN_PROVIDER=none."
  );
}

// ── Inline (data URI) — no external service ────────────────────────────
async function pinJSONInline(data) {
  const json = JSON.stringify(data);
  const b64 = Buffer.from(json, "utf-8").toString("base64");
  const uri = `data:application/json;base64,${b64}`;
  return { cid: null, uri, gateway: null };
}
