import { test, expect } from "bun:test";
import {
  API_KEYS,
  CACHE_READ_COST_USD,
  DEFAULT_EDITION,
  DOCS,
  EDITIONS,
  ICON,
  KEY_PREFIX,
  MODEL_LIMITS,
  PROVIDER,
  PROVIDER_NAME,
  RETIRED,
  SDK,
  USER_AGENT,
} from "./constants.mjs";

test("the provider id is the platform's own", () => {
  expect(PROVIDER).toBe("opencode-longcat-auth");
  expect(PROVIDER_NAME).toBe("LongCat");
});

test("both editions point at the documented endpoints", () => {
  expect(EDITIONS.cn.apiBase).toBe("https://api.longcat.chat");
  expect(EDITIONS.global.apiBase).toBe("https://api.longcat.ai");
  expect(DEFAULT_EDITION).toBe(EDITIONS.cn);
});

test("the OpenAI-compatible format uses the chat SDK package", () => {
  expect(SDK.chat).toBe("@ai-sdk/openai-compatible");
  expect(SDK.anthropic).toBe("@ai-sdk/anthropic");
});

test("the documented limits are carried", () => {
  expect(MODEL_LIMITS["LongCat-2.5-Preview"].context).toBe(1048576);
  expect(MODEL_LIMITS["LongCat-2.5-Preview"].output).toBe(262144);
  expect(MODEL_LIMITS["LongCat-2.0"].output).toBe(131072);
});

test("the prompt-cache discount is carried in dollars", () => {
  expect(CACHE_READ_COST_USD).toBe(0.00042);
});

test("the retired models are all listed, with a reason", () => {
  expect(Object.keys(RETIRED)).toHaveLength(6);
  for (const reason of Object.values(RETIRED)) {
    expect(reason).toContain("2026-05-29");
  }
});

test("the docs and key URLs are the platform's own", () => {
  expect(DOCS).toContain("longcat.chat");
  expect(API_KEYS).toContain("api_keys");
  expect(ICON).toContain("longcat");
});

test("the user agent names the plugin", () => {
  expect(USER_AGENT).toMatch(/^opencode-longcat-auth\//);
});

test("the platform key prefix is the documented one", () => {
  expect(KEY_PREFIX).toBe("ak_");
});
