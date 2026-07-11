# CrossAgentRelay: Provider-Neutral Implementation Relay

**Updated:** 2026-07-11T02:12:26-04:00
**Status:** As-Built

## Rules & Decisions

- The current host owns planning, specification, review, user gates, checkpoints, and finalization. The resolved external target owns Phase 2A implementation and bounded review-fix rounds.
- `RELAY_HOST` is fixed by the platform package: `claude` for the Claude Code skill and `codex` for the Codex skill. Prompt text cannot change the host.
- Target precedence is: explicit `--relay=` flag; unambiguous natural-language delegation intent; non-`none` project `relay:` configuration; `/knowzcode:relay` default `other`; otherwise no relay.
- Supported selectors are `none`, `auto`, `other`, `claude`, and `codex`. On Claude/Codex hosts, `auto` and `other` resolve to the opposite provider.
- Provider names mentioned without an implementation/delegation role do not activate relay. If both providers are assigned ambiguous roles, stop for clarification.
- An explicit target equal to the host is an error and is never reversed. A stale same-host project configuration on ordinary `/work` warns and falls back to native Phase 2A.
- An explicitly named unavailable target stops with remediation. An automatically/configured unavailable target may visibly fall back to native Phase 2A. Authentication failures always pause, including autonomous mode.
- Persisting the portable opt-in writes `relay: other`; concrete provider selectors retain literal target semantics for backward compatibility.
- New state files use schema 2 and role-based states. Existing schema-1 Codex relay state remains resumable through an explicit legacy mapping.
- Claude CLI execution must be non-interactive, use a bounded allowlist of tools, preserve a resumable session ID, stream liveness evidence, and never default to bypassing permission checks.
- Gemini is outside the bidirectional host set for this version and must not receive an implicit relay skill.

## Interfaces

- Invocation flags: `--relay=none|auto|other|claude|codex`, `--relay-model=`, `--relay-effort=`, and `--relay-max-fix-rounds=N`.
- Natural-language target examples: “have Claude implement this,” “send the coding to Codex,” and “use the other agent for implementation.”
- Configuration:
  - `relay: none|auto|other|claude|codex`
  - shared `relay_transport`, `relay_max_fix_rounds`, and `relay_timeout_minutes`
  - Codex adapter model/effort/fix-effort/sandbox keys, with legacy-key fallback
  - Claude adapter model/effort/fix-effort/permission-mode keys
- State schema:

  ```text
  Schema: 2
  Host: claude|codex
  Target: claude|codex
  State: INIT|PLANNED|TARGET_IMPLEMENTING|TARGET_FAILED|TARGET_DONE|
         REVIEWING|FIX_ROUND|HOST_TAKEOVER|FINALIZING|DONE|ABORTED
  Session ID: provider thread/session identifier
  ```

- Target-qualified artifacts: `{target}-log-rN.jsonl`, `{target}-last-rN.md`, `{target}-err-rN.log`, and `exit-rN`.
- Claude readiness probe: executable, version, then authentication status. Codex readiness retains the existing executable/version/login-status probe.
- Claude initial/resume transport: headless print mode with stream JSON, a persisted session UUID, explicit working directory, model/effort, safe non-interactive permissions, and in-turn completion polling.

## Verification Criteria

- VERIFY: `--relay=codex` on a Claude host still resolves to Codex and uses the existing Codex adapter semantics.
- VERIFY: `--relay=other` or `--relay=auto` resolves Claude→Codex and Codex→Claude.
- VERIFY: an explicit provider flag wins over natural-language intent and project configuration; `--relay=none` disables relay.
- VERIFY: unambiguous natural-language delegation selects the named provider, while incidental provider mentions do not activate relay.
- VERIFY: when no explicit target exists, a non-`none` project selector wins; `/knowzcode:relay` otherwise defaults to `other`; ordinary `/work` otherwise remains native.
- VERIFY: explicit same-host selection halts with a corrective message and is never silently reversed.
- VERIFY: automatic missing/broken targets visibly fall back to native Phase 2A, while explicit unavailable targets and all authentication failures stop with provider-specific remediation.
- VERIFY: schema-2 relay state records host, target, role-based state, session ID, and target-qualified artifacts.
- VERIFY: continuation maps legacy `Mode: codex`, `CODEX_*`, and `CLAUDE_TAKEOVER` state into Claude-host/Codex-target role semantics.
- VERIFY: the Claude command contract uses authenticated headless execution, stream JSON, resumable session identity, safe non-interactive permissions, target-qualified logs, and in-turn polling.
- VERIFY: Codex marketplace packaging ships relay entry/work/reference/status/continue/init support without Claude-only team APIs or a `plugins/knowzcode/agents` directory.
- VERIFY: `npx knowzcode install --platforms codex` generates the relay skill and nested execution reference with the current version injected.
- VERIFY: source and plugin orchestration/platform-adapter mirrors remain byte-identical where required.
- VERIFY: Gemini continues to omit `knowzcode-relay`.
- VERIFY: README, workflow reference, init, status, and configuration describe the same precedence, host/target roles, fallback rules, and supported directions.

## Debt & Gaps

- Claude MCP transport is deferred until its tool schema, session return value, and recovery behavior are verified end to end; Claude targets use exec transport in this version.
- A live full implementation round against a disposable repository is desirable before release but must not run automatically in validation because it consumes model quota and mutates a worktree.
- More than two relay-capable host providers would make `other` ambiguous; a future provider registry should require a configured preferred target.
