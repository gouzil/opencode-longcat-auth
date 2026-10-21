import { test, expect } from "bun:test";
import {
  editionOf,
  fingerprint,
  fromEnv,
  isPlatformKey,
  isUnusable,
} from "./keys.mjs";

test("the key is read from the plugin's own variable first", () => {
  const env = {
    OPENCODE_LONGCAT_API_KEY: "ak_override",
    LONGCAT_API_KEY: "ak_env",
  };
  expect(fromEnv(env)).toEqual({
    env: "OPENCODE_LONGCAT_API_KEY",
    key: "ak_override",
  });
});

test("the platform's own variable is read when the override is absent", () => {
  expect(fromEnv({ LONGCAT_API_KEY: "ak_env" })).toEqual({
    env: "LONGCAT_API_KEY",
    key: "ak_env",
  });
});

test("nothing is read when neither variable is set", () => {
  expect(fromEnv({})).toEqual({ env: undefined, key: undefined });
});

test("whitespace around a key is trimmed", () => {
  expect(fromEnv({ LONGCAT_API_KEY: "  ak_x  " }).key).toBe("ak_x");
});

test("a key in the platform's shape is recognised", () => {
  expect(isPlatformKey("ak_0123456789abcdef")).toBe(true);
  expect(isPlatformKey("sk-0123456789abcdef")).toBe(false);
  expect(isPlatformKey("ak_")).toBe(false);
  expect(isPlatformKey(undefined)).toBe(false);
});

test("a placeholder from the docs is refused", () => {
  expect(isUnusable("YOUR_APP_KEY")).toBe("placeholder");
  expect(isUnusable("your-app-key")).toBe("placeholder");
  expect(isUnusable("ak_real_key_here")).toBeUndefined();
});

test("an empty key is refused", () => {
  expect(isUnusable("")).toBe("empty");
  expect(isUnusable("   ")).toBe("empty");
});

test("a key with whitespace inside it is refused", () => {
  expect(isUnusable("ak_two words")).toContain("whitespace");
});

test("a key with whitespace around it is refused", () => {
  expect(isUnusable("  ak_x  ")).toContain("whitespace");
});

test("a too-short key is refused", () => {
  expect(isUnusable("ak_ab")).toBe("too short");
});

test("a fingerprint shows the ends and never the middle", () => {
  const key = "ak_abcdefghijklmnopqrstuvwxyz0123456789";
  const printed = fingerprint(key);
  expect(printed).toContain("ak_abc");
  expect(printed).toContain("456789");
  expect(printed).toContain("…");
  expect(printed).not.toBe(key);
});

test("a short value is fingerprinted by its tail alone", () => {
  expect(fingerprint("ak_x")).toBe("…ak_x");
  expect(fingerprint("")).toBe("…");
});

test("the edition is read off a global-shaped key", () => {
  expect(editionOf("ak_g0123456789abcdef")).toBe("global");
  expect(editionOf("ak_0123456789abcdef")).toBe("cn");
  expect(editionOf("not-a-key")).toBe("cn");
});
