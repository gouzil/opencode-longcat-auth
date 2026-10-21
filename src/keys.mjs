/**
 * API keys the LongCat platform signs.
 *
 * A key carries its platform edition and account, and the signature is a MAC
 * over a canonical request line, so it is never safe to hand to a host that
 * has not proven it holds the account's secret. These helpers read keys and
 * decide which edition and which credential slot a login belongs to.
 */

import { EDITIONS, KEY_PREFIX } from "./constants.mjs";

/**
 * The platform's own `ak_` key shape. `ak_` + base64url: an edition marker, a
 * random account id, and a MAC. A real platform key carries all three, so this
 * recognises the shape rather than guessing at the contents.
 */
const PLATFORM_KEY = /^ak_([A-Za-z0-9_-]{8,})$/;

/**
 * Whether a value is shaped like the platform's `ak_` key. The platform has
 * no public endpoint to verify a key, so this is a shape check: it tells the
 * user whether the key they pasted is one of ours, not whether it works.
 */
export function isPlatformKey(key) {
  if (typeof key !== "string") return false;
  const trimmed = key.trim();
  if (!trimmed.startsWith(KEY_PREFIX)) return false;
  return PLATFORM_KEY.test(trimmed);
}

/**
 * A short, stable label for a key, used to name the account when the platform
 * does not return one. The middle of the key is shown so two keys are told
 * apart; the signature tail never is.
 */
export function fingerprint(key) {
  const value = typeof key === "string" ? key.trim() : "";
  if (value.length <= 12) return "…" + value.slice(-4);
  return value.slice(0, 6) + "…" + value.slice(-6);
}

/**
 * The edition marker carried by a key, when it carries one. Both editions
 * share an account namespace, so the marker only picks a base URL.
 */
export function editionOf(key) {
  const value = typeof key === "string" ? key.trim() : "";
  if (value.startsWith("ak_")) {
    const body = value.slice(KEY_PREFIX.length);
    if (body.startsWith("g") || body.startsWith("G")) return EDITIONS.global.id;
  }
  return EDITIONS.cn.id;
}

/**
 * Whether a key is one this plugin should refuse to send. An empty key, a
 * placeholder the docs use, or a key with whitespace in it are all rejected
 * before they reach the platform.
 */
export function isUnusable(key) {
  const raw = typeof key === "string" ? key : "";
  const value = raw.trim();
  if (!value) return "empty";
  if (raw !== value) return "whitespace around it";
  if (/\s/.test(value)) return "whitespace in it";
  if (/your[_-]?app[_-]?key/i.test(value)) return "placeholder";
  if (value.length < 8) return "too short";
  return undefined;
}
