# Quality Gates — Work Skill

Gate templates, autonomous mode handling, gap loop mechanics, and progress capture instructions.

## Context-Efficient Progress Capture Policy

Before each gate, phase, or final vault capture, the coordinator MUST invoke the shipped no-write classifier:

`node knowzcode/context_efficiency_runtime.mjs vault-delta`

Send `{input:{delta,previous_deltas?,previous_hashes?,explicit_save?,interruption_sensitive?,severity?}}` on stdin. Apply its result as follows:

- `skip`: do not write or queue the duplicate/empty delta.
- `amend` or `update`: route one targeted mutation for the existing semantic or supersession identity.
- `batch`: retain the delta in one coordinator-owned phase journal; do not make an MCP call or append a pending-capture entry yet.
- `flush`: consolidate the journal and make one writer/direct MCP call. If MCP is unavailable, queue that consolidated batch once in `knowzcode/pending_captures.md` and announce the degradation.

Finalization sets `explicit_save: true` and flushes any remaining batch. HIGH/CRITICAL, correction, deprecation, interruption-sensitive, and explicit-save deltas flush early. This policy replaces unconditional per-gate writes while preserving the durability requirements below.

## Contents

- [Quality Gate #1: Change Set](#quality-gate-1-change-set)
- [Quality Gate #2: Specifications](#quality-gate-2-specifications)
- [Phase 2A Output + Progress Capture](#phase-2a-output--progress-capture)
- [Quality Gate #3: Audit Results](#quality-gate-3-audit-results)
- [Gap Loop](#gap-loop)
- [Phase 3 Output](#phase-3-output)

---

## Quality Gate #1: Change Set

Present the Change Set for user approval:

```markdown
## Approval Gate #1: Change Set

**WorkGroupID**: {wgid}
**Proposed Change Set** ({N} nodes):
{NodeIDs with descriptions}

**Dependency Map** (parallel execution; Team mode not required):
{NodeID parallelism groups}

**Risk Assessment**: {Low/Medium/High}

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Security Officer**: {risk assessment per NodeID, attack surface changes, threat model}
**Architect**: {architecture impact, layer touch points, pattern alignment}
**Test Advisor**: {coverage baseline, test strategy recommendations per NodeID}

### Group D Officer Reports               [only when Group D officers active]
**Frontend Designer**: {per-NodeID UI impact rating, design questions surfaced via Design Questions Bundle, design VERIFY needs proposed to architect}  [if FRONTEND_DESIGNER_ENABLED]
**Enterprise Enforcer**: {active guidelines count, goal-relevant guideline IDs, per-NodeID guideline map}                                              [if ENTERPRISE_ENFORCER_ENABLED]

Approve this Change Set to proceed to specification?
```

**Autonomous Mode**: If `AUTONOMOUS_MODE = true`, present gate info for transparency, log `[AUTO-APPROVED] Gate #1`, and proceed immediately.
If `AUTONOMOUS_MODE = false`: If rejected — re-run analyst with user feedback. If approved — update tracker, proceed.

### Lead Responsibility: Progress Capture (Gate #1) — MUST

Classify the Phase 1A delta with the Context-Efficient Progress Capture Policy. Batch normal change-set context; flush only when the classifier requires it. Do not silently discard a required flush.

---

## Quality Gate #2: Specifications

Present specs for batch approval:

```markdown
## Approval Gate #2: Specifications

**Specs Drafted**: {count}
| NodeID | File | Key VERIFY Criteria |
|--------|------|---------------------|
| ... | ... | ... |

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Architect**: {specs align with component map, drift concerns, pattern consistency}
**Test Advisor**: {spec testability assessment, recommended test types per NodeID}

### Group D Officer Reports               [only when Group D officers active]
**Frontend Designer**: {spec design VERIFY coverage — a11y, responsive, empty/loading/error, theme tokens}                                                                  [if FRONTEND_DESIGNER_ENABLED]
**Enterprise Enforcer**: {spec coverage: covered VERIFY criteria from blocking guidelines / required; advisory coverage; [COMPLIANCE-BLOCK-SPEC] flagged if blocking-tier ignored}  [if ENTERPRISE_ENFORCER_ENABLED]

Review specs and approve to proceed to implementation?
```

**Autonomous Mode**: If `AUTONOMOUS_MODE = true`, present gate info for transparency, log `[AUTO-APPROVED] Gate #2`, and proceed immediately.
If `AUTONOMOUS_MODE = false`: If rejected — re-run specs needing revision. If approved — pre-implementation commit, proceed.

**Pre-Implementation Commit:**
```bash
git add knowzcode/
git commit -m "KnowzCode: Specs approved for {WorkGroupID}"
```

### Lead Responsibility: Progress Capture (Gate #2) — MUST

Classify the Phase 1B spec delta with the Context-Efficient Progress Capture Policy. Include approved boundaries, contracts, diagrams, design decisions, and enterprise provenance in the coordinator-owned batch; flush only when required.

---

## Phase 2A Output + Progress Capture

When complete, present implementation summary including files changed, tests written, and test results.

### Lead Responsibility: Progress Capture (Phase 2A) — MUST

Classify the implementation delta with the Context-Efficient Progress Capture Policy. Batch normal file/test/results context and flush risk, corrections, interruptions, or explicit saves.

---

## Quality Gate #3: Audit Results

Present audit results:

```markdown
## Approval Gate #3: Audit Results

**ARC Completion**: {X}%
**Criteria Coverage**: {covered VERIFY count}/{total VERIFY count} | Scope definition gaps: {count}
**Security Posture**: {status}
**Gaps Found**: {count}
**Smoke Test**: {PASS / FAIL / SKIPPED — reason}

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Security Officer**: Findings: {N} | Critical: {N} | High: {N} | {details or [Pending]}
**Architect**: Drift: {Yes/No} | Pattern Violations: {N} | {details}
**Test Advisor**: TDD Compliance: {%} | Missing Edge Cases: {N} | Quality: {Good/Adequate/Poor} | {details or [Pending]}
**Project Advisor**: New REFACTOR tasks: {N} | Ideas captured to vault: {N}

### Group D Officer Reports               [only when Group D officers active]
**Frontend Designer**: E2E Flows: {count} | Design VERIFY: {met}/{total} | Wiring: {COMPLETE/GAPS} | a11y: {PASS/CONCERNS} | Responsive: {360/768/1280 verified} | Console: {clean/N warnings} | {[DESIGN-CONCERN] HIGH findings or PASS}                [if FRONTEND_DESIGNER_ENABLED]
**Enterprise Enforcer**: Blocking violations: {N} | Advisory violations: {N} | ARC coverage: {X}% (blocking) / {Y}% (advisory) | {[COMPLIANCE-BLOCK] tagged or PASS}                                                                              [if ENTERPRISE_ENFORCER_ENABLED]

### Smoke Test Results                      [only when smoke-tester was spawned]
**Status**: {PASS / FAIL}
**Method**: {API / Chrome / Playwright}
**Launch**: {how app was started, or "user-provided"}
**Checks**: {count passed} / {count total}
**Findings**: {details or "All checks passed"}

**Recommendation**: {proceed / return to implementation}

How would you like to proceed?
```

> **Advisory visibility**: When `COMPLIANCE_CONFIG.show_advisory_issues: false` (default true), the Enterprise Enforcer report shows blocking-tier violations and counts only — advisory-tier rows and the "Advisory violations" count are omitted across Gates #1–#3. Blocking-tier reporting and `[COMPLIANCE-BLOCK]` are never suppressed.

**Autonomous Mode**: If `AUTONOMOUS_MODE = true`:
- **Safety check**: If any security finding rated HIGH or CRITICAL (from reviewer OR security-officer `[SECURITY-BLOCK]`) → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — HIGH/CRITICAL security finding requires manual review.`
- **Safety check**: If any `[COMPLIANCE-BLOCK]` tag is present (from enterprise-enforcer) → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — blocking-tier compliance violation requires manual review.`
- **Safety check**: If `FRONTEND_DESIGNER_BLOCKING_CONFIG = true` AND any `[DESIGN-CONCERN-BLOCK]` tag is present (frontend-designer officer mode) → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — blocking design concern requires manual review.`
- **Safety check**: If ARC completion < 50% → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — ARC completion below 50% requires manual review.`
- **Safety check**: If criteria coverage is incomplete or any scope-definition gaps remain → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — assigned acceptance criteria coverage is incomplete.`
- If safety checks pass and gaps found → log `[AUTO-APPROVED] Gate #3 — proceeding to gap loop`, auto-proceed to gap loop.
- If safety checks pass and no gaps → log `[AUTO-APPROVED] Gate #3`, auto-proceed to Phase 3.

If `AUTONOMOUS_MODE = false`: User decides — proceed / fix gaps / modify specs / cancel.

---

## Gap Loop

### Parallel or Coordinated Mode (per-scope, resume-first):

1. Lead reads each reviewer's structured gap report from task summary
2. Lead creates fix task and pre-assigns:
   `TaskCreate("Fix gaps: NodeID-X", addBlockedBy: [audit-task-id])` → `TaskUpdate(owner: "builder-N")`
3. Lead sends DM to builder with task ID and gap details:
   `"**New Task**: #{fix-task-id} — Fix gaps: NodeID-X. {file path, VERIFY criterion, expected vs actual}"`
4. Builder claims fix task, fixes gaps, re-runs tests, marks fix task complete
5. Lead creates re-audit task and pre-assigns:
   `TaskCreate("Re-audit: NodeID-X", addBlockedBy: [gap-fix-task-id])` → `TaskUpdate(owner: "reviewer-N")`
6. Lead sends DM to reviewer: `"**New Task**: #{reaudit-task-id} — Re-audit: NodeID-X. {gap list}"`
7. Each builder-reviewer pair repeats independently until clean — no cross-scope blocking unless dependencies require it
8. Keep builder/reviewer handles through the bounded gap-loop lease. Resume with a delta; do not replay full specs or raw logs.
9. **3-iteration cap per scope**: If a scope exceeds 3 gap-fix iterations without resolution, **PAUSE** autonomous mode for that scope (even if `AUTONOMOUS_MODE = true`). Announce: `> **Autonomous Mode Paused** — Scope {N} failed 3 gap-fix iterations. Manual review required.`

### Microtask Coverage Rule

When implementation uses microtasks, Gate #3 cannot be marked clean until the lead confirms:
- Every microtask has assigned acceptance criteria.
- Every required NodeID `VERIFY:` criterion is covered by at least one completed and audited scope.
- Cross-microtask integration criteria are audited after all dependent microtasks land.
- Scope-definition gaps from reviewers are resolved by clarifying or creating a missing microtask, not by sending the same implementation back through a gap loop.

### Smoke Test Gap Loop

If the smoke-tester reports failures:
1. Lead creates smoke fix tasks assigned to the builder owning the failing code
2. Builder fixes, re-runs unit tests, marks fix task complete
3. Lead creates re-smoke task for smoke-tester
4. Smoke-tester re-runs against the running app
5. **3-iteration cap**: If smoke test exceeds 3 iterations, pause autonomous mode: `> **Autonomous Mode Paused** — Smoke test failed 3 iterations. Manual review required.`

Smoke gap loop runs parallel with per-scope reviewer gap loops. Gate #3 waits for both to pass.

### Sequential or Named-Agent Mode

Resume the compatible builder with the failing VERIFY IDs, concise evidence, artifact path, checkpoint, and next action. Then resume the same independent reviewer for re-audit of that bounded delta. Start a replacement only when role/scope/spec/checkpoint/model/effort/tools/permissions/sensitivity or transcript availability invalidates lineage; record the reason and use a fresh capsule. Repeat until Gate #3 is clean or the iteration cap pauses the workflow.

### Lead Responsibility: Progress Capture (Phase 2B) — MUST

Classify the audit/fix delta with the Context-Efficient Progress Capture Policy. Prefer amend/update for a previously recorded finding and batch ordinary clean-review evidence until final consolidation.

---

## Compliance Sign-Off (Phase 3 Entry)

Applies only when enterprise compliance is enabled AND `COMPLIANCE_CONFIG.require_signoff_for_finalization: true` (manifest default: `false`). Checked by the lead at the transition from Gate #3 to Phase 3, before dispatching the closer. Evaluate in order:

1. **Nothing to enforce → PROCEED.** If there were no active enforcement sources this WorkGroup (the enterprise-enforcer was legitimately SKIPPED for "no active non-empty guidelines" and no `enterprise.md`/vault source applied), the sign-off is vacuously satisfied — record "no active guidelines; sign-off N/A" and proceed to Phase 3. Do NOT block.
2. **Unresolved blocking violation → BLOCK.** Otherwise, if any blocking-tier compliance finding (`[COMPLIANCE-BLOCK]` / `[COMPLIANCE-BLOCK-SPEC]`) is still unresolved, **block finalization** and route back to the gap loop. Announce: `> **Finalization blocked** — require_signoff_for_finalization is true and {N} blocking compliance violation(s) are unresolved.`
3. **Active guidelines but no audit ran → BLOCK once.** If active guidelines/sources existed but no compliance audit executed (enforcer disabled/unavailable AND the reviewer fallback did not run), block and run `/knowzcode:audit compliance` (or re-enable the enforcer) to produce a result to sign off. Announce: `> **Finalization blocked** — compliance is enabled with active guidelines but no compliance audit ran; running one now.`
4. **Audit ran, no unresolved blocking → PROCEED.** Record the sign-off in WorkGroup context and proceed to Phase 3.

This gate is a safety exception: cases 2–3 pause even when `AUTONOMOUS_MODE = true`. When `require_signoff_for_finalization: false`, Phase 3 proceeds normally; advisory violations never block.

---

## Phase 3 Output

### Vault Write — MUST (before reporting completion)

Invoke `vault-delta` with `explicit_save: true`, consolidate all retained deltas, and flush once. With a knowledge liaison, send one Phase 3 capture task containing the consolidated batch and relevant KnowledgeIds; otherwise use one direct MCP call. If MCP is unavailable, queue the consolidated batch once and announce: `**Vault capture skipped — MCP unavailable at Phase 3. Consolidated batch queued to pending_captures.md. Run /knowz flush when MCP is available.**` Do not silently skip a required final flush.

### Vault Write Checklist (Tier 3)

Before reporting "Workflow Complete", verify:
- [ ] WorkGroup file created and updated to "Closed" in `knowzcode/workgroups/`
- [ ] `knowzcode_tracker.md` updated — all NodeIDs at `[VERIFIED]`
- [ ] `knowzcode_log.md` ARC-Completion entry written
- [ ] MCP progress capture attempted (or failure queued to `pending_captures.md` and announced to user)
- [ ] Specs updated to As-Built / FINAL status
- [ ] As-built specs, components, diagrams, integration contracts, corrections/deprecations, and enterprise guideline provenance captured or explicitly skipped with reason
- [ ] Smoke test approach captured (if smoke testing ran): launch method, endpoints tested, test method, project-specific quirks

Update workgroup to "Closed" and report:

```markdown
## Workflow Complete

**WorkGroupID**: {wgid}
**Primary Goal**: {$ARGUMENTS}
**Status**: VERIFIED and CLOSED

- NodeIDs completed: {list}
- Specs finalized: {count}
- Tech debt scheduled: {count REFACTOR_ tasks}
- Vault captures: {completed / skipped — reason}
```
