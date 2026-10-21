# CLAUDE.md

Guidance for agents working in this repository.

## What this is

An OpenCode provider plugin for the LongCat API platform. One plugin function (`src/provider.mjs`) declares one provider (`opencode-longcat-auth`), its models, an API-key login, and a fetch that sends each account's requests to the platform.

It also runs under magpie, which reads extra fields (`auth.usage`, `auth.refresh`, `auth.icon`, `auth.maxConcurrency`) that OpenCode ignores.

## Commands

```bash
bun test            # unit tests, one file per module next to the module
bun run check       # the plugin's hooks, the way magpie checks them
bun run no-api-key  # no LongCat key in the tree
bun run fmt         # prettier
bun run fmt:check   # prettier, read-only
bun run ci          # fmt:check + test + check
bun run try         # end-to-end against a local stand-in; needs opencode
```

`bun run ci` is what CI runs. `bun run try` needs an `opencode` binary — its path as the argument, or `$OPENCODE`, or `opencode` on `PATH` — and is not part of CI.

## The git hook

`prek.toml` configures prek, and `prek install` puts it in `.git/hooks/pre-commit`. Run `prek run` to check the staged files, or `prek run --all-files`. CI runs the same hooks, so a green local run is a green CI run.

The config is prek's own TOML, not `.pre-commit-config.yaml`: the `builtin` repo needs nothing fetched, and the one external check this project needs is a local hook anyway.

## Layout

```
index.mjs              the entry point; exports exactly one plugin
src/provider.mjs       the plugin: hooks, auth, models, params, headers
src/models.mjs         the model catalog and the shape the picker reads
src/constants.mjs      ids, URLs, limits, editions
src/keys.mjs           key reading, the platform key shape, the edition marker
src/thinking.mjs       LongCat's thinking field and the effort-variant mapping
src/errors.mjs         the sign-in marker, the platform's error shape
src/fetch.mjs          the fetch handed to the AI SDK, and chat.headers
scripts/check.mjs      loads the entry and asserts the hooks
scripts/no-api-key.mjs refuses a LongCat key in the tree
scripts/mock.mjs       a stand-in for the LongCat API
scripts/try.mjs        the sandbox runner
scripts/try.sh         its shell entry
prek.toml             the git hook
```

Tests live beside the module they cover: `src/keys.test.mjs` tests `src/keys.mjs`.

## Conventions

**No runtime dependencies.** The plugin ships as plain `.mjs` and is loaded directly. `devDependencies` stays empty; if a change needs a package, say so in the PR rather than adding one quietly.

**One plugin export.** `index.mjs` exports exactly one plugin. OpenCode treats every exported _function_ as a plugin, so a helper exported from the entry is a second plugin and loading fails with `Plugin export is not a function`. Anything a test needs goes in `src/`, not in the entry.

**The provider id is the plugin's own.** `PROVIDER` is `opencode-longcat-auth`, not `longcat`. OpenCode already carries a built-in LongCat provider from models.dev, and a plugin that declares that id has its declaration overridden. Do not rename it.

**Two model shapes, both read.** The `config` hook is read in models.dev's flat shape (`reasoning`, `tool_call`, `attachment`, `modalities`, `limit`, `cost`, `variants`); the resolved `Model` carries the same flags nested under `capabilities`. `buildModels` in `src/models.mjs` merges both, so a model declared either way keeps its fields. Keep that merge working when touching either side.

**The config hook declares the models.** OpenCode resolves a provider's models from the config when the config has them and does not then call `provider.models`. Declaring them in `config` is what puts them in the picker; `provider.models` then re-reads them per account. Do not move the declaration out of `config`.

**A request body is never rewritten in the fetch.** `createFetch` sets headers and marks a refused login; it does not touch the body. The `thinking` field is written by `chat.params`, where the model's options are in hand. Rewriting the body in the fetch would drop fields the options already put there.

**Errors that mean "sign in again" are thrown, not returned.** `signInExpired` in `src/errors.mjs` is the only place that sets `signIn: "expired"`, and OpenCode and magpie both read it. A non-2xx that is not a refusal is passed through untouched — both hosts treat it as the platform's own answer.

**The sign-in marker's message names the fix.** A 401 whose code is `invalid_api_key`, `insufficient_quota` or `balance_exhausted` points at the key page; anything else points at `opencode auth login`.

**An `api` login is declared without `authorize`.** Both hosts treat that as the shape that carries a typed key: magpie's host stores the key it is handed, and OpenCode never reaches an api method's `authorize`. A method that declared `authorize(inputs)` and read the key from `inputs` failed every login with an empty key, because `inputs` holds prompt answers and a method with no prompts gets none.

**Comments say why, not what.** The codebase is commented for a reader who can see the code. A comment that restates the line below it is noise; a comment that records a platform quirk, a verified OpenCode behavior, or a decision and its reason is the point. Several comments here record behavior that was verified against a real OpenCode binary — keep that standard.

**No secrets.** Keys are read from `auth.json` or the environment. A key is never logged. Never ask for a key in chat or commit one.

## Testing

`bun test` covers each module. When adding behavior, add the test beside it.

`bun run check` loads `index.mjs` and `src/provider.mjs` the way magpie does and asserts the hooks and their shape. It is the guard against a hook that stopped being returned.

`bun run try` is the only check that runs the real binary. It builds a throwaway HOME, points the plugin at `scripts/mock.mjs`, and reports the models the picker lists and the request a session sends. Run it after changing anything the hooks produce — the unit tests do not load OpenCode, so they cannot catch a shape OpenCode rejects.

It takes the binary from its argument, then `$OPENCODE`, then `opencode` on `PATH`. A binary it cannot run is reported by name: opencode produces no output in that case, and an empty listing would read as a plugin that declared no models.

## Verified against OpenCode 1.19.3

These were established by running the real binary, not by reading its source. They are why several decisions above look the way they do.

- A `plugin` entry by **package name** does not resolve from the project's `node_modules`; OpenCode looks the name up in its own plugin cache. An **absolute path** to the installed package loads. `scripts/try.mjs` uses the path.
- The `plugins` config key is **not** read by 1.x — it is reported as an unsupported native setting and omitted. Use `plugin` (deprecated but honored).
- When the config hook declares models, `provider.models` is not called. Hence the declaration in `config`.
- `opencode run` leaves a TUI behind when its output is a pipe, so it must be run with a timeout.

## Verified against magpie's plugin host

Read from magpie's own host bundle and its sign-in UI, not from its docs.

- **An `api` method declares no `authorize`.** magpie's UI sends the typed key as a top-level argument — `api("plugin-signin", {provider, method, inputs, key})` — and its host stores it directly when the method has no `authorize`. When the method _has_ one, the host calls it with `m.authorize(inputs ?? {})`: `inputs` holds the answers to a method's prompts, and a method with no `prompts` gets `{}`. An `authorize` that looked for the key in `inputs` therefore saw an empty key on every login. OpenCode's own providers declare `api` methods the same way, and its desktop returns before an api method's `authorize` is reached.
- **The edition is read at request time, not at sign-in.** With no `authorize` to record it, `editionOf(key)` in the loader is what puts `x-longcat-edition` on a request.
