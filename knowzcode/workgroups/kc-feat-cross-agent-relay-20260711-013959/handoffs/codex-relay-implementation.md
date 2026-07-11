## Phase

2A

## Status

complete

## Owned Files

- `plugins/knowzcode/skills/relay/SKILL.md` (new)
- `plugins/knowzcode/skills/work/SKILL.md`
- `plugins/knowzcode/skills/work/references/relay-execution.md` (new)
- `plugins/knowzcode/skills/continue/SKILL.md`
- `plugins/knowzcode/skills/init/SKILL.md`
- `plugins/knowzcode/skills/status/SKILL.md`
- `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/codex-relay-implementation.md`

## Findings

- Added the Codex-safe relay entry skill with only `name` and `description` frontmatter, fixed `RELAY_HOST=codex`, the required flag > natural-language > config > entry-point precedence, `other`/`auto` → Claude, same-host rejection, setup-aware Claude detection, portable `relay: other` persistence, and explicit-vs-automatic fallback rules (`plugins/knowzcode/skills/relay/SKILL.md:1-5`, `plugins/knowzcode/skills/relay/SKILL.md:13-43`, `plugins/knowzcode/skills/relay/SKILL.md:45-73`).
- Preserved the work skill's enterprise master-switch/config behavior and spawned-agent handoff contract while adding one-time relay resolution, native-vs-relayed Phase 2A ownership, explicit same-host protection, automatic fallback, and Codex-owned preflight/checkpoint/review behavior (`plugins/knowzcode/skills/work/SKILL.md:15-50`, `plugins/knowzcode/skills/work/SKILL.md:52-104`, `plugins/knowzcode/skills/work/SKILL.md:106-124`).
- Added the Codex-host execution reference with schema 2, target-qualified artifacts, legacy schema-1 mapping, `CLAUDE_DETECT`, Claude-specific configuration, exec-only transport, strict permissions/sandboxing, stream-JSON session capture, in-turn polling, same-directory `--resume`, bounded fix rounds, host takeover, and failure handling (`plugins/knowzcode/skills/work/references/relay-execution.md:12-38`, `plugins/knowzcode/skills/work/references/relay-execution.md:40-99`, `plugins/knowzcode/skills/work/references/relay-execution.md:102-137`, `plugins/knowzcode/skills/work/references/relay-execution.md:139-238`, `plugins/knowzcode/skills/work/references/relay-execution.md:240-284`).
- The Claude adapter uses direct headless CLI exec/JSONL only: prompt on stdin, exact worktree `cwd`, `--output-format stream-json --verbose --include-partial-messages`, safe `dontAsk` permission mode, a bounded tool allowlist, strict MCP isolation, strict Bash sandbox (`failIfUnavailable: true`, `allowUnsandboxedCommands: false`), and no permission bypass (`plugins/knowzcode/skills/work/references/relay-execution.md:121-182`). No Claude MCP agent transport is claimed.
- Continuation now prioritizes relay state, parses schema 2, maps legacy `Mode: codex`, `CODEX_*`, and `CLAUDE_TAKEOVER`, reconciles process/JSONL evidence, and resumes Claude only with the persisted session ID and identical `cwd` (`plugins/knowzcode/skills/continue/SKILL.md:31-69`, `plugins/knowzcode/skills/continue/SKILL.md:71-94`).
- Setup now optionally probes Claude, offers the portable `relay: other` opt-in, preserves merge-era user configuration, and leaves initialization successful when the external CLI is unavailable (`plugins/knowzcode/skills/init/SKILL.md:27-57`).
- Status now reports selector, resolved target, non-sensitive Claude readiness, same-host configuration warnings, and summarized schema/state/session presence without leaking auth or full session IDs (`plugins/knowzcode/skills/status/SKILL.md:21-48`, `plugins/knowzcode/skills/status/SKILL.md:50-71`).
- Verification completed: `git diff --check` passed for all owned skill/reference files; all five plugin skill frontmatters contain exactly `name` and `description`; `rg` found no `TeamCreate`, `TaskCreate`, `TaskUpdate`, `TaskGet`, `SendMessage`, or `ExitPlanMode` references in the owned surfaces; required selector/schema/detection/stream/resume/sandbox terms were present.
- `node scripts/validate-platform-surfaces.mjs` currently fails only on the canonical source `knowzcode/skills/work/references/relay-execution.md` contract checks (host/target, selectors, schema, Claude adapter). Those are outside this microtask and are being implemented by the canonical-source writer. The validator reported no Codex-package failures from these owned files.

## Blockers

None within the owned Codex package scope.

## Remaining Work

None within this microtask. Generated adapter embedding, shared configuration/docs, `start-work`, `codex_execution.md`, validator completion, and canonical Claude/source protocol remain assigned to their respective writers.

## Next Phase Inputs

- Adapter generation should embed `plugins/knowzcode/skills/relay/SKILL.md` as `.agents/skills/knowzcode-relay/SKILL.md` (with standalone naming) and the execution reference as `.agents/skills/knowzcode-work/references/relay-execution.md`.
- The shared orchestration template must retain the key names consumed here: `relay_claude_model`, `relay_claude_effort`, `relay_claude_fix_effort`, `relay_claude_permission_mode`, generic `relay_transport`, `relay_max_fix_rounds`, and `relay_timeout_minutes`.
- The final audit should re-run `node scripts/validate-platform-surfaces.mjs` after canonical source and adapter changes land, then compare generated Codex output with these packaged contracts.
- Live Claude execution should remain opt-in for acceptance testing; static validation must not consume model quota.
