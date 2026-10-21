/**
 * The fetch this plugin hands to the AI SDK.
 *
 * OpenCode builds a request in the format the model's `api.npm` names — chat
 * completions, Anthropic messages, or Responses — and hands it here as a URL
 * plus an init whose headers and body are already set. This fetch identifies
 * itself, marks a refused login so the account is not tried again, and passes
 * everything else through untouched.
 *
 * A non-2xx response is returned as-is: OpenCode and magpie both treat it as the
 * platform's own answer, and only read the status to decide whether to try the
 * next account. Rewriting the body here would drop the `thinking` field the
 * model's options already put there, so the body is not touched.
 */

import { CLIENT_HEADER, PROVIDER, USER_AGENT } from "./constants.mjs";
import { isAuthFailure, signInExpired } from "./errors.mjs";

/** The endpoints the platform serves, and the format each one is. */
export const PATHS = Object.freeze({
  chat: "/chat/completions",
  responses: "/responses",
  anthropic: "/messages",
});

/**
 * The path an incoming URL ends with, or `undefined` when it is not one of the
 * platform's own endpoints. A proxied or custom base URL still matches, because
 * only the tail is compared.
 */
export function protocolOf(input) {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  const path = url.split("?")[0].replace(/\/+$/, "");
  for (const [protocol, suffix] of Object.entries(PATHS)) {
    if (path.endsWith(suffix)) return protocol;
  }
  return undefined;
}

/**
 * The fetch.
 *
 * `options.fetchImpl` stands in for the global fetch, so a test can read what
 * was sent without a request leaving the process.
 */
export function createFetch(options = {}) {
  const { fetchImpl = fetch } = options;

  return async function longcatFetch(input, init = {}) {
    const protocol = protocolOf(input);
    if (!protocol || init.method !== "POST") {
      const served = `${PATHS.chat}, ${PATHS.responses}, ${PATHS.anthropic}`;
      throw new Error(`LongCat serves POST requests to ${served} only`);
    }

    const headers = new Headers(init.headers);
    headers.set("user-agent", USER_AGENT);
    headers.set(CLIENT_HEADER, USER_AGENT);

    let response;
    try {
      response = await fetchImpl(input, { ...init, headers });
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      throw new Error(
        `LongCat could not be reached: ${error?.message ?? error}`,
      );
    }

    if (isAuthFailure(response.status)) {
      throw signInExpired(response.status, await readJson(response));
    }

    return response;
  };
}

/**
 * Read a response's JSON body. The body is read only to build the error a
 * thrown `signInExpired` carries, and only for a refused status, so a
 * successful stream is never consumed here.
 */
async function readJson(response) {
  try {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  } catch {
    return {};
  }
}

/**
 * The headers to add to every request, for `chat.headers`.
 *
 * OpenCode's `chat.headers` hook runs once per request and lets a plugin add a
 * header without owning the fetch. It is the path to take when the plugin is
 * loaded but the model is served by a different one.
 */
export function chatHeaders(input, output) {
  if (input?.model?.providerID === PROVIDER) {
    output.headers["user-agent"] = USER_AGENT;
    output.headers[CLIENT_HEADER] = USER_AGENT;
  }
  return output;
}
