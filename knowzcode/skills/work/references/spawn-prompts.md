# Agent Spawn Prompts — Work Skill

These task packets are shared by adaptive, sequential, and coordinated execution. Claude automatically loads a referenced agent definition; never ask a named agent or teammate to reread its own definition. Include only the assigned scope and the fields needed below.

**Rendering rule:** `Your Task: #{task-id}` / `TaskUpdate`, mailbox, and peer-message clauses are coordinated-team-only. Include them only after Team mode was independently selected and a real team task/message capability is callable. Teams expose targeted messaging, not a broadcast primitive; fan-out requires one `SendMessage` per recipient. For local, resumed, forked, or fresh named-agent dispatch, omit Team clauses, put dependency/context inputs directly in the capsule, and require the bounded result to return to the lead. Never form a team just to make a packet's coordination sentence usable.

Every rendered packet MUST also include one explicit line: `Coordination Mode: coordinated-team` or `Coordination Mode: named-agent`. Agent definitions use that field to branch later Team-oriented prose. If omitted, agents default to named-agent and must not call task-list or peer-message tools. In templates, `{coordination_mode}` resolves to that value. For coordinated-team mode, `{coordination_task_clause}` resolves to `Your Task: #{task-id} — claim with TaskUpdate({taskId: "{task-id}", status: "in_progress"}); on completion call TaskUpdate({taskId: "{task-id}", status: "completed"}) and return a bounded summary.` In named-agent mode it resolves to `Return one bounded result directly to the lead; do not call shared task or peer-message tools.`

Every material dispatch includes the capsule version, WorkGroup/task ID, phase, objective, NodeIDs/microtask, owned/read files, approved spec paths and VERIFY IDs, checkpoint, constraints, concise failure summaries/artifact paths, lineage candidate, and next action. Every result is bounded to status, decisions/findings, `file:line` or test evidence, changed paths, VERIFY state, unresolved risks, artifact paths, and lineage status. Raw logs remain in artifacts.

## Contents

- [`{advisor_guidance}` Placeholder](#advisor_guidance-placeholder)
- [`{spec_depth_guidance}` Placeholder](#spec_depth_guidance-placeholder)
- [Stage 0: Codebase Scanners](#stage-0-codebase-scanners-2-instances--conditional)
- [Stage 0: Context & Knowledge Liaison (Persistent)](#stage-0-context--knowledge-liaison-persistent)
- [Quality Gate Writer Dispatches](#quality-gate-writer-dispatches)
- [Specialist Spawn Prompts (Group C)](#specialist-spawn-prompts-group-c--opt-in-via---specialists)
- [Phase 1A: Impact Analysis](#phase-1a-impact-analysis)
- [Stage 0: Optional Architect Pre-load](#optional-architect-pre-load)
- [Phase 1B: Specification](#phase-1b-specification)
- [Phase 2A: Implementation](#phase-2a-implementation)
- [Phase 2B: Completeness Audit](#phase-2b-completeness-audit)
- [Phase 2B: Smoke Testing](#phase-2b-smoke-testing)
- [Phase 3: Finalization](#phase-3-finalization)

---

## `{advisor_guidance}` Placeholder

Several spawn prompts below end with a `{advisor_guidance}` token. This token is resolved at spawn time based on the active profile and the agent being spawned:

- **If `profile == "advisor"` AND `MODEL_FOR(agent, profile) == "sonnet"`** (i.e. builder, reviewer, closer, smoke-tester, microfix-specialist, or frontend-designer): replace `{advisor_guidance}` with the **Advisor Guidance block** below.
- **Otherwise** (any other profile, or a strategic agent staying on Opus): replace `{advisor_guidance}` with an empty string. Do not leave the literal `{advisor_guidance}` text in the spawned prompt.

### Advisor Guidance Block

```markdown
---
## Advisor Tool Guidance

You have access to an `advisor` tool backed by a stronger reviewer model (Opus 4.6).
It takes NO parameters — when you call advisor(), your full conversation history is forwarded.

**Call advisor BEFORE substantive work:**
- Before writing code, specs, or committing to an interpretation
- Before building on an assumption

**Also call advisor:**
- When you believe your task is complete (make deliverables durable first — write files, commit)
- When stuck: errors recurring, approach not converging, results that don't fit
- When considering a change of approach

**Response format:** The advisor should respond in under 100 words and use enumerated steps.

Give advice serious weight. If you follow a step and it fails empirically, adapt.
If retrieved data conflicts with advice: surface the conflict in one more advisor call
rather than silently switching.
---
```

> **Why conditional:** The advisor tool is only available to agents running on Sonnet under the `advisor` profile. Adding the guidance to Opus-based or non-advisor spawns would mislead the agent about a tool it cannot use.

See `${CLAUDE_PLUGIN_ROOT}/skills/work/references/profile-models.md` for the full `MODEL_FOR()` resolution rule.

---

## `{spec_depth_guidance}` Placeholder

The `analyst` (Phase 1A) and `architect` (Phase 1B, incl. spec-drafters) spawn prompts end with a `{spec_depth_guidance}` token. Resolve it at spawn time based on the active profile:

- **If `profile == "frontier"` AND the agent is `analyst` or `architect`** (including `spec-drafter-N`, which uses the architect definition): replace `{spec_depth_guidance}` with the **Spec-Depth Guidance block** below.
- **Otherwise** (any other profile, or any other agent): replace `{spec_depth_guidance}` with an empty string. Do not leave the literal `{spec_depth_guidance}` text in the spawned prompt.

### Spec-Depth Guidance Block

```markdown
---
## Spec-Depth Guidance (frontier profile)

You are running on a frontier reasoning model. The Change Set / spec you produce is the contract the
Opus builder implements against — make it exhaustive and unambiguous so execution is a faithful
translation of your intent, not a re-derivation of it.

For **every** change — each NodeID, and each distinct file/symbol within it — your deliverable must cover:
- The exact file(s) and symbol(s) touched, with change type (new / modify / delete).
- The before → after behavior and the design rationale for the change.
- Edge cases, failure modes, and boundary conditions the builder must handle.
- Verification: (architect) write at least one dedicated `VERIFY:` criterion per change, each independently
  testable; (analyst) record each change atomically so no change is bundled into a vague group and every
  change is spec-able per-change downstream.

Prioritize **coverage over prescription**: state *what* must change, *why*, and *how it will be verified* —
do NOT write line-by-line pseudocode or dictate the implementation. Leave the builder room to implement well.
A change with no verification criterion, or a bundled "misc" change, is an incomplete spec.
---
```

> **Why conditional:** the extra spec depth is the whole point of the `frontier` profile (Fable plans, Opus executes a fully-specified change). Injecting it under other profiles would over-inflate specs for agents that also do the building.

See `${CLAUDE_PLUGIN_ROOT}/skills/work/references/profile-models.md` for the `{spec_depth_guidance}` resolution rule.

---

## Stage 0: Codebase Scanners (2 instances — conditional)

**Agent**: `general-purpose` (x2) | Lightweight codebase searchers (no agent definition file)

Temporary scanners are optional. Dispatch one only when deterministic local indexing left a material, independently useful uncertainty; `CODEBASE_SCANNER_ENABLED` is permission to use scanners, not a requirement to launch both.

**scanner-direct spawn prompt**:
> You are `scanner-direct` for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **Focus**: Search source code for goal-related keywords and patterns.
>
> **Steps**:
> 1. Grep for goal keywords across source files (exclude node_modules, dist, build, .git)
> 2. Read the top 5-8 matching files to understand affected code paths
> 3. Identify module boundaries and cross-module dependencies
> 4. Note public APIs and interfaces that may need changes
>
> **READ-ONLY.** Do NOT modify any files.
> **Deliverable**: Bounded summary of affected files, code paths, module boundaries, and interface patterns; put verbose matches in an artifact.
> **Budget**: Complete within ~12 turns. Focus on breadth over depth.

**scanner-tests spawn prompt**:
> You are `scanner-tests` for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **Focus**: Discover tests covering the goal area to understand test patterns and coverage shape.
>
> **Steps**:
> 1. Glob for test files: `**/*.test.*`, `**/*.spec.*`, `**/test_*`, `**/tests/**`
> 2. Grep test files for goal-related keywords
> 3. Read 3-5 matching test files to understand testing patterns (test framework, mocking strategy, fixture patterns)
> 4. Check for integration/e2e tests related to the goal area
>
> **READ-ONLY.** Do NOT modify any files.
> **Deliverable**: Bounded summary of test locations, patterns, gaps, and fixtures; put verbose matches in an artifact.
> **Budget**: Complete within ~12 turns. Focus on breadth over depth.

**Dispatch**: In adaptive or coordinated execution, use `Agent(subagent_type="general-purpose", description="Targeted test scan", prompt=<bounded scan focus>)` only for an explicit scan focus. The runtime owns its turn cap; keep the requested result bounded instead of passing a per-call turn limit. Sequential execution normally keeps deterministic scanning local. Release the scanner after its result.

---

## Context & Knowledge Liaison

**Agent**: `knowledge-liaison` | Targeted context and vault coordination agent

**Spawn prompt**:
> You are the **knowledge-liaison** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **Vault config**: `knowz-vaults.md` (project root)
> **Lead Vault Baseline**: {VAULT_BASELINE or "No baseline — MCP not available or no vaults configured"}
> **Lifecycle**: Resume only while the same WorkGroup/scope/checkpoint lineage is compatible. Release after the bounded phase/capture lease.
> **Context gathering**: Reuse the lead baseline. Skip broad vault queries when it exists. For a material gap, prepare one targeted `ReaderRequest`; after the lead supplies its reader result, return a concise Context Briefing and artifact pointers.
> **Ongoing**: Accept only a bounded targeted context gap or a classified `amend`, `update`, or `flush` action with a stable identity, content-bound parent key, and complete logical mutation plan. Derive one distinct deterministic child idempotency key per mutation and return exactly one self-contained `ReaderRequest` or `WriterRequest` to the lead; do not dispatch a reader or writer yourself. In named-agent mode the request arrives in the result; in coordinated-team mode it may return through one lead DM. Normal `batch` and `skip` deltas remain coordinator-local. Return raw `"Log: ..."` / `"Consider: ..."` candidates and unresolved vault queries to the lead without preparing an unauthorized write.
> **KnowledgeId sync**: When preparing a `WriterRequest`, check source files (specs, workgroups) for `**KnowledgeId:**` values and include the exact ID for every amend/update. Missing IDs return `MISSING_AMEND_IDENTITY` or `MISSING_UPDATE_IDENTITY`; never queue or downgrade those mutations to create. The lead dispatches exactly one `knowz:writer`, owns its task state, and applies or explicitly delegates source-file writeback indicated by `CREATED_KNOWLEDGE_ID`, `MISSING_AMEND_TARGET`, `MISSING_UPDATE_TARGET`, or legacy `REMOVED_KNOWLEDGE_ID`. A missing target removes only the stale source ID; replacement CREATE requires separate classification and a new idempotency key.

**Dispatch**: Resume a compatible liaison or use `Agent(subagent_type="knowzcode:knowledge-liaison", description="Prepare targeted context or persistence request", prompt=<spawn prompt>)` only when the baseline is insufficient or `vault-delta` returned a persistence action. The lead dispatches the single reader or writer described by the returned request and owns any coordinated-team task state. Team mode may keep the liaison as the smallest justified coordination peer; it is never an unconditional Stage 0 spawn.

---

## Classified Vault Writer Dispatches

**Agent**: `knowz:writer` | Dispatched by the lead only for `amend`, `update`, or `flush`

The lead first invokes `vault-delta` as defined in [quality-gates.md](quality-gates.md). `skip` and `batch` create no writer. For `amend`, `update`, or `flush`, the lead gives the classified action, complete mutation plan, stable parent identity/key, and known `KnowledgeId` values to the knowledge-liaison. The liaison returns one self-contained `WriterRequest` with a distinct deterministic child key per logical mutation, without spawning a child. Missing amend/update identity fails explicitly and never becomes create. The lead then dispatches exactly one writer and owns any coordinated-team task state. Writers are non-persistent; once dispatch begins, the writer receives the consolidated journal and is the sole owner of post-dispatch failure queuing.

**Dispatch**:
- *Coordinated Team*: When a team was independently justified, the lead DMs the knowledge-liaison only after a persistence action, receives its `WriterRequest`, creates/owns the task state, and dispatches one writer from that request.
- *Sequential / Named Agent*: The lead receives the liaison's `WriterRequest` and dispatches `Agent(subagent_type="knowz:writer", description="Capture Delta {action}: Phase {N}", prompt=<WriterRequest>)`; do not form a one-peer team or create shared task state.
- *Pre-dispatch failure*: Only when the lead cannot dispatch the requested writer at all may it ask the liaison to append each eligible logical mutation exactly once to project-root `knowz-pending.md` with its distinct child key. Never queue an amend/update missing its exact `KnowledgeId`.
- *Post-dispatch failure*: The writer alone queues and returns `QUEUED_IDEMPOTENCY_KEY`; neither the lead nor liaison appends a second entry.

---

## Specialist Spawn Prompts (Group C — opt-in via `--specialists`)

Use these prompts when `SPECIALISTS_ENABLED` identifies a distinct evidence need. Do not launch the whole panel by default.

**Dispatch**: Use fresh named read-only agents for independent judgment, or minimal teammates only when direct peer coordination is required. Sequential mode runs selected specialists one at a time. Release or resume within a bounded phase lease; do not keep the full panel idle through Gate #3.

### Security Officer

**Agent**: `security-officer` | Officer — CRITICAL/HIGH findings block gates

**Spawn prompt**:
> You are the **security-officer** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **READ-ONLY.** Do NOT modify any files. Bash is for read-only security scanning only.
> **Stage 0 Deliverable**: Build a STRIDE-lite threat model and scan for auth/PII/crypto/session patterns. Return the initial threat assessment with intended-recipient labels to the lead; in coordinated-team mode the lead fans it out with one targeted `SendMessage` per recipient.
> **Authority**: CRITICAL/HIGH findings use `[SECURITY-BLOCK]` tag — lead MUST pause autonomous mode.
> **Communication**: In coordinated-team mode, use bounded DMs for the listed gate handoffs. In named-agent mode, return the same handoff fields to the lead for routing; do not assume peer messaging.
> **Enterprise Compliance**: If `knowzcode/enterprise/compliance_manifest.md` exists and `compliance_enabled: true`, read active security guidelines and cross-reference findings with enterprise guideline IDs.

### Test Advisor

**Agent**: `test-advisor` | Advisor — informational only

**Spawn prompt**:
> You are the **test-advisor** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **READ-ONLY.** Do NOT modify any files. Bash is for read-only operations only (git log, coverage reports).
> **Stage 0 Deliverable**: Establish the test coverage baseline. Glob test files and run coverage if available. Return the baseline with intended-recipient labels to the lead; in coordinated-team mode the lead fans it out with one targeted `SendMessage` per recipient.
> **Communication**: In coordinated-team mode, use bounded DMs for the listed gate handoffs. In named-agent mode, return the same handoff fields to the lead for routing; do not assume peer messaging.
> **Enterprise Compliance**: If `knowzcode/enterprise/compliance_manifest.md` exists and `compliance_enabled: true`, check enterprise ARC criteria for test coverage gaps.

### Project Advisor

**Agent**: `project-advisor` | Advisor — informational only

**Spawn prompt**:
> You are the **project-advisor** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **READ-ONLY.** Do NOT modify any files.
> **Stage 0 Deliverable**: Read targeted tracker rows for existing relevant REFACTOR tasks/backlog context and return a bounded lead summary.
> **Lifecycle**: You shut down mid-Stage 2 after delivering backlog proposals — before the gap loop.
> **Communication**: Return backlog context and proposals to the lead. In coordinated-team mode this may be one bounded DM. The lead owns any authorized writer dispatch; do not message builders or other specialists.
> **Enterprise Compliance**: If `knowzcode/enterprise/compliance_manifest.md` exists, note compliance configuration gaps in backlog proposals.

---

## Group D Spawn Prompts (Conditional Officers)

Use these prompts when `FRONTEND_DESIGNER_ENABLED` or `ENTERPRISE_ENFORCER_ENABLED` is true. Each role may run as a fresh named worker or, when peer messaging is required, a teammate.

**Dispatch**: Tier 3 supports either named-agent or coordinated-team delivery. Sequential mode runs the required officer at the applicable gate. Tier 2 uses per-agent checks unless the user explicitly requests the officer. Preserve blocking compliance and design authority regardless of runtime mode.

### Frontend Designer

**Agent**: `frontend-designer` | Conditional Advisor (default) / Officer (with `--frontend-designer-blocking`)

**Spawn prompt**:
> You are the **frontend-designer** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **UI Surface Summary**: {detected entry points and framework — e.g., "React TypeScript app, index.html at apps/web/, Tailwind detected"}
> **Blocking Mode**: {`true` if FRONTEND_DESIGNER_BLOCKING_CONFIG else `false`}
> **Autonomous Defaults**: {`pause` or `accept-recommendations`}
> **READ-ONLY.** Do NOT modify any source files. Bash is for read-only probing only — never start or stop the app.
> **Browser MCP Loading**: Before any `mcp__claude-in-chrome__*` or `mcp__plugin_playwright_playwright__*` call, you MUST first invoke `ToolSearch` with `select:<tool_name>` to load the schema. Calling a browser tool without loading its schema returns `InputValidationError`.
> **Stage 0 Deliverables**: (a) Probe project for UI surface, framework, design system, theme tokens, a11y config. (b) Produce a Design Questions Bundle (3–8 batched questions with recommended defaults + ASCII/Mermaid mockups) and return it with an initial Design Posture. In coordinated-team mode, the lead may route that posture to peers that need it.
> **Authority**: Advisor by default — HIGH findings use `[DESIGN-CONCERN]` (do NOT pause autonomous mode). If Blocking Mode is true, HIGH findings use `[DESIGN-CONCERN-BLOCK]` and pause autonomous mode at Gate #3.
> **Coordination with smoke-tester**: At Stage 2B, wait for smoke-tester to signal app-ready, then run spec-driven E2E on the same running app. Smoke-tester does NOT tear down until you mark your task complete.
> **Coordination with enterprise-enforcer**: If active, expect DM at Stage 0 with active design guideline IDs (`DSN-*`); cross-reference in your Design Audit Report.
> **Communication**: DM lead at gates (Design Impact Report at #1, design VERIFY criteria to architect at #2, Design Audit Report at #3). DM architect, builders, smoke-tester, knowledge-liaison per `${CLAUDE_PLUGIN_ROOT}/agents/frontend-designer.md` Communication Protocol.
> {advisor_guidance}

### Enterprise Enforcer

**Agent**: `enterprise-enforcer` | Officer — blocking-tier guideline violations block Gate #3

**Spawn prompt**:
> You are the **enterprise-enforcer** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
> {coordination_task_clause}
> **Goal**: {goal}
> **Compliance Manifest**: `knowzcode/enterprise/compliance_manifest.md` (verified exists with `compliance_enabled: true` and ≥1 active non-empty guideline by lead at Step 2.6.2)
> **READ-ONLY.** Do NOT modify any files. Bash is for read-only pattern checks only.
> **Stage 0 Deliverables**: (a) Parse manifest + load active guidelines from `knowzcode/enterprise/guidelines/*.md` and `custom/`. (b) Enumerate guideline IDs and ARC criteria. (c) Return Compliance Posture (active count, blocking/advisory split, keyword index) with intended-recipient labels to the lead; in coordinated-team mode the lead uses one targeted `SendMessage` per recipient. (d) Complete security-officer (SEC-* IDs) and frontend-designer (DSN-* IDs) handshakes through mode-appropriate lead routing if active.
> **Authority**: Officer — blocking-tier guideline violations use `[COMPLIANCE-BLOCK]` tag at Gate #3 (lead MUST pause autonomous mode). Advisory-tier is informational.
> **Coordination with security-officer**: You own guideline-ID/ARC-coverage mapping; security-officer owns vulnerability detection and severity. Disagreements escalate to lead at gate.
> **No-op exit**: If `--enterprise-enforcer` flag forced spawn without a manifest, report `[COMPLIANCE-CONFIG-GAP]` to lead and shut down.
> **Communication**: DM architect (required VERIFY criteria with ARC IDs at Stage 1), builders (max 2 per builder, Stage 2A), test-advisor (ARC handoff), reviewer-N (scope coverage handoff), security-officer (handshake), frontend-designer (DSN-* handshake), closer (compliance audit summary for `compliance_status.md` append at Stage 3), lead (gates).

---

## Phase 1A: Impact Analysis

**Agent**: `analyst` | **Loop.md**: Section 3.1

**Spawn prompt**:
> You are the **analyst** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Context files**: Read sections 1-2 and 3.1 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_tracker.md`, `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
>
> {coordination_task_clause}
> **Conventions**: In coordinated-team mode, report results in your task summary and let the lead update the WorkGroup file. In sequential/named-agent mode, update the WorkGroup file only when delegated. Prefix any task/todo entries with `KnowzCode:`. If blocked, report blocker and notify lead.
> **Context**: Incorporate a Context Briefing only when the lead supplied one. In coordinated-team mode, request at most one targeted liaison follow-up; otherwise return the unresolved question to the lead.
> **Codebase scanners**: If the lead supplied optional scanner summaries, incorporate them; never wait for or assume scanner fan-out.
> **Preliminary Findings Protocol**: If a coordinated-team architect is already active, send at most three high-confidence `[PRELIMINARY]` NodeID messages. Otherwise include them in the bounded result.
> **Deliverable**: Change Set proposal with NodeIDs, descriptions, affected files, risk assessment, and dependency map. In coordinated-team mode, return it in task summary for lead consolidation; in sequential/named-agent mode, write it to the WorkGroup file only when delegated.
> {spec_depth_guidance}

**Dispatch**:
- *Coordinated Team*: Use a teammate only when peer coordination was independently justified; it starts without an analysis dependency.
- *Sequential Delegation*: Resume a compatible analyst or dispatch `Agent(subagent_type="knowzcode:analyst", description="Phase 1A impact analysis", prompt=<above>)`, then wait for its bounded result.
- *Named agent*: `Agent(subagent_type="knowzcode:analyst", description="Phase 1A impact analysis", prompt=<above>)`

---

## Optional Architect Pre-load

**Agent**: `architect` | Spawned early only when architecture ambiguity blocks classification

Normally dispatch the architect after Gate #1 with the approved Change Set. Pre-load it in Stage 0 only when the analyst cannot form a reliable Change Set without architectural investigation.

**Optional pre-load prompt**:
> You are the **architect** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Context files**: Read sections 1-2 and 3.2 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
> **Specs directory**: `knowzcode/specs/`
>
> {coordination_task_clause}
> **Context**: Incorporate a lead-supplied Context Briefing when present. In coordinated-team mode, request at most one targeted liaison follow-up; otherwise return the unresolved question to the lead.
> **Stage 0 Role**: Pre-load architecture context, then perform speculative research on any `[PRELIMINARY]` NodeID messages from the analyst (see Speculative Research Protocol in `${CLAUDE_PLUGIN_ROOT}/agents/architect.md`). READ-ONLY research — do NOT write specs yet.
> **Lifecycle**: Retain this lineage only while the ambiguity/spec phase remains compatible. Release it when no concrete consultation remains.

After Gate #1, the lead sends the approved Change Set via DM and creates spec-drafting tasks. For spec-drafting prompts, see Phase 1B below.

---

## Phase 1B: Specification

**Agent**: `architect` | **Loop.md**: Section 3.2

**Spec-drafting prompt** (sent as a bounded delta to an already-warm architect, or as a fresh named-agent/teammate prompt when needed):
> You are the **architect** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Approved Change Set**: {NodeIDs from Gate #1}
> **Context files**: Read sections 1-2 and 3.2 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
> **Specs directory**: `knowzcode/specs/`
>
> {coordination_task_clause}
> **Conventions**: In coordinated-team mode, report WorkGroup updates in your task summary and let the lead consolidate. In sequential/named-agent mode, update the WorkGroup file only when delegated. Prefix any task/todo entries with `KnowzCode:`. If blocked, report blocker and notify lead.
> **Deliverable**: Finalized specs for all NodeIDs written to `knowzcode/specs/`.
> {spec_depth_guidance}

**Spec-drafter spawn prompt** (Path B — 3+ disjoint NodeIDs; named agents by default, teammates only for real peer coordination):
> You are `spec-drafter-{N}` for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Your NodeIDs**: {partition — 1-2 NodeIDs assigned to this drafter}
> **Architect Research**: {research findings from architect's speculative research for these NodeIDs}
> **Cross-NodeID Constraints**: {interface dependencies, shared specs, naming conventions from architect}
> **Context files**: Read sections 1-2 and 3.2 of `knowzcode/knowzcode_loop.md`, `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
> **Specs directory**: `knowzcode/specs/`
>
> {coordination_task_clause}
> **Deliverable**: Draft specs for your assigned NodeIDs written to `knowzcode/specs/`. The architect will review for consistency after all drafters finish.
> {spec_depth_guidance}

**Dispatch**:
- *Adaptive/sequential*: Resume a compatible architect or use `Agent(subagent_type="knowzcode:architect", description="Phase 1B specification drafting", prompt=<bounded capsule>)`. If plan review is required, the first pass returns a plan only; after approval, resume the same lineage with the approval delta.
- *Coordinated team*: Spawn the referenced architect type with the runtime's supported plan-review instruction. The lead answers every approval request; autonomous mode auto-approves except established safety exceptions.
- **Path B**: After the architect partitions 3+ NodeIDs, dispatch `Agent(subagent_type="knowzcode:architect", description="Draft disjoint spec partition", prompt=<bounded partition capsule>)` per disjoint partition. The `architect` agent definition owns its turn cap; require a bounded draft result. After drafts return, resume the architect for consistency review.

Teammates inherit the lead's effective permissions. Do not depend on plugin-agent permission frontmatter or a per-child permission override.

---

## Phase 2A: Implementation

**Agent**: `builder` | **Loop.md**: Section 3.3

**Spawn prompt**:
> You are the **builder** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Assigned scope**: {one NodeID or one named microtask; never an open-ended Change Set}
> **Specs**: {assigned spec file path(s) from Phase 1B}
> **Assigned acceptance criteria**: {full NodeID VERIFY list, or the exact VERIFY subset / micro-acceptance criteria for this microtask}
> **Owned files**: {exact writable file list or module boundary}
> **Prior checkpoint**: {handoff/checkpoint for this scope, or "none"}
> **Context files**: Read sections 1-2 and 3.3 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_project.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md` (read for context; in coordinated-team mode the lead is the only WorkGroup writer)
>
> {coordination_task_clause}
> **Conventions**: Report results, blockers, and checkpoints in your task summary or handoff. In coordinated-team mode, do not edit the WorkGroup file directly; the lead consolidates. If blocked, report blocker and notify lead.
> **Scope guard**: If this assignment includes more than one NodeID, more than one microtask, missing/ambiguous assigned acceptance criteria, overlapping file ownership, or more than 6 likely touched files, stop before coding and ask the lead to split or clarify it unless the lead explicitly marked the task as a `--broad-builders` exception.
> **Context discipline**: Read only the assigned spec(s), listed owned files, and targeted sections named above. Do not load every spec, tracker history, or broad architecture file unless a specific blocker requires it.
> **Context**: Use a supplied vault briefing when present. In coordinated-team mode only, request at most one targeted `"VaultQuery: {question}"`; otherwise return the unresolved question to the lead. Skip broad best-practice queries when scope is clear.
> **TDD mandatory**: Write failing tests first, then implement, then refactor. Every assigned criterion must have tests or a documented reason why it is covered by an existing test.
> **Checkpoint rule**: If you cannot finish the assigned scope cleanly in this dispatch, include a checkpoint in your task summary or handoff with Done, Files changed, Tests run, Remaining work, and Next microtask. Mark the task partial/blocked instead of restarting or expanding scope.
> **Blocker protocol**: If you hit a blocker, document it as a Blocker Report in your task summary or handoff (see loop.md Section 11 format) and report to the lead immediately instead of guessing. The lead persists it to the WorkGroup file in coordinated-team mode.
> **Deliverable**: Assigned NodeID/microtask implemented with passing targeted tests and a compact completion summary.
> {advisor_guidance}

**Dispatch**:
- *Adaptive/sequential*: Resume a compatible builder or use `Agent(subagent_type="knowzcode:builder", description="Phase 2A TDD implementation", prompt=<bounded capsule>)`. Never override or bypass the lead/session permission policy. For a required plan gate, use a plan-only first pass and resume after approval.
- *Coordinated team*: Spawn the referenced builder type for each ready disjoint scope. Add the supported plan-review instruction when needed; teammates inherit lead permissions.

---

## Phase 2B: Completeness Audit

**Agent**: `reviewer` | **Loop.md**: Section 3.4

**Spawn prompt**:
> You are the **reviewer** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Assigned scope**: {one NodeID or one named microtask}
> **Specs**: {assigned spec file path(s)}
> **Assigned acceptance criteria**: {full NodeID VERIFY list, or the exact VERIFY subset / micro-acceptance criteria for this microtask}
> **Owned files**: {exact read-only file list or module boundary to audit}
> **Context files**: Read sections 1-2 and 3.4 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md` (read-only context)
>
> {coordination_task_clause}
> **Conventions**: Report audit results in your task summary or handoff. Do not edit the WorkGroup file. If blocked, report blocker and notify lead.
> **This is a READ-ONLY audit.** Do not modify any source code or test files.
> **Scope guard**: Audit only the assigned acceptance criteria. If this is a microtask and no assigned acceptance criteria are provided, report a scope-definition gap instead of failing unrelated NodeID criteria.
> **Deliverable**: Audit report for the assigned acceptance criteria with completion %, security posture, gap list, and any scope-definition gaps.
> {advisor_guidance}

**Dispatch**:
- Dispatch one fresh independent reviewer after its implementation scope completes. It gets only the assigned NodeID/microtask, spec, criteria, checkpoint diff, and read-only files. Never fork or resume the builder lineage. Preserve the reviewer handle for compatible re-audit deltas.

---

## Phase 2B: Smoke Testing

**Agent**: `smoke-tester` | **Loop.md**: Section 3.4

**Spawn prompt**:
> You are the **smoke-tester** for WorkGroup `{wgid}`.
> **Coordination Mode**: {coordination_mode}
>
> **Goal**: {goal}
> **Change Set**: {NodeIDs}
> **Specs**: {list of spec file paths}
> **Context files**: Read `knowzcode/knowzcode_project.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
>
> {coordination_task_clause}
> **App status**: {`"App already running at {URL}"` | `"Launch app yourself"`}
> **Deliverable**: Smoke test report with pass/fail per check, evidence, and actionable failure descriptions.
> {advisor_guidance}

**Dispatch**:
- Dispatch a fresh smoke-tester after implementation dependencies complete. In adaptive/coordinated parallel execution it may run alongside independent reviewers; sequential mode runs it after review. Preserve its own handle for compatible re-smoke deltas.

---

## Phase 3: Finalization

**Agent**: `closer` | **Loop.md**: Section 3.5

**Spawn prompt (Coordinated Team)**:
> You are the **closer** for WorkGroup `{wgid}`.
> **Coordination Mode**: coordinated-team
>
> **Goal**: {goal}
> **Change Set**: {NodeIDs}
> **Specs**: {list of spec file paths}
> **Context files**: Read sections 1-2, 3.5, 6, and 7 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_tracker.md`, `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`, `knowzcode/knowzcode_log.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
>
> **Your Task**: #{task-id} — claim immediately with `TaskUpdate({taskId: "{task-id}", status: "in_progress"})`. Mark completed with `TaskUpdate({taskId: "{task-id}", status: "completed"})` and a summary when done.
> **Conventions**: In coordinated-team mode, report WorkGroup updates in your task summary and let the lead consolidate. In sequential/named-agent mode, update the WorkGroup file only when delegated. Prefix any task/todo entries with `KnowzCode:`. If blocked, report blocker and notify lead.
> **Vault writes**: Return one consolidated `FinalCaptureDelta` to the lead. The lead classifies it with `vault-delta` and `explicit_save: true`, then sends one classified Phase 3 flush with its content-bound parent identity/key, complete mutation plan, and known `KnowledgeId` values to knowledge-liaison. The liaison returns one self-contained `WriterRequest` with a distinct deterministic child key per logical mutation; missing amend/update identities fail explicitly and never become create. The lead dispatches exactly one `knowz:writer` and owns its task state. Do NOT call MCP or append a queue yourself.
> **Enterprise Compliance Handoff**: If `enterprise-enforcer` was active during this WorkGroup, expect a DM `"ComplianceSummary: {payload}"` shortly after you claim your task. ACK with `"ComplianceSummary received"`. Before final commit, append the payload to `knowzcode/enterprise/compliance_status.md` Review History (see `${CLAUDE_PLUGIN_ROOT}/agents/closer.md` Enterprise-Enforcer Handoff section). The lead waits for your ACK before shutting down enterprise-enforcer.
> **Deliverable**: Apply only delegated finalization-file edits, then return one `FinalCaptureDelta`, explicit changed-file list, verification summary, and suggested commit message. The lead performs persistence, scoped staging, and the commit.
> {advisor_guidance}

**Spawn prompt (Sequential / Named Agent)**:
> You are the **closer** for WorkGroup `{wgid}`.
> **Coordination Mode**: named-agent
>
> **Goal**: {goal}
> **Change Set**: {NodeIDs}
> **Specs**: {list of spec file paths}
> **Context files**: Read sections 1-2, 3.5, 6, and 7 of `knowzcode/knowzcode_loop.md` (skip other phases), `knowzcode/knowzcode_tracker.md`, `knowzcode/knowzcode_project.md`, `knowzcode/knowzcode_architecture.md`, `knowzcode/knowzcode_log.md`
> **WorkGroup file**: `knowzcode/workgroups/{wgid}.md`
>
> **Result contract**: Do not call shared task-list or peer-message tools. Update the WorkGroup file only when explicitly delegated. Return the bounded result directly to the lead; if blocked, include the exact blocker.
> **Vault writes**: Return one consolidated `FinalCaptureDelta` with stable identity evidence, known `KnowledgeId` values, and a proposed content-bound parent idempotency key. Do not reuse that parent key across logical mutations: the lead/liaison resolves the ordered mutation plan and distinct deterministic child keys. Do not call MCP and do not append a queue; the lead owns the classified persistence path.
> **MCP Status**: {MCP_ACTIVE} — Vaults configured: {VAULTS_CONFIGURED}. Vault config: `knowz-vaults.md` (project root).
> **Enterprise Compliance**: Consume the bounded compliance summary supplied in this capsule. Do not dispatch or message an enforcer yourself.
> **Deliverable**: Apply only delegated finalization-file edits, then return one `FinalCaptureDelta`, explicit changed-file list, verification summary, and suggested commit message. The lead performs persistence, scoped staging, and the commit.
> {advisor_guidance}

**Dispatch**: After all required audits pass, dispatch or resume a compatible closer with only finalization inputs. In coordinated mode, obtain required officer handoffs before releasing them. In named-agent mode, use `Agent(subagent_type="knowzcode:closer", description="Phase 3 finalization", prompt=<bounded finalization packet>)`.
