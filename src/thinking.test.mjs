import { test, expect } from "bun:test";
import { thinkingFor } from "./thinking.mjs";

test("an effort variant sets the budget", () => {
  expect(thinkingFor({ variant: "low" })).toEqual({
    type: "enabled",
    budget: 8192,
  });
  expect(thinkingFor({ variant: "medium" })).toEqual({
    type: "enabled",
    budget: 32768,
  });
  expect(thinkingFor({ variant: "high" })).toEqual({
    type: "enabled",
    budget: 131072,
  });
});

test("a variant is ignored when the model's own setting turns thinking off", () => {
  expect(
    thinkingFor({
      options: { thinking: { type: "disabled" } },
      variant: "high",
    }),
  ).toEqual({ type: "disabled" });
});

test("no variant leaves the budget to the platform", () => {
  expect(thinkingFor({})).toEqual({ type: "enabled" });
});
