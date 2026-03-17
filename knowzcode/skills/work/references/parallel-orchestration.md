# Parallel Teams Orchestration — Work Skill (Tier 3)

When Parallel Teams mode is active, follow these 4 stages instead of spawning one agent per phase sequentially. The same phase spawn prompts (defined in [spawn-prompts.md](spawn-prompts.md)) are reused — what changes is WHEN agents are spawned and HOW MANY run concurrently.

---

## Stage 0: Team Creation + Parallel Discovery

1. Create team `kc-{wgid}`
2. Read knowzcode context files (lead does initial load for spawn prompts)
3. **MCP Probe** — determine vault availability BEFORE spawning:
   a. Read `knowzcode/knowzcode_vaults.md` — partition entries into CONFIGURED (non-empty ID) and UNCREATED (empty ID)
   b. Call `list_vaults(includeStats=true)` **always** — regardless of whether any IDs exist in the file
   c. If `list_vaults()` fails:
      - Check if `knowzcode/knowzcode_vaults.md` has any CONFIGURED entries (non-empty ID)
      - **If CONFIGURED entries exist**: Set `MCP_ACTIVE = true`, `VAULTS_CONFIGURED = true` — vault agents will verify connectivity independently via their Startup Verification. Announce `**MCP Status: Lead probe failed — delegating verification to vault agents**`. Proceed to Step 4.
      - **If no CONFIGURED entries** (all empty IDs or no file): Set `MCP_ACTIVE = false`, announce `**MCP Status: Not connected**`, skip Group B spawn
   d. If `list_vaults()` succeeds AND UNCREATED list is non-empty → present the **Vault Creation Prompt**:

      ```markdown
      ## Vault Setup

      Your Knowz API key is valid and MCP is connected, but {N} default vault(s) haven't been created yet.
      Creating vaults enables knowledge capture throughout the workflow:

      | Vault | Type | Description | Written During |
      |-------|------|-------------|----------------|
      ```

      Build table rows dynamically from the UNCREATED entries only. For each uncreated vault, derive the "Written During" column from its Write Conditions field in `knowzcode_vaults.md`. Example rows:
      - `| Code Patterns | code | Learnings, gotchas, and architecture insights from the codebase | Phase 2A (implementation patterns), Phase 3 (workarounds, performance) |`
      - `| Ecosystem Knowledge | ecosystem | Business rules, conventions, decisions, and cross-system details | Phase 1A (scope decisions), Phase 2B (security, quality), Phase 3 (conventions) |`
      - `| Finalizations | finalizations | Final summaries documenting complete execution and outcomes | Phase 3 (completion record) |`

      Then present options:
      ```
      Options:
        **A) Create all {N} vaults** (recommended)
        **B) Select which to create**
        **C) Skip** — proceed without vaults (can create later with `/knowz setup`)
      ```

   e. Handle user selection:
      - **A**: For each UNCREATED entry, call MCP `create_vault(name, description)`. If `create_vault` is not available, fall back to matching by name against `list_vaults()` results. Update `knowzcode_vaults.md`: fill the ID field with the server-returned vault ID and change the H3 heading from `(not created)` to the vault ID. If creation fails for some vaults, update only successful ones, report failures, and let user decide.
      - **B**: Ask which vaults to create, then create only selected ones using the same process as A.
      - **C**: Log `"Vault creation skipped — knowledge capture disabled."` Continue.
   f. After resolution, set:
      - `MCP_ACTIVE = true` (MCP works regardless of vault creation outcome)
      - `VAULTS_CONFIGURED = true` if at least 1 vault now has a valid ID, else `false`
      - Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`
4. **Spawn Group A**:
   Create tasks first, pre-assign, then spawn with task IDs:
   - If `SCOUT_MODE = "full"` (default): spawn 3 context scouts (specs, workgroups, backlog) + analyst + architect (5 agents):
     - `TaskCreate("Scout: specs context")` → `TaskUpdate(owner: "context-scout-specs")`
     - `TaskCreate("Scout: workgroups context")` → `TaskUpdate(owner: "context-scout-workgroups")`
     - `TaskCreate("Scout: backlog context")` → `TaskUpdate(owner: "context-scout-backlog")`
   - If `SCOUT_MODE = "minimal"`: spawn 1 context-scout (combined scan) + analyst + architect (3 agents):
     - `TaskCreate("Scout: combined context")` → `TaskUpdate(owner: "context-scout")`
   - If `SCOUT_MODE = "none"`: spawn analyst + architect only (2 agents). Analyst and architect scan the codebase independently without pre-loaded scout context.
   - Always:
     - `TaskCreate("Phase 1A: Impact analysis for {goal}")` → `TaskUpdate(owner: "analyst")`
     - `TaskCreate("Pre-load architecture context and speculative research")` → `TaskUpdate(owner: "architect")`
   - If `CODEBASE_SCANNER_ENABLED = true` (default):
     - Derive two search focuses from the goal:
       - **Scanner-Direct**: source code search — grep for goal keywords, read affected code paths
       - **Scanner-Tests**: test discovery — search test directories for tests covering the goal area
     - `TaskCreate("Scanner: direct codebase scan for {goal}")` → `TaskUpdate(owner: "scanner-direct")`
     - `TaskCreate("Scanner: test coverage scan for {goal}")` → `TaskUpdate(owner: "scanner-tests")`
   Spawn all Group A agents with their `{task-id}` in the spawn prompt (use spawn prompts from [spawn-prompts.md](spawn-prompts.md)).
5. **Spawn Group B** (vault liaison — same turn as Group A): If `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`:
   Spawn `knowledge-liaison` (persistent) with task ID and goal:
   - `TaskCreate("Knowledge liaison: vault coordination")` → `TaskUpdate(owner: "knowledge-liaison")`
   - Spawn with spawn prompt from [spawn-prompts.md](spawn-prompts.md). The knowledge-liaison handles initial `knowz:reader` dispatch, pending captures check, and all subsequent vault I/O.
   If `VAULTS_CONFIGURED = false` or `MCP_AGENTS_ENABLED = false`, skip Group B and log: `Vault agents skipped — no vaults configured` or `Vault agents skipped — MCP agents disabled in orchestration config.`
6. **Spawn Group C** (specialist agents — same turn as Groups A and B): If `SPECIALISTS_ENABLED` is non-empty:
   Create tasks first, pre-assign, then spawn with task IDs:
   - If `security-officer` in list: `TaskCreate("Security officer: initial threat scan")` → `TaskUpdate(owner: "security-officer")`
   - If `test-advisor` in list: `TaskCreate("Test advisor: coverage baseline")` → `TaskUpdate(owner: "test-advisor")`
   - If `project-advisor` in list: `TaskCreate("Project advisor: backlog context")` → `TaskUpdate(owner: "project-advisor")`
   Spawn each enabled specialist with its `{task-id}` in the spawn prompt (use spawn prompts from [spawn-prompts.md](spawn-prompts.md)).
   If `SPECIALISTS_ENABLED` is empty, skip Group C.
7. **Roster confirmation** — lead lists every spawned agent by name to the user. Include scanners and Group C specialists if active. If `VAULTS_CONFIGURED` was true but the knowz reader task is missing from the roster, STOP and re-dispatch before continuing.
8. All spawned agents work immediately in parallel (context scouts are cheap Sonnet read-only agents; scanners are lightweight general-purpose agents; specialists are Sonnet read-only agents). Agent count depends on orchestration config: 2-11 agents at Stage 0.
9. Scouts broadcast findings → analyst and architect consume as messages. Specialists work independently on their Stage 0 tasks.

**Key**: The analyst does NOT wait for scouts, scanners, or specialists to finish. It starts scanning the codebase immediately. Scout and scanner findings arrive as messages and enrich the analyst's work as they arrive. The analyst also streams `[PRELIMINARY]` NodeID findings to the architect as it discovers them (see Preliminary Findings Protocol). Specialist findings are consumed by the lead at gates.

---

## Stage 1: Analysis + Specification

1. Analyst completes Change Set (includes dependency map — see `agents/analyst.md`)
2. Lead reads analyst's task summary
3. Shut down scanners (scanner-direct, scanner-tests) if they were spawned — no longer needed after analysis
3. **Specialist Change Set reviews** (if `SPECIALISTS_ENABLED` non-empty): Create review tasks blocked on analysis:
   - If `security-officer` active: `TaskCreate("Security officer: Change Set review", addBlockedBy: [analysis-task-id])` → `TaskUpdate(owner: "security-officer")`. DM security-officer: `"**New Task**: #{task-id} — Review Change Set for security risk. Rate each NodeID."`
   - If `test-advisor` active: `TaskCreate("Test advisor: Change Set test strategy", addBlockedBy: [analysis-task-id])` → `TaskUpdate(owner: "test-advisor")`. DM test-advisor: `"**New Task**: #{task-id} — Recommend test types per NodeID."`
4. Lead presents **Quality Gate #1** to user (see [quality-gates.md](quality-gates.md))
5. User approves (or rejects → re-run analyst with feedback)
6. Lead sends DM to architect with the approved Change Set
7. **Spec Drafting** — choose path based on NodeID count and `PARALLEL_SPEC_THRESHOLD`:

   **Path A: Standard (fewer than PARALLEL_SPEC_THRESHOLD NodeIDs)**
   - Lead creates spec-drafting tasks for architect (1 task per NodeID, `addBlockedBy: [analysis-task-id]`):
     - `TaskCreate("Spec: NodeID-X")` → `TaskUpdate(taskId, owner: "architect")`
     - DM architect with task IDs: `"**New Tasks**: #{id-1} Spec: NodeID-A, #{id-2} Spec: NodeID-B. Approved Change Set: {summary}"`
   - Architect is already warm (pre-loaded + speculative research during Stage 0) → specs drafted FAST
   - If Gate #1 rejected: shut down architect, re-run analyst with feedback, re-spawn architect after

   **Path B: Parallel Spec Drafting (PARALLEL_SPEC_THRESHOLD or more NodeIDs)**
   - Lead DMs architect the full approved Change Set and asks for a partition plan (see `agents/architect.md` — Parallel Spec Coordination)
   - Architect proposes NodeID partitions (1-2 NodeIDs each, max 3 partitions, respecting same-spec and interface constraints)
   - Lead spawns spec-drafter agents — one per partition:
     - Spec-drafters use the `architect` agent definition with a scoped spawn prompt
     - Each drafter gets: its NodeID partition, architect's research findings, cross-NodeID interface constraints, consolidation instructions
     - `TaskCreate("Spec draft: NodeID-A, NodeID-B")` → `TaskUpdate(owner: "spec-drafter-1")`
     - Max 3 spec-drafters: `ceil(NodeID_count / 2)`, capped at 3
   - Spec-drafters draft specs in parallel
   - After all spec-drafters complete: architect runs consistency review (cross-spec alignment, naming, VERIFY coverage)
   - Shut down spec-drafters after consistency review
   - If Gate #1 rejected: shut down architect and any spec-drafters, re-run analyst with feedback, re-spawn architect after

8. Architect completes specs (Path A) or architect completes consistency review (Path B)
9. **Test-advisor spec review** (if `test-advisor` in `SPECIALISTS_ENABLED`): After specs drafted, create spec testability review task:
   - `TaskCreate("Test advisor: spec testability review", addBlockedBy: [spec-task-id])` → `TaskUpdate(owner: "test-advisor")`
   - DM test-advisor: `"**New Task**: #{task-id} — Review specs for testability. Check VERIFY criteria are automatable."`
10. Lead presents **Quality Gate #2** to user (see [quality-gates.md](quality-gates.md))
11. User approves (or rejects → architect revises)
12. Pre-implementation commit: `git add knowzcode/ && git commit -m "KnowzCode: Specs approved for {wgid}"`
13. Shut down context-scouts (no longer needed after specs approved).
14. Keep analyst alive briefly (available for scope questions during early implementation)
15. Keep architect alive through Stage 2 (consultative role — spec clarifications for builders, no code or spec edits)

---

## Stage 2: Parallel Implementation + Incremental Review

1. Lead examines dependency map from analyst:
   - Group NodeIDs into independent partitions (no shared files between groups)
   - Determine builder count: 1 builder per independent group, max `MAX_BUILDERS` (default 5, configurable in `knowzcode_orchestration.md`)

2. Create builder tasks and spawn:
   - `TaskCreate("Implement NodeIDs [A, B]", addBlockedBy: [spec-task-id])` → `TaskUpdate(owner: "builder-1")`
   - `TaskCreate("Implement NodeIDs [C]", addBlockedBy: [spec-task-id])` → `TaskUpdate(owner: "builder-2")`
   - `TaskCreate("Implement NodeIDs [D, E]", addBlockedBy: [spec-task-id])` → `TaskUpdate(owner: "builder-3")`
   Spawn each builder with its `{task-id}` in the spawn prompt.
   Each builder gets its partition's specs + affected files list.
   **NO TWO BUILDERS TOUCH THE SAME FILE**

3. Notify architect of builder spawn:
   - Lead DMs architect: `"Builders spawned for Stage 2. Introduce yourself to: {builder-1, builder-2, ...}"`
   - Architect sends brief availability message to each builder (see `agents/architect.md` — Proactive Availability)

4. Each builder creates subtasks per NodeID in the task list:
   - `"TDD: NodeID-A tests"` → `"TDD: NodeID-A implementation"` → `"TDD: NodeID-A verify"`
   - Builder works through subtasks, marks each complete with summary

5. Create reviewer tasks and spawn — one per builder partition:
   - `TaskCreate("Audit partition 1: NodeIDs [A, B]", addBlockedBy: [implement-A-task-id])` → `TaskUpdate(owner: "reviewer-1")`
   - `TaskCreate("Audit partition 2: NodeIDs [C]", addBlockedBy: [implement-C-task-id])` → `TaskUpdate(owner: "reviewer-2")`
   - `TaskCreate("Audit partition 3: NodeIDs [D, E]", addBlockedBy: [implement-D-task-id])` → `TaskUpdate(owner: "reviewer-3")`
   Spawn each reviewer with its `{task-id}` + partition's specs + VERIFY criteria.
   Reviewer stays idle until its paired builder marks first NodeID implementation complete.
   Each reviewer audits incrementally within its partition.

6. **Specialist implementation reviews** (if `SPECIALISTS_ENABLED` non-empty): Create specialist review tasks alongside reviewer audit tasks, same `addBlockedBy`:
   - If `security-officer` active — one task per partition (runs parallel to reviewer):
     `TaskCreate("Security officer: review partition {N}", addBlockedBy: [implement-X-task-id])` → `TaskUpdate(owner: "security-officer")`
     DM security-officer: `"**New Task**: #{task-id} — Vulnerability scan for partition {N}. NodeIDs: {list}."`
   - If `test-advisor` active — one task per partition:
     `TaskCreate("Test advisor: review partition {N} tests", addBlockedBy: [implement-X-task-id])` → `TaskUpdate(owner: "test-advisor")`
     DM test-advisor: `"**New Task**: #{task-id} — Test quality review for partition {N}. NodeIDs: {list}."`
   - If `project-advisor` active — one observation task (not per-partition):
     `TaskCreate("Project advisor: observe implementation")` → `TaskUpdate(owner: "project-advisor")`
     DM project-advisor: `"**New Task**: #{task-id} — Observe builder progress, note patterns and ideas. Deliver backlog proposals before gap loop."`
   **Gate #3 is NOT blocked by specialists.** If a specialist hasn't finished, gate shows `[Pending: {specialist}]`. Lead proceeds.
   **Project-advisor early shutdown**: After project-advisor delivers backlog proposals, shut it down (before the gap loop begins).

7. Gap flow (per-partition, parallel — persistent agents, DM messaging):
   a. Each reviewer marks audit task complete with structured gap report in summary
   b. Lead creates fix task and pre-assigns:
      `TaskCreate("Fix gaps: NodeID-A", addBlockedBy: [audit-task-id])` → `TaskUpdate(owner: "builder-N")`
   c. Lead sends DM to builder with task ID and gap details:
      > **New Task**: #{fix-task-id} — Fix gaps: NodeID-A
      > **Gaps**: {file path, VERIFY criterion not met, expected vs actual}
      > Fix each gap, re-run affected tests, report completion.
   d. Builder claims fix task, fixes gaps, re-runs tests, marks fix task complete
   e. Lead creates re-audit task and pre-assigns:
      `TaskCreate("Re-audit: NodeID-A", addBlockedBy: [gap-fix-task-id])` → `TaskUpdate(owner: "reviewer-N")`
   f. Lead sends DM to reviewer: `"**New Task**: #{reaudit-task-id} — Re-audit: NodeID-A. {gap list}"`
   g. Each builder-reviewer pair repeats independently until clean — no cross-partition blocking
   — All builders and reviewers stay alive through the entire gap loop (no respawning)

8. Enterprise compliance (if enabled):
   - Lead creates parallel compliance task for each reviewer (scoped to their partition)
   - Reviewer checks compliance requirements from vault research findings
   - Runs alongside ARC audits

9. Inter-agent communication during Stage 2:
   - builder → architect: Spec clarification requests (direct messages)
   - architect → builder: Design guidance and spec intent responses (direct messages)
   - builder ↔ builder: Dependency coordination (direct messages — "I changed the User interface, FYI")
   - builder → reviewer (same partition): Implementation complete notifications (via task system)
   - reviewer → lead: Gap reports per partition (structured format via task summaries)
   - lead → builder: Fix tasks (via task creation + DM)
   - lead → reviewer: Re-audit requests (via task creation + DM)
   - security-officer → builder-N: Security guidance for sensitive partitions (max 2 DMs per builder)
   - test-advisor → builder-N: Test improvement feedback (max 2 DMs per builder)
   - security-officer ↔ test-advisor: Cross-cutting test gaps in security paths (max 2 inter-specialist DMs)
   - project-advisor → knowledge-liaison: Idea captures (`"Consider: {idea}"` — knowledge-liaison dispatches `knowz:writer` if warranted)
   - project-advisor → lead: Backlog proposals (before gap loop)

10. After all NodeIDs implemented + audited across all partitions:
    - Lead consolidates audit results from all reviewers
    - Lead consolidates specialist reports (if `SPECIALISTS_ENABLED` non-empty — include even if some specialist tasks are still pending, noting `[Pending: {specialist}]`)
    - Lead presents **Quality Gate #3** (see [quality-gates.md](quality-gates.md))
    - User decides: proceed / fix gaps / modify specs / cancel

11. Shut down analyst, architect, all builders, and all reviewers

---

## Stage 3: Finalization

1. Shut down remaining specialists (security-officer, test-advisor) if still active. Project-advisor should already be shut down from mid-Stage 2.
2. `TaskCreate("Phase 3: Finalize {wgid}", addBlockedBy: [last-audit-task-id])` → `TaskUpdate(owner: "closer")`
   Spawn `closer` with `{task-id}` in spawn prompt.
3. Closer tasks (can be parallel subtasks):
   - Update all specs to FINAL as-built
   - Update `knowzcode_tracker.md`: all NodeIDs `[WIP]` → `[VERIFIED]`
   - Write ARC-Completion log entry
   - Review architecture docs for discrepancies
   - Schedule REFACTOR tasks for tech debt
   - DM knowledge-liaison for Phase 3 capture (if vaults configured): `"Capture Phase 3: {wgid}. Your task: #{task-id}"` — knowledge-liaison dispatches writer
   - Create final atomic commit
4. Lead presents completion summary
5. **Wait for writer Phase 3 capture** (if knowledge-liaison dispatched a writer):
   - Check writer task via `TaskGet(task-id)` — wait until status is `completed`
   - **Timeout**: If >2 minutes after closer completes and writer task still not complete → proceed with shutdown and log `WARNING: Writer Phase 3 capture did not complete for {wgid}. Vault writes may be incomplete.`
6. Shutdown order: closer, knowledge-liaison (after Phase 3 writer completion), remaining agents
7. Delete team

---

## WorkGroup File Format (Parallel Mode)

In Parallel Teams mode, the WorkGroup file uses per-NodeID phase tracking instead of a single `Current Phase`:

```markdown
## Change Set
| NodeID | Phase | Builder | Status | Timestamp |
|--------|-------|---------|--------|-----------|
| Authentication | 2A | builder-1 | Implementing | ... |
| UserProfile | 2B | builder-1 | Under review | ... |
| LIB_DateFormat | 2A | builder-2 | Tests passing | ... |

## Autonomous Mode
Active/Inactive

## Current Stage
Stage 2: Parallel Implementation + Incremental Review
```

---

## Task Dependency Graph

When creating tasks, model the dependency chain with `addBlockedBy` and pre-assign with `owner`:

| Task | Blocked By | Owner |
|------|-----------|-------|
| Scout: specs context | (none) | context-scout-specs |
| Scout: workgroups context | (none) | context-scout-workgroups |
| Scout: backlog context | (none) | context-scout-backlog |
| Knowledge liaison: vault coordination | (none) | knowledge-liaison |
| Scanner: direct codebase scan | (none) | scanner-direct |
| Scanner: test coverage scan | (none) | scanner-tests |
| Phase 1A analysis | (none — scouts + scanners enrich via broadcast) | analyst |
| Architect pre-load + speculative research | (none — receives [PRELIMINARY] DMs from analyst) | architect |
| Security officer: initial threat scan | (none — Group C) | security-officer |
| Test advisor: coverage baseline | (none — Group C) | test-advisor |
| Project advisor: backlog context | (none — Group C) | project-advisor |
| Security officer: Change Set review | Phase 1A analysis | security-officer |
| Test advisor: Change Set test strategy | Phase 1A analysis | test-advisor |
| Spec: NodeID-X | Phase 1A (gate approval) | architect (Path A) or spec-drafter-N (Path B) |
| Spec consistency review | All spec drafts complete (Path B only) | architect |
| Test advisor: spec testability review | Spec: NodeID-X | test-advisor |
| Implement: NodeID-X | Spec: NodeID-X | builder-N |
| Audit: NodeID-X | Implement: NodeID-X | reviewer-N |
| Security officer: review partition N | Implement: NodeID-X | security-officer |
| Test advisor: review partition N tests | Implement: NodeID-X | test-advisor |
| Project advisor: observe implementation | (none) | project-advisor |
| Fix gaps: NodeID-X round N | Audit: NodeID-X (or re-audit N-1) | builder-N |
| Re-audit: NodeID-X round N | Fix gaps round N | reviewer-N |
| Phase 3 finalization | All audits approved | closer |
| Reader: vault queries | (none — dispatched by knowledge-liaison) | knowz:reader |
| Writer: Capture Phase 1A | Phase 1A (gate approval — dispatched by knowledge-liaison) | knowz:writer |
| Writer: Capture Phase 2A | Implement: NodeID-X (dispatched by knowledge-liaison) | knowz:writer |
| Writer: Capture Phase 2B | All audits approved (dispatched by knowledge-liaison) | knowz:writer |
| Writer: Capture Phase 3 | Phase 3 finalization (dispatched by knowledge-liaison) | knowz:writer |

---

## Sequential Teams / Subagent Flow (Tier 3 Fallback)

> **Note:** Sequential Teams does not use orchestration config settings except `MCP_AGENTS_ENABLED`.

When using Sequential Teams (`--sequential`) or Subagent Delegation, follow the traditional one-agent-per-phase flow. For each phase: spawn the agent, create a task, wait for completion, present quality gate, shut down agent, proceed to next phase.

### MCP Probe (Sequential/Subagent)

Determine vault availability before Phase 1A:

1. Read `knowzcode/knowzcode_vaults.md` — check for CONFIGURED entries (non-empty ID)
2. Attempt `list_vaults(includeStats=true)`
3. If succeeds AND UNCREATED entries exist → present the **Vault Creation Prompt** (same as Parallel Teams Step 3d). Handle selection identically.
4. After resolution, announce MCP status to the user:
   - `list_vaults()` succeeded: `**MCP Status: Connected — N vault(s) available**`
   - `list_vaults()` failed but configured vaults exist: `**MCP Status: Lead probe failed — closer will verify at Phase 3**`
   - No configured vaults: `**MCP Status: Not configured**`

The closer agent independently verifies MCP at Phase 3 regardless of this result (see `agents/closer.md` — Startup MCP Verification). This probe is for the user announcement and vault creation opportunity only.
