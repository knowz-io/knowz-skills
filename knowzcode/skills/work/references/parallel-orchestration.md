# Parallel Orchestration — Work Skill (Tier 3)

> **Paths:** paths that start with `../` or name a sibling reference file (for example `profile-models.md`) are relative to this file's own directory. Paths that start with `knowzcode/`, and bare framework file names such as `knowzcode_loop.md` or `knowzcode_orchestration.md`, refer to the project's `knowzcode/` directory.

Tier 3 runs on ordinary subagents. The lead (the main session) dispatches each worker with the `Agent` tool, receives one bounded result, and routes any handoff into the next dispatch or resume. Workers never message each other and share no task list. The same bounded task packets in [spawn-prompts.md](spawn-prompts.md) apply.

Three rules hold in every stage:

- **The lead owns the ledger.** Dependencies, owners, and status live in the WorkGroup file ([Dependency Ledger](#dependency-ledger)), not in a runtime task list.
- **Parallel means several `Agent` calls for independent scopes.** Dispatch the ready wave together; results arrive as each worker finishes.
- **Resume before respawn.** A worker needed again (gap fix, re-audit, an advisor's next stage) is resumed by agent ID with `SendMessage` and a bounded delta. Record the agent ID in the ledger when the first result returns. Start a fresh worker only after a recorded lineage invalidation, and always for an independent reviewer.

Quality gates stay in the main session: the lead presents each gate and waits for the user (or auto-approves in autonomous mode). Never move a gate into a subagent, a forked skill, or a workflow script — none of them can ask the user.

Agent Teams is experimental and is not used unless the user explicitly opts in; see the [appendix](#appendix-coordinated-team-rendering-optional-experimental).

## Contents

- [Conditional Roles and Standards](#conditional-roles-and-standards)
- [Model Overrides](#model-overrides-applies-to-every-spawn-below)
- [Stage 0: Context-Efficient Discovery](#stage-0-context-efficient-discovery)
- [Stage 1: Analysis + Specification](#stage-1-analysis--specification)
- [Stage 2: Parallel Implementation + Incremental Review](#stage-2-parallel-implementation--incremental-review)
- [Stage 3: Finalization](#stage-3-finalization)
- [Handoff Routing](#handoff-routing)
- [File Ownership and Worktree Isolation](#file-ownership-and-worktree-isolation)
- [WorkGroup File Format (Parallel Mode)](#workgroup-file-format-parallel-mode)
- [Dependency Ledger](#dependency-ledger)
- [Sequential Flow](#sequential-flow)
- [Optional: Workflow Fan-Out](#optional-workflow-fan-out)
- [Appendix: Coordinated-Team Rendering](#appendix-coordinated-team-rendering-optional-experimental)

---

## Conditional Roles and Standards

Resolve these only after tier and scope classification. They never enable Agent Teams; every role runs as a named subagent.

- `SPECIALISTS_ENABLED` defaults to `default_specialists` or empty. `--specialists[=security,test,project]` and explicit natural-language requests add the named evidence role; `--no-specialists` clears security/test/project. Tier 2 skips the panel. Tier 3 sequential runs selected roles one at a time. Every role needs a distinct question and bounded deliverable.
- `FRONTEND_DESIGNER_ENABLED` resolves in order: `--no-frontend-designer`/config false; explicit flag/config true; explicit design/UX/a11y request; otherwise config `auto` performs a targeted UI-surface glob (`*.tsx`, `*.jsx`, `*.vue`, `*.svelte`, `*.razor`, `*.xaml`, `main.dart`, or relevant HTML/manifest). Tier 2 (Light) does not spawn the designer; if design review is explicitly requested, the lead recommends `--tier full`. `--no-specialists` does not disable this role.
- `ENTERPRISE_ENFORCER_ENABLED` resolves in order: explicit opt-out; explicit opt-in (skeleton mode allowed); otherwise an existing manifest with `compliance_enabled: true` and at least one active non-empty local or configured vault/KnowledgeId guideline source. Tier 2 normally uses per-agent checks. Tier 3 uses a named read-only enforcer that the lead resumes at each stage.

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

`PROFILE`, `EXECUTE_ON_FABLE`, and `FABLE_DOWNGRADE` are resolved in `/knowzcode:work` Steps 1.5 and 2.3–2.4. They do not change inside a reusable lineage.

---

## Stage 0: Context-Efficient Discovery

1. Reuse the deterministic Step 1.4 classification and spec search. Read only the project files required to construct the analyst capsule.
2. Use `MCP_ACTIVE`, `VAULTS_CONFIGURED`, and `VAULT_BASELINE` from Step 3.6. Do not repeat the MCP probe or baseline queries. Resume a compatible knowledge-liaison only for a material targeted gap; otherwise keep baseline handling local.
3. Start one analyst with the goal, candidate scope, relevant file list, prior-spec matches, baseline summary, and a bounded result contract.
4. Add an architect before Gate #1 only when architecture ambiguity blocks a reliable Change Set. Otherwise dispatch or resume the architect after approval, when NodeIDs and spec scope are stable.
5. Add a direct-code scanner or test scanner only when its slice is independently useful and material uncertainty remains. Prefer the lead's deterministic `Glob`/`Grep` index over duplicative search agents.
6. Add security, test, project, frontend, or enterprise specialists only when the requested scope or active controls require their evidence. Each receives a distinct scope and bounded output.
7. Default fan-out is the analyst plus at most two independently useful read-only workers. Record a reason for every additional worker.

Workers return bounded summaries or artifact paths to the lead. The analyst starts immediately and does not wait for optional workers. If an architect is already active, the lead forwards at most three high-confidence `[PRELIMINARY]` NodeID findings from the analyst's result; otherwise those findings stay in the analyst's final result.

---

## Stage 1: Analysis + Specification

1. Analyst returns the Change Set, including the dependency map (see `../../../agents/analyst.md`). Release scanners; they are not needed after analysis.
2. **Advisor Change Set reviews** — for each enabled role, dispatch (or resume, if it ran in Stage 0) with the Change Set and collect its report before Gate #1. Dispatch these together:
   - `security-officer`: rate each NodeID for security risk.
   - `test-advisor`: recommend test types and coverage needs per NodeID.
   - `frontend-designer` (if `FRONTEND_DESIGNER_ENABLED`): rate UI impact and list design `VERIFY:` needs.
   - `enterprise-enforcer` (if `ENTERPRISE_ENFORCER_ENABLED`): map active guidelines and required ARC criteria to NodeIDs.
3. Lead presents **Quality Gate #1** (see [quality-gates.md](quality-gates.md)). If rejected, resume the analyst with the bounded decision delta when compatible; restart only when scope, spec, checkpoint, or runtime policy changed.
4. **Spec drafting** — choose by NodeID count and `PARALLEL_SPEC_THRESHOLD`:

   **Path A: Standard (fewer than PARALLEL_SPEC_THRESHOLD NodeIDs)**
   - Dispatch one architect with the approved Change Set capsule and every advisor handoff addressed to the architect (required `VERIFY:` criteria, design criteria, guideline ARC IDs). Resume an architect that was started for a real Stage 0 ambiguity instead of dispatching a new one.

   **Path B: Parallel spec drafting (PARALLEL_SPEC_THRESHOLD or more NodeIDs)**
   - Ask the architect for a partition plan (see `../../../agents/architect.md` — Parallel Spec Coordination): 1-2 NodeIDs each, max 3 partitions, respecting same-spec and interface constraints.
   - Dispatch one spec-drafter per partition together. Spec-drafters use the `architect` agent definition with a scoped prompt: the NodeID partition, the architect's research findings, cross-NodeID interface constraints, and consolidation instructions. Max 3 spec-drafters: `ceil(NodeID_count / 2)`, capped at 3. Partitions own disjoint spec files.
   - When all drafts return, resume the architect for the consistency review (cross-spec alignment, naming, `VERIFY:` coverage). Release the spec-drafters.

5. **Advisor spec reviews** — after specs are drafted, resume each enabled role with the spec paths and collect its report before Gate #2:
   - `test-advisor`: are the `VERIFY:` criteria automatable?
   - `frontend-designer`: do UI-touching specs cover accessibility, responsive, and state-design criteria?
   - `enterprise-enforcer`: are guideline-derived `VERIFY:` criteria present; any blocking omissions?
   Route any required spec change back to the architect as one resume with the consolidated list.
6. Lead presents **Quality Gate #2** (see [quality-gates.md](quality-gates.md)). If rejected, resume the architect with the decision delta.
7. Pre-implementation commit: inspect `git status --short` and scoped diffs; stage only the explicit approved spec paths and any new journal shards with `git add -- ...` (`knowzcode/workgroups/` is gitignored; `knowzcode_tracker.md` is a frozen archive). Run `git diff --cached --check` and verify the exact `git diff --cached --name-only` list before committing. Abort if any unrelated path is staged; never stage `knowzcode/` wholesale. Record the commit SHA in the WorkGroup file — it is the baseline new tests must fail against.
8. Release the analyst. Keep the architect's agent ID in the ledger so a builder's spec question can be answered by resuming it.

---

## Stage 2: Parallel Implementation + Incremental Review

1. Lead builds implementation waves from the analyst's dependency map:
   - Topologically sort NodeIDs by dependency. A downstream NodeID is not ready until every upstream NodeID it depends on is implemented and audited clean.
   - Within the current ready wave, treat work as independent only when file ownership does not overlap.
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

4. Dispatch the ready wave:
   - One `Agent` call per builder, sent together, one NodeID or microtask per prompt.
   - Each builder gets only: assigned NodeID/microtask, spec path(s), assigned acceptance criteria, owned file list, the pre-implementation commit SHA, relevant prior handoff/checkpoint, and any advisor handoff addressed to that scope. Do not pass the full Change Set unless the builder needs it for a stated interface reason.
   - Record each builder's agent ID, scope, and owned files in the ledger.
   - Do not dispatch a downstream scope until its upstream scope has audited clean. When it has, resume the same builder with the next ready scope where the lineage is compatible — that is how a builder works through a dependency chain without exceeding `BUILDER_NODE_LIMIT` per dispatch.
   - **NO TWO BUILDERS TOUCH THE SAME FILE** — see [File Ownership and Worktree Isolation](#file-ownership-and-worktree-isolation).

5. A builder that needs a spec clarification returns a `[BUILDER_CHECKPOINT]` with a `Handoff → architect` question. The lead resumes the architect with the question, then resumes the builder with the answer. A builder that changed a shared interface returns a `Handoff → builder` note; the lead includes it in the affected builder's next dispatch or resume.

6. As each implementation scope returns, dispatch for that scope, together:
   - One **fresh independent reviewer** with the assigned spec(s), acceptance criteria, owned file list, and the builder's changed-path list. A reviewer never forks or resumes builder lineage.
   - `security-officer` (resume) — bounded vulnerability and data-flow review for the scope, if enabled.
   - `test-advisor` (resume) — test quality and test-first evidence against the pre-implementation commit, if enabled.
   - `enterprise-enforcer` (resume) — audit the scope against active guideline ARC criteria, if enabled. The reviewer does not duplicate guideline checks.

7. When every implementation scope in the WorkGroup has returned, dispatch once per WorkGroup (not per scope):
   - `smoke-tester`, which needs the whole app running.
   - `frontend-designer` E2E UI audit, after the smoke-tester reports app-ready, if enabled.
   - `project-advisor` (if enabled) with the bounded implementation summaries; collect its backlog proposals and release it before the gap loop.

8. **Gap loop** (per scope, in parallel where dependencies allow):
   a. The reviewer returns a structured gap report.
   b. The lead resumes the scope's builder with: file path, the assigned acceptance criterion not met, expected vs actual. The builder fixes, re-runs affected tests, and returns.
   c. The lead resumes the same reviewer with the bounded fix delta for re-audit.
   d. Each builder-reviewer pair repeats independently until clean; no cross-scope blocking unless the dependency graph requires it. More than 3 gap-fix iterations on one scope pauses autonomous mode.

   **Smoke gap loop**: the lead resumes the builder whose owned scope contains the failing code with expected vs observed, then resumes the smoke-tester with the previous failure list. 3-iteration cap — if exceeded: `> **Autonomous Mode Paused** — Smoke test failed 3 iterations. Manual review required.`

9. **Gate authority**:
   - **Gate #3 MUST await the selected security-officer's final report.** Its CRITICAL/HIGH findings retain `[SECURITY-BLOCK]` authority.
   - **Gate #3 IS blocked by enterprise-enforcer's blocking-tier findings.** If the enforcer is disabled (or Tier 2 Light / sequential), the reviewer checks active guideline requirements inline.
   - frontend-designer is advisory unless `FRONTEND_DESIGNER_BLOCKING_CONFIG = true`. test-advisor and project-advisor are informational; the lead may present them as `[Pending]` and proceed.

10. After all NodeIDs are implemented and audited across all scopes AND the smoke test is complete:
    - Lead verifies microtask coverage: every required NodeID `VERIFY:` criterion is covered by at least one completed and audited scope, and any cross-microtask integration criterion has been audited after its dependencies landed.
    - If coverage is incomplete, dispatch the next missing microtask or a roll-up audit before Gate #3. Do not present Gate #3 as clean while criteria remain unassigned.
    - Lead runs the consolidated verification, consolidates reviewer, smoke, and advisor results, and presents **Quality Gate #3** (see [quality-gates.md](quality-gates.md)).
    - User decides: proceed / fix gaps / modify specs / cancel.

11. Release builders, reviewers, the architect, and the smoke-tester. Keep the officer reports for Stage 3.

---

## Stage 3: Finalization

1. Build the closer capsule from results the lead already holds: the WorkGroup file, spec paths, verification summary, every required officer report (security always; enterprise-enforcer's ComplianceSummary when active), recorded `VERIFY:` decisions, and the timestamped MCP health result.
2. Dispatch `closer`. It:
   - Update all specs to FINAL as-built; record every changed, dropped, or added `VERIFY:` line (old and new wording, user decision) for the shard, and optionally name each criterion's proving test
   - Write the ARC-completion journal shard; do not mutate `knowzcode_tracker.md` (frozen archive)
   - Review architecture docs for discrepancies
   - Schedule REFACTOR tasks for tech debt
   - **If enterprise-enforcer was active**: append the compliance audit summary supplied in the closer capsule to `knowzcode/enterprise/compliance_status.md` review history
   - Return the consolidated `FinalCaptureDelta` to the lead; the lead invokes `vault-delta` and, if vaults are configured, supplies the knowledge-liaison one classified Phase 3 flush with a content-bound parent identity/key, an explicit mutation plan, and every known `KnowledgeId`. The liaison derives one distinct deterministic child key per logical mutation and returns a self-contained `WriterRequest`; amend/update without an exact `KnowledgeId` fail explicitly and never become create. The lead dispatches exactly one writer and owns its task state.
   - Return the explicit final file list and suggested commit message; the lead creates the atomic commit
3. Release officers once the closer capsule is built; nothing hands off to the closer directly.
4. Lead presents the completion summary.
5. **Wait for the Phase 3 writer** if the lead dispatched one from the liaison's `WriterRequest`: wait for its direct result. If it attempted MCP and failed, require `QUEUED_IDEMPOTENCY_KEY`; never append a second queue block. If more than 2 minutes pass after the closer completes with no bounded writer result, proceed and log `WARNING: Writer Phase 3 capture did not complete for {wgid}. Vault writes may be incomplete; queue confirmation is unknown.`
6. Release the closer after final evidence, then the knowledge-liaison after capture.

---

## Handoff Routing

Workers address a peer by returning a `Handoff → <recipient>: <payload>` item in their result. The lead delivers it in the recipient's next dispatch or resume and drops it if the recipient is no longer needed. Limits: at most 2 handoff items per builder scope from any one advisor; consolidate.

Lead duties that follow from having no peer channel:

- **Deliver guidance before the run it applies to.** A handoff reaches a builder only at its next dispatch or resume, so collect advisor guidance for a scope (Stage 1 reports) before dispatching that scope's builder.
- **Pre-fetch what a worker used to ask a peer for.** Put design-system vault context in the frontend-designer's first packet, and the enforcer's `SEC-*` / `DSN-*` guideline excerpts in the security-officer's and frontend-designer's packets. The security-officer does not load guideline files itself.
- **Hold late handoffs.** The enforcer's `Handoff → closer` ComplianceSummary arrives with its Gate #3 report; keep it for the closer capsule.
- **Keep the app up for the E2E audit.** The smoke-tester leaves the app running and reports how to reach and stop it; the lead dispatches the frontend-designer E2E audit against it and then has the app stopped (resume the smoke-tester, or stop it directly).
- **Answer questions with a resume.** A question to a peer costs one resume of each side; batch questions per worker rather than relaying one at a time.

| From | To | Payload | Delivered at |
|------|----|---------|--------------|
| analyst | architect | `[PRELIMINARY]` NodeID findings (max 3) | Architect dispatch |
| security-officer / frontend-designer / enterprise-enforcer | architect | Required `VERIFY:` criteria (threat-model, design, guideline ARC IDs) | Spec drafting or revision |
| enterprise-enforcer | security-officer / frontend-designer | Active `SEC-*` / `DSN-*` guideline IDs and ARC criteria | Their next stage |
| enterprise-enforcer | test-advisor | ARC criteria needing test coverage | Scope test review |
| enterprise-enforcer | reviewer | Scope-coverage note so guideline checks are not duplicated | Scope audit dispatch |
| security-officer / test-advisor / frontend-designer / enterprise-enforcer | builder | Scope guidance (max 2 items each) | Builder dispatch or gap-fix resume |
| builder | architect | Spec clarification question | Architect resume; answer returns on builder resume |
| builder | builder | Shared-interface change notice | Affected builder's next dispatch or resume |
| reviewer / smoke-tester | builder | Gap or failure report | Gap-fix resume |
| frontend-designer | lead | `[DESIGN-QUESTIONS]` bundle (relayed to the user via `AskUserQuestion`) | Immediately |
| project-advisor / any worker | lead | `"Consider: {idea}"` capture candidates (lead classifies with `vault-delta`; `skip`/`batch` do not dispatch) | Immediately |
| enterprise-enforcer | closer | ComplianceSummary for `compliance_status.md` | Closer capsule |

---

## File Ownership and Worktree Isolation

Default: builders share the working tree and own disjoint file lists. The lead assigns every file in a wave to exactly one builder and serializes any two scopes that need the same file.

Use worktree isolation only when two ready scopes cannot be given disjoint files and serializing them is too slow. Dispatch each such builder with `isolation: "worktree"`. Before doing so:

- Builders do not commit, so a worktree sees only committed state. The pre-implementation commit, and a lead checkpoint commit of every earlier audited wave, must exist first.
- A worktree branches from the repository's default branch unless the project sets `worktree.baseRef: "head"` (see https://code.claude.com/docs/en/worktrees). Confirm that setting; without it, do not use worktrees for a WorkGroup branch.
- The lead integrates each returned worktree diff into the working tree, resolves conflicts, and re-runs the affected tests before the scope's audit. A conflict the lead cannot resolve mechanically goes back to the owning builder as a gap.

If any precondition fails, serialize the scopes instead.

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

## Dependency Ledger

The lead keeps this table in the WorkGroup file and updates it as results return. It replaces any runtime task list.

```markdown
## Ledger
| Unit | Waits For | Agent | Agent ID | Status |
|------|-----------|-------|----------|--------|
| Phase 1A analysis | — | analyst | … | done |
| Spec: Authentication | Gate #1 | architect | … | done |
| Implement: Authentication/token-expiry | Gate #2 | builder-1 | … | in progress |
| Audit: Authentication/token-expiry | its implement unit | reviewer (fresh) | — | waiting |
| Security review: scope 1 | its implement unit | security-officer | … | waiting |
| Smoke test | all implement units | smoke-tester | — | waiting |
| Phase 3 finalization | Gate #3 | closer | — | waiting |
```

Ordering rules:

| Unit | Waits for |
|------|-----------|
| Advisor Change Set reviews | Phase 1A analysis |
| Spec: NodeID-X | Gate #1 approval |
| Spec consistency review (Path B) | All spec drafts |
| Advisor spec reviews | Spec drafts |
| Implement: NodeID-X or microtask | Gate #2, and clean audits of every upstream scope |
| Audit / security / test / compliance review of a scope | That scope's implementation |
| Fix gaps round N | Audit (or re-audit N-1) |
| Re-audit round N | Fix gaps round N |
| Smoke test, E2E UI audit | All implement units (E2E also waits for app-ready) |
| Phase 3 finalization | Gate #3 approval |
| `knowz:reader` | A liaison `ReaderRequest`; lead dispatches |
| `knowz:writer` | `vault-delta` returns `amend`/`update`/`flush` and the liaison returns a `WriterRequest`; lead dispatches once |

---

## Sequential Flow

When using `--sequential`, process one ready scope at a time. A profile does not force a team. Keep a compatible named agent only through its bounded phase or gap-loop lease, and resume it before considering a replacement.

### MCP & Vault Baseline

Use `MCP_ACTIVE`, `VAULTS_CONFIGURED`, and `VAULT_BASELINE` from Step 3.6 in `work/SKILL.md`. The lead has already completed the MCP probe, vault creation, and baseline vault queries before reaching this point. Do NOT re-run the MCP probe or baseline queries here.

Pass the lead's timestamped MCP health result to the closer. The closer probes only when that result is absent, expired, or explicitly invalidated (see `../../../agents/closer.md`).

### Pre-Phase: Targeted Context and Knowledge

Before dispatching the analyst, use `VAULT_BASELINE`. If a material targeted gap remains:

1. Resume a compatible knowledge-liaison or dispatch `Agent(subagent_type="knowzcode:knowledge-liaison", description="Prepare targeted context request", prompt=<bounded question + VAULT_BASELINE>)`. The liaison returns a self-contained `ReaderRequest`; the lead dispatches the reader and returns the bounded result to the liaison or directly to the next consumer.
2. Wait for the reader result. Return it to the liaison for a bounded `Context Briefing`, or synthesize that briefing locally when no further liaison judgment is needed.
3. Inject the resulting briefing into the analyst spawn prompt as: `> **Context Briefing**: {bounded findings}`.

For Gate rejection and Stage 2 gap loops, send only the changed decision, failing VERIFY IDs, checkpoint, and artifact path to the compatible analyst, architect, builder, or reviewer. Start a fresh agent only after a recorded lineage invalidation. Preserve the same TDD, gate, compliance, and capture behavior as parallel execution.

Before Gate #3, wait for every required reviewer and for the selected security-officer. Test/project advisory roles may remain pending, but security may not. Before Phase 3, collect all required officer results into the closer capsule. The closer returns `FinalCaptureDelta`, explicit changed paths, verification summary, and a suggested commit message; the lead performs persistence, scoped staging, and the commit.

---

## Optional: Workflow Fan-Out

When the user explicitly asks for a workflow (for example "use a workflow for the build") and a wave has many independent scopes, the lead may run the packaged `/knowzcode:build-review` workflow for Stage 2 steps 4-6 instead of dispatching by hand. It builds each scope and audits it with a fresh reviewer, running scopes concurrently, and returns one result per scope.

- It never replaces a gate. A workflow cannot pause for user input, so Gates #1-#3, `VERIFY:` decisions, and `[DESIGN-QUESTIONS]` stay with the lead before and after the run.
- It covers one ready wave. The lead still builds waves, assigns disjoint owned files, runs the gap loop by resuming or redispatching, and runs the consolidated verification.
- Pass the wave as `args` (see the script header for the shape). Record the run ID in the ledger.
- If workflows are unavailable or disabled on the host, dispatch the wave with `Agent` calls as usual.

---

## Appendix: Coordinated-Team Rendering (optional, experimental)

Agent Teams is experimental in Claude Code and off unless the user enables it (https://code.claude.com/docs/en/agent-teams). KnowzCode uses it only when the user explicitly asks for teammates or Team mode in the current task and at least two active peers need direct messaging that lead routing cannot provide. No profile, tier, or amount of parallel work selects it. Teammates are not restored by `/resume`, cannot use worktree isolation, and cost more.

In that mode the stages above are unchanged, with this rendering:

- Each ledger row is also a runtime task. `task_id := TaskCreate({subject, description})`, then `TaskUpdate({taskId: task_id, addBlockedBy: [...], owner: "<worker>"})`; never pass `addBlockedBy`, `addBlocks`, or `owner` to `TaskCreate`. The task ID goes in the worker's packet, which states `Coordination Mode: coordinated-team`.
- Do not create downstream implementation tasks until their dependency audit task IDs exist. For a later dependent wave, create the reviewer task only after creating that wave's implementation task.
- A `Handoff → <recipient>` item may be sent as a direct message instead of returning through the lead. The lead still owns gates, the WorkGroup file, and every dispatch.
- Dispatch the closer before releasing officers so the enforcer can send its ComplianceSummary directly.
- Request graceful teammate shutdown after deliverables; there is no team deletion step.
- If the teammate capability is not callable, continue with ordinary subagents and record `CAPABILITY_FALLBACK`.
