#!/usr/bin/env node
/**
 * Migrate a plaintext (v1) agent keystore to encrypted (v2) format.
 *
 * Usage:
 *   node scripts/migrate-keystore.mjs agents/nova-1.json
 *
 * Prompts for a new password. Writes a timestamped backup of the v1 file
 * before overwriting so you can compare / roll back if needed.
 *
 * Password source (in order):
 *   1. KEYSTORE_PASSWORD env var (non-interactive mode)
 *   2. Interactive prompt
 */

import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ethers } from "ethers";
import { buildKeystoreV2, promptPassword } from "./lib/keystore.mjs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/migrate-keystore.mjs <path-to-keystore.json>");
  process.exit(1);
}

const resolved = resolve(path);
if (!existsSync(resolved)) {
  console.error(`File not found: ${resolved}`);
  process.exit(1);
}

const raw = readFileSync(resolved, "utf-8");
const ks = JSON.parse(raw);

if (ks.schema === "agent-keystore/v2") {
  console.log(`  ${path} is already encrypted (v2). Nothing to do.`);
  process.exit(0);
}
if (ks.schema !== "agent-keystore/v1") {
  console.error(`  Unknown keystore schema: ${ks.schema}`);
  process.exit(1);
}
if (!ks.privateKey) {
  console.error(`  v1 keystore missing privateKey — nothing to migrate.`);
  process.exit(1);
}

console.log(`\n  Migrating ${path} to encrypted (v2) format.`);
console.log(`  Agent: ${ks.chosenName} (#${ks.agentId})`);
console.log(`  Wallet: ${ks.walletAddress || "?"}`);

// Get password
let password = process.env.KEYSTORE_PASSWORD;
if (!password) {
  console.log(`\n  Choose a password for this keystore:`);
  password = await promptPassword("Password: ");
  const confirm = await promptPassword("Confirm : ");
  if (password !== confirm) {
    console.error("  Passwords don't match.");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("  Password must be at least 8 characters.");
    process.exit(1);
  }
}

// Build the encrypted keystore
const wallet = new ethers.Wallet(ks.privateKey);
if (ks.walletAddress && wallet.address.toLowerCase() !== ks.walletAddress.toLowerCase()) {
  console.warn(`  ⚠  walletAddress mismatch — file says ${ks.walletAddress} but private key derives ${wallet.address}`);
}

const metadataFields = {
  agentId: ks.agentId,
  chosenName: ks.chosenName,
  creator: ks.creator,
  registryAddress: ks.registryAddress,
  chainId: ks.chainId,
  metadataCID: ks.metadataCID,
  metadataURI: ks.metadataURI,
  pins: ks.pins || (ks.metadataCID ? [{ provider: "pinata", cid: ks.metadataCID, gateway: `https://gateway.pinata.cloud/ipfs/${ks.metadataCID}` }] : []),
  createdAt: ks.createdAt,
  delegated: ks.delegated,
  delegationExpiresAt: ks.delegationExpiresAt,
};

console.log(`\n  Encrypting (this takes ~1-2 seconds)...`);
const v2 = await buildKeystoreV2(wallet, metadataFields, password);

// Backup the v1 file first
const backup = `${resolved}.v1-backup-${Date.now()}`;
copyFileSync(resolved, backup);
console.log(`  Backup: ${backup}`);

// Overwrite with v2
writeFileSync(resolved, JSON.stringify(v2, null, 2));
console.log(`  ✓ Migrated: ${resolved}`);
console.log(`\n  ⚠  Securely delete the backup once you've confirmed everything works:`);
console.log(`      rm ${backup}`);
console.log(`  Or use 'shred -u' / 'rm -P' for secure deletion on sensitive hardware.\n`);
