#!/usr/bin/env node
/**
 * Pin a binary file (image, SVG, PDF, anything) to Pinata.
 *
 * Usage:
 *   node --env-file=.env scripts/pin-asset.mjs landing/assets/avatar.svg
 *   node --env-file=.env scripts/pin-asset.mjs landing/assets/header.svg
 */

import { readFileSync } from "node:fs";
import { basename, extname } from "node:path";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/pin-asset.mjs <path-to-file>");
  process.exit(1);
}

const jwt = process.env.PINATA_JWT;
if (!jwt) {
  console.error("PINATA_JWT not set in .env");
  process.exit(1);
}

const data = readFileSync(path);
const ext = extname(path).toLowerCase();
const mime =
  ext === ".svg" ? "image/svg+xml"
  : ext === ".png" ? "image/png"
  : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg"
  : ext === ".json" ? "application/json"
  : "application/octet-stream";

const name = basename(path);
const blob = new Blob([data], { type: mime });
const form = new FormData();
form.append("file", blob, name);
form.append("network", "public");
form.append("name", name);

console.log(`\n  Pinning ${path} (${data.length} bytes, ${mime})...`);

const resp = await fetch("https://uploads.pinata.cloud/v3/files", {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}` },
  body: form,
});

if (!resp.ok) {
  const err = await resp.text();
  console.error(`  Pinata error ${resp.status}: ${err}`);
  process.exit(1);
}

const result = await resp.json();
const cid = result?.data?.cid;
if (!cid) {
  console.error(`  No CID in response: ${JSON.stringify(result)}`);
  process.exit(1);
}

console.log(`\n  ✓ Pinned`);
console.log(`    CID     : ${cid}`);
console.log(`    ipfs URI: ipfs://${cid}`);
console.log(`    Gateway : https://gateway.pinata.cloud/ipfs/${cid}`);
console.log(`\n  Use the ipfs:// URI for ENS/Base Names records.\n`);
