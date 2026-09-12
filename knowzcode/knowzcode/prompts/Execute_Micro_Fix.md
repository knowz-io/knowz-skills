# KnowzCode: Execute Micro-Fix

**Target:** [NodeID or specific file path]
**Issue:** [Brief, one-line description of the small change needed]

Remember to log follow-up tasks in `knowzcode/workgroups/<WorkGroupID>.md` with the `KnowzCode:` prefix.

> **Automation Path:** Prefer invoking `/knowzcode-microfix target=<NodeID> summary="..."` to delegate to the `microfix-specialist` subagent while keeping scope under the 50-line threshold.

---

## Your Mission
You have been instructed to perform a "Micro-Fix." This protocol is for small, localized changes that do not alter system architecture or component interfaces.

**CRITICAL RULE: Before proceeding, confirm this task qualifies as a Micro-Fix.** It must be a small change (e.g., < 50 lines), have no ripple effects, and require no spec updates. If it does not qualify, **STOP** and inform the Orchestrator that the full KnowzCode loop is required.

**Reference:** Your actions are governed by the "Micro-Fix Protocol" in `knowzcode_loop.md`.

---

### Execution Protocol

1.  **Implement Fix:**
    *   Make the small, targeted change precisely as requested.

2.  **Quick Verification:**
    *   Perform a focused check to confirm the fix resolves the described issue and introduces no regressions in the immediate vicinity of the change.

3.  **Record Operation (Ref: `knowzcode_loop.md` - Section 2.1 and Section 4):**
    *   Create one new immutable journal shard. Never prepend or append `knowzcode/knowzcode_log.md` and never write rows to `knowzcode/knowzcode_tracker.md` — both are frozen archives.
        ```
        knowzcode/journal/YYYY-MM/<WorkGroupID>/YYYYMMDDTHHMMSSZ-microfix-<shortid>.md
        ```
    *   Use `ungrouped` in place of `<WorkGroupID>` when no WorkGroup is active. `YYYY-MM` and `YYYYMMDDTHHMMSSZ` come from an environment-sourced UTC timestamp; `<shortid>` is 4–8 hex/alphanumeric characters.
        ```markdown
        ---
        wgid: [WorkGroupID or ungrouped]
        type: microfix
        timestamp: [ISO-8601 UTC, e.g. 2026-09-12T19:00:00Z]
        agent: microfix-specialist
        nodeids: [TargetNodeID or file_path]
        knowz_sync: pending
        summary: [One-line outcome]
        ---

        - **User Request:** [Orchestrator's brief issue description].
        - **Action Taken:** [Brief description of change made].
        - **Verification:** [Brief verification method/outcome].
        ```

4.  **Commit Fix (Ref: `knowzcode_loop.md` - Step 4.4):**
    *   Commit the change to version control with a descriptive `fix:` message (e.g., `fix: correct label on login button`). Use the `git` command specified in your `environment_context.md`.

### Final Report

*   Once all steps are complete, provide a concise confirmation report.

**Example Response:**
> "✓ Micro-Fix completed for `[Target]`.
> *   **Change:** Corrected the CSS padding on the main header.
> *   **Verification:** Visually confirmed the alignment is now correct.
> *   **Documentation:** Journal shard created and a `fix:` commit has been made.
> 
> Awaiting next `PrimaryGoal`."
