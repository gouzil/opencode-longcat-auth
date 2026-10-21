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

**A cost is flat in the config hook, nested in the resolved Model.** The two halves name the prompt-cache rate differently: a config entry carries models.dev's `cache_read`/`cache_write`, a resolved Model carries `cache.read`/`cache.write`. The config hook must use the flat names — a nested `cache` there is silently dropped by OpenCode's converters, which would price every cached token at the full input rate. `mergeCost` in `src/models.mjs` is the only place the two are joined, and it emits the nested shape alone.

**Prices are per million tokens, in dollars.** `PRICES` in `src/constants.mjs` is the platform's discounted **dollar** table, and models.dev — whose `cost` object OpenCode reads directly — stores the same convention (`anthropic/claude-sonnet-4-6` is `{"input":3,"output":15}`, Anthropic's $3/$15 per 1M). A factor of 10^6 wrong here is the difference between a session costing cents and costing a fortune. `scripts/check.mjs` asserts the published numbers on both halves, so a regression fails CI rather than shipping.

**The model-detail endpoint publishes the yuan table, not the dollar one.** `GET /openai/v1/models/{id}` answers `{"pricing":{"prompt":"2","completion":"8","cached_tokens":"0.04"}}` on **both** editions — the global one too, whose docs show it beside the dollar table. `discoverPrice` converts by `USD_PER_CNY` and the converted value is what reaches the model. Copying the endpoint's numbers straight onto `cost` would put a 6.67× overcharge on every session, which is worse than the zero price it replaced. `USD_PER_CNY` is the _reciprocal_ of the page's 6.666… (`3/20`), so `2 * (3/20)` is exactly `0.3` while `2 / 6.667` is `0.2999850007499625`.

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
- **A cost is per million tokens, and the config hook wants it flat.** OpenCode's runtime price function divides by `1e6` (`…mul($(R?.input??0)).div(1e6)`), and models.dev — the source OpenCode's own providers come from — stores the same convention. Its config-hook converters read `cache_read`/`cache_write`, not a nested `cache`; the nested form belongs to the resolved `Model` that `provider.models` returns.
- **A model's cost is read, not decorative.** The runtime computes a per-message cost from `cost` and a session total is their sum, displayed in USD with no conversion. A model with `cost.input === 0` does not show as cheap — it shows as free, and the whole session reads as $0.00.

## Verified against the LongCat platform

These were established by fetching the platform's own endpoints and docs, not by reading its source.

- **The model-detail endpoint answers the yuan table, on both editions.** `GET /openai/v1/models/LongCat-2.5-Preview` returns `{"pricing":{"prompt":"2","completion":"8","cached_tokens":"0.04"}}` from `api.longcat.chat` _and_ `api.longcat.ai`. The docs' own example payload is the same yuan numbers, on every edition. The dollar table lives only on the pricing pages.
- **The endpoint is not a usable liveness check.** It answers `200` with a `pricing` body for a key it has never seen, as long as the key is past a length threshold (probed: `ak_` + 27 digits answers 200, +26 answers 401 `incorrect api key`). The model-list endpoint refuses an unrecognised key outright. This is why `auth.usage` keys on the model-list read and not on this one.
- **The pricing pages carry both currencies, and they are a fixed conversion.** `¥2 / ¥0.04 / ¥8` and `$0.30 / $0.006 / $1.20` are the same rates; the two editions differ only in billing currency.
- **The discounted rates are explicitly limited-time.** The page calls them 折扣价 / 限时 and says the platform's own page and billing records are authoritative, so the built-in table is a hint and not a quote.

## Verified against magpie's plugin host

Read from magpie's own host bundle and its sign-in UI, not from its docs.

- **An `api` method declares no `authorize`.** magpie's UI sends the typed key as a top-level argument — `api("plugin-signin", {provider, method, inputs, key})` — and its host stores it directly when the method has no `authorize`. When the method _has_ one, the host calls it with `m.authorize(inputs ?? {})`: `inputs` holds the answers to a method's prompts, and a method with no `prompts` gets `{}`. An `authorize` that looked for the key in `inputs` therefore saw an empty key on every login. OpenCode's own providers declare `api` methods the same way, and its desktop returns before an api method's `authorize` is reached.
- **The edition is read at request time, not at sign-in.** With no `authorize` to record it, `editionOf(key)` in the loader is what puts `x-longcat-edition` on a request.
- **A plugin's model `cost` is read by magpie, in both shapes.** Its host normalizes with `cost(c) = { input: c?.input ?? 0, output: c?.output ?? 0, cache: { read: c?.cache_read ?? c?.cache?.read ?? 0, write: c?.cache_write ?? c?.cache?.write ?? 0 } }` (`host-*.js`, `function cost(c)`), so the flat names a config entry carries are understood as well as the nested ones. This is why the config hook may declare the flat shape: magpie does not drop it, and neither does OpenCode.
- **A plugin's `auth.usage` may not invent a quota.** magpie renders `windows` as the platform's own allowance, so a window the plugin cannot back with a read would show a fabricated number as if it came from the platform. The platform publishes no balance endpoint — its pay-as-you-go page points balance and usage at its own console — so the honest answer is `windows: []` plus a plan that names where the balance is. `signIn: "kept"` is the host's own signal that a read succeeded and an account's "sign in again" mark should clear.
