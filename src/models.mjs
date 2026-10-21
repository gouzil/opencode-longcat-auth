/**
 * The LongCat model catalog and the shape the model picker reads.
 *
 * Every model is served under both API formats, so each one is published twice:
 * once under the OpenAI-compatible base URL and once under the Anthropic
 * messages base URL. A model's `api.npm` decides which format its requests are
 * built in; the model's key stays the platform's model name, so the agent sees
 * `longcat/LongCat-2.5-Preview` in its `/models` picker.
 */

import {
  API_KEY_ENV,
  EDITIONS,
  MODEL_LIMITS,
  PROVIDER_NAME,
  RETIRED,
  SDK,
  CACHE_READ_COST_USD,
  EFFORT_VARIANTS,
} from "./constants.mjs";

/**
 * The models the platform serves today, in picker order. Anything the platform
 * has since added is appended to this list by `discoverModels`; anything it
 * dropped is filtered out there.
 */
export const CATALOG = Object.freeze(
  Object.entries(MODEL_LIMITS).map(([id, limit]) => ({
    id,
    name: id,
    description: limit.description,
    releaseDate: limit.releaseDate,
    context: limit.context,
    output: limit.output,
    cacheRead: limit.cacheReadCost ?? CACHE_READ_COST_USD,
    image: Boolean(limit.image),
  })),
);

/** `true` when the id is one the platform has retired. */
export function isRetired(id) {
  return Object.hasOwn(RETIRED, id);
}

/**
 * The capabilities of a LongCat model, in the internal Model shape OpenCode
 * reads: the same field names models.dev uses, nested under `capabilities`.
 *
 * `reasoning` is on because both models are reasoning models and their thinking
 * is toggled with the `thinking` field rather than a separate model. `toolcall`
 * is on because the platform documents native tool calling.
 */
export function capabilities({ reasoning = true, image = false } = {}) {
  return {
    temperature: true,
    reasoning,
    attachment: image,
    toolcall: true,
    input: { text: true, audio: false, image, video: false, pdf: false },
    output: {
      text: true,
      audio: false,
      image: false,
      video: false,
      pdf: false,
    },
    interleaved: { field: "reasoning_content" },
  };
}

/**
 * The internal Model object for one catalog entry.
 *
 * `api.url` carries the platform's own path for the format (`/openai/v1`), so a
 * request lands on `…/openai/v1/chat/completions` — the endpoint the platform
 * documents. The loader's baseURL is the platform root; this is the path under it.
 */
export function toModel(entry, apiBase) {
  return {
    id: entry.id,
    name: entry.name,
    api: {
      id: entry.id,
      url: `${apiBase.replace(/\/+$/, "")}/openai/v1`,
      npm: SDK.chat,
    },
    capabilities: capabilities({ image: entry.image }),
    cost: {
      input: entry.inputCost ?? 0,
      output: entry.outputCost ?? 0,
      cache: { read: entry.cacheRead, write: 0 },
    },
    limit: { context: entry.context, output: entry.output },
    status: "active",
    options: { thinking: { type: "enabled" } },
    headers: {},
    release_date: entry.releaseDate,
  };
}

/** `true` when an id could be a model name this plugin may offer. */
export function isValidId(id) {
  return typeof id === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id);
}

/**
 * The models a provider's config hook declares. The plugin publishes both
 * formats for every model, so the result is keyed by model id and carries the
 * base URL the model is served at; the AI SDK package is what picks the path
 * under that base URL.
 */
export function configModels(apiBase = EDITIONS.cn.apiBase) {
  const result = {};
  for (const model of CATALOG) {
    result[model.id] = {
      id: model.id,
      name: model.name,
      api: {
        id: model.id,
        url: `${apiBase.replace(/\/+$/, "")}/openai/v1`,
        npm: SDK.chat,
      },
      description: model.description,
      family: "longcat",
      attachment: model.image,
      reasoning: true,
      temperature: true,
      tool_call: true,
      interleaved: { field: "reasoning_content" },
      release_date: model.releaseDate,
      modalities: {
        input: model.image ? ["text", "image"] : ["text"],
        output: ["text"],
      },
      cost: { input: 0, output: 0, cache: { read: model.cacheRead, write: 0 } },
      limit: { context: model.context, output: model.output },
      options: { thinking: { type: "enabled" } },
      variants: EFFORT_VARIANTS,
    };
  }
  return result;
}

/**
 * The config hook's provider declaration. Kept separate from the models
 * because the two hooks are read at different times and in different shapes:
 * `config` is the models.dev half, `provider.models` the internal half.
 */
export function configProvider(apiBase = EDITIONS.cn.apiBase) {
  return {
    name: PROVIDER_NAME,
    npm: SDK.chat,
    api: apiBase,
    env: [API_KEY_ENV],
    models: configModels(apiBase),
    options: { baseURL: apiBase },
  };
}

/**
 * Build the models for one account: the catalog, plus any model the platform
 * lists that the catalog does not describe, minus any the platform retired.
 *
 * `provider.models` holds whatever models.dev and the config hook declared for
 * this id, keyed by model id. Those entries are passed through so a user's own
 * overrides — a custom `id`, a `cost`, a disabled flag — survive, and their
 * `provider`/`api` fields are filled in when they left them out.
 */
export function buildModels({
  apiBase = EDITIONS.cn.apiBase,
  providerModels = {},
  known = [],
} = {}) {
  const result = {};
  const chatURL = `${apiBase.replace(/\/+$/, "")}/openai/v1`;

  const add = (model) => {
    // `provider.models` hands back the resolved Model objects, whose capability
    // flags are nested under `capabilities`; the config hook's own entries use
    // models.dev's flat names. Both are read, so a model declared either way
    // keeps the fields that were set.
    const raw = providerModels?.[model.id] ?? {};
    const flat = raw.capabilities ? {} : raw;
    const caps = raw.capabilities ?? {
      temperature: raw.temperature ?? true,
      reasoning: raw.reasoning ?? true,
      attachment: raw.attachment ?? model.image,
      toolcall: raw.toolcall ?? raw.tool_call ?? true,
      input: {
        text: true,
        image: model.image,
        audio: false,
        video: false,
        pdf: false,
      },
      output: {
        text: true,
        audio: false,
        image: false,
        video: false,
        pdf: false,
      },
      interleaved: { field: "reasoning_content" },
    };
    result[model.id] = {
      ...model,
      ...flat,
      capabilities: { ...caps, ...(raw.capabilities ?? {}) },
      api: {
        id: model.id,
        // A model that declares its own `api.url` keeps it; that address is
        // the one the request must use.
        url: raw.api?.url ?? model.api?.url ?? chatURL,
        npm: raw.api?.npm ?? model.api?.npm ?? SDK.chat,
      },
      limit: { ...model.limit, ...(raw.limit ?? {}) },
      cost: { ...model.cost, ...(raw.cost ?? {}) },
      options: { ...(model.options ?? {}), ...(raw.options ?? {}) },
    };
  };

  for (const entry of CATALOG) {
    add(toModel(entry, apiBase));
  }

  for (const id of known) {
    if (result[id] || isRetired(id) || !isValidId(id)) continue;
    add({
      ...toModel(
        {
          id,
          name: id,
          description: `LongCat model ${id}`,
          releaseDate: "",
          context: MODEL_LIMITS["LongCat-2.5-Preview"].context,
          output: MODEL_LIMITS["LongCat-2.5-Preview"].output,
          cacheRead: CACHE_READ_COST_USD,
          image: false,
        },
        apiBase,
      ),
      ...(providerModels?.[id] ?? {}),
    });
  }

  return result;
}

/**
 * The list endpoint for one edition, and the auth header that reads it.
 * LongCat keeps one list per format, so the OpenAI endpoint is enough: it
 * returns the same ids the Anthropic endpoint does.
 */
export function modelsEndpoint(apiBase = EDITIONS.cn.apiBase) {
  return `${apiBase.replace(/\/+$/, "")}/openai/v1/models`;
}

/**
 * Read the model list the platform publishes. Used to pick up a model added
 * after this plugin was written, and to drop one the platform stopped serving.
 *
 * The platform's list is `{ object: "list", data: [{ id, owned_by }] }`.
 * Returns `{ ids }`, or `{ ids: [], error }` when the platform cannot be read.
 * The caller keeps its built-in list in that case.
 */
export async function discoverModels({
  apiBase = EDITIONS.cn.apiBase,
  key,
  signal,
  fetchImpl = fetch,
  timeoutMs = 15000,
} = {}) {
  const endpoint = modelsEndpoint(apiBase);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });

  try {
    const response = await fetchImpl(endpoint, {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok)
      return { ids: [], error: `LongCat answered HTTP ${response.status}` };
    const body = await response.json();
    const data = Array.isArray(body?.data) ? body.data : [];
    return { ids: data.map((item) => item?.id).filter(isValidId) };
  } catch (error) {
    if (error?.name === "AbortError")
      return { ids: [], error: "The model list timed out" };
    return {
      ids: [],
      error: `The model list could not be read: ${error?.message ?? error}`,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}
