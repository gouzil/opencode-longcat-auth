/**
 * LongCat's thinking mode.
 *
 * The platform's reasoning models take a `thinking` object rather than a
 * `reasoning_effort` string: `{"type":"enabled"}` turns thinking on,
 * `{"type":"disabled"}` turns it off, and the field defaults to enabled. The
 * budget is a separate `thinking_budget` integer, capped at 262144.
 *
 * The AI SDK builds the request body from a model's options, so this module
 * maps the model's options onto that shape rather than touching a body. It is
 * the only place that knows the mapping.
 */

const DEFAULT_THINKING = Object.freeze({ type: "enabled" });

/** The largest `thinking_budget` the platform accepts. */
const MAX_THINKING_BUDGET = 262144;

/**
 * The effort variant names this plugin publishes, and the thinking budget each
 * one asks for. The platform does not expose per-variant budgets, so these are
 * the plugin's own: a low variant still thinks, it just spends less of it.
 */
const EFFORT_BUDGET = Object.freeze({
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
function thinkingFromOptions(options) {
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
