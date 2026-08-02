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

Tier 2 does not form a team. Use the lead's `VAULT_BASELINE`; only when a material component-specific knowledge gap remains, resume a compatible knowledge-liaison or dispatch one bounded `Agent(subagent_type="knowzcode:knowledge-liaison", description="Prepare targeted context", prompt=<baseline + targeted question>)`. Require a concise Context Briefing and skip duplicate broad vault queries.

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
   - Pre-implementation commit: inspect `git status --short` and scoped diffs, then run `git add -- knowzcode/workgroups/{wgid}.md knowzcode/knowzcode_tracker.md {approved-spec-paths}`. Verify `git diff --cached --check` and `git diff --cached --name-only`; abort on any unapproved path before `git commit -m "KnowzCode: Light spec approved for {wgid}"`.

---

## Light Phase 2A: Implementation

Resume a compatible builder lineage when one owns this exact spec/scope/checkpoint. Otherwise dispatch `Agent(subagent_type="knowzcode:builder", description="Light Phase 2A implementation", prompt=<standard bounded Phase 2A packet>)` using `${CLAUDE_PLUGIN_ROOT}/skills/work/references/spawn-prompts.md`. Include only the lightweight spec, assigned VERIFY IDs, owned files, checkpoint, constraints, and a bounded result contract.

The builder self-verifies against spec VERIFY criteria — no separate audit phase.

---

## Light Phase 2B: Smoke Testing (Opt-in)

Only if user explicitly requested smoke testing (e.g., `--smoke-test` in `$ARGUMENTS` or natural language: "smoke test", "test it running", "verify it works"):

Dispatch a fresh independent smoke-tester via `Agent(subagent_type="knowzcode:smoke-tester", description="Smoke test", prompt=<bounded task packet>)`. Do not fork or resume the builder lineage.

If smoke test fails: create fix tasks for builder, re-run smoke-tester. 3-iteration cap, then escalate. App lifecycle managed by smoke-tester (see `${CLAUDE_PLUGIN_ROOT}/agents/smoke-tester.md`).

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
4. **Knowledge capture**:
   - Classify the consolidated delta with `vault-delta` and `explicit_save: true`; store `FINAL_CAPTURE_ACTION` and its stable identity/reason.
   - For `skip`, make no MCP or pending-queue write. For `batch` (defensive fallback), retain it and reclassify at the explicit final boundary. For `amend`, `update`, or `flush`, send the exact classified action, content-bound parent identity/key, explicit mutation plan, and known `KnowledgeId` values to a compatible knowledge-liaison or dispatch one writer directly. Each logical mutation receives a distinct deterministic child key. Missing amend/update identity returns `MISSING_AMEND_IDENTITY` or `MISSING_UPDATE_IDENTITY` and never falls through to create. Wait for the bounded result (max 2 minutes), then release the lineage.
5. **Vault Write Checklist (MUST — do not skip, do not defer)**:
   You MUST attempt every item. Check each off or report failure to the user.
   - [ ] WorkGroup file exists in `knowzcode/workgroups/{wgid}.md`
   - [ ] `knowzcode_tracker.md` updated with NodeID status
   - [ ] `knowzcode_log.md` entry written
   - [ ] Classified persistence handled exactly once when `FINAL_CAPTURE_ACTION` is `amend`, `update`, or `flush`:
     - Read `knowz-vaults.md`, resolve vault IDs. Read the WorkGroup file for the `**KnowledgeId:**` value.
     - **For `amend`/`update`**: give the writer the exact `KnowledgeId`, operation, and stable mutation key for the targeted mutation. A missing ID is an explicit error; never create a duplicate or replacement implicitly.
     - **For `flush`**: give one writer the consolidated journal, complete ordered mutation plan, content-bound parent key, and distinct child key for every exact create/amend/update identity.
     - **After create**: write the returned ID back as `**KnowledgeId:**` in the WorkGroup file.
   - [ ] If MCP is unavailable for a required persistence action before writer dispatch: have the knowledge-liaison queue each eligible logical mutation exactly once in project-root `knowz-pending.md` using its distinct stable child key; never queue an amend/update missing its exact `KnowledgeId`. If a writer already started, require confirmation for every expected mutation key and do not append again. Announce: `**Vault capture skipped — MCP unavailable. Consolidated delta queue status: {confirmed mutation keys | confirmation required}. Run /knowz flush when confirmed.**`

   Do NOT silently skip. "Light mode" means fewer agents — not fewer artifacts.
6. Final commit: inspect `git status --short` and `git diff -- {explicit-approved-paths}`; stage only the resolved active WorkGroup, tracker, approved specs, and approved implementation files with `git add -- {explicit-approved-paths}`. Verify `git diff --cached --check` and the exact `git diff --cached --name-only` list before `git commit -m "feat: {goal} (WorkGroup {wgid})"`. Never stage a directory wholesale.
7. Report completion.

**DONE** — Lightweight workflow: bounded knowledge context + one builder lineage. Skipped: analyst, architect, reviewer, closer, scanners, and default specialist fan-out.

> **Note on compliance in Tier 2**: use per-agent compliance criteria by default. If blocking compliance is required or explicitly requested, route to Tier 3 or dispatch one fresh enterprise-enforcer; never silently omit active blocking controls.
>
> **Note on UI design in Tier 2**: frontend-designer is not spawned in Light mode. If the user explicitly requests design review in a Light workflow, the lead recommends `--tier full` for the design-intensive scope.
