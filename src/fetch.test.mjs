import { test, expect } from "bun:test";
import { PATHS, chatHeaders, createFetch, protocolOf } from "./fetch.mjs";

const BASE = "https://api.longcat.chat";

test("the platform's endpoints are recognised by their tails", () => {
  expect(protocolOf(`${BASE}/openai/v1/chat/completions`)).toBe("chat");
  expect(protocolOf(`${BASE}/openai/v1/responses`)).toBe("responses");
  expect(protocolOf(`${BASE}/anthropic/v1/messages`)).toBe("anthropic");
  expect(protocolOf(`${BASE}/openai/v1/models`)).toBeUndefined();
});

test("a query string does not hide the endpoint", () => {
  expect(protocolOf(`${BASE}/openai/v1/chat/completions?alt=sse`)).toBe("chat");
});

test("a proxied base URL still matches", () => {
  expect(protocolOf("http://127.0.0.1:9000/openai/v1/chat/completions")).toBe(
    "chat",
  );
});

test("a URL object is read too", () => {
  expect(protocolOf(new URL(`${BASE}/anthropic/v1/messages`))).toBe(
    "anthropic",
  );
});

test("the fetch adds its own headers and passes the request through", async () => {
  const seen = [];
  const fetchImpl = async (input, init) => {
    seen.push({ input, init });
    return new Response("{}", { status: 200 });
  };
  const fetch = createFetch({ fetchImpl });
  const response = await fetch(`${BASE}/openai/v1/chat/completions`, {
    method: "POST",
    headers: { "x-opencode-project": "p" },
    body: JSON.stringify({ model: "LongCat-2.5-Preview" }),
  });
  expect(response.status).toBe(200);
  const { init } = seen[0];
  expect(init.headers.get("x-opencode-project")).toBe("p");
  expect(init.headers.get("x-opencode-longcat-client")).toMatch(
    /^opencode-longcat-auth\//,
  );
  expect(init.headers.get("user-agent")).toMatch(/^opencode-longcat-auth\//);
});

test("the fetch refuses a request that is not the platform's own", async () => {
  const fetch = createFetch({
    fetchImpl: async () => new Response("{}", { status: 200 }),
  });
  await expect(
    fetch(`${BASE}/openai/v1/models`, { method: "POST" }),
  ).rejects.toThrow(/POST/);
});

test("a network failure is reported as such", async () => {
  const fetch = createFetch({
    fetchImpl: async () => {
      throw new Error("ECONNREFUSED");
    },
  });
  await expect(
    fetch(`${BASE}/openai/v1/chat/completions`, { method: "POST", body: "{}" }),
  ).rejects.toThrow(/could not be reached/);
});

test("an aborted request is passed through as an abort", async () => {
  const fetch = createFetch({
    fetchImpl: async (_input, init) => {
      init.signal.throwIfAborted();
      return new Response("{}", { status: 200 });
    },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    fetch(`${BASE}/openai/v1/chat/completions`, {
      method: "POST",
      body: "{}",
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
});

test("a refused response throws the sign-in error", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: { code: "invalid_api_key", message: "incorrect api key" },
      }),
      { status: 401 },
    );
  const fetch = createFetch({ fetchImpl });
  const error = await fetch(`${BASE}/openai/v1/chat/completions`, {
    method: "POST",
    body: "{}",
  }).catch((e) => e);
  expect(error.signIn).toBe("expired");
  expect(error.message).toContain("api_keys");
});

test("a non-2xx that is not a refusal is passed through untouched", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        error: { code: "rate_limit_exceeded", message: "slow down" },
      }),
      { status: 429 },
    );
  const fetch = createFetch({ fetchImpl });
  const response = await fetch(`${BASE}/openai/v1/chat/completions`, {
    method: "POST",
    body: "{}",
  });
  expect(response.status).toBe(429);
});

test("chat.headers only touches LongCat requests", () => {
  const longcat = chatHeaders(
    { model: { providerID: "opencode-longcat-auth" } },
    { headers: {} },
  );
  expect(longcat.headers["x-opencode-longcat-client"]).toMatch(
    /^opencode-longcat-auth\//,
  );

  const other = chatHeaders(
    { model: { providerID: "anthropic" } },
    { headers: {} },
  );
  expect(other.headers["x-opencode-longcat-client"]).toBeUndefined();
});

test("the endpoint table covers the formats the platform serves", () => {
  expect(PATHS.chat).toBe("/chat/completions");
  expect(PATHS.responses).toBe("/responses");
  expect(PATHS.anthropic).toBe("/messages");
});
