# WorkGroup: kc-feat-cross-agent-relay-20260711-013959

**Primary Goal**: Make KnowzCode relay orchestration provider-neutral so Claude Code and Codex can automatically delegate implementation to the other agent, honor explicit flags and natural-language intent, and fall back predictably to project configuration or native Phase 2A.
**Created**: 2026-07-11 01:39:59
**Status**: Completed
**Current Phase**: 3 - Finalization (Completed)
**Tier**: 3 (Full)
**Execution Mode**: Codex coordinator with bounded parallel explorers
**Autonomous Mode**: Active (user requested careful planning and implementation)

## Initial Constraints

- Preserve `--relay=codex` and `relay: codex` behavior for existing Claude Code users.
- Never silently reinterpret an explicit target that equals the host platform.
- Natural-language routing must be deterministic enough to document and test.
- Automatic/configured relay may fall back to native Phase 2A; an unavailable explicitly requested target must stop with remediation.
- Claude and Codex packaging, generated adapters, configuration templates, documentation, and continuation/status behavior must remain aligned.
- Enterprise compliance is disabled in the repository template, so no enterprise enforcement inputs apply.

## Change Set

### New Capabilities (NodeIDs)

| NodeID | Description |
|--------|-------------|
| CrossAgentRelay | Provider-neutral relay resolution and lifecycle: the current Claude or Codex host plans/reviews/finalizes while the selected external agent implements and performs bounded fix rounds. |

### Affected Files

Canonical Claude/source surfaces:

- `knowzcode/skills/relay/SKILL.md`
- `knowzcode/skills/work/SKILL.md`
- `knowzcode/skills/work/CLAUDE.md`
- `knowzcode/skills/work/references/relay-execution.md`
- `knowzcode/agents/relay-runner.md`
- `knowzcode/skills/continue/SKILL.md`
- `knowzcode/skills/continue/CLAUDE.md`
- `knowzcode/skills/init/SKILL.md`
- `knowzcode/skills/init/references/templates.md`
- `knowzcode/skills/init/references/success-messages.md`
- `knowzcode/skills/status/SKILL.md`
- `knowzcode/skills/start-work/SKILL.md`

Codex marketplace and generated-adapter surfaces:

- `plugins/knowzcode/skills/relay/SKILL.md` (new)
- `plugins/knowzcode/skills/work/SKILL.md`
- `plugins/knowzcode/skills/work/references/relay-execution.md` (new)
- `plugins/knowzcode/skills/{continue,init,start-work,status}/SKILL.md`
- `plugins/knowzcode/knowzcode/codex_execution.md`
- `knowzcode/knowzcode/relay_execution.md` (new canonical install surface)
- `plugins/knowzcode/knowzcode/relay_execution.md` (new mirror)
- `knowzcode/knowzcode/platform_adapters.md`
- `plugins/knowzcode/knowzcode/platform_adapters.md`

Shared configuration, documentation, and verification:

- `knowzcode/knowzcode/knowzcode_orchestration.md`
- `plugins/knowzcode/knowzcode/knowzcode_orchestration.md`
- `knowzcode/README.md`
- `knowzcode/CHANGELOG.md`
- `knowzcode/DEV_GUIDE.md`
- `knowzcode/docs/workflow-reference.md`
- `scripts/validate-platform-surfaces.mjs`
- `scripts/sync-codex-relay-surfaces.mjs` (new deterministic mirror generator)
- `knowzcode/knowzcode/specs/CrossAgentRelay.md` (new)

### Dependency Order

1. Define and test resolution/state/adapter invariants.
2. Generalize the canonical relay protocol while preserving the Codex target adapter.
3. Add the Claude target adapter and Codex-host skill surfaces.
4. Synchronize generated adapters, configuration, and documentation.
5. Run static packaging validation, adapter-generation smoke tests, and a read-only acceptance audit.

### Risk Assessment

| Risk | Level | Mitigation |
|------|-------|------------|
| Explicit intent is silently reversed | High | Same-host explicit targets halt; only `auto`/`other` compute the complement. |
| Headless Claude receives unsafe permissions | High | Use an allowlisted tool set and non-interactive permission mode; never default to bypass permissions. |
| Existing v0.20 relay cannot resume | High | Schema-v2 reader maps legacy `Mode: codex` and provider-named states without rewriting before a successful transition. |
| Plugin and generated Codex skills drift | Medium | Validate both checked-in plugin surfaces and a real temporary adapter generation. |
| Natural language fires on incidental provider mentions | Medium | Require delegation/implementation-role language; ambiguous provider mentions do not activate relay. |

**Specs Required**: 1 — `knowzcode/knowzcode/specs/CrossAgentRelay.md`

## Todos

- [x] KnowzCode: Map current relay protocol, CLI capabilities, packaging mirrors, and validation surfaces
- [x] KnowzCode: Approve Change Set and CrossAgentRelay specification
- [x] KnowzCode: Implement provider-neutral resolution and Codex-to-Claude transport using TDD
- [x] KnowzCode: Synchronize packaged skills, adapters, configuration, and documentation
- [x] KnowzCode: Audit against verification criteria and finalize

## Phase History

| Phase | Status | Timestamp |
|-------|--------|-----------|
| 1A (Impact) | Completed / auto-approved | 2026-07-11 01:52:00 |
| 1B (Specification) | Completed / auto-approved | 2026-07-11 01:52:00 |
| 2A (Implementation) | Completed | 2026-07-11 02:08:00 |
| 2B (Independent Audit) | Completed — 15/15 criteria | 2026-07-11 02:10:00 |
| 3 (Finalization) | Completed | 2026-07-11 02:12:26 |

## Discovery Handoffs

- `handoffs/relay-source-explorer.md` — canonical protocol, state migration, and lifecycle implications.
- `handoffs/codex-packaging-explorer.md` — marketplace/generator packaging and validation surfaces.
- `handoffs/claude-cli-explorer.md` — verified Claude CLI headless/auth/session/permission contract.
- `handoffs/relay-audit.md` — independent completeness/security audit plus focused re-audit; final result 15/15 with no blockers.

## Decisions

- `RELAY_HOST` is fixed by the installed platform package (`claude` or `codex`); it is not guessed from prose.
- Resolution precedence is explicit flag, unambiguous natural language, project configuration, `/relay` default `other`, then native execution.
- `relay: other` is the portable persisted opt-in. Existing `relay: codex` retains its target semantics for backward compatibility.
- New relay state uses schema 2 with role-based states (`TARGET_*`, `HOST_TAKEOVER`) and target-qualified artifacts; continuation accepts schema 1.
- Codex remains the only MCP relay transport in this change. Claude target execution uses the verified CLI exec transport.
- Gemini remains native-only; no relay skill is generated for it.

## Completion Evidence

- `node scripts/validate-platform-surfaces.mjs` passed, including a real temporary Codex adapter installation.
- `git diff --check` and Node syntax checks for both validation/synchronization scripts passed.
- `npm pack --dry-run --json` reported `knowzcode@0.20.0` with 85 files and included the relay skill, nested execution reference, and core relay reference.
- Canonical and packaged core relay references are byte-identical; generated Codex skills are correctly namespaced and Gemini still omits relay.
- Independent Phase 2B review passed all 15 verification criteria after two bounded completion-safety fixes.
- Thirteen global Codex KnowzCode skills, including `knowzcode-relay`, were installed from this working copy. The prior installation is backed up at `/Users/alex/.codex/skill-backups/knowzcode-v0.20.0-pre-cross-agent-20260711-021219`.
- A quota-consuming, worktree-mutating end-to-end relay implementation leg remains deliberate pre-release debt and was not run automatically.
