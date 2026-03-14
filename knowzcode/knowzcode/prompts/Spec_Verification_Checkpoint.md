# KnowzCode: Spec Verification Checkpoint

**WorkGroupID for Verification:**
[Orchestrator: Re-state the `WorkGroupID` that requires specification verification.]

> **Automation Path:** Use `/knowzcode-audit audit=spec workgroup_id=<ID>` to run the `reviewer` subagent against the draft specs before implementation.

**WorkGroupID:** `[wip-timestamp-to-verify]`

---

## Your Mission
This is a **READ-ONLY** quality gate to ensure all specifications for the given `WorkGroupID` are complete and ready for implementation. You must systematically check every spec file associated with the WorkGroupID against the quality criteria.

**CRITICAL RULE: You MUST NOT modify any files during this check. This is a verification step, not a correction step.**

**Reference:** Your actions are governed by `knowzcode_loop.md`, executing the quality check defined in **Step 3.5**.

---

### Execution Protocol

1.  **Identify Scope:**
    *   Using the `WorkGroupID`, identify all `NodeID`s from `knowzcode_tracker.md` that are part of this verification task.

2.  **Systematic Spec Review:**
    *   For **each** `NodeID` in the scope, read its corresponding `specs/[NodeID].md` file.
    *   Verify the following for each file:
        *   **Existence:** Does the spec file actually exist?
        *   **Completeness:** Are all 4 sections filled out? (Rules & Decisions, Interfaces, Verification Criteria, Debt & Gaps). Legacy 7-section format also accepted.
        *   **Clarity:** Are the `VERIFY:` statements (or legacy `ARC_XXX_01:` criteria) specific, testable, and unambiguous? Minimum 2 VERIFY: statements per spec.
        *   **Consistency:** Do the dependencies listed in Interfaces align with the Change Set?

3.  **Synthesize Findings & Report:**
    *   After reviewing all specs, compile a single report summarizing the overall quality.

### Reporting

*   **On Success:** If all specs are present, complete, and meet quality standards.
    *   **Success Report:**
    > "Specification Verification Checkpoint for `WorkGroupID: [ID]` is complete. All specs are present, complete, and meet quality standards. Ready to proceed to implementation. Awaiting the `[LOOP_2A]__Implement_Change_Set.md` command."

*   **On Issues Found:** If any specs are missing, incomplete, or have quality issues.
    *   **Issues Report:**
    > "Specification Verification Checkpoint for `WorkGroupID: [ID]` is complete. The following issues were found:
    >
    > *   **Missing Specs:**
    >     *   `[NodeID_X]`
    > *   **Incomplete Specs:**
    >     *   `[NodeID_Y]`: 'Verification Criteria' section is empty or has <2 VERIFY: statements.
    >     *   `[NodeID_Z]`: 'Rules & Decisions' section contains only placeholder text.
    >
    > Recommendation: Return to `LOOP 1B` to address these specification issues before proceeding with implementation."

### Final State

*   Upon completion of your report, you will **PAUSE**.
*   The Orchestrator will decide whether to proceed to Loop 2A or return to Loop 1B to fix the specs.
---
