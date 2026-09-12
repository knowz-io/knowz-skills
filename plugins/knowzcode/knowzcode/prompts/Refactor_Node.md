# KnowzCode: Refactor Node

**Target NodeID:** [The NodeID to be refactored, e.g., `API_UserSearch`]
**Refactoring Goal:** [The specific goal, e.g., "Improve performance by optimizing database queries"]

> **Automation Path:** Begin with `/knowzcode-step phase=1A` targeting the `REFACTOR_<NodeID>` item in the node's spec `Debt & Gaps` section to scope the Change Set before executing this prompt.

---

## Your Mission
You have been assigned a technical debt task to refactor the specified `TargetNodeID`. Your goal is to improve the internal quality of the code (e.g., performance, readability, simplicity) **without changing its external behavior or interfaces.**

**CRITICAL RULE: The functional contract of the node, as defined by its existing Verification Criteria, MUST NOT change. All existing tests and verification criteria must still pass after the refactoring is complete.**

---

### Pre-Flight Check
Before proceeding, confirm the following:
*   The `TargetNodeID` has a finalized as-built spec at `knowzcode/specs/[TargetNodeID].md` and is not part of an in-flight WorkGroup (no `knowzcode/journal/*/*/` folder naming it that lacks an `arc-completion` or `workgroup-abandoned` shard).
*   The goal is purely internal improvement, not adding features or fixing functional bugs. If this is not the case, **STOP** and inform the Orchestrator that a different protocol is required.

---

### Refactoring Protocol

#### Phase 1: Planning & Setup
1.  **Initiate Work:**
    *   Generate a new, unique `WorkGroupID` for this refactor (e.g., `kc-refactor-<slug>-YYYYMMDD-HHMMSS`) and record it in `knowzcode/workgroups/<WorkGroupID>.md`. Do **not** write `[WIP]` rows to `knowzcode/knowzcode_tracker.md` — it is a frozen archive.
2.  **Review & Plan:**
    *   Thoroughly review the existing code for the `TargetNodeID`.
    *   Review its spec at `knowzcode/specs/[TargetNodeID].md`, paying close attention to the `VERIFY:` statements in the Verification Criteria section. These are your success metrics.
    *   Develop a clear internal plan for the refactoring.

#### Phase 2: Implementation & Verification
1.  **Execute Refactoring:**
    *   Incrementally apply your planned improvements to the code.
    *   Ensure all existing functionality is preserved.
2.  **Full Verification:**
    *   After refactoring, conduct a **full verification** against the *existing* `knowzcode/specs/[TargetNodeID].md`.
    *   All original `VERIFY:` statements from the Verification Criteria section **must** pass. This proves there have been no functional regressions.
    *   Run all associated unit and integration tests.
    *   Iterate on your refactoring until the code is improved AND all verification checks pass.

#### Phase 3: Documentation & Final Commit
1.  **Update Specification (If Necessary):**
    *   If the internal "Core Logic" was significantly changed (e.g., a different algorithm is now used), update that section of the spec to reflect the new, cleaner approach.
    *   **Do not change the Interfaces or Verification Criteria sections.**
2.  **Record Operation (Ref: `knowzcode_loop.md` - Section 2.1):**
    *   Create one new immutable journal shard. Never prepend or append `knowzcode/knowzcode_log.md` — it is a frozen archive.
        ```
        knowzcode/journal/YYYY-MM/<WorkGroupID>/YYYYMMDDTHHMMSSZ-refactor-completion-<shortid>.md
        ```
    *   `YYYY-MM` and `YYYYMMDDTHHMMSSZ` come from an environment-sourced UTC timestamp; `<shortid>` is 4-8 hex/alphanumeric characters.
        ```markdown
        ---
        wgid: [The WorkGroupID for this refactor]
        type: refactor-completion
        timestamp: [ISO-8601 UTC, e.g. 2026-09-12T19:00:00Z]
        agent: builder
        nodeids: [TargetNodeID]
        knowz_sync: pending
        summary: [One-line outcome]
        ---

        - **Goal:** [Original refactoring goal].
        - **Summary of Improvements:** [List of specific improvements made, e.g., "Replaced N+1 query with a single JOIN", "Extracted duplicated logic into a helper function"].
        - **Verification:** Confirmed that all original Verification Criteria for the node still pass, ensuring no functional regressions.
        ```
    *   This shard is the terminal record for the refactor WorkGroup. Shards are immutable: a later correction is a new shard referencing this filename.
3.  **Resolve Debt Item:**
    *   Do **not** mutate `knowzcode/knowzcode_tracker.md`. Remove the resolved `REFACTOR_[TargetNodeID]` item from the `Debt & Gaps` section of `knowzcode/specs/[TargetNodeID].md` and note its resolution in the shard body.
4.  **Final Commit:**
    *   Inspect status and scoped diffs; stage only the explicit approved code, spec, and new journal shard paths, verify the cached name list and diff, then commit with a descriptive `refactor:` message (e.g., `refactor(API_UserSearch): Optimize query performance`). Preserve unrelated user state.

### Final Report
*   Once all steps are complete, provide a concise confirmation report.
> "✓ Refactoring of `[TargetNodeID]` is complete. The technical debt task has been resolved, recorded in a journal shard, and committed."
