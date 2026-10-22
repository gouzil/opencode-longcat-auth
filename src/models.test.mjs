import { test, expect } from "bun:test";
import {
  CATALOG,
  buildModels,
  capabilities,
  configModels,
  discoverModels,
  discoverPrice,
  isRetired,
  isValidId,
  modelEndpoint,
  modelsEndpoint,
} from "./models.mjs";

const BASE = "https://api.longcat.chat";

test("the catalog is the two models the platform serves", () => {
  expect(CATALOG.map((m) => m.id)).toEqual([
    "LongCat-2.5-Preview",
    "LongCat-2.0",
  ]);
});

test("each model carries the documented context and output limits", () => {
  expect(CATALOG.find((m) => m.id === "LongCat-2.5-Preview").context).toBe(
    1048576,
  );
  expect(CATALOG.find((m) => m.id === "LongCat-2.5-Preview").output).toBe(
    262144,
  );
  expect(CATALOG.find((m) => m.id === "LongCat-2.0").output).toBe(131072);
});

test("only the 2.5 model takes images", () => {
  expect(CATALOG.find((m) => m.id === "LongCat-2.5-Preview").image).toBe(true);
  expect(CATALOG.find((m) => m.id === "LongCat-2.0").image).toBe(false);
});

test("capabilities are nested, the way the internal Model reads them", () => {
  const caps = capabilities({ image: true });
  expect(caps.reasoning).toBe(true);
  expect(caps.toolcall).toBe(true);
  expect(caps.attachment).toBe(true);
  expect(caps.input.image).toBe(true);
  expect(caps.interleaved.field).toBe("reasoning_content");
});

test("a model id is validated before it is offered", () => {
  expect(isValidId("LongCat-2.5-Preview")).toBe(true);
  expect(isValidId("longcat_2.5")).toBe(true);
  expect(isValidId("__proto__")).toBe(false);
  expect(isValidId("")).toBe(false);
  expect(isValidId("has space")).toBe(false);
});

test("retired models are named", () => {
  expect(isRetired("LongCat-Flash-Chat")).toBe(true);
  expect(isRetired("LongCat-2.0")).toBe(false);
});

test("the config hook declares the provider and both models", () => {
  const models = configModels(BASE);
  expect(Object.keys(models)).toEqual(["LongCat-2.5-Preview", "LongCat-2.0"]);
  const model = models["LongCat-2.5-Preview"];
  expect(model.reasoning).toBe(true);
  expect(model.tool_call).toBe(true);
  expect(model.limit.context).toBe(1048576);
  expect(model.variants).toEqual({ low: {}, medium: {}, high: {} });
});

test("the config hook publishes the platform's rates in the flat shape", () => {
  // OpenCode reads this hook's models in models.dev's flat shape, so the
  // prompt-cache rate is `cache_read`. A nested `cache` object here would be
  // dropped and every cached token would be priced at the full input rate.
  const model = configModels(BASE)["LongCat-2.5-Preview"];
  expect(model.cost).toEqual({
    input: 0.3,
    output: 1.2,
    cache_read: 0.006,
    cache_write: 0,
  });
  // The nested key must not be there: it is not what this shape reads.
  expect(model.cost.cache).toBeUndefined();
});

test("provider.models publishes the same rates in the nested shape", () => {
  // The resolved Model is the other half, and it is the one OpenCode's runtime
  // cost function reads. The two shapes carry the same numbers.
  const model = buildModels({ apiBase: BASE })["LongCat-2.5-Preview"];
  expect(model.cost).toEqual({
    input: 0.3,
    output: 1.2,
    cache: { read: 0.006, write: 0 },
  });
});

test("a model the platform lists that the catalog lacks still carries a price", () => {
  // A discovered model would otherwise cost nothing to run, which reads as free
  // rather than as unpriced.
  const model = buildModels({ apiBase: BASE, known: ["LongCat-2.5-Flash"] })[
    "LongCat-2.5-Flash"
  ];
  expect(model.cost.input).toBe(0.3);
  expect(model.cost.cache.read).toBe(0.006);
});

test("a flat cache_read from a user's own config overrides the catalog rate", () => {
  // A user who sets a price in opencode.json gets it, in the shape the runtime
  // reads, rather than the catalog's rate silently winning.
  const models = buildModels({
    apiBase: BASE,
    providerModels: {
      "LongCat-2.0": { cost: { input: 9, output: 9, cache_read: 1 } },
    },
  });
  expect(models["LongCat-2.0"].cost).toEqual({
    input: 9,
    output: 9,
    cache: { read: 1, write: 0 },
  });
});

test("the model list endpoint is the documented one", () => {
  expect(modelsEndpoint(BASE)).toBe(`${BASE}/openai/v1/models`);
});

test("buildModels offers the catalog under the format path", () => {
  const models = buildModels({ apiBase: BASE });
  expect(Object.keys(models).sort()).toEqual([
    "LongCat-2.0",
    "LongCat-2.5-Preview",
  ]);
  expect(models["LongCat-2.5-Preview"].api.url).toBe(`${BASE}/openai/v1`);
  expect(models["LongCat-2.5-Preview"].api.npm).toBe(
    "@ai-sdk/openai-compatible",
  );
  expect(models["LongCat-2.5-Preview"].capabilities.reasoning).toBe(true);
});

test("buildModels keeps a model the config already declared", () => {
  const models = buildModels({
    apiBase: BASE,
    providerModels: {
      "LongCat-2.0": {
        name: "My 2.0",
        cost: { input: 1, output: 2, cache: { read: 0, write: 0 } },
      },
    },
  });
  expect(models["LongCat-2.0"].name).toBe("My 2.0");
  expect(models["LongCat-2.0"].cost.input).toBe(1);
});

test("buildModels reads the flat capability flags a config entry carries", () => {
  const models = buildModels({
    apiBase: BASE,
    providerModels: { "LongCat-2.0": { attachment: true } },
  });
  expect(models["LongCat-2.0"].capabilities.attachment).toBe(true);
});

test("buildModels reads the nested capability flags a resolved Model carries", () => {
  const models = buildModels({
    apiBase: BASE,
    providerModels: {
      "LongCat-2.0": { capabilities: { attachment: true, toolcall: false } },
    },
  });
  expect(models["LongCat-2.0"].capabilities.attachment).toBe(true);
  expect(models["LongCat-2.0"].capabilities.toolcall).toBe(false);
});

test("buildModels adds a model the platform lists that the catalog lacks", () => {
  const models = buildModels({ apiBase: BASE, known: ["LongCat-2.5-Flash"] });
  expect(models["LongCat-2.5-Flash"]).toBeDefined();
  expect(models["LongCat-2.5-Flash"].id).toBe("LongCat-2.5-Flash");
});

test("buildModels drops a model the platform retired", () => {
  const models = buildModels({
    apiBase: BASE,
    known: ["LongCat-Flash-Chat", "LongCat-2.5-Flash"],
  });
  expect(models["LongCat-Flash-Chat"]).toBeUndefined();
  expect(models["LongCat-2.5-Flash"]).toBeDefined();
});

test("buildModels ignores a malformed model id", () => {
  const models = buildModels({ apiBase: BASE, known: ["__proto__", "ok"] });
  expect(Object.keys(models)).not.toContain("__proto__");
});

test("discoverModels reads the platform's list", async () => {
  const fetchImpl = async (url) => {
    expect(url).toBe(`${BASE}/openai/v1/models`);
    return new Response(
      JSON.stringify({
        object: "list",
        data: [{ id: "LongCat-2.0" }, { id: "bad id" }],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  };
  const { ids, error } = await discoverModels({
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
  });
  expect(error).toBeUndefined();
  expect(ids).toEqual(["LongCat-2.0"]);
});

test("discoverModels reports a refusal rather than throwing", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: "no" } }), { status: 401 });
  const { ids, error } = await discoverModels({
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
  });
  expect(ids).toEqual([]);
  expect(error).toContain("401");
});

test("discoverModels reports a network failure rather than throwing", async () => {
  const fetchImpl = async () => {
    throw new Error("ECONNREFUSED");
  };
  const { ids, error } = await discoverModels({
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
  });
  expect(ids).toEqual([]);
  expect(error).toContain("ECONNREFUSED");
});

test("discoverPrice converts the yuan table the endpoint publishes into dollars", async () => {
  // The endpoint answers strings, not numbers, and in *yuan* — ¥2 / ¥8 / ¥0.04 —
  // which is the table the docs' own example shows. Copying it as dollars would
  // put a 6.67× overcharge on every session, so it is converted here.
  const fetchImpl = async (url) => {
    expect(url).toBe(`${BASE}/openai/v1/models/LongCat-2.5-Preview`);
    return new Response(
      JSON.stringify({
        id: "LongCat-2.5-Preview",
        pricing: { prompt: "2", completion: "8", cached_tokens: "0.04" },
      }),
      { status: 200 },
    );
  };
  const { price } = await discoverPrice({
    id: "LongCat-2.5-Preview",
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
  });
  expect(price).toEqual({ input: 0.3, output: 1.2, cacheRead: 0.006 });
});

test("discoverPrice leaves a dollar table alone", async () => {
  // The conversion is decided by the edition, not by the numbers: an endpoint
  // that answers dollars must not be divided again.
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        id: "LongCat-2.5-Preview",
        pricing: { prompt: "0.3", completion: "1.2", cached_tokens: "0.006" },
      }),
      { status: 200 },
    );
  const { price } = await discoverPrice({
    id: "LongCat-2.5-Preview",
    apiBase: "https://api.longcat.ai",
    key: "ak_x",
    fetchImpl,
  });
  expect(price).toEqual({ input: 0.3, output: 1.2, cacheRead: 0.006 });
});

test("discoverPrice gives nothing back for a model the endpoint does not price", async () => {
  // A 200 whose body carries no `pricing` is not a price. Inventing one would
  // put a number on a model the platform never quoted.
  const fetchImpl = async () =>
    new Response(JSON.stringify({ id: "LongCat-2.5-Preview" }), {
      status: 200,
    });
  const { price } = await discoverPrice({
    id: "LongCat-2.5-Preview",
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
  });
  expect(price).toBeUndefined();
});

test("discoverPrice gives nothing back when the endpoint is unreadable", async () => {
  // A model the endpoint does not price, or a platform that is down, must not
  // throw: the caller keeps its built-in table.
  for (const impl of [
    async () => new Response("nope", { status: 404 }),
    async () => new Response("{}", { status: 200 }),
    async () => {
      throw new Error("ECONNREFUSED");
    },
  ]) {
    const { price } = await discoverPrice({
      id: "LongCat-2.5-Preview",
      apiBase: BASE,
      key: "ak_x",
      fetchImpl: impl,
    });
    expect(price).toBeUndefined();
  }
});

test("buildModels takes the price the platform published over its own table", () => {
  const models = buildModels({
    apiBase: BASE,
    prices: { "LongCat-2.5-Preview": { input: 9, output: 9, cacheRead: 3 } },
  });
  expect(models["LongCat-2.5-Preview"].cost).toEqual({
    input: 9,
    output: 9,
    cache: { read: 3, write: 0 },
  });
  // A model the platform did not price keeps the catalog's table.
  expect(models["LongCat-2.0"].cost.input).toBe(0.3);
});

test("discoverModels does not hang when the platform never answers", async () => {
  // A fetch that never settles on its own: only the abort signal can end it,
  // which is what the plugin's timeout relies on.
  const fetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener(
        "abort",
        () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        { once: true },
      );
    });
  const { error } = await discoverModels({
    apiBase: BASE,
    key: "ak_x",
    fetchImpl,
    timeoutMs: 50,
  });
  expect(error).toContain("timed out");
}, 5000);
