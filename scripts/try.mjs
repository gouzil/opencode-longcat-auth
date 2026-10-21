/**
 * Run the plugin in a sandbox that cannot reach your real OpenCode.
 *
 *   bun scripts/try.mjs [opencode-path]
 *
 * The binary is taken from the argument, then `OPENCODE`, then `opencode` on
 * PATH. A binary that cannot be run is reported as such rather than as a plugin
 * that listed no models — the two look alike otherwise.
 *
 * This starts the stand-in for the LongCat API itself, so it needs nothing else.
 * The stand-in is stopped when the run ends.
 *
 * The plugin is copied into a throwaway HOME, so your own config, auth.json and
 * sessions are untouched. The sandbox is pointed at the stand-in, so no request
 * leaves the machine and no real key is needed.
 *
 * What it shows: the provider's models in `opencode models`, and the request a
 * session sends — the headers, the endpoint, and the body the plugin built.
 *
 * This needs opencode (https://opencode.ai).
 */

import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bin = process.argv[2] ?? process.env.OPENCODE ?? "opencode";
const port = Number(process.env.MOCK_PORT ?? 4100);
const mock = `http://127.0.0.1:${port}`;

const sandbox = mkdtempSync(path.join(tmpdir(), "longcat-try-"));
const plugin = path.join(
  sandbox,
  "proj",
  "node_modules",
  "opencode-longcat-auth",
);
mkdirSync(path.join(sandbox, ".config", "opencode"), { recursive: true });
mkdirSync(path.join(sandbox, ".local", "share", "opencode"), {
  recursive: true,
});
mkdirSync(path.join(sandbox, "proj"), { recursive: true });

cpSync(path.join(root, "index.mjs"), path.join(plugin, "index.mjs"));
cpSync(path.join(root, "src"), path.join(plugin, "src"), { recursive: true });
cpSync(path.join(root, "package.json"), path.join(plugin, "package.json"));

// The plugin's own options are how a proxy or a stand-in is pointed at; this is
// the same shape a user would write in opencode.json. The plugin is referenced
// by path rather than by package name: OpenCode 1.x's `plugin` setting resolves
// a name through its own plugin cache, and a package that is only in the
// project's node_modules is not found there. The installed entry point is the
// same file either way.
writeFileSync(
  path.join(sandbox, ".config", "opencode", "opencode.json"),
  JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugin: [[plugin, { apiBase: mock }]],
  }),
);
writeFileSync(
  path.join(sandbox, ".local", "share", "opencode", "auth.json"),
  JSON.stringify({
    "opencode-longcat-auth": {
      type: "api",
      key: "ak_sandbox_0123456789",
      metadata: { label: "sandbox" },
    },
  }),
);

const env = {
  ...process.env,
  HOME: sandbox,
  XDG_DATA_HOME: `${sandbox}/.local/share`,
  XDG_CONFIG_HOME: `${sandbox}/.config`,
  XDG_CACHE_HOME: `${sandbox}/.cache`,
  OPENCODE_DISABLE_AUTOUPDATE: "true",
};

/** Wait for the stand-in to answer, so a slow start does not read as a failure. */
async function waitForMock(attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(`${mock}/__hits`);
      if (response.ok) return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  return false;
}

const hits = async () => {
  try {
    return await (await fetch(`${mock}/__hits`)).json();
  } catch {
    return [];
  }
};
const reset = async () => {
  try {
    await fetch(`${mock}/__reset`);
  } catch {}
};

/**
 * Run opencode in the sandbox. `run` leaves a TUI behind, so it is bounded.
 *
 * A binary that is not there, or is not executable, is not a run that failed —
 * opencode produced nothing at all, and reporting that as "no models listed"
 * sends the reader looking at the plugin. The cause is named instead.
 */
function run(args, timeout = 90000) {
  const result = spawnSync(bin, args, {
    env,
    cwd: path.join(sandbox, "proj"),
    encoding: "utf8",
    timeout,
  });
  // `run` leaves its TUI behind, so the timeout below is the normal way a chat
  // ends rather than a failure — the request it came to make is already recorded.
  const timedOut = result.error?.code === "ETIMEDOUT";
  if (result.error && !timedOut) {
    throw new Error(`could not run ${bin}: ${result.error.message}`);
  }
  return {
    status: result.status,
    signal: result.signal ?? null,
    timedOut,
    out: `${result.stdout ?? ""}\n${result.stderr ?? ""}`,
  };
}

// The stand-in is started as a child, so it is stopped however this ends.
const standin = spawn(
  process.execPath,
  [path.join(root, "scripts", "mock.mjs"), String(port)],
  {
    env: { ...process.env, MOCK_PORT: String(port) },
    stdio: "ignore",
  },
);
let standinPid = standin.pid;

try {
  if (!(await waitForMock())) {
    console.log(`the stand-in did not come up on ${mock}`);
    process.exitCode = 1;
  } else {
    console.log(`sandbox: ${sandbox}`);
    console.log(`stand-in: ${mock}`);

    console.log("\n== models ==");
    await reset();
    const models = run(["models"]);
    const lines = models.out
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const mine = lines.filter((l) => l.startsWith("opencode-longcat-auth/"));
    console.log(mine.join("\n") || "(no LongCat models listed)");
    const loadError = lines.find((l) => l.includes("failed to load plugin"));
    if (loadError) console.log(`  ${loadError}`);

    console.log("\n== one request ==");
    await reset();
    const chat = run([
      "run",
      "--model",
      "opencode-longcat-auth/LongCat-2.5-Preview",
      "--agent",
      "build",
      "--auto",
      "reply with the single word: pong",
    ]);
    const real = (await hits()).filter((h) => !h.path.startsWith("/__"));
    if (real.length === 0) {
      console.log(
        `  (no request reached the stand-in — opencode exited ${chat.status}${
          chat.signal ? ` (${chat.signal})` : ""
        })`,
      );
    } else {
      const seen = new Set();
      for (const hit of real) {
        const line = `  ${hit.method} ${hit.path}  auth=${hit.auth}  client=${hit.client}  edition=${hit.edition}`;
        if (seen.has(line)) continue;
        seen.add(line);
        console.log(line);
        if (hit.body && typeof hit.body === "object" && !hit.body.__raw) {
          console.log(
            `    model=${hit.body.model} thinking=${JSON.stringify(
              hit.body.thinking,
            )}`,
          );
        }
      }
    }
  }
} finally {
  try {
    process.kill(standinPid, "SIGTERM");
  } catch {
    /* already gone */
  }
  rmSync(sandbox, { recursive: true, force: true });
}
