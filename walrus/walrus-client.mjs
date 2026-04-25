/**
 * Walrus Decentralized Storage Client for AgentCivics
 *
 * Stores and retrieves blobs via the Walrus HTTP API (publisher/aggregator).
 * Used to extend agent memory beyond the 500-char on-chain limit.
 *
 * Architecture:
 *   - Content > 500 chars → store full content on Walrus
 *   - On-chain souvenir stores: summary (≤500 chars) + walrus://<blobId> in uri field
 *   - content_hash stores SHA-256 of full content for integrity verification
 *
 * @see https://docs.wal.app/docs/usage/web-api
 */

import { createHash } from "crypto";

// ═══════════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════════

const WALRUS_NETWORK = process.env.WALRUS_NETWORK || "testnet";

const DEFAULTS = {
  testnet: {
    publisher: "https://publisher.walrus-testnet.walrus.space",
    aggregator: "https://aggregator.walrus-testnet.walrus.space",
  },
  mainnet: {
    publisher: "https://publisher.walrus.space",
    aggregator: "https://aggregator.walrus.space",
  },
};

const PUBLISHER_URL = process.env.WALRUS_PUBLISHER_URL || DEFAULTS[WALRUS_NETWORK]?.publisher || DEFAULTS.testnet.publisher;
const AGGREGATOR_URL = process.env.WALRUS_AGGREGATOR_URL || DEFAULTS[WALRUS_NETWORK]?.aggregator || DEFAULTS.testnet.aggregator;

/** Default storage duration in epochs (1 epoch ≈ 1 day on testnet) */
const DEFAULT_EPOCHS = parseInt(process.env.WALRUS_EPOCHS || "30", 10);

/** On-chain content limit in bytes */
export const MAX_ONCHAIN_CONTENT = 500;

/** URI scheme prefix for Walrus blob references */
export const WALRUS_URI_PREFIX = "walrus://";

// ═══════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Compute SHA-256 hash of content, returned as a Uint8Array (32 bytes).
 */
export function sha256(content) {
  const hash = createHash("sha256").update(content, "utf8").digest();
  return new Uint8Array(hash);
}

/**
 * Check if a URI is a Walrus reference.
 */
export function isWalrusUri(uri) {
  return typeof uri === "string" && uri.startsWith(WALRUS_URI_PREFIX);
}

/**
 * Extract blob ID from a walrus:// URI.
 */
export function blobIdFromUri(uri) {
  if (!isWalrusUri(uri)) return null;
  return uri.slice(WALRUS_URI_PREFIX.length);
}

/**
 * Build a walrus:// URI from a blob ID.
 */
export function toWalrusUri(blobId) {
  return `${WALRUS_URI_PREFIX}${blobId}`;
}

/**
 * Truncate content to fit on-chain, adding an ellipsis indicator.
 */
export function truncateForOnchain(content, maxLen = MAX_ONCHAIN_CONTENT) {
  if (content.length <= maxLen) return content;
  const suffix = "… [full content on Walrus]";
  return content.slice(0, maxLen - suffix.length) + suffix;
}

// ═══════════════════════════════════════════════════════════════════════
//  STORE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Store a blob on Walrus via the publisher HTTP API.
 *
 * @param {string|Buffer|Uint8Array} data - Content to store
 * @param {object} [opts]
 * @param {number} [opts.epochs] - Storage duration in epochs (default: 30)
 * @param {boolean} [opts.deletable] - Whether the blob can be deleted later
 * @returns {Promise<{blobId: string, uri: string, hash: Uint8Array, response: object}>}
 */
export async function storeBlob(data, opts = {}) {
  const epochs = opts.epochs || DEFAULT_EPOCHS;
  const deletable = opts.deletable ?? false;

  const body = typeof data === "string" ? Buffer.from(data, "utf8") : data;

  const params = new URLSearchParams({ epochs: String(epochs) });
  if (deletable) params.set("deletable", "true");

  const url = `${PUBLISHER_URL}/v1/blobs?${params}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Walrus store failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  // The response can be either { newlyCreated: { blobObject: {...} } }
  // or { alreadyCertified: { blobId: "...", ... } }
  let blobId;
  if (json.newlyCreated) {
    blobId = json.newlyCreated.blobObject?.blobId || json.newlyCreated.blobId;
  } else if (json.alreadyCertified) {
    blobId = json.alreadyCertified.blobId;
  } else {
    // Fallback: try common field locations
    blobId = json.blobId || json.blob_id;
  }

  if (!blobId) {
    throw new Error("Walrus store succeeded but no blobId in response: " + JSON.stringify(json));
  }

  const contentStr = typeof data === "string" ? data : data.toString("utf8");
  const hash = sha256(contentStr);

  return {
    blobId,
    uri: toWalrusUri(blobId),
    hash,
    response: json,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  RETRIEVE
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retrieve a blob from Walrus via the aggregator HTTP API.
 *
 * @param {string} blobIdOrUri - Blob ID or walrus:// URI
 * @returns {Promise<{content: string, bytes: Buffer}>}
 */
export async function retrieveBlob(blobIdOrUri) {
  const blobId = isWalrusUri(blobIdOrUri) ? blobIdFromUri(blobIdOrUri) : blobIdOrUri;

  const url = `${AGGREGATOR_URL}/v1/blobs/${blobId}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Walrus retrieve failed (${res.status}): ${text}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const content = buffer.toString("utf8");

  return { content, bytes: buffer };
}

// ═══════════════════════════════════════════════════════════════════════
//  VERIFY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Retrieve a blob and verify its integrity against an expected hash.
 *
 * @param {string} blobIdOrUri - Blob ID or walrus:// URI
 * @param {Uint8Array|number[]} expectedHash - Expected SHA-256 hash (32 bytes)
 * @returns {Promise<{content: string, verified: boolean, hash: Uint8Array}>}
 */
export async function retrieveAndVerify(blobIdOrUri, expectedHash) {
  const { content, bytes } = await retrieveBlob(blobIdOrUri);
  const actualHash = sha256(content);

  const expected = expectedHash instanceof Uint8Array ? expectedHash : new Uint8Array(expectedHash);
  const verified = actualHash.length === expected.length &&
    actualHash.every((b, i) => b === expected[i]);

  return { content, verified, hash: actualHash };
}

// ═══════════════════════════════════════════════════════════════════════
//  HIGH-LEVEL: STORE EXTENDED MEMORY
// ═══════════════════════════════════════════════════════════════════════

/**
 * Prepare content for storage. If content fits on-chain (≤500 chars),
 * returns it as-is. If too long, stores on Walrus and returns a truncated
 * summary + walrus URI + hash for on-chain storage.
 *
 * @param {string} content - Full memory content
 * @param {object} [opts] - Walrus storage options
 * @returns {Promise<{onchainContent: string, uri: string, contentHash: Uint8Array, isExtended: boolean, blobId?: string}>}
 */
export async function prepareMemoryContent(content, opts = {}) {
  if (content.length <= MAX_ONCHAIN_CONTENT) {
    return {
      onchainContent: content,
      uri: "",
      contentHash: sha256(content),
      isExtended: false,
    };
  }

  // Content is too long for on-chain — store on Walrus
  const { blobId, uri, hash } = await storeBlob(content, opts);

  return {
    onchainContent: truncateForOnchain(content),
    uri,
    contentHash: hash,
    isExtended: true,
    blobId,
  };
}

/**
 * Read a memory's full content. If the souvenir has a Walrus URI,
 * fetches from Walrus and optionally verifies the hash.
 *
 * @param {object} souvenir - Souvenir fields from on-chain
 * @param {string} souvenir.content - On-chain content
 * @param {string} souvenir.uri - URI field (may be walrus://)
 * @param {number[]} [souvenir.content_hash] - On-chain hash for verification
 * @returns {Promise<{content: string, source: "onchain"|"walrus", verified?: boolean}>}
 */
export async function readMemoryContent(souvenir) {
  if (!souvenir.uri || !isWalrusUri(souvenir.uri)) {
    return { content: souvenir.content, source: "onchain" };
  }

  // Fetch from Walrus
  const hasHash = souvenir.content_hash &&
    Array.isArray(souvenir.content_hash) &&
    souvenir.content_hash.some(b => b !== 0);

  if (hasHash) {
    const { content, verified } = await retrieveAndVerify(souvenir.uri, souvenir.content_hash);
    return { content, source: "walrus", verified };
  }

  const { content } = await retrieveBlob(souvenir.uri);
  return { content, source: "walrus" };
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORTS SUMMARY
// ═══════════════════════════════════════════════════════════════════════

export default {
  storeBlob,
  retrieveBlob,
  retrieveAndVerify,
  prepareMemoryContent,
  readMemoryContent,
  sha256,
  isWalrusUri,
  blobIdFromUri,
  toWalrusUri,
  truncateForOnchain,
  MAX_ONCHAIN_CONTENT,
  WALRUS_URI_PREFIX,
  PUBLISHER_URL,
  AGGREGATOR_URL,
};
