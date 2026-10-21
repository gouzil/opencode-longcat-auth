# opencode-longcat-auth

An [OpenCode](https://opencode.ai) provider plugin for the [LongCat](https://longcat.chat) API platform. It adds a LongCat provider, lists the platform's models, and sends requests to LongCat with your own API key or OAuth token.

It also runs under [magpie](https://usemagpie.ai), which reads the extra fields this plugin carries — the icon, the concurrency limit, the usage report, and the sign-in marker — without OpenCode seeing them.

## Install

Install the package and list it in your `opencode.json`:

```bash
npm install opencode-longcat-auth
```

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-longcat-auth", { "apiBase": "https://api.longcat.chat" }]
  ]
}
```

`apiBase` is optional; it defaults to the Chinese edition. Set it when you want the global edition (`https://api.longcat.ai`) or a proxy in front of the platform.

> **On plugin paths.** OpenCode 1.x resolves a `plugin` entry by path or by package name, but a package that is only in the project's `node_modules` is not found by name — the name is looked up in OpenCode's own plugin cache. If `opencode models` does not list the provider, use the installed path instead:
>
> ```json
> { "plugin": [["/absolute/path/to/node_modules/opencode-longcat-auth", {}]] }
> ```
>
> The entry point is the same file either way.

## Sign in

```
opencode auth login
```

Choose **LongCat API key** and paste a key from the [platform's key page](https://longcat.chat/platform/api_keys). Keys are shaped `ak_…`.

You can also set the key in the environment instead:

```bash
export LONGCAT_API_KEY=ak_…
```

The plugin declares `LONGCAT_API_KEY` in its `env` field, so OpenCode reads it and signs requests with it without a stored account. Verified against OpenCode 1.19.3: a request sent with only that variable set is signed with it.

The plugin refuses a key that is empty, has whitespace in it, or is the placeholder from the docs, before it is sent anywhere.

## Models

| Model                 | Released   | Context | Max output | Notes                               |
| --------------------- | ---------- | ------- | ---------- | ----------------------------------- |
| `LongCat-2.5-Preview` | 2026-09-25 | 1M      | 262,144    | Multimodal; tool calling; reasoning |
| `LongCat-2.0`         | 2026-06-30 | 1M      | 131,072    | Reasoning; tool calling             |

Both are served under the OpenAI-compatible format. Select one with:

```
opencode run --model opencode-longcat-auth/LongCat-2.5-Preview
```

Six Flash models (`LongCat-Flash-Chat`, `LongCat-Flash-Thinking`, `LongCat-Flash-Thinking-2601`, `LongCat-Flash-Lite`, `LongCat-Flash-Omni-2603`, `LongCat-Flash-Chat-2602-Exp`) were retired on 2026-05-29 and are not offered.

When an account is signed in, the plugin reads the platform's own model list and offers anything it added after this plugin was written. A model the platform stopped serving is dropped. If the list cannot be read, the two models above are still offered.

### Thinking

LongCat's reasoning models take a `thinking` object rather than a `reasoning_effort` string:

```json
{
  "model": "opencode-longcat-auth/LongCat-2.5-Preview",
  "thinking": { "type": "enabled" }
}
```

`{"type": "disabled"}` turns thinking off. The field defaults to enabled when it is left out.

The plugin publishes three effort variants — `low`, `medium`, `high` — which map onto a thinking budget of 8,192 / 32,768 / 131,072 tokens. The platform's own maximum is 262,144.

## Editions

The platform runs two editions, and the plugin serves either:

| Edition        | Base URL                   | Billing |
| -------------- | -------------------------- | ------- |
| `cn` (default) | `https://api.longcat.chat` | yuan    |
| `global`       | `https://api.longcat.ai`   | USD     |

Pick one with the plugin's `edition` option, or point `apiBase` straight at it:

```json
{ "plugin": [["opencode-longcat-auth", { "edition": "global" }]] }
```

Every request carries an `x-longcat-edition` header naming the edition it was sent to.

## Configuration

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-longcat-auth",
      {
        "apiBase": "https://api.longcat.chat",
        "edition": "cn",
        "maxConcurrency": 4
      }
    ]
  ]
}
```

| Option           | Default                    | Meaning                                                             |
| ---------------- | -------------------------- | ------------------------------------------------------------------- |
| `apiBase`        | `https://api.longcat.chat` | Base URL every request goes to                                      |
| `edition`        | `cn`                       | Which edition `apiBase` should point at when it is not given        |
| `maxConcurrency` | `4`                        | How many requests an account may have in flight (magpie reads this) |

## Troubleshooting

**`Provider not found: opencode-longcat-auth`** — the plugin was not loaded. OpenCode 1.x looks a `plugin` name up in its own cache rather than the project's `node_modules`; use the installed path (see [Install](#install)). Run with `--print-logs` to see `failed to load plugin` and its reason.

**`incorrect api key`** — the key was refused. Get a fresh one from the [key page](https://longcat.chat/platform/api_keys) and sign in again. The plugin marks the account as needing a new sign-in and stops sending it requests until you do.

**`insufficient_quota` / `balance_exhausted`** — the key is valid but has no balance. This is reported as a sign-in problem because topping the account up is the fix.

**A model is missing** — the plugin could not read the platform's model list, so it fell back to the built-in catalog. The two models above are always offered; check the network path to `apiBase`.

**`Plugin export is not a function`** — an older plugin entry shape. This package's entry exports a single `{ id, server }` object; make sure the installed copy is this package's `index.mjs`.

## Development

```bash
bun install
bun test          # unit tests
bun run check     # the plugin's hooks, the way magpie checks them
bun run fmt       # format
bun run ci        # fmt:check, test, check
```

`bun run try` runs the plugin in a sandbox against a local stand-in for the LongCat API — it starts the stand-in itself, so no request leaves the machine, no real key is needed, and nothing is left running afterwards:

```bash
bun run try          # uses $OPENCODE, then opencode from PATH
bun run try /path/to/opencode
```

To run the stand-in on its own, `bun run mock` serves it on `$MOCK_PORT` (default 4100); `GET /__hits` reports what it recorded.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the conventions this repository holds to, and [CLAUDE.md](CLAUDE.md) for the same in a form an agent can act on.

## License

[MIT](LICENSE)
