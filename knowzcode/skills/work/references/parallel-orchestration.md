# Parallel Orchestration — Work Skill (Tier 3)

Use these four stages for adaptive parallel delegation and for the optional coordinated-team mode. The same bounded task packets in [spawn-prompts.md](spawn-prompts.md) apply. Classify every unit before dispatch; parallelism alone never justifies Team mode.

All `TaskCreate`/`TaskUpdate`/`TaskGet`, task-ID, DM, mailbox, and peer-message examples below are **coordinated-team-only renderings**. In named-agent/adaptive mode, the lead records dependencies locally, dispatches or resumes each worker with a bounded capsule, waits for its result, and routes any necessary delta itself. A named agent never claims/creates shared tasks or messages peers. The dedicated named-agent section remains authoritative when modes differ.

In every task example, the variable to the left of `:=` captures the task ID returned by `TaskCreate`. `TaskCreate` receives only `subject`, `description`, optional `activeForm`, and optional `metadata`. Set dependencies, ownership, and status only in a subsequent `TaskUpdate({taskId: task_id, ...})`; never pass `addBlockedBy`, `addBlocks`, or `owner` to `TaskCreate`.

## Contents

- [Model Overrides](#model-overrides-applies-to-every-spawn-below)
- [Conditional Roles and Standards](#conditional-roles-and-standards)
- [Stage 0: Context-Efficient Discovery](#stage-0-context-efficient-discovery)
- [Stage 1: Analysis + Specification](#stage-1-analysis--specification)
- [Stage 2: Parallel Implementation + Incremental Review](#stage-2-parallel-implementation--incremental-review)
- [Stage 3: Finalization](#stage-3-finalization)
- [WorkGroup File Format (Parallel Mode)](#workgroup-file-format-parallel-mode)
- [Task Dependency Graph](#task-dependency-graph)
- [Sequential / Named-Agent Flow](#sequential--named-agent-flow)

---

## Conditional Roles and Standards

Resolve these only after tier and scope classification. They never enable Agent Teams; use named agents unless selected workers genuinely need task/mailbox coordination.

- `SPECIALISTS_ENABLED` defaults to `default_specialists` or empty. `--specialists[=security,test,project,design]` and explicit natural-language requests add the named evidence role; `--no-specialists` clears security/test/project. Tier 2 skips the panel. Tier 3 sequential runs selected roles one at a time. Every role needs a distinct question and bounded deliverable.
- `FRONTEND_DESIGNER_ENABLED` resolves in order: `--no-frontend-designer`/config false; explicit flag/config true; explicit design/UX/a11y request; otherwise config `auto` performs a targeted UI-surface glob (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.razor`, `*.xaml`, `main.dart`, or relevant HTML/manifest). Tier 2 uses one fresh named designer only for explicit runtime/UI verification. `--no-specialists` does not disable this role.
- `ENTERPRISE_ENFORCER_ENABLED` resolves in order: explicit opt-out; explicit opt-in (skeleton mode allowed); otherwise an existing manifest with `compliance_enabled: true` and at least one active non-empty local or configured vault/KnowledgeId guideline source. Tier 2 normally uses per-agent checks. Tier 3 uses a fresh named read-only enforcer unless peer coordination independently justifies a teammate.

When compliance is active, parse and carry `pull_standards_at_start`, `preserve_guideline_provenance`, `show_advisory_issues`, `require_signoff_for_finalization`, `push_audit_results`, `push_completion_records`, and `include_in_audit` with documented defaults. Pull vault standards only when MCP compliance is enabled and a concrete configured source exists; preserve provenance unless disabled, verify retrieved guidance against live code/docs, and pause on blocking conflicts. Configuration may forbid a write but never supplies user authorization for an otherwise read-only operation.

Announce only enabled roles and their activation reasons. Release conditional workers as soon as their bounded deliverable or handoff completes.

---

## Model Overrides (applies to every spawn below)

At every spawn or resume decision in Stages 0-3, resolve the model via `MODEL_FOR(agent_name, PROFILE, EXECUTE_ON_FABLE)` from [profile-models.md](profile-models.md):

- If `MODEL_FOR` returns non-null (e.g. `"sonnet"` under `PROFILE == "advisor"` for builder/reviewer/closer/smoke-tester; `"fable"` for planning/analysis/spec/review agents and `"opus"` for execution agents under `PROFILE == "frontier"`): include `model: <value>` in the spawn call.
- If `MODEL_FOR` returns null: omit the `model` parameter entirely — the agent's frontmatter default is used.
- When `FABLE_DOWNGRADE == true` (Fable unavailable — see `/knowzcode:work` Step 2.3): substitute `"opus"` for any `"fable"` result before spawning.

At every spawn whose prompt contains the `{advisor_guidance}` token (see [spawn-prompts.md](spawn-prompts.md#advisor_guidance-placeholder)): substitute the Advisor Guidance block when `PROFILE == "advisor"` AND `MODEL_FOR(agent, PROFILE) == "sonnet"`; otherwise substitute an empty string.

At every spawn whose prompt contains the `{spec_depth_guidance}` token (analyst, architect, and spec-drafters — see [spawn-prompts.md](spawn-prompts.md#spec_depth_guidance-placeholder)): substitute the Spec-Depth Guidance block when `PROFILE == "frontier"`; otherwise substitute an empty string.

`PROFILE`, `EXECUTE_ON_FABLE`, and `FABLE_DOWNGRADE` are resolved in `/knowzcode:work` Steps 2.3-2.4. They do not change inside a reusable lineage.

---

## Stage 0: Context-Efficient Discovery

1. Reuse the deterministic Step 1.4 classification and spec search. Read only the project files required to construct the analyst capsule.
2. Use `MCP_ACTIVE`, `VAULTS_CONFIGURED`, and `VAULT_BASELINE` from Step 3.6. Do not repeat the MCP probe or baseline queries. Resume a compatible knowledge-liaison only for a material targeted gap; otherwise keep baseline handling local.
3. Start one analyst with the goal, candidate scope, relevant file list, prior-spec matches, baseline summary, and a bounded result contract.
4. Add an architect before Gate #1 only when architecture ambiguity blocks a reliable Change Set. Otherwise dispatch or resume the architect after approval, when NodeIDs and spec scope are stable.
5. Add a direct-code scanner or test scanner only when its slice is independently useful and material uncertainty remains. Prefer the lead's deterministic `Glob`/`Grep` index over duplicative search agents.
6. Add security, test, project, frontend, or enterprise specialists only when the requested scope or active controls require their evidence. Each receives a distinct scope and bounded output.
7. Default fan-out is the analyst plus at most two independently useful read-only workers. Record a reason for every additional worker.

For adaptive delegation, workers return bounded summaries/artifact paths to the lead. For coordinated-team mode, the first eligible teammate spawn forms the runtime-managed team; create and assign task IDs before subsequent teammate dispatch and use mailbox messages only for decision-relevant peer coordination. If teammate spawning is unavailable, continue with equivalent named agents and record `CAPABILITY_FALLBACK`.

The analyst starts immediately and does not wait for optional workers. It may send at most three high-confidence `[PRELIMINARY]` NodeID findings to an already-active architect; otherwise those findings stay in its final result.

---

## Stage 1: Analysis + Specification

1. Analyst completes Change Set (includes dependency map — see `${CLAUDE_PLUGIN_ROOT}/agents/analyst.md`)
2. Lead reads analyst's task summary
3. Shut down scanners (scanner-direct, scanner-tests) if they were spawned — no longer needed after analysis
4. **Specialist Change Set reviews** (if `SPECIALISTS_ENABLED` non-empty): Create review tasks blocked on analysis:
   - If `security-officer` active: `security_change_task_id := TaskCreate({subject: "Security officer: Change Set review", description: "Review the approved Change Set for security risk and rate each NodeID."})`; then `TaskUpdate({taskId: security_change_task_id, addBlockedBy: [analysis_task_id], owner: "security-officer"})`. DM the returned ID to security-officer.
   - If `test-advisor` active: `test_strategy_task_id := TaskCreate({subject: "Test advisor: Change Set test strategy", description: "Recommend test types and coverage needs for each Change Set NodeID."})`; then `TaskUpdate({taskId: test_strategy_task_id, addBlockedBy: [analysis_task_id], owner: "test-advisor"})`. DM the returned ID to test-advisor.
4b. **Group D Change Set reviews** (if Group D officers active):
   - If `FRONTEND_DESIGNER_ENABLED`: `design_change_task_id := TaskCreate({subject: "Frontend designer: Change Set design review", description: "Rate each NodeID's UI impact and identify design VERIFY needs."})`; then `TaskUpdate({taskId: design_change_task_id, addBlockedBy: [analysis_task_id], owner: "frontend-designer"})`. DM the returned ID to frontend-designer.
   - If `ENTERPRISE_ENFORCER_ENABLED`: `compliance_map_task_id := TaskCreate({subject: "Enterprise enforcer: Change Set guideline map", description: "Map active guidelines and required ARC criteria to Change Set NodeIDs."})`; then `TaskUpdate({taskId: compliance_map_task_id, addBlockedBy: [analysis_task_id], owner: "enterprise-enforcer"})`. DM the returned ID to enterprise-enforcer.
4. Lead presents **Quality Gate #1** to user (see [quality-gates.md](quality-gates.md))
5. User approves (or rejects → re-run analyst with feedback)
6. Lead sends DM to architect with the approved Change Set
7. **Spec Drafting** — choose path based on NodeID count and `PARALLEL_SPEC_THRESHOLD`:

   **Path A: Standard (fewer than PARALLEL_SPEC_THRESHOLD NodeIDs)**
   - Lead creates one spec-drafting task per NodeID:
     - `spec_task_id := TaskCreate({subject: "Spec: NodeID-X", description: "Draft the approved specification and VERIFY criteria for NodeID-X."})`; then `TaskUpdate({taskId: spec_task_id, addBlockedBy: [analysis_task_id], owner: "architect"})`.
     - DM architect with task IDs: `"**New Tasks**: #{id-1} Spec: NodeID-A, #{id-2} Spec: NodeID-B. Approved Change Set: {summary}"`
   - Resume a compatible architect only when it was started for a real ambiguity; otherwise dispatch a fresh architect now with the approved Change Set capsule.
   - If Gate #1 is rejected, resume the analyst with the bounded decision delta when compatible. Invalidate and restart only when scope/spec/checkpoint or runtime policy changed.

   **Path B: Parallel Spec Drafting (PARALLEL_SPEC_THRESHOLD or more NodeIDs)**
   - Lead DMs architect the full approved Change Set and asks for a partition plan (see `${CLAUDE_PLUGIN_ROOT}/agents/architect.md` — Parallel Spec Coordination)
   - Architect proposes NodeID partitions (1-2 NodeIDs each, max 3 partitions, respecting same-spec and interface constraints)
   - Lead spawns spec-drafter agents — one per partition:
     - Spec-drafters use the `architect` agent definition with a scoped spawn prompt
     - Each drafter gets: its NodeID partition, architect's research findings, cross-NodeID interface constraints, consolidation instructions
     - `spec_partition_task_id := TaskCreate({subject: "Spec draft: NodeID-A, NodeID-B", description: "Draft the assigned disjoint NodeID specification partition under the approved cross-spec constraints."})`; then `TaskUpdate({taskId: spec_partition_task_id, addBlockedBy: [analysis_task_id], owner: "spec-drafter-1"})`.
     - Max 3 spec-drafters: `ceil(NodeID_count / 2)`, capped at 3
   - Spec-drafters draft specs in parallel
   - After all spec-drafters complete: architect runs consistency review (cross-spec alignment, naming, VERIFY coverage)
   - Shut down spec-drafters after consistency review
   - If Gate #1 is rejected, release temporary spec-drafters and resume the analyst/architect only when each lineage remains compatible; otherwise record invalidation and use a fresh capsule.

8. Architect completes specs (Path A) or architect completes consistency review (Path B)
9. **Test-advisor spec review** (if `test-advisor` in `SPECIALISTS_ENABLED`): After specs drafted, create spec testability review task:
   - `testability_task_id := TaskCreate({subject: "Test advisor: spec testability review", description: "Review drafted VERIFY criteria for automation and testability."})`; then `TaskUpdate({taskId: testability_task_id, addBlockedBy: [spec_task_id], owner: "test-advisor"})`.
   - DM test-advisor: `"**New Task**: #{task-id} — Review specs for testability. Check VERIFY criteria are automatable."`
9b. **Group D spec reviews** (after specs drafted):
   - If `FRONTEND_DESIGNER_ENABLED`: `design_spec_task_id := TaskCreate({subject: "Frontend designer: spec design review", description: "Verify UI-touching specs cover accessibility, responsive, and state-design criteria."})`; then `TaskUpdate({taskId: design_spec_task_id, addBlockedBy: [spec_task_id], owner: "frontend-designer"})`. DM the returned ID to frontend-designer.
   - If `ENTERPRISE_ENFORCER_ENABLED`: `compliance_spec_task_id := TaskCreate({subject: "Enterprise enforcer: spec compliance audit", description: "Audit specs for required guideline-derived VERIFY criteria and blocking omissions."})`; then `TaskUpdate({taskId: compliance_spec_task_id, addBlockedBy: [spec_task_id], owner: "enterprise-enforcer"})`. DM the returned ID to enterprise-enforcer.
10. Lead presents **Quality Gate #2** to user (see [quality-gates.md](quality-gates.md))
11. User approves (or rejects → architect revises)
12. Pre-implementation commit: inspect `git status --short` and scoped diffs; stage only `knowzcode/workgroups/{wgid}.md`, `knowzcode/knowzcode_tracker.md`, and the explicit approved spec paths with `git add -- ...`. Run `git diff --cached --check` and verify the exact `git diff --cached --name-only` list before committing. Abort if any unrelated path is staged; never stage `knowzcode/` wholesale.
13. Release the analyst after approval unless a concrete early-implementation question is already pending.
14. Retain the architect through Stage 2 only when active cross-scope clarification is likely; otherwise release it and resume from lineage if a compatible question arises.

---

## Stage 2: Parallel Implementation + Incremental Review

1. Lead examines the dependency map from analyst and creates implementation waves:
   - Topologically sort NodeIDs by dependency. A downstream NodeID is not ready until all upstream NodeIDs it depends on are implemented and audited clean.
   - Within the current ready wave, identify independent work only when file ownership does not overlap.
   - If the dependency graph is mostly serialized, run a single builder for the next ready microtask. Do not spawn extra builders just to keep concurrency high.

2. Split oversized NodeIDs into microtasks before spawning builders. Split when any signal is true:
   - The NodeID crosses layers such as DI + service + consumer + UI.
   - The expected touch set is more than 5 files or more than 500 LOC including tests.
   - The NodeID has sequential subtasks such as "interface first, then consumer, then UI".
   - A prior builder dispatch ended partial, timed out, or stopped before wiring/tests completed.

   Example splits:
   - `N5a: service interface + registration`
   - `N5b: EmailProcessingService wiring`
   - `N5c: focused unit/integration tests`

   Every microtask MUST include assigned acceptance criteria before dispatch:
   - A full NodeID receives all relevant `VERIFY:` criteria from its spec.
   - A microtask receives the exact `VERIFY:` subset or micro-acceptance criteria it is expected to satisfy.
   - Criteria outside the assigned subset remain pending for later microtasks and must not be treated as implementation gaps for the current microtask.
   - The lead records the microtask plan and criteria coverage in the WorkGroup file. A NodeID is complete only when the union of audited microtasks covers all required `VERIFY:` criteria and any cross-microtask integration criteria.

3. Determine builder count for the current wave:
   - `builder_count = min(MAX_BUILDERS, ready independent microtasks)`
   - Default `MAX_BUILDERS` is 2. Use more than 3 only when `--broad-builders` was explicitly provided and the tasks are tiny, independent, and disjoint.
   - Default `BUILDER_NODE_LIMIT` is 1. A builder receives at most one NodeID unless `builder_node_limit: 2` or `--builder-node-limit=2` is set and both NodeIDs share one bounded owned-file set.

4. Create builder tasks for the current ready wave and spawn:
   - `implement_n5a_task_id := TaskCreate({subject: "Implement N5a: service interface + registration", description: "Implement and verify the bounded N5a service-interface and registration microtask."})`; then `TaskUpdate({taskId: implement_n5a_task_id, addBlockedBy: [spec_task_id], owner: "builder-1"})`.
   - `implement_n7_task_id := TaskCreate({subject: "Implement N7: independent cache invalidation", description: "Implement and verify the bounded N7 cache-invalidation scope."})`; then `TaskUpdate({taskId: implement_n7_task_id, addBlockedBy: [spec_task_id], owner: "builder-2"})`.
   Each `TaskCreate` above is a **separate builder dispatch** (one NodeID or microtask per prompt) from the ready wave only. Do not create downstream implementation tasks until their dependency audit task IDs exist. After `N5a` audits clean, create the next dependent task: `implement_n6_task_id := TaskCreate({subject: "Implement N6: PreExtractionRequestedConsumer", description: "Implement and verify N6 after the N5a dependency audit passes."})`; then `TaskUpdate({taskId: implement_n6_task_id, addBlockedBy: [audit_n5a_task_id], owner: "builder-1"})`.
   The same builder slot can be reused for the next ready scope once its prior scope is audited clean — that is how a builder works through a dependency chain without exceeding `BUILDER_NODE_LIMIT` per dispatch.
   Spawn each builder with its `{task-id}` in the spawn prompt.
   Each builder gets only: assigned NodeID/microtask, spec path(s), assigned acceptance criteria, owned file list, and relevant prior handoff/checkpoint. Do not pass the full Change Set unless the builder needs it for a stated interface reason.
   **NO TWO BUILDERS TOUCH THE SAME FILE**

5. Notify architect of builder spawn:
   - Lead DMs architect: `"Builders spawned for Stage 2. Introduce yourself to: {builder-1, builder-2, ...}"`
   - Architect sends brief availability message to each builder (see `${CLAUDE_PLUGIN_ROOT}/agents/architect.md` — Proactive Availability)

6. Each builder creates subtasks per NodeID/microtask in the task list:
   - `"TDD: NodeID-A tests"` → `"TDD: NodeID-A implementation"` → `"TDD: NodeID-A verify"` for one NodeID
   - For microtasks: `"TDD: NodeID-A / microtask-name tests"` → `"implementation"` → `"verify"`
   - Builder works through subtasks, marks each complete with summary

7. After each implementation scope completes, dispatch one fresh independent reviewer for that scope:
   - `audit_n5a_task_id := TaskCreate({subject: "Audit N5a: service interface + registration", description: "Independently audit the N5a implementation against its assigned criteria."})`; then `TaskUpdate({taskId: audit_n5a_task_id, addBlockedBy: [implement_n5a_task_id], owner: "reviewer-1"})`.
   - `audit_n7_task_id := TaskCreate({subject: "Audit N7: independent cache invalidation", description: "Independently audit the N7 implementation against its assigned criteria."})`; then `TaskUpdate({taskId: audit_n7_task_id, addBlockedBy: [implement_n7_task_id], owner: "reviewer-2"})`.
   Spawn each reviewer with its `{task-id}` + assigned spec(s), assigned acceptance criteria, and owned file list.
   Each reviewer audits incrementally within its assigned microtask or one-NodeID scope.
   For a later dependent wave, create the reviewer task only after creating that wave's implementation task.

8. Create smoke-tester task and spawn (one per WorkGroup, not per builder scope):
   - `smoke_task_id := TaskCreate({subject: "Smoke test: {wgid}", description: "Run the WorkGroup runtime smoke checks after every implementation scope completes."})`; then `TaskUpdate({taskId: smoke_task_id, addBlockedBy: [all_implement_task_ids], owner: "smoke-tester"})`.
   Spawn smoke-tester with its `{task-id}` in the spawn prompt. The smoke-tester waits until at least one builder marks implementation complete, then launches the full app for runtime verification.
   **Note:** Unlike reviewers, only one smoke-tester runs per WorkGroup — it needs the full app running, not individual builder scopes.

9. **Specialist implementation reviews** (if `SPECIALISTS_ENABLED` non-empty): Create specialist review tasks alongside reviewer audit tasks, same `addBlockedBy`:
   - If `security-officer` active — one task per active builder scope (runs parallel to reviewer):
     `security_scope_task_id := TaskCreate({subject: "Security officer: review scope {N}", description: "Run the bounded vulnerability and data-flow review for implementation scope {N}."})`; then `TaskUpdate({taskId: security_scope_task_id, addBlockedBy: [implement_x_task_id], owner: "security-officer"})`.
     DM security-officer: `"**New Task**: #{task-id} — Vulnerability scan for scope {N}. NodeIDs/microtasks: {list}."`
   - If `test-advisor` active — one task per active builder scope:
     `test_scope_task_id := TaskCreate({subject: "Test advisor: review scope {N} tests", description: "Review test quality and TDD evidence for implementation scope {N}."})`; then `TaskUpdate({taskId: test_scope_task_id, addBlockedBy: [implement_x_task_id], owner: "test-advisor"})`.
     DM test-advisor: `"**New Task**: #{task-id} — Test quality review for scope {N}. NodeIDs/microtasks: {list}."`
   - If `project-advisor` active — one observation task (not per-scope):
     `project_observation_task_id := TaskCreate({subject: "Project advisor: observe implementation", description: "Observe bounded implementation summaries and return backlog proposals before the gap loop."})`; then `TaskUpdate({taskId: project_observation_task_id, owner: "project-advisor"})`.
     DM project-advisor: `"**New Task**: #{task-id} — Observe builder progress, note patterns and ideas. Deliver backlog proposals before gap loop."`
   **Gate #3 MUST await the selected security-officer's final report.** Its CRITICAL/HIGH findings retain `[SECURITY-BLOCK]` authority. Test-advisor and project-advisor are informational and may be shown as pending; the lead may proceed without those advisory results.
   **Project-advisor early shutdown**: After project-advisor delivers backlog proposals, shut it down (before the gap loop begins).

9b. **Group D implementation reviews** (if Group D officers active):
   - If `ENTERPRISE_ENFORCER_ENABLED` — one task per active builder scope (parallel to reviewer):
     `compliance_scope_task_id := TaskCreate({subject: "Enterprise enforcer: compliance audit scope {N}", description: "Audit implementation scope {N} against the active guideline ARC criteria."})`; then `TaskUpdate({taskId: compliance_scope_task_id, addBlockedBy: [implement_x_task_id], owner: "enterprise-enforcer"})`.
     DM enforcer: `"**New Task**: #{task-id} — Compliance audit for scope {N}. NodeIDs/microtasks: {list}. Guideline IDs in scope: {from Stage 0 map}."`
   - If `FRONTEND_DESIGNER_ENABLED` — one E2E task per WorkGroup (not per scope, like smoke-tester):
     `design_e2e_task_id := TaskCreate({subject: "Frontend designer: E2E UI audit", description: "Run the spec-driven E2E design audit after implementation and smoke readiness."})`; then `TaskUpdate({taskId: design_e2e_task_id, addBlockedBy: [all_implement_task_ids, smoke_task_id], owner: "frontend-designer"})`.
     DM frontend-designer: `"**New Task**: #{task-id} — Wait for smoke-tester app-ready signal, then run spec-driven E2E design audit on the running app."`
   **Gate #3 IS blocked by enterprise-enforcer's blocking-tier findings** (officer authority — analogous to security-officer). frontend-designer is advisor by default; gate is blocked only if `FRONTEND_DESIGNER_BLOCKING_CONFIG = true` (officer mode).

10. Gap flow (per-scope, parallel where dependencies allow — persistent agents, DM messaging):
   a. Each reviewer marks audit task complete with structured gap report in summary
   b. Lead creates fix task and pre-assigns:
      `gap_fix_task_id := TaskCreate({subject: "Fix gaps: NodeID-A", description: "Fix the bounded reviewer gaps for NodeID-A and rerun affected checks."})`; then `TaskUpdate({taskId: gap_fix_task_id, addBlockedBy: [audit_task_id], owner: "builder-N"})`.
   c. Lead sends DM to builder with task ID and gap details:
      > **New Task**: #{fix-task-id} — Fix gaps: NodeID-A
      > **Gaps**: {file path, assigned acceptance criterion not met, expected vs actual}
      > Fix each gap, re-run affected tests, report completion.
   d. Builder claims fix task, fixes gaps, re-runs tests, marks fix task complete
   e. Lead creates re-audit task and pre-assigns:
      `reaudit_task_id := TaskCreate({subject: "Re-audit: NodeID-A", description: "Re-audit only the bounded NodeID-A gap-fix delta."})`; then `TaskUpdate({taskId: reaudit_task_id, addBlockedBy: [gap_fix_task_id], owner: "reviewer-N"})`.
   f. Lead sends DM to reviewer: `"**New Task**: #{reaudit-task-id} — Re-audit: NodeID-A. {gap list}"`
   g. Each builder-reviewer pair repeats independently until clean — no cross-scope blocking unless the dependency graph requires it
   — All builders and reviewers stay alive through the entire gap loop (no respawning)

   **Smoke test gap flow** (parallel with per-scope reviewer gaps):
   h. Smoke-tester marks task complete with structured failure report
   i. Lead creates the smoke fix task: `smoke_fix_task_id := TaskCreate({subject: "Fix smoke gap: {description}", description: "Fix the bounded smoke failure and rerun the affected unit checks."})`; then `TaskUpdate({taskId: smoke_fix_task_id, addBlockedBy: [smoke_task_id], owner: "builder-N"})` (assign to the builder whose owned scope contains the failing code).
   j. Lead DMs builder: `"**New Task**: #{fix-task-id} — Fix smoke gap: {description}. {expected vs observed}"`
   k. Builder fixes, re-runs unit tests, marks fix task complete
   l. Lead creates the re-smoke task: `resmoke_task_id := TaskCreate({subject: "Re-smoke: {wgid}", description: "Re-run the WorkGroup smoke checks against the bounded smoke-fix delta."})`; then `TaskUpdate({taskId: resmoke_task_id, addBlockedBy: [smoke_fix_task_id], owner: "smoke-tester"})`.
   m. Lead DMs smoke-tester: `"**New Task**: #{resmoke-task-id} — Re-smoke: {wgid}. Previous failures: {list}"`
   n. 3-iteration cap — if exceeded, pause autonomous mode: `> **Autonomous Mode Paused** — Smoke test failed 3 iterations. Manual review required.`

11. Enterprise compliance:
   - **If `ENTERPRISE_ENFORCER_ENABLED`**: enterprise-enforcer owns compliance audit per scope (see step 9b above). Reviewer does NOT duplicate guideline checks — it only flags potential matches via DM.
   - **Fallback** (enterprise-enforcer disabled / Tier 2 Light / Sequential): Lead creates parallel compliance task for each reviewer (scoped to their builder scope); reviewer checks compliance requirements from active guidelines inline.

12. Inter-agent communication during Stage 2:
   - builder → architect: Spec clarification requests (direct messages)
   - architect → builder: Design guidance and spec intent responses (direct messages)
   - builder ↔ builder: Dependency coordination (direct messages — "I changed the User interface, FYI")
   - builder → reviewer (same scope): Implementation complete notifications (via task system)
   - reviewer → lead: Gap reports per scope (structured format via task summaries)
   - lead → builder: Fix tasks (via task creation + DM)
   - lead → reviewer: Re-audit requests (via task creation + DM)
   - security-officer → builder-N: Security guidance for sensitive scopes (max 2 DMs per builder)
   - test-advisor → builder-N: Test improvement feedback (max 2 DMs per builder)
   - security-officer ↔ test-advisor: Cross-cutting test gaps in security paths (max 2 inter-specialist DMs)
   - project-advisor → lead: Idea candidates (`"Consider: {idea}"` — lead classifies with `vault-delta`; `skip`/`batch` do not dispatch)
   - project-advisor → lead: Backlog proposals (before gap loop)
   - frontend-designer → architect: Design VERIFY criteria proposals (Stage 1)
   - frontend-designer → builder-N: Design guidance for UI scopes (max 2 DMs per builder)
   - frontend-designer → smoke-tester: App-readiness coordination
   - frontend-designer → lead: `[DESIGN-QUESTIONS]` bundles (relayed to user via `AskUserQuestion`); Design Impact + Design Audit reports at gates
   - enterprise-enforcer → security-officer: SEC-* guideline ID handshake (Stage 0) + cross-reference reconciliation (Stage 2)
   - enterprise-enforcer → frontend-designer: DSN-* design guideline ID handshake (Stage 0)
   - enterprise-enforcer → architect: Required VERIFY criteria citing ARC IDs (Stage 1)
   - enterprise-enforcer → builder-N: Guideline guidance (max 2 DMs per builder)
   - enterprise-enforcer → test-advisor: ARC criteria handoff for test-coverage verification
   - enterprise-enforcer → reviewer-N: Scope-coverage handoff so reviewer skips guideline duplication
   - enterprise-enforcer → closer: Compliance audit summary payload for `compliance_status.md` append (Stage 3)

13. After all NodeIDs implemented + audited across all scopes AND smoke test complete:
    - Lead verifies microtask coverage: every required NodeID `VERIFY:` criterion is covered by at least one completed and audited scope, and any cross-microtask integration criterion has been audited after its dependencies landed.
    - If coverage is incomplete, create the next missing microtask or roll-up audit task before Gate #3. Do not present Gate #3 as clean while criteria remain unassigned.
    - Lead consolidates audit results from all reviewers
    - Lead consolidates smoke test results (if smoke-tester was spawned)
    - Lead consolidates specialist reports. If security-officer was selected, its report MUST be complete and any `[SECURITY-BLOCK]` resolved before Gate #3. Only informational test/project advisor results may remain `[Pending]`.
    - Lead presents **Quality Gate #3** (see [quality-gates.md](quality-gates.md))
    - User decides: proceed / fix gaps / modify specs / cancel

14. Shut down analyst, architect, all builders, all reviewers, and smoke-tester (if spawned)

---

## Stage 3: Finalization

> **Shutdown wave ordering** (canonical — referenced by all officer agent files): closer is spawned BEFORE Group C/D officers shut down so officers can hand off final artifacts directly to closer. Order:
> 1. Shut down `project-advisor` (already done mid-Stage 2)
> 2. Spawn `closer`
> 3. (If enterprise-enforcer active) Enforcer DMs closer `"ComplianceSummary: {payload}"`; wait for closer's ack DM
> 4. Shut down `security-officer`, `test-advisor`, `frontend-designer`, `enterprise-enforcer` (any order)
> 5. Closer returns one consolidated `FinalCaptureDelta`; lead classifies it with `vault-delta` using `explicit_save: true` and sends one Phase 3 flush to the knowledge-liaison
> 6. Release `knowledge-liaison` after capture; runtime-managed Team cleanup occurs at session end

The direct officer-to-closer handoff above is coordinated-team-only. In named-agent mode, the lead waits for every required officer result (including security), places those bounded reports in the closer capsule, and receives the closer's `FinalCaptureDelta` and explicit file list directly. No named worker uses mailbox/task APIs.

1. (Project-advisor was shut down mid-Stage 2.)
2. `finalize_task_id := TaskCreate({subject: "Phase 3: Finalize {wgid}", description: "Apply the delegated finalization-file updates and return FinalCaptureDelta plus explicit changed paths."})`; then `TaskUpdate({taskId: finalize_task_id, addBlockedBy: [last_audit_task_id], owner: "closer"})`.
   Spawn `closer` with `{task-id}` in spawn prompt. **Spawn closer before shutting down Group C/D officers** so they can DM final artifacts.
2b. **Enterprise-enforcer handoff** (if `ENTERPRISE_ENFORCER_ENABLED`): once closer is alive and has claimed its task, DM enterprise-enforcer: `"Closer ready at task #{closer-task-id}. Send ComplianceSummary."` Enforcer DMs closer with `"ComplianceSummary: {payload — Compliance Report, ARC coverage, finding table}"`. Closer ACKs and queues the writeback to `compliance_status.md` for inclusion in its final commit.
2c. **Shut down Group C/D officers**: security-officer, test-advisor, frontend-designer (if active), enterprise-enforcer (if active). Any order — they're all read-only and have delivered their final reports.
3. Closer tasks (can be parallel subtasks):
   - Update all specs to FINAL as-built
   - Update `knowzcode_tracker.md`: all NodeIDs `[WIP]` → `[VERIFIED]`
   - Write ARC-Completion log entry
   - Review architecture docs for discrepancies
   - Schedule REFACTOR tasks for tech debt
   - **If enterprise-enforcer was active**: append the compliance audit summary received by Team DM or supplied in the named-agent capsule to `knowzcode/enterprise/compliance_status.md` review history
   - Return the consolidated `FinalCaptureDelta` to the lead; the lead invokes `vault-delta` and, if vaults are configured, supplies the knowledge-liaison one classified Phase 3 flush with a content-bound parent identity/key, an explicit mutation plan, and every known `KnowledgeId`. The liaison derives one distinct deterministic child key per logical mutation and returns a self-contained `WriterRequest`; amend/update without an exact `KnowledgeId` fail explicitly and never become create. The lead dispatches exactly one writer and owns its task state.
   - Return the explicit final file list and suggested commit message; the lead creates the atomic commit
4. Lead presents completion summary
5. **Wait for writer Phase 3 capture** (if the lead dispatched a writer from the liaison's `WriterRequest`):
   - Coordinated-team: check the writer task via `TaskGet({taskId: writer_task_id})` and wait until status is `completed`.
   - Named-agent: wait for the direct writer result. If it attempted MCP and failed, require `QUEUED_IDEMPOTENCY_KEY`; never append a second queue block.
   - **Timeout**: If >2 minutes after closer completes and the writer operation still has no bounded result → proceed with shutdown and log `WARNING: Writer Phase 3 capture did not complete for {wgid}. Vault writes may be incomplete; queue confirmation is unknown.`
6. Release closer after final evidence, then release the knowledge-liaison after capture. In coordinated mode, request graceful teammate shutdown; no separate Team deletion is performed.

---

## WorkGroup File Format (Parallel Mode)

In parallel orchestration, the WorkGroup file uses per-NodeID phase tracking instead of a single `Current Phase`:

```markdown
## Change Set
| NodeID | Scope/Microtask | Assigned Criteria | Phase | Builder | Status | Timestamp |
|--------|-----------------|-------------------|-------|---------|--------|-----------|
| Authentication | Auth-token-expiry | VERIFY:token_expiry | 2A | builder-1 | Implementing | ... |
| UserProfile | Full NodeID | All VERIFY criteria | 2B | builder-1 | Under review | ... |
| LIB_DateFormat | Full NodeID | All VERIFY criteria | 2A | builder-2 | Tests passing | ... |

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
| Knowledge liaison: targeted context/vault gap | (only when baseline is insufficient) | knowledge-liaison |
| Scanner: direct codebase scan | (none) | scanner-direct |
| Scanner: test coverage scan | (none) | scanner-tests |
| Phase 1A analysis | (none — knowledge-liaison returns context to the lead; the lead routes scanner findings with one targeted `SendMessage` per recipient) | analyst |
| Architect pre-load + speculative research | (none — receives [PRELIMINARY] DMs from analyst) | architect |
| Security officer: initial threat scan | (none — Group C) | security-officer |
| Test advisor: coverage baseline | (none — Group C) | test-advisor |
| Project advisor: backlog context | (none — Group C) | project-advisor |
| Frontend designer: design discovery & questioning | (none — Group D, conditional) | frontend-designer |
| Enterprise enforcer: load compliance posture | (none — Group D, conditional) | enterprise-enforcer |
| Security officer: Change Set review | Phase 1A analysis | security-officer |
| Test advisor: Change Set test strategy | Phase 1A analysis | test-advisor |
| Frontend designer: Change Set design review | Phase 1A analysis | frontend-designer |
| Enterprise enforcer: Change Set guideline map | Phase 1A analysis | enterprise-enforcer |
| Spec: NodeID-X | Phase 1A (gate approval) | architect (Path A) or spec-drafter-N (Path B) |
| Spec consistency review | All spec drafts complete (Path B only) | architect |
| Test advisor: spec testability review | Spec: NodeID-X | test-advisor |
| Frontend designer: spec design review | Spec: NodeID-X | frontend-designer |
| Enterprise enforcer: spec compliance audit | Spec: NodeID-X | enterprise-enforcer |
| Implement: NodeID-X or NodeID-X/microtask | Spec: NodeID-X | builder-N |
| Audit: NodeID-X or NodeID-X/microtask | Implement: NodeID-X or microtask | reviewer-N |
| Security officer: review scope N | Implement: NodeID-X or microtask | security-officer |
| Test advisor: review scope N tests | Implement: NodeID-X or microtask | test-advisor |
| Enterprise enforcer: compliance audit scope N | Implement: NodeID-X or microtask | enterprise-enforcer |
| Frontend designer: E2E UI audit | All implement tasks complete + Smoke test | frontend-designer |
| Project advisor: observe implementation | (none) | project-advisor |
| Fix gaps: NodeID-X round N | Audit: NodeID-X (or re-audit N-1) | builder-N |
| Re-audit: NodeID-X round N | Fix gaps round N | reviewer-N |
| Smoke test: {wgid} | All implement tasks complete | smoke-tester |
| Re-smoke: {wgid} round N | Smoke gap fix round N | smoke-tester |
| Phase 3 finalization | All audits approved | closer |
| Reader: vault queries | Liaison returned a self-contained `ReaderRequest`; lead dispatches and owns task state | knowz:reader |
| Writer: Capture Delta amend/update/flush | `vault-delta` returns a persistence action and liaison returns `WriterRequest`; lead dispatches once | knowz:writer |
| Writer: Consolidated Phase 3 flush | Phase 3 `explicit_save` classification and liaison `WriterRequest`; lead dispatches once | knowz:writer |

---

## Sequential / Named-Agent Flow

When using `--sequential`, process one ready scope at a time. A profile does not force a team. Keep a compatible named agent only through its bounded phase or gap-loop lease, and resume it before considering a replacement.

### MCP & Vault Baseline

Use `MCP_ACTIVE`, `VAULTS_CONFIGURED`, and `VAULT_BASELINE` from Step 3.6 in `work/SKILL.md`. The lead has already completed the MCP probe, vault creation, and baseline vault queries before reaching this point. Do NOT re-run the MCP probe or baseline queries here.

Pass the lead's timestamped MCP health result to the closer. The closer probes only when that result is absent, expired, or explicitly invalidated (see `${CLAUDE_PLUGIN_ROOT}/agents/closer.md`).

### Pre-Phase: Targeted Context and Knowledge

Before dispatching the analyst, use `VAULT_BASELINE`. If a material targeted gap remains:

1. Resume a compatible knowledge-liaison or dispatch `Agent(subagent_type="knowzcode:knowledge-liaison", description="Prepare targeted context request", prompt=<bounded question + VAULT_BASELINE>)`. The liaison returns a self-contained `ReaderRequest`; the lead dispatches the reader and returns the bounded result to the liaison or directly to the next consumer.
2. Wait for the reader result. Return it to the liaison for a bounded `Context Briefing`, or synthesize that briefing locally when no further liaison judgment is needed.
3. Inject the resulting briefing into the analyst spawn prompt as: `> **Context Briefing**: {bounded findings}`.

For Gate rejection and Stage 2 gap loops, send only the changed decision, failing VERIFY IDs, checkpoint, and artifact path to the compatible analyst, architect, builder, or reviewer. Start a fresh agent only after a recorded lineage invalidation. Preserve the same TDD, gate, compliance, and capture behavior as parallel execution.

Before Gate #3, wait for every required reviewer and for the selected security-officer. Test/project advisory roles may remain pending, but security may not. Before Phase 3, collect all required officer results into the closer capsule. The closer returns `FinalCaptureDelta`, explicit changed paths, verification summary, and a suggested commit message; the lead performs persistence, scoped staging, and the commit.
