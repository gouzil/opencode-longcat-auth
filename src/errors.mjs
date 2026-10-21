/**
 * Errors this plugin raises, and the one signal OpenCode and magpie act on.
 *
 * When the platform refuses a login, OpenCode and magpie mark the account as
 * needing a new sign-in and stop sending it requests. Both read the same marker
 * — a thrown error with `signIn: "expired"` — so this module is the only place
 * that sets it. A response header (`X-Magpie-Sign-In`) says the same thing to
 * magpie, and `signInFromHeaders` reads it back.
 */

import { API_KEYS, DOCS } from "./constants.mjs";

export const SIGN_IN_HEADER = "X-Magpie-Sign-In";

/** The values the sign-in marker can carry, and what each one means. */
export const SIGN_IN = Object.freeze({
  /** The login was refused; the account is marked until the user signs in again. */
  EXPIRED: "expired",
  /** The account is fine; this refusal was about something else. */
  KEPT: "kept",
  /** The login was renewed, so the mark is cleared whatever happens next. */
  RENEWED: "renewed",
});

/**
 * The platform's error shape. Every non-2xx answer carries
 * `{ error: { code, message, type, retry_after? } }`.
 */
export function platformError(body, status) {
  const error = body?.error;
  if (typeof error === "string")
    return { code: undefined, message: error, type: undefined };
  if (error && typeof error === "object") {
    return {
      code: error.code ?? error.type,
      message: error.message ?? `LongCat answered HTTP ${status}`,
      type: error.type,
      retryAfter: error.retry_after,
    };
  }
  return {
    code: undefined,
    message: `LongCat answered HTTP ${status}`,
    type: undefined,
  };
}

/** HTTP statuses that mean the account's login was refused. */
export function isAuthFailure(status) {
  return status === 401 || status === 403;
}

/**
 * The error to throw for a refused response.
 *
 * A 401 is the platform's own signal, and the plugin also treats a 403 whose
 * body says the key is invalid as a refusal: the platform answers 403 for a
 * key that exists but has no balance, and that is a sign-in problem rather than
 * a request problem.
 *
 * The message is what the agent shows the user, so it names the fix.
 */
export function signInExpired(status, body) {
  const { code, message } = platformError(body, status);
  const reason =
    code === "invalid_api_key" ||
    code === "insufficient_quota" ||
    code === "balance_exhausted"
      ? `${message}. Get a key at ${API_KEYS}, then sign in again.`
      : `${message}. Sign in again with \`opencode auth login\` (see ${DOCS}).`;
  return Object.assign(new Error(reason), {
    signIn: SIGN_IN.EXPIRED,
    status,
    code,
  });
}

/**
 * Read the sign-in marker off a response's headers.
 *
 * magpie passes the header through and strips it before the response reaches
 * the agent; a plugin that cannot throw (it is inside a streaming fetch) uses
 * the header instead. `undefined` means the response says nothing.
 */
export function signInFromHeaders(headers) {
  const read = (value) => {
    if (typeof value !== "string") return undefined;
    const lowered = value.trim().toLowerCase();
    if (lowered === "expired" || lowered === "kept" || lowered === "renewed")
      return lowered;
    return undefined;
  };
  if (!headers) return undefined;
  if (typeof headers.get === "function")
    return read(headers.get(SIGN_IN_HEADER));
  const raw = headers[SIGN_IN_HEADER] ?? headers[SIGN_IN_HEADER.toLowerCase()];
  return read(raw);
}

/**
 * The headers to set on a response to mark the sign-in state.
 * Only magpie reads them, and magpie removes them before the response leaves.
 */
export function signInHeaders(value) {
  return { [SIGN_IN_HEADER]: value };
}
