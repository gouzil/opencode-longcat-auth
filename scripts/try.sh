#!/usr/bin/env bash
# Run the plugin in a sandbox that cannot reach your real OpenCode.
#
#   scripts/try.sh [opencode-path]
#
# The plugin is copied into a throwaway HOME, so your own config, auth.json and
# sessions are untouched. The sandbox is pointed at a local stand-in for the
# LongCat API, so no request leaves the machine and no real key is needed.
#
# This needs opencode (https://opencode.ai) and a mock API on $MOCK_PORT.
#
# The binary is resolved by scripts/try.mjs: the argument, then $OPENCODE, then
# `opencode` on PATH. This checks that a choice was made and can be executed;
# `command -v` alone would reject an absolute path to a real binary.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCODE="${1:-${OPENCODE:-opencode}}"
MOCK_PORT="${MOCK_PORT:-4100}"

if ! command -v bun >/dev/null 2>&1; then
  echo "bun not found — install it with: curl -fsSL https://bun.sh/install | bash" >&2
  exit 1
fi
if ! { command -v "$OPENCODE" >/dev/null 2>&1 || [ -x "$OPENCODE" ]; }; then
  echo "opencode not found: $OPENCODE" >&2
  echo "install it with: curl -fsSL https://opencode.ai/install | bash" >&2
  exit 1
fi

export MOCK_PORT
exec bun "$ROOT/scripts/try.mjs" "$OPENCODE"
