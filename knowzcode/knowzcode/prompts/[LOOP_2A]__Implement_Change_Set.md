# KnowzCode: [LOOP 2A] Authorize Implementation

**WorkGroupID for Implementation:**
[Orchestrator: Re-state the `WorkGroupID` that you have reviewed and are now approving for implementation. This confirms all associated specs are approved.]

> **Automation Path (Claude Code):** Use `/knowzcode-step phase=2A workgroup_id=<ID>` to activate the `builder` subagent. The command enforces the `environment-guard` skill and records progress in the WorkGroup session file once the loop instructions are complete. On Codex, use the `/knowzcode:work` skill's inline Phase 2A flow and follow `knowzcode/codex_execution.md` for native delegation.

**Remember:**
- Cross-check code updates against the latest specs and refresh them if implementation diverges.
- Record in-progress work and emerging tasks in `knowzcode/workgroups/<WorkGroupID>.md`, keeping every todo prefixed with `KnowzCode:`.

**WorkGroupID:** `[wip-timestamp-to-implement]`

---

## Your Mission
You are authorized to begin the core development phase for the specified `WorkGroupID`. All associated specifications are approved.

Your task is to autonomously execute the planning, committing, implementation, and initial verification cycle. Your work on this prompt follows **Section 3.3** of `knowzcode_loop.md` and is considered complete only after its scoped verification loop and consolidated verification have passed.

**NOTE:** Your implementation will be independently audited for completeness in Loop 2B after you report success here.

**Reference:** Your actions are governed by `knowzcode_loop.md`, executing **Section 3.3 (Implementation, TDD mandatory)**, starting from the Pre-Implementation Commit in Section 3.2.

---

### Execution Protocol

1.  **Plan & Commit:**
    *   Develop a **dependency-wave** implementation plan from the analyst's dependency map. Default to **one NodeID or one named microtask per implementation pass**, each with its own assigned acceptance criteria (`VERIFY:` subset or micro-acceptance criteria). Only treat the whole Change Set as a single pass when it is tiny, single-layer, and shares one bounded owned-file set.
    *   Split oversized NodeIDs into microtasks before coding when they cross layers (DI + service + consumer + UI), touch more than ~5 files, contain sequential subtasks, or previously timed out. The split signals and microtask conventions are defined in `knowzcode/skills/work/references/parallel-orchestration.md`.
    *   **CRITICAL CHECKPOINT:** After developing your plan, evaluate its complexity. If the plan is exceptionally complex or high-risk, you **MUST PAUSE** now and present the plan for Orchestrator review (Section 5 of the loop). If the plan is straightforward, proceed.
    *   Perform the **Pre-Implementation Commit** as per Section 3.2 and note its SHA in the WorkGroup file — it is the baseline new tests must fail against.

2.  **Implement (Red-Green-Refactor):**
    *   Write each failing test first and keep its failing run (command + failing assertion) as RED evidence for the success report. You do not commit during implementation, so that evidence is the record that the test came first.
    *   Execute the plan **wave-by-wave**: complete and verify each NodeID/microtask against its assigned acceptance criteria before starting the next dependent one. Do not pre-load or modify code outside the current scope's owned files.
    *   If a wave cannot finish cleanly in this dispatch, persist a `[BUILDER_CHECKPOINT]` block (format in `knowzcode/agents/builder.md`) describing Done / Files changed / Tests run / Remaining / Next microtask, and stop instead of restarting or expanding scope.

3.  **Verify:**
    *   Verify each completed scope against **its assigned acceptance criteria only** — for a microtask, do not fail unrelated parent NodeID criteria. Follow the iterative "fix and re-verify" cycle detailed in `knowzcode_loop.md`.
    *   Run the consolidated verification (full test suite + static analysis + build + cross-microtask integration criteria) only after all dependency waves are complete and every required `VERIFY:` criterion is covered by at least one audited scope.

### Reporting

*   **On Success:** Once all dependency waves are complete and every assigned acceptance criterion has been verified, report your success and readiness for the audit.
    *   **Success Report:**
    > "Implementation and Initial Verification for `WorkGroupID: [ID]` (Phase 2A) is complete. All dependency waves complete, code written, and all self-conducted tests and assigned acceptance criteria have passed across the covered scopes. The Change Set is now ready for the Loop 2B Implementation Completeness Audit. Awaiting the `[LOOP_2B]__Verify_Implementation.md` command."

*   **On Blocker:** If you pause at the planning checkpoint, or encounter an unresolvable issue, report the specific blocker.
    *   **Blocker Report:**
    > "Execution paused for `WorkGroupID: [ID]`. [Clearly describe the blocker...]"

### Final State & Next Prompt

*   Upon successful completion, you will **PAUSE**.
*   The next command from the Orchestrator for this `WorkGroupID` will be **`[LOOP_2B]__Verify_Implementation.md`**.

---
