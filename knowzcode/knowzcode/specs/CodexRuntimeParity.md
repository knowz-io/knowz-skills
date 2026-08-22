# CodexRuntimeParity: Canonical Distribution and Native Context Reuse

**Updated:** 2026-07-31
**Status:** As-Built — verified
**WorkGroup:** `kc-fix-context-orchestration-hardening-20260731-003258`

## Context

The Codex plugin currently ships `knowzcode/codex_execution.md`, while the canonical npm framework source does not. As a result, a marketplace plugin checkout can contain execution guidance that `npx @knowzai/knowzcode install --platforms codex` cannot copy into a project. The validator does not mirror-check this file or assert its presence in a generated install. The guide and work skill also hard-code stale operation names and require disk handoffs for every child task.

This contract makes the npm framework source canonical, validates plugin and generated-install parity, and maps portable context modes to currently available Codex capabilities without pretending Codex has Claude Agent Teams.

## Rules & Decisions

### Canonical distribution

- `knowzcode/knowzcode/codex_execution.md` is the canonical project execution guide.
- `plugins/knowzcode/knowzcode/codex_execution.md` mirrors it byte-for-byte.
- The npm installer and upgrader copy the canonical guide with the rest of the framework `.md` files.
- Generated Codex installs MUST contain `knowzcode/codex_execution.md`, `AGENTS.md`, the work skill, and its selected references.
- The platform-surface validator checks source/plugin equality and generated-install content, including the context mode, lineage, conditional handoff, and semantic-operation contracts.

### Native semantic operations

Durable Codex instructions use semantic operations rather than assuming one runtime's tool names:

| Operation | Meaning |
|---|---|
| spawn | Create a scoped worker with selected context policy |
| follow up | Reuse a compatible live worker for a delta |
| message | Deliver non-triggering context to a live worker when supported |
| wait | Observe one or more workers using cursors/compact snapshots |
| interrupt | Stop active work without deleting durable project state |
| release | Stop retaining the worker after completion |

At runtime the coordinator detects callable capabilities, currently including shapes such as `spawn_agent`, `followup_task`, `send_message`, `wait_agent`, `interrupt_agent`, and `list_agents`. Durable instructions MUST NOT require `send_input` or `close_agent`; those names may exist in another host but are not the portable contract.

### Codex mode mapping

| Portable mode | Codex adapter |
|---|---|
| `local` | Coordinator executes directly |
| `resume` | Follow up with a compatible live/durable subagent or resume a provider thread when exposed |
| `inherit-full` | Spawn with full history only when the host exposes an explicit inheritance/fork option and the scope passes compatibility checks |
| `inherit-recent` | Spawn with a bounded recent-turn fork when exposed; otherwise capsule |
| `fresh-capsule` | Spawn with no/bounded history and an explicit context capsule |
| `coordinated-team` | Not emulated; coordinator plus scoped workers and WorkGroup state |

Codex does not gain team mailboxes, peer broadcast, or shared task APIs through this adapter. The coordinator owns dependency state and integrates handoffs.

### Warm leases and handoffs

- A worker may stay warm only for a likely compatible follow-up in the current phase or audit/fix loop and within the shared lease.
- Release or stop retaining a worker at lease expiry, final gate, incompatibility, sensitivity transition, explicit capacity pressure, or when no likely bounded continuation remains. Completing the first dispatch does not by itself invalidate a likely same-phase fix or re-audit continuation.
- Material cross-agent changes, resumable work, and phase evidence use the WorkGroup handoff schema. Tiny read-only checks may return a bounded structured finding directly when loss would not impair recovery.
- When the user or audit mode prohibits writes, the child MUST use an ephemeral bounded result and MUST NOT create a handoff or artifact file.
- Writers receive explicit, non-overlapping owned files and one NodeID or named microtask by default. Reviewers are read-only and fresh relative to builders.

### Progressive skill loading

The Codex work skill startup reads the active WorkGroup or a compact context capsule and the current phase contract. It then loads execution, project, tracker, architecture, compliance, relay, handoff, or orchestration references only when the chosen phase and path require them. It does not eagerly load all four project/framework files or every provider document. The critical phase/gate/safety path remains in `SKILL.md`; detailed routing schemas, platform notes, and evaluation guidance may live in references.

## Interfaces

The canonical execution guide consumes `context_efficiency` from `knowzcode_orchestration.md` and the capsule/lineage schemas in `ContextEfficientOrchestration.md`.

The WorkGroup handoff schema remains:

```markdown
## Phase
1A | 1B | 2A | 2B | 3

## Status
complete | blocked | partial

## Owned Files
...

## Findings
...

## Remaining Work
...

## Next Phase Inputs
...
```

`Remaining Work` is required only for `partial`; `Blockers` is required only for `blocked`. A direct bounded result is permitted only by the conditional-handoff rule above.

## Verification Criteria

- VERIFY CRP-01: canonical and plugin `codex_execution.md` files exist and are byte-identical.
- VERIFY CRP-02: a fresh `npx @knowzai/knowzcode install --platforms codex` contains `knowzcode/codex_execution.md` and the generated work skill reads it conditionally.
- VERIFY CRP-03: upgrade replaces the canonical execution guide while preserving documented user-owned framework files.
- VERIFY CRP-04: validators fail when the canonical/plugin guide drifts or a generated install drops it.
- VERIFY CRP-05: Codex durable guidance names semantic operations and does not require `send_input` or `close_agent`.
- VERIFY CRP-06: current runtime capability examples include spawn, follow-up, message, wait, interrupt, and listing/observation, with capability detection and fallback.
- VERIFY CRP-07: the adapter implements local, resume, inherited, and capsule semantics without claiming a fake team, mailbox, broadcast, or peer task list.
- VERIFY CRP-08: warm workers have phase/fix-loop leases and are released at a final gate, expiry, incompatibility, sensitivity change, capacity eviction, or when no likely continuation remains—not merely when an initial dispatch completes.
- VERIFY CRP-09: disk handoffs are mandatory for material/resumable/phase-crossing work but optional for tiny read-only checks.
- VERIFY CRP-09A: a behavioral temp-directory smoke proves a write-prohibited child/result-policy path returns an ephemeral bounded result, authorizes no writes, and creates no handoff, artifact, or other file.
- VERIFY CRP-10: generated `AGENTS.md` and work-skill startup classify and resolve active WorkGroup/spec/phase first, then route to detailed project, architecture, execution, relay, compliance, and vault references only when required.
- VERIFY CRP-11: parallel writers have non-overlapping owned files and independent reviewers do not inherit builder lineage.
- VERIFY CRP-12: package dry-run, plugin validation, platform-surface validation, and generated-install smoke tests pass together and enumerate every generated Codex skill, including adapter-only surfaces.

### Hardening addendum

- VERIFY CRP-13: local install/upgrade never mutates global skill state, and global cleanup changes only entries bearing verifiable KnowzCode ownership metadata.
- VERIFY CRP-14: installer/upgrader recognizes only marked KnowzCode adapters and preserves unrelated `AGENTS.md`/`AGENTS.override.md` content.
- VERIFY CRP-15: all platform settings and target-state preflights complete before installation mutation; every failed install preserves the complete target snapshot.
- VERIFY CRP-16: every generated relay reference resolves from its installed skill directory, and the standalone setup skill bootstraps a new repository through the packaged CLI rather than an unavailable adjacent bundle.
- VERIFY CRP-17: platform flags mutate only selected platform state, validators isolate home/global paths, and regression sentinels prove local upgrade and test execution cannot delete unrelated user skills.
- VERIFY CRP-18: installer validation exercises the Claude plugin/local rendering matrix, including exact agent namespaces, command names, and mixed KnowzCode-local/Knowz-plugin ownership without ambiguous suffix fallback.
- VERIFY CRP-19: Knowz and KnowzCode share Gemini MCP custody only when both per-product digests match the unchanged entry and the peer's product-specific managed files are live regular files with exact ownership content and no symlinked path component; both install orders, immutable co-owned updates, both uninstall orders, arbitrary unowned entries, and missing/replaced/leaf-symlinked/ancestor-symlinked crash-interruption evidence leave no orphan entry or credential.

## Debt & Gaps

- Codex tool names and inheritance options can vary by host release. Capability detection remains authoritative.
- Codex has no portable Agent Teams equivalent. A future provider-native team capability should be integrated only after it has real coordination semantics and tests.
- This release validates local/package distribution. A live paid multi-agent evaluation is represented by the shared observe/shadow protocol and is not run automatically in CI.

## As-Built Verification

- Canonical and plugin execution guides, runtime, and schemas are exact mirrors; fresh install and upgrade paths ship the complete contract.
- Generated Codex skills progressively load branch-specific guidance, use semantic agent operations, retain compatible warm lineages, and preserve strict no-write/independent-review behavior.
- KnowzCode and Knowz installers use exact per-product manifests, preflight every mutation boundary, preserve unmanaged adapters/settings, isolate project and HOME state, and reconcile shared Gemini MCP custody through matching digests plus product-specific active-install proof.
- Both Gemini install orders, co-owned update attempts, both uninstall orders, arbitrary unowned entries, malformed settings, symlink targets, global/local isolation, Copilot structural merges, and Claude/Codex ownership collisions have executable regression coverage.
- All 20 criteria pass. The KnowzCode dry-run package contains 104 files including eight documentation files; the Knowz package contains 20 files including the vault-routing template. Fresh install, upgrade, uninstall, generated-skill enumeration, zero-write, and package smokes pass.
