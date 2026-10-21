/**
 * Errors this plugin raises, and the one signal OpenCode and magpie act on.
 *
 * When the platform refuses a login, OpenCode and magpie mark the account as
 * needing a new sign-in and stop sending it requests. Both read the same marker
 * — a thrown error with `signIn: "expired"` — so this module is the only place
 * that sets it.
 */

import { API_KEYS, DOCS } from "./constants.mjs";

/** The value a thrown error carries when the platform refused the login. */
export const SIGN_IN_EXPIRED = "expired";

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
    signIn: SIGN_IN_EXPIRED,
    status,
    code,
  });
}
