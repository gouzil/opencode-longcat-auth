import { test, expect } from "bun:test";
import {
  clampBudget,
  thinkingBudgetOf,
  thinkingFor,
  thinkingFromOptions,
  withThinking,
  MAX_THINKING_BUDGET,
} from "./thinking.mjs";

test("a missing setting is the platform's default, which is on", () => {
  expect(thinkingFromOptions({})).toEqual({ type: "enabled" });
  expect(thinkingFromOptions(undefined)).toEqual({ type: "enabled" });
});

test("the platform's own object is read", () => {
  expect(thinkingFromOptions({ thinking: { type: "disabled" } })).toEqual({
    type: "disabled",
  });
  expect(thinkingFromOptions({ thinking: { type: "enabled" } })).toEqual({
    type: "enabled",
  });
});

test("a bare string is read too, since a config file may write one", () => {
  expect(thinkingFromOptions({ thinking: "disabled" })).toEqual({
    type: "disabled",
  });
  expect(thinkingFromOptions({ thinking: "off" })).toEqual({
    type: "disabled",
  });
  expect(thinkingFromOptions({ thinking: "enabled" })).toEqual({
    type: "enabled",
  });
});

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

test("a budget is clamped to the platform's ceiling", () => {
  expect(clampBudget(MAX_THINKING_BUDGET + 1)).toBe(MAX_THINKING_BUDGET);
  expect(clampBudget(-1)).toBeUndefined();
  expect(clampBudget(0)).toBe(0);
  expect(clampBudget("nonsense")).toBeUndefined();
});

test("withThinking writes the field without disturbing the rest of the body", () => {
  const body = {
    model: "LongCat-2.5-Preview",
    messages: [{ role: "user", content: "hi" }],
  };
  const out = withThinking(body, { type: "disabled" });
  expect(out.thinking).toEqual({ type: "disabled" });
  expect(out.model).toBe("LongCat-2.5-Preview");
  expect(out.messages).toHaveLength(1);
  // the input is not mutated
  expect(body.thinking).toBeUndefined();
});

test("withThinking removes the field when there is nothing to write", () => {
  const body = { model: "x", thinking: { type: "enabled" } };
  expect(withThinking(body, null).thinking).toBeUndefined();
});

test("the budget is read off either field name", () => {
  expect(thinkingBudgetOf({ thinking_budget: 4096 })).toBe(4096);
  expect(thinkingBudgetOf({ thinking: { budget: 8192 } })).toBe(8192);
  expect(thinkingBudgetOf({})).toBeUndefined();
});
