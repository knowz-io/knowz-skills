## Phase

Phase 2A — canonical lifecycle support for provider-neutral relay initialization, status, and continuation.

## Status

Complete for the assigned source files. Schema-2 continuation, schema-1 Codex compatibility, dynamic init detection, portable opt-in, provider-specific template defaults, Codex adapter success output, and target-aware status reporting are implemented.

## Owned Files

- `knowzcode/skills/continue/SKILL.md`
- `knowzcode/skills/continue/CLAUDE.md`
- `knowzcode/skills/init/SKILL.md`
- `knowzcode/skills/init/references/templates.md`
- `knowzcode/skills/init/references/success-messages.md`
- `knowzcode/skills/status/SKILL.md`
- `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/source-relay-lifecycle.md`

## Findings

- Continuation now treats schema-2 `Host`, `Target`, role-based `State`, and `Session ID` as authoritative and never re-resolves target from later prompt/config changes.
- Legacy state with no Schema and `Mode: codex` maps to Claude host/Codex target. `CODEX_IMPLEMENTING`, `CODEX_FAILED`, `CODEX_DONE`, and `CLAUDE_TAKEOVER` map to `TARGET_IMPLEMENTING`, `TARGET_FAILED`, `TARGET_DONE`, and `HOST_TAKEOVER`; all shared state names map unchanged. Legacy files are read without eager mutation and migrate only after a successful transition.
- Dead-process reconciliation is adapter-qualified: Codex completion evidence and Claude stream-JSON `result` evidence are never cross-applied. Legacy Codex artifacts remain recognized.
- Init fixes host identity to the active platform package, probes only the opposite provider, redacts Claude auth PII, and persists `relay: other` after an interactive opt-in. Gemini explicitly skips detection/enablement and remains native-only.
- The embedded orchestration template now contains the full selector/transport/shared limits plus Codex and Claude target settings. It documents Codex v0.20 fallback keys and Claude's `dontAsk` + bounded allowlist + strict Bash sandbox defaults without introducing unsupported new config keys.
- Codex generation now lists the relay skill and nested relay execution reference; its success message reports both paths. Gemini generation still omits relay.
- Status now reports host, configured selector, resolved target, provider readiness, target-qualified configuration, and active state. It warns on stale same-host config, unsupported Claude MCP transport, unsafe Claude bypass permissions, auth failures, and config/state divergence without printing auth identities or session identifiers.
- Verification completed:
  - `git diff --check` passed for all six assigned source files.
  - `rg` confirmed the complete legacy-state mapping and schema-2 vocabulary.
  - `rg` confirmed dynamic host detection, `relay: other`, Claude/Codex auth probes, Codex relay skill/reference generation, and Gemini native-only guards.
  - `rg` confirmed every provider-specific relay key, Claude safe-default note, Codex legacy fallback key, and shared timeout in the embedded template.

## Blockers

None within this source lifecycle slice.

## Remaining Work

- Codex plugin/init/status/continue mirrors and generated adapter templates must implement the same semantics; those files were intentionally outside this task.
- The core relay/work protocol must provide the provider-specific completion selectors, resume commands, schema-2 state writer, and artifact paths that continuation references.
- Shared orchestration, docs, validators, and end-to-end tests remain owned by the other Phase 2A/2B tasks.
- A full platform-surface validator run should wait until source, plugin, adapter, and validator edits have converged; running it mid-flight would report expected mirror drift.

## Next Phase Inputs

- Treat this lifecycle wording as the canonical source behavior when updating Codex plugin and generated-adapter surfaces.
- Test continuation with both a schema-2 Claude-target state and an untouched v0.20 Codex state; assert that reading alone does not migrate the legacy file.
- Test status with `relay: none`, `other`, a concrete external provider, stale same-host config, missing/broken/unauthenticated targets, Claude `relay_transport: mcp`, an active schema-2 state, and a legacy state.
- Test init on Claude, Codex, and Gemini surfaces; only supported interactive hosts with a ready opposite provider may offer opt-in, and acceptance must persist `relay: other`.
