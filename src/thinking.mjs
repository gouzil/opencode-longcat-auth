/**
 * LongCat's thinking mode.
 *
 * The platform's reasoning models take a `thinking` object rather than a
 * `reasoning_effort` string: `{"type":"enabled"}` turns thinking on,
 * `{"type":"disabled"}` turns it off, and the field defaults to enabled. The
 * budget is a separate `thinking_budget` integer, capped at 262144.
 *
 * A plugin that maps its effort variants onto these fields has to rewrite the
 * request body, so this module is the only place that knows the mapping.
 */

export const DEFAULT_THINKING = Object.freeze({ type: "enabled" });

/** The largest `thinking_budget` the platform accepts. */
export const MAX_THINKING_BUDGET = 262144;

/**
 * The effort variant names this plugin publishes, and the thinking budget each
 * one asks for. The platform does not expose per-variant budgets, so these are
 * the plugin's own: a low variant still thinks, it just spends less of it.
 */
export const EFFORT_BUDGET = Object.freeze({
  low: 8192,
  medium: 32768,
  high: 131072,
});

/**
 * Read the thinking setting out of a model's `options`.
 *
 * OpenCode puts a model's configured options under `options.thinking`; a user
 * may write either the platform's object (`{"type":"disabled"}`) or a bare
 * string (`"disabled"`). `undefined` means the model's default, which is on.
 */
export function thinkingFromOptions(options) {
  const value = options?.thinking;
  if (value == null) return DEFAULT_THINKING;
  if (typeof value === "string") {
    return value === "disabled" || value === "off"
      ? { type: "disabled" }
      : DEFAULT_THINKING;
  }
  if (typeof value === "object") {
    return value.type === "disabled" ? { type: "disabled" } : DEFAULT_THINKING;
  }
  return DEFAULT_THINKING;
}

/**
 * The thinking field for a request, given the model's options and the effort
 * variant the agent picked.
 *
 * Returns the object to set on the body. `null` means the platform's own
 * default applies, so the field is left off entirely — the platform reads a
 * missing field as enabled, and leaving it off keeps the request body the same
 * shape the platform's own clients send.
 */
export function thinkingFor({ options, variant } = {}) {
  const base = thinkingFromOptions(options);
  if (base.type === "disabled") return { type: "disabled" };

  const budget = EFFORT_BUDGET[variant];
  if (!budget) return { type: "enabled" };
  return { type: "enabled", budget: Math.min(budget, MAX_THINKING_BUDGET) };
}

/**
 * Write a thinking field onto a request body without disturbing anything else.
 * Both API formats take the same field name, so one function covers them.
 *
 * Returns a new object; the input is never mutated. A `null` field is removed,
 * which is how a request is put back to the platform's default.
 */
export function withThinking(body, thinking) {
  if (thinking == null || thinking.type == null) {
    const { thinking: _drop, ...rest } = body;
    return rest;
  }
  return {
    ...body,
    thinking: {
      type: thinking.type,
      ...(thinking.budget ? { budget: thinking.budget } : {}),
    },
  };
}

/**
 * Read the thinking budget off a body, as an integer. `thinking_budget` is the
 * platform's own field; `thinking.budget` is what this plugin writes when an
 * effort variant is selected.
 */
export function thinkingBudgetOf(body) {
  const direct = body?.thinking_budget;
  const nested = body?.thinking?.budget;
  const value = direct ?? nested;
  const parsed = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Clamp a budget the platform would reject. Values above 262144 return 400,
 * so a budget that came from a config file is brought into range here rather
 * than failing the request.
 */
export function clampBudget(value) {
  if (!Number.isFinite(value)) return undefined;
  const integer = Math.trunc(value);
  if (integer < 0) return undefined;
  return Math.min(integer, MAX_THINKING_BUDGET);
}
