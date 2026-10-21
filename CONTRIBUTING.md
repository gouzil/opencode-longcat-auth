# Contributing

Thanks for taking the time to contribute.

## Getting set up

```bash
git clone git@github.com:gouzil/opencode-longcat-auth.git
cd opencode-longcat-auth
bun install
bun test
```

There are no runtime dependencies and no build step — the plugin is plain `.mjs` that OpenCode loads directly.

## Before opening a pull request

Run the checks:

```bash
bun run ci
```

That is formatting, the unit tests, and the plugin check. It is what CI runs, so a green local run is a green CI run.

The git hook is configured in `prek.toml`. Install it once after cloning:

```bash
prek install
```

`prek run` checks the staged files and `prek run --all-files` checks everything; CI runs the same hooks.

If your change touches what the hooks produce, also run the end-to-end check:

```bash
bun run try
```

It needs an `opencode` binary: pass its path as the argument, or set `$OPENCODE`, or have `opencode` on `PATH`. It builds a throwaway HOME, points the plugin at a local stand-in for the LongCat API, and reports the models the picker lists and the request a session sends. The unit tests do not load OpenCode, so they cannot catch a shape OpenCode rejects — this can.

A binary that is not there is reported as such. If it were not, the run would look like a plugin that listed no models, and you would go looking in the wrong place.

## What to know before you change things

Read [CLAUDE.md](CLAUDE.md) for the full set. The short version:

- **No runtime dependencies.** If you think you need one, say so in the PR first.
- **The entry exports exactly one plugin.** OpenCode treats every exported function as a plugin, so a helper exported from `index.mjs` breaks loading. Put helpers in `src/`.
- **The provider id is `opencode-longcat-auth`.** OpenCode already carries a built-in LongCat provider, and a plugin declaring `longcat` has its declaration overridden. Do not rename it.
- **The `config` hook declares the models.** OpenCode reads a provider's models from the config when the config has them and does not then call `provider.models`.
- **A cost is flat in the config hook, nested in the resolved Model.** The config hook carries models.dev's `cache_read`/`cache_write`; the resolved `Model` carries `cache.read`/`cache.write`. `mergeCost` in `src/models.mjs` joins the two, and it emits the nested shape alone.
- **Prices are per million tokens, in dollars.** The platform quotes per million and so does models.dev, which is what OpenCode reads. A factor of 10^6 wrong here is the difference between a session costing cents and costing a fortune.
- **The model-detail endpoint answers in yuan.** It returns `{"pricing":{"prompt":"2",…}}` — the yuan half of the platform's table — on both editions, so a rate read there must be converted by `USD_PER_CNY` before it lands on a model's `cost`.
- **Comments record why.** A comment that restates the line below it is noise; one that records a platform quirk, a verified OpenCode behavior, or a decision and its reason is the point. Several comments here record behavior verified against a real OpenCode binary — keep that standard.
- **No secrets.** Never commit a key, and never log one.

## Adding a model

Add it to `MODEL_LIMITS` in `src/constants.mjs`. Everything else follows: `CATALOG` in `src/models.mjs` builds from it, the limits and the release date are carried into the picker, and the config hook's declaration picks it up.

A new model gets the `PRICES` table unless the platform prices it differently — it serves one table for every model today. The plugin also reads each model's own rate from the model-detail endpoint, which answers the platform's **yuan** table on both editions; `discoverPrice` converts it into the dollars OpenCode displays. The built-in table stays the floor for a model the endpoint does not price.

If the platform has retired a model, add it to `RETIRED` with the reason rather than deleting it, so an agent that names it is told why it is not offered.

## Adding a test

Tests live beside the module they cover: `src/keys.test.mjs` tests `src/keys.mjs`. Use `bun:test` and keep the test on the behavior, not on the implementation — the point is that the behavior survives a refactor.

## Commits

- One change per commit.
- A subject line that says what changed, in the imperative.
- A body that says why, when the subject does not already.
- End the message with:

  ```
  Co-Authored-By: Claude Code <noreply@anthropic.com>
  ```

  when a Claude Code agent helped with the change. Do not add it otherwise.

## Pull requests

- Describe what changed and why.
- Note anything you verified with `bun run try` and anything you could not verify.
- End the description with:

  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

  when a Claude Code agent helped write it.

## Reporting a problem

Open an issue with:

- the plugin version,
- your OpenCode version (`opencode --version`),
- what you expected and what happened,
- and, if the provider is missing from `opencode models`, the output of `opencode models --print-logs`, which names the reason a plugin failed to load.

Do not include your API key. `ak_…` values are credentials.
