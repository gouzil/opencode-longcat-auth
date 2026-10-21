/**
 * The LongCat provider plugin.
 *
 * One plugin function, one provider: it declares LongCat and its models, offers
 * an API-key login, and gives each account a fetch that sends its requests to
 * the platform with its own headers.
 *
 * The plugin runs in OpenCode and in magpie. Everything magpie reads beyond
 * OpenCode's own hooks — `auth.usage`, `auth.refresh`, `maxConcurrency`, the
 * icon — is ignored by OpenCode, so one package serves both.
 */

import {
  DISCOVERY_TIMEOUT_MS,
  EDITIONS,
  ICON,
  PLAN,
  PROVIDER,
  USER_AGENT,
} from "./constants.mjs";
import { editionOf } from "./keys.mjs";
import {
  buildModels,
  configProvider,
  discoverModels,
  discoverPrice,
} from "./models.mjs";
import { chatHeaders, createFetch } from "./fetch.mjs";
import { thinkingFor } from "./thinking.mjs";

/**
 * The plugin.
 *
 * `input` is OpenCode's `PluginInput`: `{ client, project, directory, worktree,
 * serverUrl, $ }`. `options` is the plugin's own options from `opencode.json`,
 * or magpie's `plugins.json`.
 */
export const LongCatAuthPlugin = async (input, options = {}) => {
  const apiBase = resolveApiBase(options);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    /**
     * Declare the provider's transport and its models.
     *
     * The models are declared here, in the models.dev shape this hook reads, so
     * the provider is complete the moment the config is read. OpenCode resolves
     * a provider's models from the config when the config has them and does not
     * then call `provider.models`; declaring them here is what puts them in the
     * picker. The `provider.models` hook below re-reads them for the account,
     * and `buildModels` merges the two shapes.
     */
    config: async (cfg) => {
      cfg.provider ??= {};
      cfg.provider[PROVIDER] ??= configProvider(apiBase);
    },

    /** How an account signs in, and what each of its requests carries. */
    auth: {
      provider: PROVIDER,
      icon: ICON,
      maxConcurrency: options.maxConcurrency ?? 4,
      methods: [
        // An `api` method is declared without `authorize`, which is what makes
        // the key land. Both hosts treat it as the one shape that carries a
        // typed value: OpenCode's CLI stores the key itself, and its desktop
        // returns before an api method's `authorize` is reached. magpie's host
        // calls `authorize(inputs)` with the *answers to prompts* — never the
        // key, which its UI sends as a top-level argument the host stores
        // directly. An `authorize` here that looked for the key in `inputs`
        // therefore saw an empty key for every login.
        {
          type: "api",
          label: "LongCat API key",
          placeholder: "ak_…",
        },
      ],
      /** What this account's requests are sent with. */
      async loader(getAuth) {
        const auth = await getAuth();
        const key = auth ? readKey(auth) : undefined;
        if (!key) return {};

        return {
          // The loader's baseURL is the platform root: the model's own `api`
          // carries the format path, and the AI SDK appends the endpoint to
          // whatever the model names.
          baseURL: apiBase,
          apiKey: key,
          headers: {
            "user-agent": USER_AGENT,
            "x-longcat-edition": auth.metadata?.edition ?? editionOf(key),
          },
          fetch: createFetch({ fetchImpl }),
        };
      },
      /**
       * magpie only: what this account's allowance looks like.
       *
       * LongCat is prepaid pay-as-you-go, and the platform publishes no balance
       * endpoint — the console at `费用中心` is the only place an account's
       * remaining credit is readable. So there is no window to fill: a
       * `windows` entry would have to invent a number, and magpie would show it
       * as the platform's own quota. What can be said honestly is read here:
       * the key is asked for its model list, so a read that succeeds proves the
       * key still works, and the plan names where the balance is.
       *
       * `signIn: "kept"` is deliberate: the read succeeded, so magpie clears any
       * "sign in again" mark on the account. That is the host's own signal for
       * a clean read.
       */
      async usage(getAuth) {
        const auth = await getAuth();
        const key = auth ? readKey(auth) : undefined;
        if (!key) return { plan: PLAN, windows: [] };

        const { error } = await discoverModels({
          apiBase,
          key,
          fetchImpl,
          timeoutMs: DISCOVERY_TIMEOUT_MS,
        });
        if (error) {
          // The key could not be used, so the account is marked. magpie shows
          // this where the quota window would be and stops sending it requests
          // until it is signed in again.
          return { plan: PLAN, error, signIn: "expired", windows: [] };
        }
        return { plan: PLAN, signIn: "kept", windows: [] };
      },
    },

    /** The models this account may use. */
    provider: {
      id: PROVIDER,
      async models(provider, { auth } = {}) {
        const stored = provider?.models ?? {};
        const key = auth ? readKey(auth) : undefined;
        if (!key) return buildModels({ apiBase, providerModels: stored });

        // The platform's own list decides what this account may use; the
        // catalog is the floor, so a model the platform dropped is still named
        // here (and the retired ones are filtered out by buildModels).

        const { ids, error } = await discoverModels({
          apiBase,
          key,
          fetchImpl,
          timeoutMs: DISCOVERY_TIMEOUT_MS,
        });
        if (error || ids.length === 0) {
          // The platform could not be read. Keep the catalog rather than
          // dropping the account, and tell magpie the list fell back.
          const result = buildModels({ apiBase, providerModels: stored });
          if (error) result[Symbol.for("magpie.fellBack")] = true;
          return result;
        }

        // Each model's own price is read from the platform, so a price it has
        // changed since this plugin was written shows up without a release. The
        // catalog's table stays the floor: a model the endpoint does not price,
        // or an endpoint that cannot be read, keeps it.
        const prices = await pricesFor({ ids, apiBase, key, fetchImpl });
        return buildModels({
          apiBase,
          providerModels: stored,
          known: ids,
          prices,
        });
      },
    },

    /** magpie only: renew this account's token before it expires. */
    async refresh() {
      return {};
    },

    /**
     * Write the model's thinking field into the request.
     *
     * LongCat's reasoning models take `thinking: {type: "enabled" | "disabled"}`
     * in the request body, and an effort variant maps onto the thinking budget.
     * The body is built by the AI SDK from the provider options, so the field
     * is added here rather than in the fetch.
     */
    "chat.params": async (input, output) => {
      if (input?.model?.providerID !== PROVIDER) return;
      const options = { ...(output.options ?? {}) };
      const thinking = thinkingFor({
        options: {
          thinking: options.thinking ?? input.model?.options?.thinking,
        },
        variant: input.variant,
      });
      if (thinking) options.thinking = thinking;
      output.options = options;
    },

    /** LongCat session affinity, for magpie's own session header. */
    "chat.headers": (input, output) => chatHeaders(input, output),
  };
};

/**
 * The base URL requests go to.
 *
 * A user may point the plugin at a proxy or another edition with
 * `options.apiBase`; the plugin's own option wins over the platform's default.
 */
function resolveApiBase(options) {
  const given = options?.apiBase ?? options?.baseURL;
  if (typeof given === "string" && /^https?:\/\//.test(given.trim())) {
    return given.trim().replace(/\/+$/, "");
  }
  const edition = options?.edition ?? EDITIONS.cn.id;
  return EDITIONS[edition]?.apiBase ?? EDITIONS.cn.apiBase;
}

/**
 * One price per model id, read from the platform.
 *
 * Every id is asked at once and the first failure is the whole read's failure,
 * so a platform that will not answer a detail endpoint costs one round trip per
 * model rather than one per request. An id the endpoint does not price is left
 * out, and `buildModels` gives it the catalog's table instead.
 */
async function pricesFor({ ids, apiBase, key, fetchImpl }) {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const { price } = await discoverPrice({ id, apiBase, key, fetchImpl });
      return [id, price];
    }),
  );
  const prices = {};
  for (const [id, price] of entries) {
    if (price) prices[id] = price;
  }
  return prices;
}

/** The key an account's requests are signed with. */
function readKey(auth) {
  if (!auth || typeof auth !== "object") return undefined;
  if (auth.type === "api") return auth.key;
  if (auth.type === "oauth") return auth.access;
  if (auth.type === "wellknown") return auth.key ?? auth.token;
  return auth.key ?? auth.token;
}
