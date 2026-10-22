#!/usr/bin/env bun
/**
 * Load the plugin the way magpie does and check its hooks.
 *
 * magpie runs every plugin through this before publishing: it loads each entry
 * file, calls the plugin function, and asserts the hooks it promised are there.
 * Running the same check here means a hook that stopped being returned is
 * caught before it reaches a user.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const entries = ["index.mjs", path.join("src", "provider.mjs")];

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`,
  );
};

/** The hooks magpie requires from a provider plugin. */
const REQUIRED = ["config", "auth", "provider"];

for (const entry of entries) {
  const file = path.join(root, entry);
  let mod;
  try {
    mod = await import(pathToFileURL(file).href);
  } catch (error) {
    check(`${entry} loads`, false, error.message);
    continue;
  }
  check(`${entry} loads`, true);

  // magpie loads the first exported plugin: exports["./server"], then main,
  // then exports["."]; and every exported function is a plugin. The entry also
  // carries the OpenCode v1 `{ id, server }` form, where the function is a
  // property rather than the export itself.
  const candidates = [
    mod.default,
    mod.default?.server,
    mod.server,
    ...Object.values(mod),
  ].filter((value) => typeof value === "function");
  check(
    `${entry} exports a plugin function`,
    candidates.length > 0,
    `${candidates.length} found`,
  );

  const plugin = candidates[0];
  let hooks;
  try {
    hooks = await plugin({ project: {}, directory: root, client: {} }, {});
  } catch (error) {
    check(`${entry} runs`, false, error.message);
    continue;
  }
  check(`${entry} runs`, true);

  for (const name of REQUIRED) {
    check(`${entry} returns the ${name} hook`, hooks[name] != null);
  }

  // The auth hook's own shape. The id is read from the hooks rather than
  // hardcoded: the plugin's id is its own, not the built-in provider's.
  const auth = hooks.auth;
  check(
    "auth names the plugin's provider",
    typeof auth?.provider === "string" &&
      auth.provider.length > 0 &&
      auth.provider !== "longcat",
    auth?.provider,
  );
  check(
    "auth offers at least one login method",
    Array.isArray(auth?.methods) && auth.methods.length > 0,
  );
  check(
    "every method has a label",
    auth.methods.every(
      (m) => typeof m.label === "string" && m.label.length > 0,
    ),
  );

  // A method that takes a typed key is declared without `authorize`. magpie's
  // host passes the key to the host itself, not into `authorize` (which gets
  // the answers to prompts), and OpenCode never reaches an api method's
  // `authorize`. Declaring one that reads the key from `inputs` is how a login
  // comes to fail with an empty key.
  const apiMethods = auth.methods.filter((m) => m.type === "api");
  check(
    "api methods declare no authorize",
    apiMethods.every((m) => typeof m.authorize !== "function"),
    `${apiMethods.length} api method(s)`,
  );

  // The config hook must not overwrite a provider the user configured.
  const id = auth.provider;
  const cfg = { provider: { [id]: { name: "Mine" } } };
  await hooks.config?.(cfg);
  check(
    "config keeps the user's own provider",
    cfg.provider[id].name === "Mine",
  );

  const bare = { provider: {} };
  await hooks.config?.(bare);
  check(
    "config declares the provider when absent",
    bare.provider[id]?.name === "LongCat",
  );

  // The models hook must list the platform's models.
  const models = await hooks.provider?.models?.(
    { models: {} },
    { auth: { type: "api", key: "ak_test_0123456789" } },
  );
  const ids = Object.keys(models ?? {});
  check(
    "the models hook lists LongCat-2.5-Preview",
    ids.includes("LongCat-2.5-Preview"),
  );
  check("the models hook lists LongCat-2.0", ids.includes("LongCat-2.0"));
  check(
    "the models hook drops retired models",
    !ids.includes("LongCat-Flash-Chat"),
  );

  const model = models?.["LongCat-2.5-Preview"];
  check(
    "each model carries its limits",
    model?.limit?.context === 1048576 && model?.limit?.output === 262144,
  );
  check(
    "each model names its API",
    model?.api?.url?.includes("api.longcat.chat"),
  );

  // The resolved Model is the shape OpenCode's cost function reads. Zero here
  // means a session costs nothing, which reads as free rather than as unpriced —
  // the failure the published rates exist to prevent.
  check(
    "each model carries its published price",
    model?.cost?.input === 0.3 &&
      model?.cost?.output === 1.2 &&
      model?.cost?.cache?.read === 0.006,
    `input=${model?.cost?.input} output=${model?.cost?.output} cache=${model?.cost?.cache?.read}`,
  );
  check(
    "a model's price is a real discount for cached tokens",
    model?.cost?.cache?.read > 0 &&
      model?.cost?.cache?.read < model?.cost?.input,
  );

  // The config hook's half is read in models.dev's flat shape, so the cache
  // rate is `cache_read` there and a nested `cache` would be dropped.
  const declared = bare.provider[id]?.models?.["LongCat-2.5-Preview"];
  check(
    "the config hook declares the price in the flat shape",
    declared?.cost?.input === 0.3 &&
      declared?.cost?.output === 1.2 &&
      declared?.cost?.cache_read === 0.006 &&
      declared?.cost?.cache === undefined,
    `cache_read=${declared?.cost?.cache_read}`,
  );

  // magpie's usage hook. The platform publishes no balance endpoint, so a
  // window would be an invented number: the contract this plugin honours is
  // "no window" plus a plan that names where the balance is.
  // The plugin's own fetch is used only when an option sets one; this check
  // passes a stand-in that answers the model list, so nothing leaves the
  // process and the read is a success rather than a network failure.
  const usageHooks = await candidates[0](
    { project: {}, directory: root, client: {} },
    {
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "LongCat-2.5-Preview" }],
          }),
          { status: 200 },
        ),
    },
  );
  const usage = await usageHooks.auth.usage?.(async () => ({
    type: "api",
    key: "ak_test_0123456789",
  }));
  check(
    "the usage hook invents no quota window",
    Array.isArray(usage?.windows) && usage.windows.length === 0,
    `${usage?.windows?.length ?? "no"} windows`,
  );
  check(
    "a successful usage read keeps the account",
    usage?.signIn === "kept",
    usage?.signIn ?? "(none)",
  );

  // The live-price read. The model-detail endpoint publishes the *yuan* table,
  // so a rate read there must land on the model in the dollars OpenCode's cost
  // function is in. A read copied across unconverted would put a 6.67×
  // overcharge on every session, which is worse than the zero it replaced.
  const pricedHooks = await candidates[0](
    { project: {}, directory: root, client: {} },
    {
      fetchImpl: async (url) => {
        if (/\/models\/[^/]+$/.test(String(url))) {
          return new Response(
            JSON.stringify({
              id: "LongCat-2.5-Preview",
              pricing: { prompt: "2", completion: "8", cached_tokens: "0.04" },
            }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({
            object: "list",
            data: [{ id: "LongCat-2.5-Preview" }],
          }),
          { status: 200 },
        );
      },
    },
  );
  const priced = await pricedHooks.provider.models(
    { models: {} },
    { auth: { type: "api", key: "ak_test_0123456789" } },
  );
  const live = priced?.["LongCat-2.5-Preview"]?.cost;
  check(
    "a live yuan price lands on the model in dollars",
    live?.input === 0.3 && live?.output === 1.2 && live?.cache?.read === 0.006,
    `input=${live?.input} output=${live?.output} cache=${live?.cache?.read}`,
  );

  // The loader must produce a fetch and a key.
  const loaderOptions = await hooks.auth.loader?.(async () => ({
    type: "api",
    key: "ak_test_0123456789",
  }));
  check(
    "the loader returns a fetch",
    typeof loaderOptions?.fetch === "function",
  );
  check(
    "the loader returns the key",
    loaderOptions?.apiKey === "ak_test_0123456789",
  );
  check(
    "the loader returns a base URL",
    typeof loaderOptions?.baseURL === "string",
  );

  const none = await hooks.auth.loader?.(async () => undefined);
  check(
    "the loader returns nothing without an account",
    Object.keys(none ?? {}).length === 0,
  );
}

// The package must be publishable as magpie and OpenCode both load it.
const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
check(
  "package.json names the package",
  typeof pkg.name === "string" && pkg.name.length > 0,
);
check("package.json declares a main", typeof pkg.main === "string");
check(
  "package.json has no runtime dependencies",
  !pkg.dependencies || Object.keys(pkg.dependencies).length === 0,
);
check(
  "magpie fields are present",
  typeof pkg.magpie?.icon === "string" &&
    typeof pkg.magpie?.maxConcurrency === "number",
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} checks passed`,
);
process.exit(failed.length ? 1 : 0);
