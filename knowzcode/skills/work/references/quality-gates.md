# Quality Gates — Work Skill

Gate templates, autonomous mode handling, gap loop mechanics, and progress capture instructions.

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

### Lead Responsibility: Progress Capture (Gate #1)

**Lead responsibility.** After gate approval, the lead triggers progress capture. If vaults are configured and knowledge-liaison is active:
- DM knowledge-liaison: `"Capture Phase 1A: {wgid}. Your task: #{task-id}"`
- The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide)

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

---

## Phase 2A Output + Progress Capture

When complete, present implementation summary including files changed, tests written, and test results.

### Lead Responsibility: Progress Capture (Phase 2A)

**Lead responsibility.** After Phase 2A completion, the lead triggers progress capture. If vaults are configured and knowledge-liaison is active:
- DM knowledge-liaison: `"Capture Phase 2A: {wgid}. Your task: #{task-id}"`
- The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide)

---

## Quality Gate #3: Audit Results

Present audit results:

```markdown
## Approval Gate #3: Audit Results

**ARC Completion**: {X}%
**Security Posture**: {status}
**Gaps Found**: {count}

### Specialist Reports                    [only when SPECIALISTS_ENABLED non-empty]
**Security Officer**: Findings: {N} | Critical: {N} | High: {N} | {details or [Pending]}
**Architect**: Drift: {Yes/No} | Pattern Violations: {N} | {details}
**Test Advisor**: TDD Compliance: {%} | Missing Edge Cases: {N} | Quality: {Good/Adequate/Poor} | {details or [Pending]}
**Project Advisor**: New REFACTOR tasks: {N} | Ideas captured to vault: {N}

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

### Sequential Teams mode:

Spawn a NEW `builder` with the standard Phase 2A prompt plus gap fix context. Then re-run Phase 2B (spawn a new reviewer). Repeat until user approves at Gate #3.

### Subagent mode:

Launch parallel `Task()` calls — one for gap fix (builder), then one for re-audit (reviewer). Repeat as needed.

### Lead Responsibility: Progress Capture (Phase 2B)

**Lead responsibility.** After gate approval, the lead triggers progress capture. If vaults are configured and knowledge-liaison is active:
- DM knowledge-liaison: `"Capture Phase 2B: {wgid}. Your task: #{task-id}"`
- The knowledge-liaison owns extraction, vault routing, and writer dispatch (see `agents/knowledge-liaison.md` — Phase Extraction Guide)

---

## Phase 3 Output

When complete, if MCP is configured, vaults are available, and knowledge-liaison is active:
- The closer DMs knowledge-liaison: `"Capture Phase 3: {wgid}. Your task: #{task-id}"`. The knowledge-liaison dispatches `knowz:writer` for Phase 3 capture. The lead waits for the writer task to complete before shutdown.

Update workgroup to "Closed" and report:

```markdown
## Workflow Complete

**WorkGroupID**: {wgid}
**Primary Goal**: {$ARGUMENTS}
**Status**: VERIFIED and CLOSED

- NodeIDs completed: {list}
- Specs finalized: {count}
- Tech debt scheduled: {count REFACTOR_ tasks}
```
