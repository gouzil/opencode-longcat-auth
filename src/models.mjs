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
  PRICES,
  PROVIDER_NAME,
  RETIRED,
  SDK,
  USD_PER_CNY,
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
    image: Boolean(limit.image),
    // Every model the platform serves is priced by the one published table, so
    // the rates are read off PRICES rather than per model. A model the platform
    // lists that this plugin has never seen still gets a price, which is what
    // stops a session's cost reading as zero.
    price: PRICES,
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
function toModel(entry, apiBase) {
  return {
    id: entry.id,
    name: entry.name,
    api: {
      id: entry.id,
      url: `${apiBase.replace(/\/+$/, "")}/openai/v1`,
      npm: SDK.chat,
    },
    capabilities: capabilities({ image: entry.image }),
    // The units are the platform's own: the platform quotes per million tokens,
    // and so does models.dev, whose `cost` object OpenCode reads directly
    // (`anthropic/claude-sonnet-4-6` is `{"input":3,"output":15}`, which is
    // Anthropic's published $3/$15 per 1M). Getting this wrong by 10^6 is the
    // difference between a session costing cents and costing a fortune.
    cost: {
      input: entry.price.input,
      output: entry.price.output,
      cache: { read: entry.price.cacheRead, write: 0 },
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
      // The flat models.dev shape, not the nested one: this hook's models are
      // read by OpenCode's `Tt`/`cQ` converters, which look for `cache_read` and
      // `cache_write`. A nested `cache` object here is silently dropped, so the
      // prompt-cache rate would read as zero and every cached token would be
      // priced at the full input rate. `provider.models` below is the nested
      // half, and `buildModels` merges both.
      cost: {
        input: model.price.input,
        output: model.price.output,
        cache_read: model.price.cacheRead,
        cache_write: 0,
      },
      limit: { context: model.context, output: model.output },
      options: { thinking: { type: "enabled" } },
      variants: EFFORT_VARIANTS,
    };
  }
  return result;
}

/**
 * Overlay one model's cost onto another, in the resolved Model's nested shape.
 *
 * The two sources a model can come from name the prompt-cache rate differently:
 * a config entry carries models.dev's flat `cache_read`, while a resolved Model
 * carries the nested `cache.read`. Reading both means a user who sets a price in
 * `opencode.json` gets it, and the result is the nested shape alone — a flat key
 * left over would put both on the model, where OpenCode reads the nested one and
 * never the other.
 */
function mergeCost(base, over) {
  const read = over?.cache_read ?? over?.cache?.read ?? base?.cache?.read ?? 0;
  return {
    input: over?.input ?? base?.input ?? 0,
    output: over?.output ?? base?.output ?? 0,
    cache: {
      read,
      write: over?.cache_write ?? over?.cache?.write ?? base?.cache?.write ?? 0,
    },
  };
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
  prices = {},
} = {}) {
  const result = {};
  const chatURL = `${apiBase.replace(/\/+$/, "")}/openai/v1`;

  const add = (model) => {
    // A price the platform itself published wins over the catalog's table, so a
    // rate it changed is picked up without a release. The live rate names its
    // cached half `cacheRead` where the catalog nests `cache.read`, so the
    // overlay is built rather than spread — a straight spread would leave the
    // cached rate behind. A user's own `cost` still wins over both.
    //
    // `discoverPrice` hands back dollars; the endpoint's own table is yuan and
    // the conversion happens there, so nothing here divides again.
    const live = prices?.[model.id];
    const base = live
      ? {
          ...model,
          cost: {
            ...model.cost,
            input: live.input,
            output: live.output,
            cache: { ...model.cost.cache, read: live.cacheRead },
          },
        }
      : model;
    // `provider.models` hands back the resolved Model objects, whose capability
    // flags are nested under `capabilities`; the config hook's own entries use
    // models.dev's flat names. Both are read, so a model declared either way
    // keeps the fields that were set.
    const raw = providerModels?.[base.id] ?? {};
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
    result[base.id] = {
      ...base,
      ...flat,
      capabilities: { ...caps, ...(raw.capabilities ?? {}) },
      api: {
        id: base.id,
        // A model that declares its own `api.url` keeps it; that address is
        // the one the request must use.
        url: raw.api?.url ?? base.api?.url ?? chatURL,
        npm: raw.api?.npm ?? base.api?.npm ?? SDK.chat,
      },
      limit: { ...base.limit, ...(raw.limit ?? {}) },
      cost: mergeCost(base.cost, raw.cost),
      options: { ...(base.options ?? {}), ...(raw.options ?? {}) },
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
          price: PRICES,
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
      return {
        ids: [],
        error: `LongCat answered HTTP ${response.status}`,
        // Carried so the caller can tell a refused key (401/403) from the
        // platform being down (5xx) or unreachable (no status at all): only
        // the former means the account must sign in again.
        status: response.status,
      };
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

/** The detail endpoint for one model, under the same format path as the list. */
export function modelEndpoint(id, apiBase = EDITIONS.cn.apiBase) {
  return `${modelsEndpoint(apiBase)}/${encodeURIComponent(id)}`;
}

/**
 * One model's price, in the platform's own yuan table.
 *
 * The endpoint answers `{"pricing":{"prompt":"2","completion":"8",
 * "cached_tokens":"0.04"}}` — strings, not numbers, and yuan, not dollars. Both
 * editions answer the yuan table; the global edition's docs carry it too, beside
 * the dollar one. The unit is per million tokens, which the endpoint does not
 * state: the numbers are the same ones the pricing pages label `¥/百万 Tokens`.
 *
 * This is deliberately **not** converted. A caller must not turn yuan into
 * dollars on the assumption that the endpoint answered in dollars, which would
 * put a 6.67× overcharge on every session.
 */
function priceOf(body) {
  const p = body?.pricing;
  if (!p || typeof p !== "object") return undefined;
  const read = (v) => (typeof v === "number" ? v : Number.parseFloat(v));
  const input = read(p.prompt);
  const output = read(p.completion);
  const cacheRead = read(p.cached_tokens);
  if (![input, output, cacheRead].every((n) => Number.isFinite(n) && n >= 0)) {
    return undefined;
  }
  return { input, output, cacheRead };
}

/** The currency a model-detail price is answered in, for one edition. */
function priceCurrency(apiBase) {
  return apiBase === EDITIONS.global.apiBase ? "usd" : "cny";
}

/**
 * Read one model's own price from the platform's model-detail endpoint, in the
 * dollars OpenCode's `cost` field is in.
 *
 * The endpoint publishes the yuan table, so the read is converted by the rate
 * the platform's own two tables imply. Returns `undefined` when the endpoint
 * cannot be read or does not price the model, and the caller keeps its built-in
 * table — a price is never invented for a model the endpoint did not price.
 *
 * The endpoint also answers a bogus key with 200 (an unrecognised key is refused
 * only once its length is past a threshold, and a short one is refused as
 * `incorrect api key`), so a price this read returns is not proof the key works.
 * The model-list read in `discoverModels` is what the usage hook keys on.
 */
export async function discoverPrice({
  id,
  apiBase = EDITIONS.cn.apiBase,
  key,
  signal,
  fetchImpl = fetch,
  timeoutMs = 15000,
} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener?.("abort", onAbort, { once: true });

  try {
    const response = await fetchImpl(modelEndpoint(id, apiBase), {
      headers: { authorization: `Bearer ${key}`, accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) return { price: undefined };
    const raw = priceOf(await response.json());
    if (!raw) return { price: undefined };
    // A table that is already dollars needs no conversion; the yuan one does.
    const rate = priceCurrency(apiBase) === "usd" ? 1 : USD_PER_CNY;
    return {
      price: {
        input: raw.input * rate,
        output: raw.output * rate,
        cacheRead: raw.cacheRead * rate,
      },
    };
  } catch {
    return { price: undefined };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onAbort);
  }
}
