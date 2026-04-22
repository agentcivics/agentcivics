/**
 * Agent keystore helpers.
 *
 * Supports two schemas:
 *   agent-keystore/v1 — plaintext `privateKey` (legacy, insecure; migrate!)
 *   agent-keystore/v2 — `encrypted` field holds an ethers.js Web3 JSON keystore v3
 *
 * v2 is the default from agent-register.mjs. v1 is still readable for
 * backward compatibility; the keystore migration script upgrades v1 → v2.
 *
 * Password source (in order):
 *   1. `options.password` if explicitly passed
 *   2. KEYSTORE_PASSWORD env var
 *   3. Interactive prompt (TTY only)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { ethers } from "ethers";

const CURRENT_SCHEMA = "agent-keystore/v2";

/**
 * Build a keystore object (metadata + encrypted wallet).
 */
export async function buildKeystoreV2(wallet, metadata, password) {
  const encrypted = await wallet.encrypt(password);
  return {
    schema: CURRENT_SCHEMA,
    ...metadata,
    walletAddress: wallet.address,
    encrypted,
  };
}

/**
 * Read a keystore JSON file and return its parsed metadata object.
 * Does NOT decrypt. Use loadAgentWallet() to get an actual Wallet.
 */
export function readKeystoreFile(path) {
  const raw = readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

/**
 * Load an agent's Wallet from a keystore file.
 * Prompts for password if needed (or reads KEYSTORE_PASSWORD env).
 */
export async function loadAgentWallet(keystorePath, options = {}) {
  const ks = readKeystoreFile(keystorePath);
  return decryptKeystore(ks, options);
}

export async function decryptKeystore(ks, options = {}) {
  if (!ks.schema) throw new Error(`Keystore missing schema field`);

  // v1 — plaintext (legacy)
  if (ks.schema === "agent-keystore/v1") {
    if (!ks.privateKey) throw new Error("v1 keystore missing privateKey");
    warnLegacyFormat(ks);
    return new ethers.Wallet(ks.privateKey);
  }

  // v2 — encrypted
  if (ks.schema === "agent-keystore/v2") {
    if (!ks.encrypted) throw new Error("v2 keystore missing `encrypted` field");
    const password = await resolvePassword(options, ks);
    return await ethers.Wallet.fromEncryptedJson(ks.encrypted, password);
  }

  throw new Error(`Unknown keystore schema: ${ks.schema}`);
}

/**
 * Save a keystore metadata+encrypted object back to disk (pretty-printed).
 */
export function writeKeystoreFile(path, ks) {
  writeFileSync(path, JSON.stringify(ks, null, 2));
}

// ── Password resolution ────────────────────────────────────────────────

async function resolvePassword(options, ks) {
  if (options.password) return options.password;
  if (process.env.KEYSTORE_PASSWORD) return process.env.KEYSTORE_PASSWORD;
  const name = ks?.chosenName ? ` for "${ks.chosenName}"` : "";
  return await promptPassword(`Keystore password${name}: `);
}

/**
 * Read a password from stdin, echoing `*` for each character.
 *
 * Uses raw mode for character-by-character control. Supports:
 *   Enter / Return  → submit
 *   Backspace       → delete last char + erase on-screen *
 *   Ctrl-C          → cancel (exits process)
 *   Printable chars → appended to buffer, echoed as *
 */
export async function promptPassword(prompt = "Password: ") {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Password required but stdin is not a TTY. Set KEYSTORE_PASSWORD env var."
    );
  }

  process.stdout.write(prompt);

  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  return await new Promise((resolve, reject) => {
    let buf = "";

    const onData = (ch) => {
      // Each chunk can contain multiple bytes (e.g. paste); handle char-by-char
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolve(buf);
          return;
        }
        if (c === "\u0003") { // Ctrl-C
          cleanup();
          process.stdout.write("^C\n");
          process.exit(130);
        }
        if (c === "\u007f" || c === "\b") { // Backspace / DEL
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            // Move cursor back, overwrite with space, move back again
            process.stdout.write("\b \b");
          }
          continue;
        }
        // Ignore other control characters
        if (c < " ") continue;
        buf += c;
        process.stdout.write("*");
      }
    };

    const cleanup = () => {
      process.stdin.removeListener("data", onData);
      process.stdin.setRawMode(wasRaw);
      process.stdin.pause();
    };

    process.stdin.on("data", onData);
  });
}

let warned = false;
function warnLegacyFormat(ks) {
  if (warned) return;
  warned = true;
  console.warn(
    `\n  ⚠  Keystore for "${ks.chosenName || ks.walletAddress}" is plaintext (v1).\n` +
      `    Run: node scripts/migrate-keystore.mjs ${ks.chosenName ? `agents/${ks.chosenName.toLowerCase()}-${ks.agentId}.json` : "<path>"}\n`
  );
}
