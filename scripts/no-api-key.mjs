#!/usr/bin/env bun
/**
 * Refuse a commit that carries a LongCat API key.
 *
 * `detect-private-key` in prek's builtin repo reads PEM blocks, which an `ak_…`
 * key is not, so the platform's own shape is checked here. It is a hook and a
 * check: `bun run no-api-key` runs it over the whole tree.
 *
 * The keys the tests and the sandbox use are placeholders — short, and named
 * for it — so they pass. A real key is long enough to be unmistakable.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

/** A real platform key: `ak_` and then a long base64url body. */
const PLATFORM_KEY = /\bak_[A-Za-z0-9_-]{32,}\b/g;

/**
 * The placeholders this repository uses on purpose: the docs' standing-in, and
 * the fixtures the tests and the sandbox sign with. Each is short enough to be
 * obviously not a key, and each is named for it.
 */
const ALLOWED = new Set([
  "ak_…", // the README and CONTRIBUTING standing-in
  "ak_test_0123456789", // scripts/check.mjs
  "ak_sandbox_0123456789", // scripts/try.mjs
  "ak_0123456789abcdef", // the src test fixtures
]);

const SKIP = new Set(["node_modules", ".git", "dist", "build", "coverage"]);

/** Every file under the root that is not skipped, as relative paths. */
async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(full)));
    else out.push(full);
  }
  return out;
}

const found = [];

for (const file of await files(root)) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch {
    continue; // a binary or unreadable file is not a key
  }
  for (const match of text.matchAll(PLATFORM_KEY)) {
    if (ALLOWED.has(match[0])) continue;
    found.push(`${path.relative(root, file)}: ak_…${match[0].slice(-6)}`);
  }
}

if (found.length > 0) {
  console.error("A LongCat API key was found in the tree:");
  for (const line of found) console.error(`  ${line}`);
  console.error("\nRemove it, then sign in again with `opencode auth login`.");
  console.error(
    "A key that has been committed should be revoked at https://longcat.chat/platform/api_keys.",
  );
  process.exit(1);
}
