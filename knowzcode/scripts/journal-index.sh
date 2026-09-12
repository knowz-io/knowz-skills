#!/usr/bin/env bash
# Derive KnowzCode journal state from the shard tree.
#
# The journal has no index file on purpose: filenames are UTC time-prefixed and
# a WorkGroup's terminal shard is discoverable by name, so state is always
# derivable from `ls`. This script is a convenience for humans — no agent is
# required to run it, and nothing here writes to the journal.
#
# Usage:
#   journal-index.sh              # in-flight WorkGroups + 20 newest shards
#   journal-index.sh --in-flight  # in-flight WorkGroups only
#   journal-index.sh --recent [N] # N newest shards only (default 20)

set -euo pipefail

JOURNAL="${KNOWZCODE_JOURNAL:-knowzcode/journal}"

if [ ! -d "$JOURNAL" ]; then
  echo "No journal at $JOURNAL" >&2
  echo "Run the KnowzCode installer, or set KNOWZCODE_JOURNAL to the journal path." >&2
  exit 1
fi

# A WorkGroup is closed once its folder holds an arc-completion or
# workgroup-abandoned shard. Anything else is still in flight.
TERMINAL='-(arc-completion|workgroup-abandoned)-'

list_shards() {
  find "$JOURNAL" -mindepth 3 -maxdepth 3 -type f -name '*.md' | sort -r
}

print_in_flight() {
  echo "In-flight WorkGroups"
  echo "--------------------"
  local found=0
  while IFS= read -r wg; do
    [ -d "$wg" ] || continue
    if ! ls "$wg" | grep -qE -- "$TERMINAL"; then
      local count
      count=$(find "$wg" -maxdepth 1 -type f -name '*.md' | wc -l | tr -d ' ')
      printf '  %s (%s shard(s))\n' "$(basename "$wg")" "$count"
      found=1
    fi
  done < <(find "$JOURNAL" -mindepth 2 -maxdepth 2 -type d | sort)
  [ "$found" -eq 0 ] && echo "  (none)"
  return 0
}

print_recent() {
  local limit="${1:-20}"
  echo "Recent shards (newest first)"
  echo "----------------------------"
  local any=0
  while IFS= read -r shard; do
    any=1
    local summary
    # `summary:` lives in the shard frontmatter; fall back to the filename.
    summary=$(sed -n 's/^summary:[[:space:]]*//p' "$shard" | head -1)
    printf '  %s\n' "${shard#"$JOURNAL"/}"
    [ -n "$summary" ] && printf '      %s\n' "$summary"
  done < <(list_shards | head -n "$limit")
  [ "$any" -eq 0 ] && echo "  (none)"
  return 0
}

case "${1:-}" in
  --in-flight)
    print_in_flight
    ;;
  --recent)
    print_recent "${2:-20}"
    ;;
  '')
    print_in_flight
    echo
    print_recent 20
    ;;
  *)
    echo "Usage: journal-index.sh [--in-flight | --recent [N]]" >&2
    exit 2
    ;;
esac
