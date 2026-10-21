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
