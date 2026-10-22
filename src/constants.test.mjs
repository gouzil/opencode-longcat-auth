import { test, expect } from "bun:test";
import {
  API_KEYS,
  DOCS,
  EDITIONS,
  ICON,
  KEY_PREFIX,
  MODEL_LIMITS,
  PRICES,
  PROVIDER,
  PROVIDER_NAME,
  RETIRED,
  SDK,
  USD_PER_CNY,
  USER_AGENT,
} from "./constants.mjs";

test("the provider id is the platform's own", () => {
  expect(PROVIDER).toBe("opencode-longcat-auth");
  expect(PROVIDER_NAME).toBe("LongCat");
});

test("both editions point at the documented endpoints", () => {
  expect(EDITIONS.cn.apiBase).toBe("https://api.longcat.chat");
  expect(EDITIONS.global.apiBase).toBe("https://api.longcat.ai");
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

test("the published rates are carried, per million tokens", () => {
  // The platform's discounted rates: $0.30 / $1.20 / $0.006 per 1M tokens, the
  // same numbers as the ¥2 / ¥8 / ¥0.04 yuan table at a fixed 6.667 conversion.
  expect(PRICES.input).toBe(0.3);
  expect(PRICES.output).toBe(1.2);
  expect(PRICES.cacheRead).toBe(0.006);
});

test("the yuan table converts to the dollar table exactly", () => {
  // The model-detail endpoint publishes the *yuan* rates, so a live read has to
  // be converted into the dollars OpenCode's `cost` field is in. The rate is the
  // reciprocal of the page's 6.666… so the products come out exact: `2 * (3/20)`
  // is `0.3`, where `2 / 6.667` is 0.2999850007499625 and would drift.
  expect(2 * USD_PER_CNY).toBe(0.3);
  expect(8 * USD_PER_CNY).toBe(1.2);
  expect(0.04 * USD_PER_CNY).toBe(0.006);
  expect(USD_PER_CNY).toBe(3 / 20);
});

test("the cached rate is a real discount on the input rate", () => {
  // The page bills cached input at a fiftieth of uncached input, which is what
  // makes a prompt cache worth turning on. A rate at or above the input rate
  // would mean the discount is not carried.
  expect(PRICES.cacheRead).toBeLessThan(PRICES.input);
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
