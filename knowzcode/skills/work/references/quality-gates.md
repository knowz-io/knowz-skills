# Quality Gates — Work Skill

Gate templates, autonomous mode handling, gap loop mechanics, and progress capture instructions.

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

**Dependency Map** (Parallel Teams):
{NodeID parallelism groups}

**Risk Assessment**: {Low/Medium/High}

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Security Officer**: {risk assessment per NodeID, attack surface changes, threat model}
**Architect**: {architecture impact, layer touch points, pattern alignment}
**Test Advisor**: {coverage baseline, test strategy recommendations per NodeID}

Approve this Change Set to proceed to specification?
```

**Autonomous Mode**: If `AUTONOMOUS_MODE = true`, present gate info for transparency, log `[AUTO-APPROVED] Gate #1`, and proceed immediately.
If `AUTONOMOUS_MODE = false`: If rejected — re-run analyst with user feedback. If approved — update tracker, proceed.

### Lead Responsibility: Progress Capture (Gate #1) — MUST

After gate approval, the lead MUST trigger progress capture:
- **If vaults configured + knowledge-liaison active**: DM knowledge-liaison: `"Capture Phase 1A: {wgid}. Your task: #{task-id}"`
  Include the WorkGroup file's `**KnowledgeId:**` value (if present) so knowledge-liaison can pass it to knowz:writer for update mode.
  The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide).
- **If vaults configured + no knowledge-liaison**: call MCP directly (direct write fallback per `knowzcode_loop.md` Section 7).
- **If MCP unavailable**: Queue capture to `knowzcode/pending_captures.md` AND announce to user: `**Vault capture skipped — MCP unavailable at Gate #1. Queued to pending_captures.md.**`

Do NOT silently skip this step.

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

After gate approval, the lead MUST trigger progress capture for spec design decisions:
- **If vaults configured + knowledge-liaison active**: DM knowledge-liaison: `"Capture Phase 1B: {wgid}. Your task: #{task-id}"`
  Include the WorkGroup file's `**KnowledgeId:**` value (if present) so knowledge-liaison can pass it to knowz:writer for update mode.
- **If vaults configured + no knowledge-liaison**: call MCP directly (direct write fallback per `knowzcode_loop.md` Section 7).
- **If MCP unavailable**: Queue capture to `knowzcode/pending_captures.md` AND announce to user: `**Vault capture skipped — MCP unavailable at Gate #2. Queued to pending_captures.md.**`

Do NOT silently skip this step.

---

## Phase 2A Output + Progress Capture

When complete, present implementation summary including files changed, tests written, and test results.

### Lead Responsibility: Progress Capture (Phase 2A) — MUST

After Phase 2A completion, the lead MUST trigger progress capture:
- **If vaults configured + knowledge-liaison active**: DM knowledge-liaison: `"Capture Phase 2A: {wgid}. Your task: #{task-id}"`
  Include the WorkGroup file's `**KnowledgeId:**` value (if present) so knowledge-liaison can pass it to knowz:writer for update mode.
  The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide).
- **If vaults configured + no knowledge-liaison**: call MCP directly (direct write fallback per `knowzcode_loop.md` Section 7).
- **If MCP unavailable**: Queue capture to `knowzcode/pending_captures.md` AND announce to user: `**Vault capture skipped — MCP unavailable after Phase 2A. Queued to pending_captures.md.**`

Do NOT silently skip this step.

---

## Quality Gate #3: Audit Results

Present audit results:

```markdown
## Approval Gate #3: Audit Results

**ARC Completion**: {X}%
**Security Posture**: {status}
**Gaps Found**: {count}
**Smoke Test**: {PASS / FAIL / SKIPPED — reason}

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Security Officer**: Findings: {N} | Critical: {N} | High: {N} | {details or [Pending]}
**Architect**: Drift: {Yes/No} | Pattern Violations: {N} | {details}
**Test Advisor**: TDD Compliance: {%} | Missing Edge Cases: {N} | Quality: {Good/Adequate/Poor} | {details or [Pending]}
**Project Advisor**: New REFACTOR tasks: {N} | Ideas captured to vault: {N}

### Smoke Test Results                      [only when smoke-tester was spawned]
**Status**: {PASS / FAIL}
**Method**: {API / Chrome / Playwright}
**Launch**: {how app was started, or "user-provided"}
**Checks**: {count passed} / {count total}
**Findings**: {details or "All checks passed"}

**Recommendation**: {proceed / return to implementation}

How would you like to proceed?
```

**Autonomous Mode**: If `AUTONOMOUS_MODE = true`:
- **Safety check**: If any security finding rated HIGH or CRITICAL (from reviewer OR security-officer `[SECURITY-BLOCK]`) → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — HIGH/CRITICAL security finding requires manual review.`
- **Safety check**: If ARC completion < 50% → **PAUSE** autonomous mode for this gate. Announce: `> **Autonomous Mode Paused** — ARC completion below 50% requires manual review.`
- If safety checks pass and gaps found → log `[AUTO-APPROVED] Gate #3 — proceeding to gap loop`, auto-proceed to gap loop.
- If safety checks pass and no gaps → log `[AUTO-APPROVED] Gate #3`, auto-proceed to Phase 3.

If `AUTONOMOUS_MODE = false`: User decides — proceed / fix gaps / modify specs / cancel.

---

## Gap Loop

### Parallel Teams mode (per-partition, persistent agents — no respawning):

1. Lead reads each reviewer's structured gap report from task summary
2. Lead creates fix task and pre-assigns:
   `TaskCreate("Fix gaps: NodeID-X", addBlockedBy: [audit-task-id])` → `TaskUpdate(owner: "builder-N")`
3. Lead sends DM to builder with task ID and gap details:
   `"**New Task**: #{fix-task-id} — Fix gaps: NodeID-X. {file path, VERIFY criterion, expected vs actual}"`
4. Builder claims fix task, fixes gaps, re-runs tests, marks fix task complete
5. Lead creates re-audit task and pre-assigns:
   `TaskCreate("Re-audit: NodeID-X", addBlockedBy: [gap-fix-task-id])` → `TaskUpdate(owner: "reviewer-N")`
6. Lead sends DM to reviewer: `"**New Task**: #{reaudit-task-id} — Re-audit: NodeID-X. {gap list}"`
7. Each builder-reviewer pair repeats independently until clean — no cross-partition blocking
8. All builders and reviewers stay alive throughout
9. **3-iteration cap per partition**: If a partition exceeds 3 gap-fix iterations without resolution, **PAUSE** autonomous mode for that partition (even if `AUTONOMOUS_MODE = true`). Announce: `> **Autonomous Mode Paused** — Partition {N} failed 3 gap-fix iterations. Manual review required.`

### Smoke Test Gap Loop

If the smoke-tester reports failures:
1. Lead creates smoke fix tasks assigned to the builder owning the failing code
2. Builder fixes, re-runs unit tests, marks fix task complete
3. Lead creates re-smoke task for smoke-tester
4. Smoke-tester re-runs against the running app
5. **3-iteration cap**: If smoke test exceeds 3 iterations, pause autonomous mode: `> **Autonomous Mode Paused** — Smoke test failed 3 iterations. Manual review required.`

Smoke gap loop runs parallel with per-partition reviewer gap loops. Gate #3 waits for both to pass.

### Sequential Teams mode:

Spawn a NEW `builder` with the standard Phase 2A prompt plus gap fix context. Then re-run Phase 2B (spawn a new reviewer). Repeat until user approves at Gate #3.

### Subagent mode:

Launch parallel `Task()` calls — one for gap fix (builder), then one for re-audit (reviewer). Repeat as needed.

### Lead Responsibility: Progress Capture (Phase 2B) — MUST

After gate approval, the lead MUST trigger progress capture:
- **If vaults configured + knowledge-liaison active**: DM knowledge-liaison: `"Capture Phase 2B: {wgid}. Your task: #{task-id}"`
  Include the WorkGroup file's `**KnowledgeId:**` value (if present) so knowledge-liaison can pass it to knowz:writer for update mode.
  The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide).
- **If vaults configured + no knowledge-liaison**: call MCP directly (direct write fallback per `knowzcode_loop.md` Section 7).
- **If MCP unavailable**: Queue capture to `knowzcode/pending_captures.md` AND announce to user: `**Vault capture skipped — MCP unavailable after Phase 2B. Queued to pending_captures.md.**`

Do NOT silently skip this step.

---

## Phase 3 Output

### Vault Write — MUST (before reporting completion)

- **If vaults configured + knowledge-liaison active**: The closer DMs knowledge-liaison: `"Capture Phase 3: {wgid}. Your task: #{task-id}"`. Include the WorkGroup and spec files' `**KnowledgeId:**` values if present. The knowledge-liaison dispatches `knowz:writer` for Phase 3 capture. The lead waits for the writer task to complete before shutdown.
- **If vaults configured + no knowledge-liaison**: The closer calls MCP directly (direct write fallback per `knowzcode_loop.md` Section 7).
- **If MCP unavailable**: Queue capture to `knowzcode/pending_captures.md` (see `agents/closer.md` MCP Graceful Degradation) AND announce to user: `**Vault capture skipped — MCP unavailable at Phase 3. Queued to pending_captures.md. Run /knowz flush when MCP is available.**`

Do NOT silently skip this step.

### Vault Write Checklist (Tier 3)

Before reporting "Workflow Complete", verify:
- [ ] WorkGroup file created and updated to "Closed" in `knowzcode/workgroups/`
- [ ] `knowzcode_tracker.md` updated — all NodeIDs at `[VERIFIED]`
- [ ] `knowzcode_log.md` ARC-Completion entry written
- [ ] MCP progress capture attempted (or failure queued to `pending_captures.md` and announced to user)
- [ ] Specs updated to As-Built / FINAL status
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
