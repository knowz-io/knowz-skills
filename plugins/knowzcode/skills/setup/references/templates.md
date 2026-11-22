# KnowzCode Init — Generated Files

Setup step 3 copies every framework file from the plugin's framework directory. That directory is the only source for them; this file holds no copies of those files. The two files below are the ones the framework directory does not ship, and setup generates them in the project's `knowzcode/` directory.

## Contents

- [journal/README.md](#journalreadmemd)
- [environment_context.md](#environment_contextmd)

## journal/README.md

Create `knowzcode/journal/` and write this README into it. The journal is tracked in git — do **not** add it to `.gitignore`.

````markdown
# KnowzCode Journal

Every work event is recorded here as one **immutable shard**. Agents no longer
prepend to a single shared `knowzcode_log.md`, which serialized every agent
through one file and produced merge conflicts.

## Path

```
knowzcode/journal/YYYY-MM/<WorkGroupID>/YYYYMMDDTHHMMSSZ-<type>-<shortid>.md
```

- `YYYY-MM` — UTC year and month of the event
- `<WorkGroupID>` — `kc-{type}-{slug}-YYYYMMDD-HHMMSS`, or `ungrouped` for an
  event with no active WorkGroup (micro-fix, standalone audit, migration)
- `YYYYMMDDTHHMMSSZ` — UTC timestamp, so filenames sort chronologically
- `<type>` — `arc-completion`, `microfix`, `refactor-completion`, `audit`,
  `telemetry`, `start-work`, `knowledge-migration`, `init`, `workgroup-abandoned`
- `<shortid>` — 4–8 lowercase hex/alphanumeric characters

## Required frontmatter

```yaml
---
wgid: kc-feat-example-20260912-150000
type: arc-completion
timestamp: 2026-09-12T19:00:00Z
agent: closer
nodeids: [Authentication]
knowz_sync: pending
summary: One-line outcome
---
```

The body holds the prose: verification summary, learnings, ripple effects.
`knowz_sync` is `pending` until synced to a Knowz vault, then holds the
knowledge id. Knowz is optional and never a gate — a shard with
`knowz_sync: pending` is already a complete record.

## Rules

- Shards are created, never edited or deleted.
- A correction is a **new shard** referencing the earlier shard's filename.
- There is no `index.md`. State is derived from the tree.
- `knowzcode_log.md` and `knowzcode_tracker.md` are frozen archives. Never write
  to them.

## Deriving state

```bash
# in-flight WorkGroups: folders with no terminal shard
for wg in knowzcode/journal/*/*/; do
  case "$wg" in */ungrouped/) continue;; esac
  ls "$wg" | grep -qE -- '-(arc-completion|workgroup-abandoned)-' || echo "IN FLIGHT: $wg"
done

# recent history, newest first
ls knowzcode/journal/*/*/*.md | sort -r | head -20
```

Use the shell commands above to inspect journal state. No agent is required.

## Reference Quality Criteria

1. **Reliability:** Robust error handling, graceful degradation
2. **Maintainability:** Clear code structure, good naming, modularity
3. **Security:** Input validation, secure authentication, data protection
4. **Performance:** Efficient algorithms, optimized queries
5. **Testability:** Comprehensive test coverage, clear test cases
````

## environment_context.md
```markdown
# KnowzCode Environment Context

**Purpose:** Environment and tooling information.

## Detected Environment

**Platform:** [Auto-detected]
**Language:** [Auto-detected]
**Package Manager:** [Auto-detected]
**Test Runner:** [Auto-detected]
**Build Command:** [Auto-detected, or "none"]
```
