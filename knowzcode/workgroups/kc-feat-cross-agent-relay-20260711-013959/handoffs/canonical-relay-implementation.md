## Phase

Phase 2A — canonical Claude-side cross-agent relay implementation.

## Status

Complete. The assigned canonical relay entry, work integration, execution reference, and runner now implement the approved provider-neutral host/target contract while preserving the existing Codex target adapter and adding the verified Claude exec adapter.

## Owned Files

- `knowzcode/skills/relay/SKILL.md`
- `knowzcode/skills/work/SKILL.md`
- `knowzcode/skills/work/CLAUDE.md`
- `knowzcode/skills/work/references/relay-execution.md`
- `knowzcode/agents/relay-runner.md`
- `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/canonical-relay-implementation.md`

## Findings

- Relay target resolution is now explicit and deterministic: flag > unambiguous natural-language implementation/delegation role > non-`none` project config > `/relay` default `other` > native `/work`. Selectors are `none|auto|other|claude|codex`; `RELAY_HOST` is platform-fixed and `auto|other` resolves to its complement.
- Explicit named same-host targets halt and are never reversed. Stale same-host project configuration on ordinary `/work` visibly falls back to native Phase 2A.
- Missing/broken named targets stop with remediation; automatic/config-derived targets may visibly fall back; every authentication failure pauses, including autonomous mode.
- Target settings resolve independently. Codex retains MCP/exec behavior, legacy config-key fallback, `-a never`, `workspace-write`, `--ignore-user-config`, `/dev/null`, JSONL/thread capture, narrow `codex exec resume`, and SIGINT recovery. Claude does not inherit Codex model/sandbox settings.
- New relay state is schema 2 with Host, Target, role-based states, Session ID, exact cwd/PID/evidence paths, result subtype, and target-qualified artifacts. The reference includes the explicit schema-1 mapping from `Mode: codex`, `CODEX_*`, `CLAUDE_TAKEOVER`, and `Thread ID` without rewriting legacy state on read.
- The Claude target adapter uses redacted `claude auth status --json`, authenticated `claude -p`, `--verbose --output-format stream-json --include-partial-messages`, early `system/init.session_id`, validated final result envelopes, exact same-cwd `--resume`, stdin prompt delivery, `dontAsk`, the bounded `Bash,Read,Edit,Write,Glob,Grep` tool set, strict Bash sandbox settings, explicit empty/strict MCP config, `--no-chrome`, provider-qualified logs, and a 12-minute minimum liveness floor.
- Claude MCP is explicitly unsupported as an agent relay. `relay_transport: mcp` with a Claude target emits a visible transport fallback to exec.
- `relay-runner` is provider-generic: the lead supplies complete commands/tool args and provider-specific query commands; the runner never composes commands, preserves the in-turn iron rule, records Session ID/PID/cwd/evidence, validates provider completion beyond exit zero, and performs at most one supplied resume.
- Tier 3-only behavior, `advisor` incompatibility, branch isolation, clean C0, host-owned commits/review/finalization, bounded target fix rounds, Gate #3 safety exceptions, and native `HOST_TAKEOVER` remain intact.

Verification completed:

- `node scripts/validate-platform-surfaces.mjs` — passed (`Platform surface validation passed.`).
- `git diff --check --` for all five assigned production files — passed.
- Targeted static searches confirmed selector ordering, host/target tokens, schema 2 + legacy mapping, both resume commands, Claude auth/stream/permission/sandbox tokens, target timeout rules, and `[RELAY-FALLBACK]` behavior.
- Markdown fence counts in edited reference/work/runner files are balanced.

## Blockers

None in the assigned canonical source slice.

## Remaining Work

- Codex marketplace/generated-skill mirrors, status/continue/init/configuration surfaces, docs, and validation/generator work are owned by the other Phase 2A writers.
- The approved spec calls a live disposable-repository relay round desirable but not automatic because it consumes model quota and mutates a worktree; no live implementation leg was launched here.
- Forced-interruption Claude resume remains documented as best-effort, matching the approved debt item; completed-session same-cwd resume is the verified contract.

## Next Phase Inputs

- Reviewer should compare the Codex mirrors against this reference for identical selector precedence, fallback categories, schema-1 mapping, target-qualified artifacts, and Claude safety flags.
- Reviewer should verify status/continue consume `Session ID`, Host/Target, role-based states, target evidence, and old schema-1 Codex artifacts without assuming Codex JSON event names for Claude.
- Run the full validator again after all parallel writers merge, then inspect the aggregate diff for mirror drift and unchanged Gemini relay omission.
