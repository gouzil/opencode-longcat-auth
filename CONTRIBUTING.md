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

If your change touches what the hooks produce, also run the end-to-end check:

```bash
bun run try
```

It needs an `opencode` binary on `PATH`. It builds a throwaway HOME, points the plugin at a local stand-in for the LongCat API, and reports the models the picker lists and the request a session sends. The unit tests do not load OpenCode, so they cannot catch a shape OpenCode rejects — this can.

## What to know before you change things

Read [CLAUDE.md](CLAUDE.md) for the full set. The short version:

- **No runtime dependencies.** If you think you need one, say so in the PR first.
- **The entry exports exactly one plugin.** OpenCode treats every exported function as a plugin, so a helper exported from `index.mjs` breaks loading. Put helpers in `src/`.
- **The provider id is `opencode-longcat-auth`.** OpenCode already carries a built-in LongCat provider, and a plugin declaring `longcat` has its declaration overridden. Do not rename it.
- **The `config` hook declares the models.** OpenCode reads a provider's models from the config when the config has them and does not then call `provider.models`.
- **Comments record why.** A comment that restates the line below it is noise; one that records a platform quirk, a verified OpenCode behavior, or a decision and its reason is the point. Several comments here record behavior verified against a real OpenCode binary — keep that standard.
- **No secrets.** Never commit a key, and never log one.

## Adding a model

Add it to `MODEL_LIMITS` in `src/constants.mjs`. Everything else follows: `CATALOG` in `src/models.mjs` builds from it, the limits and the release date are carried into the picker, and the config hook's declaration picks it up.

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
