import { test, expect } from "bun:test";
import { LongCatAuthPlugin } from "./provider.mjs";

const BASE = "https://api.longcat.chat";

/** A plugin instance with a stub fetch, so no request leaves the process. */
async function plugin(options = {}) {
  const defaultFetch = async (url) => {
    if (String(url).includes("/models")) {
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "LongCat-2.5-Preview" }, { id: "LongCat-2.0" }],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  return LongCatAuthPlugin(
    { project: {}, directory: "/tmp" },
    { fetchImpl: defaultFetch, ...options },
  );
}

test("the config hook declares the provider without overwriting the user's own", async () => {
  const hooks = await plugin();
  const cfg = { provider: { "opencode-longcat-auth": { name: "My LongCat" } } };
  await hooks.config(cfg);
  expect(cfg.provider["opencode-longcat-auth"].name).toBe("My LongCat");
});

test("the config hook declares the transport when the provider is absent", async () => {
  const hooks = await plugin();
  const cfg = { provider: {} };
  await hooks.config(cfg);
  const provider = cfg.provider["opencode-longcat-auth"];
  expect(provider.name).toBe("LongCat");
  expect(provider.npm).toBe("@ai-sdk/openai-compatible");
  expect(provider.api).toBe(BASE);
});

test("the auth hook offers one API-key login", async () => {
  const hooks = await plugin();
  expect(hooks.auth.provider).toBe("opencode-longcat-auth");
  expect(hooks.auth.methods).toHaveLength(1);
  expect(hooks.auth.methods[0].type).toBe("api");
  expect(hooks.auth.methods[0].label).toContain("LongCat");
});

test("the API-key login declares no authorize", async () => {
  // The shape that works in both hosts. magpie's host calls `authorize` with
  // the answers to a method's prompts — the typed key reaches it as a separate
  // argument the host stores itself — and OpenCode returns before an api
  // method's `authorize` is reached at all. An `authorize` that looked for the
  // key in `inputs` saw an empty key on every login.
  const hooks = await plugin();
  const method = hooks.auth.methods[0];
  expect(method.authorize).toBeUndefined();
  expect(method.prompts).toBeUndefined();
});

test("the loader returns nothing for an account with no key", async () => {
  const hooks = await plugin();
  const options = await hooks.auth.loader(async () => undefined);
  expect(options).toEqual({});
});

test("the loader signs each request with the account's key", async () => {
  const hooks = await plugin();
  const options = await hooks.auth.loader(async () => ({
    type: "api",
    key: "ak_0123456789abcdef",
  }));
  expect(options.baseURL).toBe(BASE);
  expect(options.apiKey).toBe("ak_0123456789abcdef");
  expect(options.headers["x-longcat-edition"]).toBe("cn");
  expect(typeof options.fetch).toBe("function");
});

test("the loader reads an OAuth access token too", async () => {
  const hooks = await plugin();
  const options = await hooks.auth.loader(async () => ({
    type: "oauth",
    access: "tok",
    refresh: "ref",
    expires: 0,
  }));
  expect(options.apiKey).toBe("tok");
});

test("the loader's base URL follows the plugin's own option", async () => {
  const hooks = await plugin({ apiBase: "https://proxy.example" });
  const options = await hooks.auth.loader(async () => ({
    type: "api",
    key: "ak_0123456789abcdef",
  }));
  expect(options.baseURL).toBe("https://proxy.example");
});

test("the models hook offers the catalog", async () => {
  const hooks = await plugin();
  const models = await hooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_0123456789abcdef" } },
  );
  expect(Object.keys(models).sort()).toEqual([
    "LongCat-2.0",
    "LongCat-2.5-Preview",
  ]);
});

test("the models hook adds a model the platform lists", async () => {
  const hooks = await plugin({
    fetchImpl: async (url) =>
      new Response(
        JSON.stringify({ object: "list", data: [{ id: "LongCat-2.5-Flash" }] }),
        { status: 200 },
      ),
  });
  const models = await hooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_0123456789abcdef" } },
  );
  expect(models["LongCat-2.5-Flash"]).toBeDefined();
});

test("the models hook takes the price the platform publishes for a model", async () => {
  // The platform can change a rate without a release, so the plugin asks each
  // model what it costs rather than trusting the table it shipped with. The
  // endpoint answers the *yuan* table, so a rate it doubled here lands on the
  // model as dollars — the conversion is the endpoint's job, not the hook's.
  const hooks = await plugin({
    fetchImpl: async (url) => {
      if (String(url).endsWith("/models/LongCat-2.5-Preview")) {
        return new Response(
          JSON.stringify({
            id: "LongCat-2.5-Preview",
            pricing: { prompt: "20", completion: "80", cached_tokens: "0.8" },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "LongCat-2.5-Preview" }],
        }),
        { status: 200 },
      );
    },
  });
  const models = await hooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_0123456789abcdef" } },
  );
  expect(models["LongCat-2.5-Preview"].cost).toEqual({
    input: 3,
    output: 12,
    cache: { read: 0.12, write: 0 },
  });
});

test("the models hook keeps the catalog when the platform cannot be read", async () => {
  const hooks = await plugin({
    fetchImpl: async () => new Response("nope", { status: 500 }),
  });
  const models = await hooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_0123456789abcdef" } },
  );
  expect(models["LongCat-2.5-Preview"]).toBeDefined();
  expect(models[Symbol.for("magpie.fellBack")]).toBe(true);
});

test("the models hook drops a model the platform retired", async () => {
  const hooks = await plugin({
    fetchImpl: async (url) =>
      new Response(
        JSON.stringify({
          object: "list",
          data: [{ id: "LongCat-Flash-Chat" }],
        }),
        { status: 200 },
      ),
  });
  const models = await hooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_0123456789abcdef" } },
  );
  expect(models["LongCat-Flash-Chat"]).toBeUndefined();
});

test("the models hook still lists models for an account with no key", async () => {
  const hooks = await plugin();
  const models = await hooks.provider.models(
    { models: {} },
    { auth: undefined },
  );
  expect(models["LongCat-2.5-Preview"]).toBeDefined();
});

test("chat.params writes the thinking field for LongCat only", async () => {
  const hooks = await plugin();
  const output = { options: {} };
  await hooks["chat.params"](
    { model: { providerID: "opencode-longcat-auth" } },
    output,
  );
  expect(output.options.thinking).toEqual({ type: "enabled" });

  const other = { options: {} };
  await hooks["chat.params"]({ model: { providerID: "anthropic" } }, other);
  expect(other.options.thinking).toBeUndefined();
});

test("chat.params maps an effort variant onto the thinking budget", async () => {
  const hooks = await plugin();
  const output = { options: {} };
  await hooks["chat.params"](
    { model: { providerID: "opencode-longcat-auth" }, variant: "high" },
    output,
  );
  expect(output.options.thinking).toEqual({ type: "enabled", budget: 131072 });
});

test("chat.params keeps a model that turns thinking off", async () => {
  const hooks = await plugin();
  const output = { options: { thinking: { type: "disabled" } } };
  await hooks["chat.params"](
    { model: { providerID: "opencode-longcat-auth" }, variant: "high" },
    output,
  );
  expect(output.options.thinking).toEqual({ type: "disabled" });
});

test("chat.headers adds the plugin's headers for LongCat", async () => {
  const hooks = await plugin();
  const output = { headers: {} };
  hooks["chat.headers"](
    { model: { providerID: "opencode-longcat-auth" } },
    output,
  );
  expect(output.headers["x-opencode-longcat-client"]).toMatch(
    /^opencode-longcat-auth\//,
  );
});

test("the plugin carries the icon and concurrency magpie reads", async () => {
  const hooks = await plugin();
  expect(hooks.auth.icon).toContain("longcat");
  expect(hooks.auth.maxConcurrency).toBe(4);
});

test("magpie's usage hook reports the plan and keeps a working key", async () => {
  const hooks = await plugin();
  const usage = await hooks.auth.usage(async () => ({
    type: "api",
    key: "ak_0123456789abcdef",
  }));
  expect(usage.plan).toContain("按量付费");
  expect(usage.windows).toEqual([]);
  // A read that succeeded clears any "sign in again" mark on the account.
  expect(usage.signIn).toBe("kept");
});

test("magpie's usage hook marks an account whose key stopped working", async () => {
  const hooks = await plugin({
    fetchImpl: async () => new Response("nope", { status: 500 }),
  });
  const usage = await hooks.auth.usage(async () => ({
    type: "api",
    key: "ak_0123456789abcdef",
  }));
  expect(usage.error).toContain("500");
  expect(usage.signIn).toBe("expired");
});

test("magpie's usage hook says nothing to claim when no key is stored", async () => {
  const hooks = await plugin();
  const usage = await hooks.auth.usage(async () => undefined);
  expect(usage.plan).toContain("按量付费");
  expect(usage.signIn).toBeUndefined();
});
