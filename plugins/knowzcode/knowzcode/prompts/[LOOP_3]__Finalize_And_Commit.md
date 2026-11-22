# KnowzCode: [LOOP 3] Finalize & Commit Change Set

**WorkGroupID for Finalization:**
[Orchestrator: Re-state the `WorkGroupID` that has passed implementation and verification, authorizing its finalization and commit.]

> **Automation Path:** `/knowzcode:work` runs this phase with the `closer` agent, which writes the completion journal shard and reconciles the architecture document.

**Remember:**
- Finalize every spec in `knowzcode/specs/` to reflect the as-built system.
- Close or add remaining todos in `knowzcode/workgroups/<WorkGroupID>.md`, ensuring all entries keep the `KnowzCode:` prefix.

**WorkGroupID:** `[WorkGroupID]`

---

## Your Mission
The implementation and verification for the specified `WorkGroupID` is complete. You are now authorized to execute the final phase of the KnowzCode loop: documentation, logging, and committing.

**CRITICAL RULE: The implementation phase is complete. Your work in this phase is strictly limited to updating KnowzCode's own project and specification files (`.md` files) to reflect the finished work. You MUST NOT write or modify any more application source code (e.g., `.js`, `.py`, `.html` files).**

**Reference:** Your actions are governed by `knowzcode_loop.md`, executing **Section 3.5, Step 7 through Step 12**.

---

### Execution Protocol

1.  **Finalize Specifications (Step 7):**
    *   For **each** `NodeID` in the `WorkGroupID`, update its spec file in `knowzcode/specs/` to the "as-built" state in the 4-section format, ensuring it perfectly reflects the verified code.
    *   Before overwriting, compare the approved `VERIFY:` lines (Pre-Implementation Commit) with the as-built lines and list every changed, dropped, or added criterion, old and new wording verbatim, for the Step 9 shard. A VERIFY criterion is never dropped, weakened, or substituted to pass without a recorded user decision giving the old and new wording. If such a change has no recorded decision, stop and ask.
    *   Optionally append ` [test: <path>::<test name>]` to a `VERIFY:` line its test proves. Never invent a test reference.

2.  **Check Architecture (Step 8):**
    *   Review `knowzcode_architecture.md` against the Change Set. If you find a simple discrepancy, fix `knowzcode_architecture.md` directly. If it's complex, document it in the Step 9 shard.

3.  **Write ARC-Completion Shard (Step 9):**
    *   Create one new immutable journal shard at `knowzcode/journal/YYYY-MM/<WorkGroupID>/YYYYMMDDTHHMMSSZ-arc-completion-<shortid>.md` using an environment-sourced UTC timestamp. Required frontmatter: `wgid`, `type: arc-completion`, `timestamp`, `agent`, `nodeids`, `knowz_sync: pending`, `summary` (see `knowzcode_loop.md` section 2.1). The body must include the flowchart check outcome, any unforeseen ripple effects, and project overview updates.
    *   Never prepend or append `knowzcode_log.md`, and never edit an existing shard. This shard is the terminal record that closes the WorkGroup.

4.  **Schedule Debt & Check Project Overview (Step 10):**
    *   **Do not mutate `knowzcode_tracker.md`** — it is a frozen archive. NodeID status is implied by the ARC-completion shard plus the as-built specs.
    *   **Schedule Debt:** Perform the "Technical Debt Scheduling" step. For any nodes with documented debt, record new `REFACTOR_` tasks in the `Debt & Gaps` section of the relevant spec and list them in the shard body.
    *   **Update Project Overview:** Check if this Change Set impacts `knowzcode_project.md`:
        - New major features or scope expansion → Update the "Goal" section
        - New libraries/tools → Update the "Stack" table
        - Architecture changes → Update the "Architecture" section
        - Changed conventions, test strategy, or security posture → Update "Standards", "Testing", or "Security Priorities"

5.  **Final Commit (Step 11):**
    *   Inspect `git status --short` and scoped diffs, resolve the explicit approved final file list, stage only those paths with `git add -- {explicit-paths}`, verify `git diff --cached --check` and the exact cached name list, then commit with a descriptive `feat:` message. Never stage unrelated or ambiguous user state.

### Final Report (Step 12)

*   Once all steps above are complete, provide a final confirmation report.

**Example Response Format:**
> "Finalization for `WorkGroupID: [ID]` is complete.
>
> *   All specifications have been updated to the 'as-built' state.
> *   **Verification Criteria Delta:** [None | changed/dropped/added `VERIFY:` lines with their recorded decisions]
> *   The architecture flowchart has been checked and updated.
> *   A complete `ARC-Completion` shard has been written to `knowzcode/journal/`.
> *   Completion is recorded by that shard; the frozen `knowzcode_log.md`/`knowzcode_tracker.md` archives were not modified.
> *   **Project Overview Updates:** [None | Updated sections: Stack, Goal]
> *   The final `feat:` commit has been made to version control.
> *   **New Refactor Tasks Created:** [List any REFACTOR_ nodes created, or 'None'].
>
> This Change Set is now fully complete and documented. Awaiting next `PrimaryGoal` via a new Work Session."

### Final State

*   Upon successful completion, the KnowzCode loop for this `WorkGroupID` is **finished**. You will return to an idle state.

---
