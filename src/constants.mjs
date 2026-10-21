/**
 * LongCat platform constants.
 *
 * The platform publishes two endpoints, one per API format, and the format a
 * model is served under decides which base URL its requests must go to:
 *
 *   OpenAI compatible (chat completions / responses)
 *     https://api.longcat.chat/openai
 *   Anthropic messages
 *     https://api.longcat.chat/anthropic
 *
 * `longcat.chat` is the public edition. `longcat.ai` is the same platform on
 * another edition, and the two are interchangeable for every endpoint below
 * (the docs sync links, codes and scopes between them).
 */

/**
 * Provider id.
 *
 * This is deliberately not `longcat`: OpenCode already has a built-in LongCat
 * provider (models.dev carries it), and when a plugin declares that id the
 * built-in entry wins and the plugin's models never appear. An id of the
 * plugin's own — `opencode-longcat-auth`, named after the package — is not
 * taken by anything, so the plugin's declaration is the one that is used.
 */
export const PROVIDER = "opencode-longcat-auth";

/** Human readable name shown next to the provider id. */
export const PROVIDER_NAME = "LongCat";

/** Icon used by magpie's plugin cards and provider rows. */
export const ICON =
  "https://s3plus.meituan.net/elsa-multimedia-data/longcat/logo-group.svg";

/** The AI SDK packages each API format is driven by. */
export const SDK = Object.freeze({
  chat: "@ai-sdk/openai-compatible",
  anthropic: "@ai-sdk/anthropic",
});

/** LongCat's own docs for this plugin. */
export const DOCS = "https://longcat.chat/platform/docs/zh/open-code";
export const API_KEYS = "https://longcat.chat/platform/api_keys";

/**
 * The plan name `auth.usage` reports.
 *
 * The platform is prepaid pay-as-you-go and publishes no balance endpoint, so
 * the account's remaining credit is readable only in its console — the pay-as-you-go
 * page points at 用量管理 for it. The plan name is therefore a sentence that
 * names where to look rather than a number the plugin has not read.
 */
export const PLAN = "API 按量付费（余额见费用中心）";

/** Environment variable the platform accepts for the API key. */
export const API_KEY_ENV = "LONGCAT_API_KEY";

/** An API key in the platform's own shape starts with this prefix. */
export const KEY_PREFIX = "ak_";

/** Editions of the platform, and the base URL each one serves. */
export const EDITIONS = Object.freeze({
  cn: {
    id: "cn",
    label: "LongCat 中国站",
    hint: "longcat.chat — 人民币计费",
    apiBase: "https://api.longcat.chat",
  },
  global: {
    id: "global",
    label: "LongCat Global",
    hint: "longcat.ai — USD billing",
    apiBase: "https://api.longcat.ai",
  },
});

/**
 * The pay-as-you-go rates the platform publishes, per million tokens.
 *
 * Both models are priced identically — the platform's own page lists one table
 * for "LongCat-2.5-Preview、LongCat-2.0" — so one object serves both. The
 * platform publishes the same table in two currencies, and they are a fixed
 * conversion of each other (¥2 = $0.30, ¥0.04 = $0.006, ¥8 = $1.20), so the two
 * editions do not differ in price, only in the currency they bill in.
 *
 * These are the platform's *discounted* rates: the page calls them 折扣价 / 限时
 * and says the platform and its billing records are authoritative. Treat them
 * as a floor on nothing and a hint on everything else.
 *
 * These are the **dollar** half of that page. The model-detail endpoint publishes
 * the *yuan* half (¥2 / ¥8 / ¥0.04) on both editions, which is why
 * `discoverPrice` converts rather than copying.
 */
export const PRICES = Object.freeze({
  /** Uncached input, the ordinary prompt tokens. */
  input: 0.3,
  /** Output, which includes reasoning tokens: the platform bills
   * `completion_tokens_details.reasoning_tokens` as part of completion. */
  output: 1.2,
  /** Cached input. A fiftieth of the uncached rate, which is what makes a
   * prompt cache worth turning on. */
  cacheRead: 0.006,
});

/**
 * The yuan-to-dollar rate the platform's own two tables imply, as dollars per
 * yuan: ¥2 = $0.30, ¥0.04 = $0.006 and ¥8 = $1.20 all divide by the same
 * 6.666…, which is 20/3. Written as its reciprocal so the conversion
 * multiplies exactly — `2 * (3/20)` is `0.3`, where `2 / 6.667` is not.
 *
 * The model-detail endpoint publishes the **yuan** table on both editions, so
 * this is what turns a live read into the dollars OpenCode's `cost` field is in.
 */
export const USD_PER_CNY = 3 / 20;

/** Built-in model limits. Source: the docs' "模型参数参考" page. */
export const MODEL_LIMITS = Object.freeze({
  /** LongCat-2.5-Preview, released 2026-09-25. */
  "LongCat-2.5-Preview": Object.freeze({
    context: 1048576,
    output: 262144,
    releaseDate: "2026-09-25",
    description:
      "Meituan LongCat-2.5-Preview: multimodal agentic model with tool calling and a 1M-token context window",
    image: true,
  }),
  /** LongCat-2.0, released 2026-06-30. */
  "LongCat-2.0": Object.freeze({
    context: 1048576,
    output: 131072,
    releaseDate: "2026-06-30",
    description:
      "Meituan LongCat-2.0: a reasoning model with tool calling and a 1M-token context window",
    image: false,
  }),
});

/**
 * Models no longer served by the platform. Kept so an old model id can be
 * recognised and left out, rather than offered and refused at request time.
 */
export const RETIRED = Object.freeze({
  "LongCat-Flash-Chat":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
  "LongCat-Flash-Thinking":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
  "LongCat-Flash-Thinking-2601":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
  "LongCat-Flash-Lite":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
  "LongCat-Flash-Omni-2603":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
  "LongCat-Flash-Chat-2602-Exp":
    "retired on 2026-05-29, migrate to LongCat-2.0 or LongCat-2.5-Preview",
});

/**
 * The reasoning effort tiers LongCat's thinking models expose. The model
 * toggles thinking, and the budget is set per request.
 */
export const EFFORT_VARIANTS = Object.freeze({
  low: {},
  medium: {},
  high: {},
});

/** Request headers this plugin identifies itself with. */
export const USER_AGENT = "opencode-longcat-auth/0.1.0";
export const CLIENT_HEADER = "x-opencode-longcat-client";

/**
 * How long a model-list read is waited for before the catalog is used. The
 * platform is far away from some users, so the catalog is kept rather than the
 * account dropped when the list is slow.
 */
export const DISCOVERY_TIMEOUT_MS = 15000;
