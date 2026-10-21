/**
 * API keys the LongCat platform signs.
 *
 * A key carries its platform edition and account, and the signature is a MAC
 * over a canonical request line, so it is never safe to hand to a host that
 * has not proven it holds the account's secret.
 */

import { EDITIONS, KEY_PREFIX } from "./constants.mjs";

/**
 * The edition marker carried by a key, when it carries one. Both editions
 * share an account namespace, so the marker only picks a base URL.
 *
 * Read at request time rather than at sign-in: an `api` login has no
 * `authorize` for the plugin to record the edition into, so this is what the
 * loader falls back on for a key the host stored directly.
 */
export function editionOf(key) {
  const value = typeof key === "string" ? key.trim() : "";
  if (value.startsWith(KEY_PREFIX)) {
    const body = value.slice(KEY_PREFIX.length);
    if (body.startsWith("g") || body.startsWith("G")) return EDITIONS.global.id;
  }
  return EDITIONS.cn.id;
}
