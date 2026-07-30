# Tier 2 Light Workflow — Phase Details

Detailed phase instructions for Tier 2 (Light) execution. The lead reads this file when a Light workflow is selected in `/knowzcode:work`.

---

## Contents

- [Dispatch Setup](#dispatch-setup)
- [Light Phase 1: Impact Scan + Spec](#light-phase-1-impact-scan--spec)
- [Light Phase 2A: Implementation](#light-phase-2a-implementation-builder-teammate)
- [Light Phase 2B: Smoke Testing (Opt-in)](#light-phase-2b-smoke-testing-opt-in)
- [Light Phase 3: Finalization](#light-phase-3-inline--lead-coordinates-knowledge-liaison-captures)

---

## Dispatch Setup

Tier 2 does not form a team. Use the lead's `VAULT_BASELINE`; only when a material component-specific knowledge gap remains, resume a compatible knowledge-liaison or dispatch one bounded `Task(subagent_type="knowledge-liaison")`. Pass the baseline and targeted question, and require a concise Context Briefing. Skip duplicate broad vault queries.

---

## Light Phase 1: Impact Scan + Spec

Inline — lead coordinates, knowledge-liaison active.

1. Quick impact scan: grep for related files, check existing specs
2. **Vault context**: Reference `VAULT_BASELINE` from Step 3.6 (already available). If baseline results are relevant to the affected component, factor them into the Change Set. If deeper component-specific queries are needed, call `search_knowledge({vault_id}, "past decisions about {affected_component}")` for targeted follow-up.
3. Propose a Change Set (typically 1 NodeID)
4. Draft a lightweight spec (or reference existing spec if found) — use the 4-section format from `knowzcode_loop.md` section 3.2. Minimum: 1 Rule, 1 Interface, 2 `VERIFY:` statements.
5. Present combined Change Set + Spec for approval:

```markdown
## Light Mode: Change Set + Spec Approval

**WorkGroupID**: {wgid}
**Tier**: 2 (Light)
**NodeID**: {NodeID} — {description}
**Affected Files**: {list}

**Spec Summary**:
- Rules: {key decisions}
- Interfaces: {public contracts}
- VERIFY: {criteria list}

Approve Change Set and spec to proceed to implementation?
```

6. **Autonomous Mode**: If `AUTONOMOUS_MODE = true`, log `[AUTO-APPROVED] Light mode gate` and proceed directly to implementation.
   If `AUTONOMOUS_MODE = false`: If rejected — adjust based on feedback and re-present. If approved:
   - Update `knowzcode_tracker.md` with NodeID status `[WIP]`
   - Pre-implementation commit: `git add knowzcode/ && git commit -m "KnowzCode: Light spec approved for {wgid}"`

---

## Light Phase 2A: Implementation

Resume a compatible builder lineage when one owns this exact spec/scope/checkpoint. Otherwise dispatch `Task(subagent_type="builder")` with the standard Phase 2A task packet from `references/spawn-prompts.md`. Include only the lightweight spec, assigned VERIFY IDs, owned files, checkpoint, constraints, and a bounded result contract.

The builder self-verifies against spec VERIFY criteria — no separate audit phase.

---

## Light Phase 2B: Smoke Testing (Opt-in)

Only if user explicitly requested smoke testing (e.g., `--smoke-test` in `$ARGUMENTS` or natural language: "smoke test", "test it running", "verify it works"):

Dispatch a fresh independent smoke-tester via `Task(subagent_type="smoke-tester", description="Smoke test", prompt=<bounded task packet>)`. Do not fork or resume the builder lineage.

If smoke test fails: create fix tasks for builder, re-run smoke-tester. 3-iteration cap, then escalate. App lifecycle managed by smoke-tester (see `agents/smoke-tester.md`).

If user did not request smoke testing, skip to Light Phase 3.

---

## Light Phase 3 (Inline — lead coordinates, knowledge-liaison captures)

After builder completes successfully:
1. Update spec to As-Built status
2. Update `knowzcode_tracker.md`: NodeID status `[WIP]` → `[VERIFIED]`
3. Write a brief log entry to `knowzcode_log.md`:
   ```markdown
   ---
   **Type:** ARC-Completion
   **Timestamp:** [timestamp]
   **WorkGroupID:** [ID]
   **NodeID(s):** [list]
   **Logged By:** AI-Agent
   **Details:** Light mode (Tier 2). {brief summary of implementation}.
   ---
   ```
4. Final commit: `git add knowzcode/ <changed files> && git commit -m "feat: {goal} (WorkGroup {wgid})"`
5. Report completion.
6. **Knowledge capture**:
   - Classify the consolidated delta with `vault-delta` and `explicit_save: true`; store `FINAL_CAPTURE_ACTION` and its stable identity/reason.
   - For `skip`, make no MCP or pending-queue write. For `batch` (defensive fallback), retain it and reclassify at the explicit final boundary. For `amend`, `update`, or `flush`, send that exact classified action to a compatible knowledge-liaison and wait for confirmation (max 2 minutes), or perform one matching direct MCP mutation. Release the lineage after capture.
7. **Vault Write Checklist (MUST — do not skip, do not defer)**:
   You MUST attempt every item. Check each off or report failure to the user.
   - [ ] WorkGroup file exists in `knowzcode/workgroups/{wgid}.md`
   - [ ] `knowzcode_tracker.md` updated with NodeID status
   - [ ] `knowzcode_log.md` entry written
   - [ ] Classified persistence handled exactly once when `FINAL_CAPTURE_ACTION` is `amend`, `update`, or `flush`:
     - Read `knowz-vaults.md`, resolve vault IDs. Read the WorkGroup file for the `**KnowledgeId:**` value.
     - **For `amend`/`update`**: resolve the returned stable identity and perform that targeted mutation; never create a duplicate.
     - **For `flush`**: consolidate the journal and perform one create/update transaction, using KnowledgeId or one targeted title lookup when available.
     - **After create**: write the returned ID back as `**KnowledgeId:**` in the WorkGroup file.
   - [ ] If MCP is unavailable for a required persistence action: queue the classified consolidated delta once to `knowzcode/pending_captures.md` (same format as closer — see `agents/closer.md` MCP Graceful Degradation) AND announce to user: `**Vault capture skipped — MCP unavailable. Consolidated delta queued to pending_captures.md. Run /knowz flush when MCP is available.**`

   Do NOT silently skip. "Light mode" means fewer agents — not fewer artifacts.

**DONE** — Lightweight workflow: bounded knowledge context + one builder lineage. Skipped: analyst, architect, reviewer, closer, scanners, and default specialist fan-out.

> **Note on compliance in Tier 2**: use per-agent compliance criteria by default. If blocking compliance is required or explicitly requested, route to Tier 3 or dispatch one fresh enterprise-enforcer; never silently omit active blocking controls.
>
> **Note on UI design in Tier 2**: frontend-designer is not spawned in Light mode. If the user explicitly requests design review in a Light workflow, the lead recommends `--tier full` for the design-intensive scope.
