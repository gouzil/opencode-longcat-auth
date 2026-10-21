import { test, expect } from "bun:test";
import { editionOf } from "./keys.mjs";

test("the edition is read off a global-shaped key", () => {
  expect(editionOf("ak_g0123456789abcdef")).toBe("global");
  expect(editionOf("ak_0123456789abcdef")).toBe("cn");
});

test("a value that is not a platform key reads as the default edition", () => {
  // Every edition marker is a guess at the contents, and a host may store a
  // key this plugin did not shape, so the default is the one the loader uses.
  expect(editionOf("not-a-key")).toBe("cn");
  expect(editionOf("")).toBe("cn");
  expect(editionOf(undefined)).toBe("cn");
});

test("whitespace around a key does not hide its edition", () => {
  expect(editionOf("  ak_g0123456789abcdef  ")).toBe("global");
});
