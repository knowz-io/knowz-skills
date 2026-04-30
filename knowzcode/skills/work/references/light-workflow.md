# Tier 2 Light Workflow — Phase Details

Detailed phase instructions for Tier 2 (Light) execution. The lead reads this file when a Light workflow is selected in `/knowzcode:work`.

---

## Contents

- [Team Setup](#team-setup)
- [Light Phase 1: Impact Scan + Spec](#light-phase-1-impact-scan--spec)
- [Light Phase 2A: Implementation](#light-phase-2a-implementation-builder-teammate)
- [Light Phase 2B: Smoke Testing (Opt-in)](#light-phase-2b-smoke-testing-opt-in)
- [Light Phase 3: Finalization](#light-phase-3-inline--lead-coordinates-knowledge-liaison-captures)

---

## Team Setup

If Agent Teams is available (TeamCreate succeeded in Step 2):
1. Create team `kc-{wgid}` (already done in Step 2)
2. Spawn `knowledge-liaison` as persistent teammate using the Stage 0 spawn prompt from `references/spawn-prompts.md`. Pass `VAULT_BASELINE` from Step 3.6 in the spawn prompt.
3. Knowledge-liaison performs startup protocol (reads local context, dispatches vault readers if vaults configured, sends Context Briefing — but only to lead since no analyst/architect in Tier 2)

If Agent Teams is NOT available (subagent fallback):
- Knowledge-liaison dispatched as one-shot `Task(subagent_type="knowzcode:knowledge-liaison")` for vault baseline research before Phase 2
- Degradation warning already shown in Step 2

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

## Light Phase 2A: Implementation (Builder teammate)

**Agent Teams mode**: Spawn the builder as a teammate in the `kc-{wgid}` team using the standard Phase 2A spawn prompt from `references/spawn-prompts.md` (same prompt for both tiers). The builder runs as a persistent teammate alongside the knowledge-liaison.

**Subagent fallback**: Spawn the builder via `Task(subagent_type="knowzcode:builder")` with the standard Phase 2A prompt (current behavior).

The builder self-verifies against spec VERIFY criteria — no separate audit phase.

---

## Light Phase 2B: Smoke Testing (Opt-in)

Only if user explicitly requested smoke testing (e.g., `--smoke-test` in `$ARGUMENTS` or natural language: "smoke test", "test it running", "verify it works"):

**Agent Teams mode**: Spawn the smoke-tester as a teammate in the `kc-{wgid}` team using the Phase 2B smoke-tester spawn prompt from `references/spawn-prompts.md`.

**Subagent fallback**: Spawn via `Task(subagent_type="smoke-tester", description="Smoke test", prompt=<spawn prompt>)`.

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
6. **Knowledge-Liaison Capture** (Agent Teams mode only):
   - DM the knowledge-liaison: `"Capture Phase 3: {wgid}. Your task: #{task-id}"`
   - Wait for knowledge-liaison to confirm capture (max 2 minutes, else proceed with warning)
   - After capture, shut down knowledge-liaison, then delete team `kc-{wgid}`
7. **Vault Write Checklist (MUST — do not skip, do not defer)**:
   You MUST attempt every item. Check each off or report failure to the user.
   - [ ] WorkGroup file exists in `knowzcode/workgroups/{wgid}.md`
   - [ ] `knowzcode_tracker.md` updated with NodeID status
   - [ ] `knowzcode_log.md` entry written
   - [ ] MCP progress capture attempted:
     - Read `knowz-vaults.md`, resolve vault IDs. Read the WorkGroup file for the `**KnowledgeId:**` value.
     - **If KnowledgeId exists**: call `get_knowledge_item(id)`. If found → `update_knowledge` with the completion record. If not found → remove `**KnowledgeId:**` from the WorkGroup file, fall through to create.
     - **If no KnowledgeId**: check for existing entry via `search_by_title_pattern("WorkGroup: {wgid}*")` — update if found, create if not.
     - **After create**: write the returned ID back as `**KnowledgeId:**` in the WorkGroup file.
   - [ ] If MCP unavailable: queue capture to `knowzcode/pending_captures.md` (same format as closer — see `agents/closer.md` MCP Graceful Degradation) AND announce to user: `**Vault capture skipped — MCP unavailable. Queued to pending_captures.md. Run /knowz flush when MCP is available.**`

   Do NOT silently skip. "Light mode" means fewer agents — not fewer artifacts.

**DONE** — Lightweight team: knowledge-liaison (persistent) + builder. Skipped: analyst, architect, reviewer, closer.
