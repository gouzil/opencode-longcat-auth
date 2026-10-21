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
  API_DOCS,
  API_KEY_ENV,
  API_KEYS,
  DOCS,
  EDITIONS,
  ICON,
  PROVIDER,
  PROVIDER_NAME,
  SDK,
  USER_AGENT,
} from "./constants.mjs";
import { editionOf, fingerprint, isPlatformKey, isUnusable } from "./keys.mjs";
import {
  buildModels,
  configModels,
  configProvider,
  discoverModels,
  isRetired,
  retiredReason,
} from "./models.mjs";
import { chatHeaders, createFetch } from "./fetch.mjs";
import { thinkingFor } from "./thinking.mjs";

/** How long a model-list read is waited for before the catalog is used. */
const DISCOVERY_TIMEOUT_MS = 15000;

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
        {
          type: "api",
          label: "LongCat API key",
          placeholder: "ak_…",
          async authorize(inputs) {
            const given = inputs?.key?.trim() ?? "";
            const problem = isUnusable(given);
            if (problem) {
              return {
                type: "failed",
                error:
                  problem === "placeholder"
                    ? "That is the placeholder from the docs. Paste your own key."
                    : `That key is ${problem}. Paste the key from ${API_KEYS}.`,
              };
            }
            const edition = inputs?.edition ?? editionOf(given);
            return {
              type: "success",
              key: given,
              metadata: {
                edition,
                label: fingerprint(given),
                ...(isPlatformKey(given) ? {} : { shape: "other" }),
              },
            };
          },
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
      /** magpie only: how much of the plan this account has used. */
      async usage(getAuth) {
        const auth = await getAuth();
        const key = auth ? readKey(auth) : undefined;
        if (!key) return { plan: "API 按量付费", windows: [] };

        const { error } = await discoverModels({ apiBase, key, fetchImpl });
        return error
          ? { plan: "API 按量付费", error, windows: [] }
          : { plan: "API 按量付费", windows: [] };
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
        });
        if (error || ids.length === 0) {
          // The platform could not be read. Keep the catalog rather than
          // dropping the account, and tell magpie the list fell back.
          const result = buildModels({ apiBase, providerModels: stored });
          if (error) result[Symbol.for("magpie.fellBack")] = true;
          return result;
        }
        return buildModels({ apiBase, providerModels: stored, known: ids });
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

/** The key an account's requests are signed with. */
function readKey(auth) {
  if (!auth || typeof auth !== "object") return undefined;
  if (auth.type === "api") return auth.key;
  if (auth.type === "oauth") return auth.access;
  if (auth.type === "wellknown") return auth.key ?? auth.token;
  return auth.key ?? auth.token;
}

export {
  API_DOCS,
  API_KEYS,
  DOCS,
  PROVIDER,
  retiredReason,
  DISCOVERY_TIMEOUT_MS,
};
export default LongCatAuthPlugin;
