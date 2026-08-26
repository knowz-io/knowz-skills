#!/usr/bin/env bash
# Install Knowz + KnowzCode into the current Grok Build user config.
# Safe to re-run. Requires `grok` on PATH.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! command -v grok >/dev/null 2>&1; then
  echo "grok CLI not found. Install Grok Build, then re-run." >&2
  exit 1
fi

echo "Adding marketplace from $ROOT"
grok plugin marketplace add "$ROOT" || true

echo "Installing knowz (trust MCP) and knowzcode"
grok plugin install knowz --trust
grok plugin install knowzcode --trust

if command -v knowz >/dev/null 2>&1; then
  echo "knowz CLI already on PATH: $(command -v knowz)"
else
  echo "Optional: npm i -g @knowzai/cli   # preferred vault path, no MCP OAuth"
fi

echo
echo "Done. Start a new Grok session, then:"
echo "  /knowz status"
echo "  /knowzcode:setup    # if this project has no knowzcode/ yet"
echo "  /knowzcode:work \"your feature\""
