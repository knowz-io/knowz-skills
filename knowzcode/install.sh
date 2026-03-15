#!/bin/bash
# KnowzCode Shell Bootstrap
# Delegates to the Node.js installer (bin/knowzcode.mjs)
#
# Usage: ./install.sh [install|uninstall|upgrade|detect] [options]
# All arguments are forwarded to the Node.js CLI.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIN_NODE_VERSION=18

check_node() {
  if ! command -v node &>/dev/null; then
    return 1
  fi
  local ver
  ver=$(node -v 2>/dev/null | sed 's/^v//' | cut -d. -f1)
  [[ "$ver" -ge "$MIN_NODE_VERSION" ]] 2>/dev/null
}

if ! check_node; then
  echo ""
  echo "[ERROR] Node.js $MIN_NODE_VERSION+ is required to run the KnowzCode installer."
  echo ""
  echo "Install Node.js: https://nodejs.org/"
  echo ""
  echo "Alternative (no Node.js needed):"
  echo "  Claude Code plugin:  /plugin marketplace add knowz-io/knowz-skills"
  echo "                       /plugin install knowzcode@knowz-skills"
  echo ""
  exit 1
fi

LOCAL_BIN="$SCRIPT_DIR/bin/knowzcode.mjs"

if [[ -f "$LOCAL_BIN" ]]; then
  exec node "$LOCAL_BIN" "$@"
else
  exec npx knowzcode "$@"
fi
