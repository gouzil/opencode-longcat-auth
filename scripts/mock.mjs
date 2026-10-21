/**
 * A local stand-in for the LongCat API.
 *
 *   bun scripts/mock.mjs [port]
 *
 * `bun run try` needs something to point the plugin at. This serves the two
 * endpoints OpenCode's AI SDK uses — `GET /openai/v1/models` and
 * `POST /openai/v1/chat/completions` — and records every request so the script
 * can report what the plugin sent.
 *
 * No request leaves the machine and no key is needed. `GET /__hits` returns what
 * was recorded; `GET /__reset` clears it.
 */

const port = Number(process.env.MOCK_PORT ?? process.argv[2] ?? 4100);

/** Every request this mock has seen, newest last. */
const hits = [];

/** The models the stand-in offers, including one the catalog does not describe. */
const MODELS = ["LongCat-2.5-Preview", "LongCat-2.0", "LongCat-2.5-Flash"];

/** A JSON answer. `Bun.serve` wants a `Response`, not a Node-style writable. */
function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const server = Bun.serve({
  port,
  hostname: "127.0.0.1",
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/__hits") return json(200, hits);
    if (path === "/__reset") {
      hits.length = 0;
      return json(200, { ok: true });
    }

    const auth = request.headers.get("authorization") ?? "";
    const signed = auth.startsWith("Bearer ") && auth.length > 7;

    // The endpoints are matched on their tail, so a stand-in pointed at by
    // `apiBase` serves them at the root and a stand-in pointed at by a model's
    // own `api.url` serves them under the format path. Both are the platform's
    // endpoints.
    if (request.method === "GET" && path.endsWith("/models")) {
      hits.push({
        method: "GET",
        path,
        auth,
        client: request.headers.get("x-opencode-longcat-client"),
      });
      if (!signed)
        return json(401, {
          error: {
            code: "invalid_api_key",
            message: "missing_api_key",
            type: "authentication_error",
          },
        });
      return json(200, {
        object: "list",
        data: MODELS.map((id) => ({ id, owned_by: "LongCat" })),
      });
    }

    if (request.method === "POST" && path.endsWith("/chat/completions")) {
      const raw = await request.text();
      let body = {};
      try {
        body = raw ? JSON.parse(raw) : {};
      } catch {
        body = { __raw: raw };
      }
      hits.push({
        method: "POST",
        path,
        auth,
        client: request.headers.get("x-opencode-longcat-client"),
        edition: request.headers.get("x-longcat-edition"),
        body,
      });
      if (!signed)
        return json(401, {
          error: {
            code: "invalid_api_key",
            message: "missing_api_key",
            type: "authentication_error",
          },
        });
      return json(200, {
        id: "chatcmpl-mock",
        object: "chat.completion",
        created: 1,
        model: body.model ?? "LongCat-2.5-Preview",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "pong" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
    }

    return json(404, {
      error: {
        code: "not_found",
        message: `no such endpoint: ${request.method} ${path}`,
      },
    });
  },
});

console.log(`LongCat stand-in on http://127.0.0.1:${server.port}`);
console.log("  GET  /openai/v1/models");
console.log("  POST /openai/v1/chat/completions");
console.log("  GET  /__hits   (what was recorded)");
console.log("  GET  /__reset  (clear it)");
