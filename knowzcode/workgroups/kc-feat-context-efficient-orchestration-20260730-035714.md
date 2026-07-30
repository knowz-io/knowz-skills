# WorkGroup: kc-feat-context-efficient-orchestration-20260730-035714

**Primary Goal**: Formalize and implement cross-platform context-efficient orchestration for the KnowzCode Claude plugin and Codex plugin, then independently audit and iterate until the verified self-review score is at least 95%.
**Created**: 2026-07-30T03:57:14-04:00
**Status**: Closed
**Current Phase**: 3 - Finalized
**Autonomous Mode**: Active
**Relay Host**: codex
**Relay Target**: none
**Relay Intent Source**: no explicit relay intent; native Codex implementation
**Enterprise Compliance**: Disabled (`compliance_enabled: false`)
**KnowledgeId:**

## Change Set

### New Capabilities

| NodeID | Description |
|---|---|
| ContextEfficientOrchestration | Provider-neutral dispatch, context capsule, lineage, telemetry, budgets, adaptive fan-out, model/profile, test-output, and vault-delta policy. |
| ClaudeRuntimeCompatibility | Current Claude conversation-fork, resumable subagent, Agent Teams, plugin-agent permission, cache, and relay-budget semantics. |
| CodexRuntimeParity | Canonical Codex execution guide, installation parity, semantic native capabilities, warm-agent leases, conditional handoffs, and progressive skill loading. |

### Affected Surfaces

- `knowzcode/knowzcode/specs/` — formal cross-platform specifications.
- `knowzcode/knowzcode/{knowzcode_loop,knowzcode_orchestration,claude_code_execution,relay_execution,platform_adapters}.md` — shared and Claude runtime contracts.
- `knowzcode/knowzcode/codex_execution.md` — new canonical Codex execution source.
- `knowzcode/skills/work/SKILL.md` and `knowzcode/skills/work/references/*.md` — Claude workflow routing, prompts, profiles, quality gates, and orchestration.
- `knowzcode/agents/*.md` — supported Claude plugin-agent fields and concise runtime initialization.
- `plugins/knowzcode/` — generated/thin Codex plugin skills, references, manifest support, and framework files.
- `knowzcode/bin/knowzcode.mjs` — Codex installer/upgrade parity.
- `scripts/{validate-platform-surfaces,sync-codex-relay-surfaces}.mjs` and new deterministic fixtures/scripts as needed — generation and semantic contract validation.
- `knowzcode/CHANGELOG.md`, tracker, architecture, operational log, and documentation — release and as-built records.

### Scope Boundaries

- Preserve TDD, owned-file isolation, mandatory final full regression/static/build gate, independent audit, enterprise safety, and strict relay permissions.
- Do not build a provider SDK controller, fake Codex Agent Teams, in-house tree-sitter indexer, universal cache TTL, or Agent/fork support inside strict relay v1.
- Do not claim that cached context removes logical tokens; report billed cost, logical context, latency, and outcome separately.
- Keep provider caches and sessions as optimizations, never durable project state.

### Dependency Plan

1. Shared specification and schemas establish portable semantics.
2. Claude and Codex adapters implement the shared semantics independently and may proceed in parallel after spec approval.
3. Packaging/generation depends on the canonical adapter sources.
4. Independent platform, security, and quality audits depend on the consolidated implementation.

### Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Current Claude guidance calls removed team APIs | Critical | Repair lifecycle first and add modern-version contract tests. |
| Codex npm and plugin installs diverge | Critical | Add canonical source plus generated-install parity assertions. |
| Fork/resume leaks stale or sensitive context | High | Hash lineage, sensitivity compatibility, invalidation, bounded warm leases, independent reviewer rule. |
| Reported savings are misleading or unprovable | High | Observe-only baseline, versioned telemetry schema, one-variable experiments, provider-native accounting. |
| Parallel writers conflict | High | Disjoint ownership and dependency waves; no overlapping writable files. |
| Prompt slimming removes necessary safety detail | High | Preserve normative rules in on-demand references and semantic validation fixtures. |
| Packaging mirrors drift | Medium | Generate from canonical inputs and compare contract hashes. |

## Phase History

### Phase 1A — 2026-07-30T03:57:14-04:00

- Reviewed the prior three-expert deliberation and current repository state.
- Confirmed two pre-existing untracked user-owned paths will remain untouched: `knowzcode/explore/` and `knowzcode/planning/enterprise-code-review-agent-guidance.md`.
- Confirmed compliance and MCP compliance are disabled for this WorkGroup.
- Confirmed no cross-provider relay was requested.
- `[AUTO-APPROVED] Gate #1` — autonomous mode authorized by the user.

## Acceptance Summary

- Formal specs exist with provider-neutral and provider-specific VERIFY criteria.
- Modern Claude lifecycle and plugin-agent constraints are accurate.
- Codex npm and plugin installations contain equivalent execution contracts.
- Adaptive dispatch distinguishes local, resume, inherited, fresh/capsule, and coordinated-team work.
- Context capsules and lineage invalidation are deterministic and versioned.
- Telemetry distinguishes logical, billed, and outcome measures without sensitive identifiers.
- Skills use progressive references and bounded result/log contracts.
- Stage 0 fan-out, vault capture, model routing, and test verification are evidence-driven.
- Static/package/install tests pass and independent audit scores at least 95%.

## Parallel Work Ownership

### Phase 1 Discovery Handoffs

- Claude runtime: `handoffs/claude-discovery.md`
- Codex/package parity: `handoffs/codex-discovery.md`
- Shared policy/economics: `handoffs/shared-efficiency-discovery.md`

### Approved Specifications

- `knowzcode/knowzcode/specs/ContextEfficientOrchestration.md`
- `knowzcode/knowzcode/specs/ClaudeRuntimeCompatibility.md`
- `knowzcode/knowzcode/specs/CodexRuntimeParity.md`

### Phase 1B Reconciliation

- Classification and spec-reuse routing occurs before team creation, discretionary spawn, or broad vault queries.
- Warm workers survive initial dispatch completion when a likely same-phase fix/re-audit remains; eviction is lease/final-gate/compatibility/capacity based.
- Write-prohibited read-only workers use ephemeral bounded results and create no handoff or artifact.
- The benchmark corpus has at least 40 tasks and includes a recovery/invalidation stratum.
- Canonical shared schema names are `knowzcode.context-capsule/v1`, `knowzcode.agent-lineage/v1`, and `knowzcode.efficiency-event/v1`.
- `[AUTO-APPROVED] Gate #2` — specs approved under user-authorized autonomous mode.

### Phase 2A Ownership Waves

| Wave | Owner | Writable scope |
|---|---|---|
| C1 | Codex adapter builder | canonical/plugin `codex_execution.md` only |
| S1 | Shared contract builder | schemas, deterministic fixtures, contract test harness |
| A1 | Claude adapter builder | Claude guide, active Claude skills/references, agent frontmatter |
| I1 | Coordinator | loop/config, relay, validators, installer, platform adapters, packaging/docs integration |

No parallel writers share a writable file. Adapter mirrors are consolidated only after canonical sources pass their scoped checks.

### Phase 2A — 2026-07-30

- Implemented the canonical shared runtime, schemas, deterministic fixtures, 40-case evaluation corpus, Claude adapter repair, Codex canonical distribution, progressive skills, relay budgeting, installer/package parity, and semantic validation.
- Synchronized 13 packaged Codex skills plus one generated reference, seven framework mirrors, and three contracts.
- Contract and platform validators passed before independent review.

### Phase 2B — 2026-07-30

- Ran independent shared, Claude, Codex/package, and workflow-integration audits with fresh reviewer-owned reasoning.
- Closed all reported high/medium gaps in bounded loops, including promotion provenance/sample/stratum/threshold bypasses, gate-capture contradictions, tool-authority mismatches, installed-runtime realpath execution, and malformed Claude settings preservation.
- Final score: shared 14/14, Claude 14/14, Codex 13/13 = 41/41 (100%). Critical/high/medium residual findings: 0.
- `[AUTO-APPROVED] Gate #3` — full criteria coverage, no scope-definition gap, no security/compliance blocker.

### Phase 3 — 2026-07-30

- Finalized all three specs as As-Built, verified tracker/log/architecture/changelog state, and reran consolidated package/install validation after the last production audit fix.
- Verification: 20/20 contract tests, platform validator PASS, mirror sync PASS, package dry-run PASS (96 files), `git diff --check` PASS.
- No enterprise guidelines were active; compliance sign-off was not applicable.
- Knowz MCP remained unavailable from the recorded failed health probe. The lead classified the consolidated completion delta as `flush / EXPLICIT_SAVE` and queued it once in `knowzcode/pending_captures.md`.
- Status: VERIFIED and CLOSED.
