/**
 * API keys the LongCat platform signs.
 *
 * A key carries its platform edition and account, and the signature is a MAC
 * over a canonical request line, so it is never safe to hand to a host that
 * has not proven it holds the account's secret. These helpers read keys and
 * decide which edition and which credential slot a login belongs to.
 */

import { API_KEY_ENV, EDITIONS, KEY_PREFIX } from "./constants.mjs";

const SHARED = "longcat.platform.shared";

/**
 * The platform's own `ak_` key shape. `ak_` + base64url: an edition marker, a
 * random account id, and a MAC. A real platform key carries all three, so this
 * recognises the shape rather than guessing at the contents.
 */
const PLATFORM_KEY = /^ak_([A-Za-z0-9_-]{8,})$/;

/**
 * Editions this plugin can serve, in the order the login prompt offers them.
 * A deployment may allow a subset.
 */
export function editions(allowed = Object.keys(EDITIONS)) {
  return allowed.map((id) => EDITIONS[id]).filter(Boolean);
}

/**
 * Read the API key from the environment. The platform's own variable is the
 * only one it documents; `OPENCODE_LONGCAT_API_KEY` is this plugin's override
 * so a project can keep the key out of a shared environment.
 *
 * Returns `{ env, key }`, or `{ env: undefined, key: undefined }` when unset.
 */
export function fromEnv(env = process.env) {
  const override = env.OPENCODE_LONGCAT_API_KEY?.trim();
  if (override) return { env: "OPENCODE_LONGCAT_API_KEY", key: override };
  const own = env[API_KEY_ENV]?.trim();
  if (own) return { env: API_KEY_ENV, key: own };
  return { env: undefined, key: undefined };
}

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

/**
 * Where a login's key should be read from when the account is created outside
 * this plugin. The platform writes the first account under the provider id
 * itself, so an `auth.json` written by OpenCode's built-in provider carries
 * the same key.
 */
export function sharedKey(auth) {
  if (!auth || typeof auth !== "object") return undefined;
  if (auth.type !== "api") return undefined;
  const key = auth.key ?? auth.token;
  return typeof key === "string" ? key : undefined;
}

export const SHARED_KEY_NAMESPACE = SHARED;

/**
 * Build the login record stored for an API key account.
 *
 * Without `authorize` the platform stores the key verbatim, which is all it
 * needs. With one, the plugin is responsible for checking the key and for
 * returning what the account should be named and scoped to.
 */
export function apiKeyAuth(key, { edition, accountId, email } = {}) {
  return {
    type: "api",
    key: key.trim(),
    metadata: {
      ...(edition ? { edition } : {}),
      ...(accountId ? { accountId } : {}),
      ...(email ? { email } : {}),
    },
  };
}
