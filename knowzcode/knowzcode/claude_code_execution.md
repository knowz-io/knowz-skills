# Claude Code Execution Model

**Purpose:** Defines Agent Teams behavior and inter-agent communication patterns specific to Claude Code. This file supplements the platform-agnostic agent definitions in `agents/`.

Agents on other platforms should ignore this file — see `knowzcode/platform_adapters.md` for platform-specific execution instructions.

---

## Agent Teams Overview

Agent Teams is an **experimental** Claude Code feature for multi-agent coordination. It requires the environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to be set in the Claude Code environment.

> **Status:** Experimental. The API may change in future releases.

### Prerequisites

- Claude Code with Agent Teams support
- Environment variable: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (set in `~/.claude/settings.json` env block or shell environment)
- Commands detect Agent Teams at runtime via try-then-fallback: they attempt `TeamCreate()` and fall back to Subagent Delegation if it fails. No manual detection logic is needed in command files.

> **Windows note:** Split-pane mode (`tmux`) is not supported on Windows Terminal. Agent Teams automatically uses `in-process` mode on Windows (the default `auto` mode handles this correctly). No manual configuration is needed.

### Architecture

Agent Teams uses a **team lead + teammates** model:

- **Team Lead**: Coordinates workflow, delegates tasks, never codes directly (delegate mode)
- **Teammates**: Specialized agents that receive tasks and report results
- **Shared Task List**: Structured work tracking with dependencies
- **Mailbox**: Ad-hoc inter-agent messaging for coordination

### Task Mechanics

Tasks follow a lifecycle: `pending` -> `in_progress` -> `completed`

- Tasks can have **dependencies** (task B blocked by task A)
- Tasks can have **blockers** (external impediments)
- The lead creates tasks and assigns to teammates
- Teammates update status and report results

### Communication Primitives

Agent Teams provides two communication mechanisms:

| Mechanism | Purpose | When to Use |
|-----------|---------|-------------|
| **Task List** | Structured work with status, dependencies, blockers | Phase delegation, quality gates, handoffs |
| **Mailbox** | Ad-hoc coordination between teammates | Clarifications, gap details, scope questions |

### Hooks

Agent Teams supports event-driven coordination via hooks:

- **`TeammateIdle`**: Fires when a teammate finishes its current task — can auto-assign next work
- **`TaskCompleted`**: Fires when a task is marked complete — can trigger dependent tasks

### Plan Approval Handshake (Agent Teams Only)

When the lead enables plan approval in the spawn prompt (or a teammate has `permissionMode: plan`):

1. **Teammate** presents their plan by calling `ExitPlanMode`
2. **Lead** receives a `plan_approval_request` message with a `request_id`
3. **Lead** reviews the plan and responds with `SendMessage` type `plan_approval_response`:
   - `approve: true` → teammate exits plan mode and proceeds with execution
   - `approve: false` + `content: "feedback"` → teammate revises their plan and re-presents
4. **Teammate** receives the response and acts accordingly

The lead MUST respond to every `plan_approval_request` — ignoring it will leave the teammate blocked indefinitely.

#### Autonomous Mode and Plan Approval

When `AUTONOMOUS_MODE = true`, the lead auto-approves all `plan_approval_request` messages immediately. The plan content is still logged for transparency, but no pause for review occurs.

**Exception**: Plans that touch >10 files or propose disabling security measures → pause for manual review even in autonomous mode.

### Handling Shutdown Requests

When you receive a `shutdown_request` from the lead:

1. Complete or save any in-progress work (update the WorkGroup file if needed)
2. Mark your current task as `completed` (or leave as `in_progress` if unfinished)
3. Respond with `SendMessage` type `shutdown_response`:
   - `approve: true` → confirms shutdown, your process will terminate
   - `approve: false` + `content: "reason"` → if you are mid-critical-operation (e.g., "Completing task, will be ready in a moment")
4. After approving shutdown, do not take any further actions

### Limitations

- Experimental feature — API may change
- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env var
- Not available in all Claude Code environments
- No nested teams — teammates never create teams themselves

---

## Team Lifecycle

The team lead manages the full lifecycle of a team. Teammates never create or clean up teams.

### Creation

At the start of a workflow (`/knowzcode:work`, `/knowzcode:explore`, `/knowzcode:audit`), the lead creates a team before spawning any teammates:

- **`/knowzcode:work`**: Team name `kc-{wgid}` (matches the WorkGroup ID)
- **`/knowzcode:explore`**: Team name `kc-explore-{slug}` (from the research topic)
- **`/knowzcode:audit`**: Team name `kc-audit-{timestamp}`

Creating a team establishes:
- A shared task list for structured work tracking
- A team config that teammates can read to discover each other
- A coordination namespace for mailbox messaging

### Cleanup

After the workflow completes (or if cancelled), the lead:
1. Shuts down all active teammates — waits for each to confirm shutdown
2. Deletes the team — removes team config and task list

No teammates or team resources should remain after a workflow ends.

---

## KnowzCode Agent Teams Behavior

When running as teammates in a Claude Code Agent Teams workflow, all agents follow these conventions:

### Task Lifecycle
- Your spawn prompt or DM includes your assigned task ID (e.g., `**Your Task**: #5`)
- Claim immediately: `TaskUpdate(taskId, status: "in_progress")`
- Read context files listed in task description independently (do not duplicate context across agents)
- Report progress by updating task status
- When complete: `TaskUpdate(taskId, status: "completed")` with a summary
- If blocked: keep task in_progress with blocker description
- Do NOT create new tasks for work already assigned to you — use the provided task ID

### Plan Approval (architect, builder only)
- **Architect**: Present spec drafts as a plan for lead review before finalizing. Wait for lead approval before writing final specs
- **Builder**: Present implementation plan (approach, file changes, test strategy) for lead review before coding. Wait for lead approval before writing code

### Inter-Agent Communication

> **Note:** In `/knowzcode:work` Parallel Teams mode, teammates coexist within stages: knowledge-liaison pushes context to analysts, builders and reviewers persist through the gap loop. The messaging patterns below are actively used. In Sequential Teams mode (`--sequential`), teammates are spawned one at a time — inter-phase communication goes through the lead via WorkGroup files.

Use mailbox messaging for coordination between teammates:

| From | To | When |
|------|-----|------|
| knowledge-liaison | analyst, architect | Context Briefing with local + vault findings (DM) |
| scanner | all | Codebase scan findings — affected files, test patterns (broadcast) |
| analyst | architect | `[PRELIMINARY]` NodeID findings during Stage 0 (max 3 DMs), scope clarifications, NodeID overlap with existing specs |
| architect | analyst | Scope adjustments needed |
| architect | builder | Design guidance and spec intent responses |
| builder | analyst | Affected files and dependency questions |
| builder | architect | Spec clarification requests |
| builder | builder | Shared interface changes, dependency coordination |
| reviewer | lead | Gap reports per partition (structured format via task summaries) |
| lead | builder | Gap fix assignments with context (task creation + DM) |
| lead | reviewer | Re-audit requests after gap fixes (task creation + DM) |
| lead | knowledge-liaison | Capture DMs at quality gates: `"Capture Phase {N}: {wgid}"` |
| knowledge-liaison | knowz:writer dispatch | Dispatch writer with self-contained extraction prompts |
| knowledge-liaison | knowz:reader dispatch | Dispatch reader for vault queries |
| closer | knowledge-liaison | Phase 3 capture DM: `"Capture Phase 3: {wgid}"` |
| any agent | knowledge-liaison | `"Log: ..."`, `"Consider: ..."`, `"VaultQuery: ..."` |
| closer | analyst | Change scope for log entry accuracy |
| closer | architect | Spec format and legacy migration |
| security-officer | lead | Structured finding reports at gates (with `[SECURITY-BLOCK]` for CRITICAL/HIGH) |
| security-officer | architect | Security VERIFY criteria needs during Phase 1B |
| security-officer | builder | Security guidance for sensitive partitions (max 2 DMs per builder) |
| security-officer | test-advisor | Cross-cutting: test gaps in security-critical paths (max 2 inter-specialist DMs) |
| test-advisor | lead | Test quality reports at gates |
| test-advisor | architect | VERIFY criteria testability concerns during Phase 1B |
| test-advisor | builder | Specific test improvement feedback (max 2 DMs per builder) |
| test-advisor | security-officer | Cross-cutting: security scenarios needing test coverage (max 2 inter-specialist DMs) |
| project-advisor | lead | Backlog context (Stage 0) and proposals (late Stage 2) |
| project-advisor | knowledge-liaison | Idea captures: `"Consider: {idea}"` (knowledge-liaison dispatches knowz:writer if warranted) |

### Gap Communication Flow
In Parallel Teams mode, gap communication goes through the lead:
1. Reviewer reports gaps in task completion summary (structured format)
2. Lead creates fix task and pre-assigns to builder:
   `TaskCreate("Fix gaps: NodeID-X")` → `TaskUpdate(taskId, owner: "builder-N")`
3. Lead sends DM to builder with task ID and gap details:
   `"**New Task**: #{fix-task-id} — Fix gaps: NodeID-X. {file path, VERIFY criterion, expected vs actual}"`
4. Builder claims fix task, fixes gaps, marks fix task complete
5. Lead creates re-audit task and pre-assigns to reviewer:
   `TaskCreate("Re-audit: NodeID-X")` → `TaskUpdate(taskId, owner: "reviewer-N")`
6. Lead sends DM to reviewer with task ID:
   `"**New Task**: #{reaudit-task-id} — Re-audit: NodeID-X. {gap list}"`

In Sequential Teams mode, the lead spawns a new builder with gap context, then a new reviewer for re-audit.

---

## Parallel Teams Orchestration

This section defines conventions specific to Parallel Teams mode in `/knowzcode:work`. For the full orchestration flow, see `skills/work/SKILL.md`.

### Lead Responsibilities in Parallel Mode

- Lead is the **sole WorkGroup file writer** — agents report via task completion summaries, lead consolidates
- Lead manages all agent lifecycles (spawn, shutdown) — agents never self-shutdown
- Lead creates the task graph progressively (not all upfront) based on dependency map
- Lead mediates gap flow: reviewer → lead → builder (not direct reviewer → builder for actionable gaps)
- Lead uses DM messages alongside task creation to provide context and coordinate
- Lead owns progress documentation — at every quality gate, the lead DMs the knowledge-liaison with capture requests (e.g., `"Capture Phase 1A: {wgid}. Your task: #{task-id}"`). No other agent initiates gate captures. If the knowledge-liaison is unavailable, the lead ensures the closer handles vault writes at Phase 3.

### Task Assignment Protocol

When creating a task for a specific agent, the lead MUST thread the task ID:
1. `TaskCreate(subject, description)` → capture returned `{task-id}`
2. `TaskUpdate(taskId: "{task-id}", owner: "{agent-name}")` — pre-assign
3. Include the task ID in the agent's context:
   - **Spawn prompt** (new agent): Add `**Your Task**: #{task-id}` line
   - **DM** (existing agent): Include `**New Task**: #{task-id} — "{subject}"`

Agents must NOT create new tasks for work already assigned to them via task ID.

### Agent Lifecycle

| Agent | Spawn At | Shut Down At | Purpose While Alive |
|-------|----------|-------------|---------------------|
| scanner-direct | Stage 0 (conditional) | After Stage 1 (analyst done) | Source code scanning — broadcasts affected files and code paths |
| scanner-tests | Stage 0 (conditional) | After Stage 1 (analyst done) | Test discovery — broadcasts test patterns and coverage shape |
| analyst | Stage 0 | Early Stage 2 | Scope questions from builders |
| architect | Stage 0 (pre-load + speculative research) | After Gate #3 | Pre-load → speculative research on `[PRELIMINARY]` NodeIDs → spec drafting (+ parallel coordination for 3+ NodeIDs) → design guidance for builders |
| spec-drafter(s) | Stage 1 (Path B, 3+ NodeIDs) | After architect consistency review | Draft specs for assigned NodeID partition |
| builder(s) | Stage 2 | After Gate #3 | Implementation + gap fixes (persistent through gap loop) |
| reviewer(s) | Stage 2 (1 per builder partition) | After Gate #3 | Incremental audit per partition (persistent through gap loop) |
| security-officer | Stage 0 (Group C) | After Gate #3 | Threat modeling + vulnerability scanning (officer — can block gates) |
| test-advisor | Stage 0 (Group C) | After Gate #3 | TDD enforcement + test quality review (advisor — informational) |
| project-advisor | Stage 0 (Group C) | Mid-Stage 2 | Backlog curation + idea capture (advisor — informational) |
| knowledge-liaison | Stage 0 (Group A) | Last before team cleanup | Persistent context & vault coordinator — reads local context, dispatches vault readers, routes vault I/O |
| closer | Stage 3 | End of workflow | Finalization |

### Task Dependency Usage

All tasks in a workflow use `addBlockedBy` to express the dependency chain:
1. **Visibility**: `TaskList` shows the workflow graph at any point
2. **Future automation**: Hooks (`TeammateIdle`, `TaskCompleted`) can auto-assign when dependencies resolve
3. **Progressive creation**: Lead creates tasks stage-by-stage, not all upfront

### Task Graph Patterns

- Stage 0 tasks: scanner + analysis tasks (no deps, knowz:writer dispatched at gates)
- Stage 1 tasks: spec drafting tasks (blocked by gate approval — lead creates after gate). Path B (3+ NodeIDs): spec-drafter tasks + architect consistency review task
- Stage 2 tasks: implementation subtasks (blocked by spec approval), audit subtasks (blocked by implementation)
- Stage 3 tasks: finalization (blocked by audit approval)

### Orchestration Configuration

Team sizing defaults are configurable via `knowzcode/knowzcode_orchestration.md`:

| Parameter | Default | Flag Override | Effect |
|-----------|---------|--------------|--------|
| `max_builders` | 5 | `--max-builders=N` | Cap concurrent builders (1-5) |
| `default_specialists` | [] | `--specialists`, `--no-specialists` | Project-level specialist defaults |
| `mcp_agents_enabled` | true | `--no-mcp` | Toggle vault agents (knowz:reader, knowz:writer dispatches) |
| `codebase_scanner_enabled` | true | `--no-scanners` | Toggle codebase scanner agents (scanner-direct, scanner-tests) |
| `parallel_spec_threshold` | 3 | `--no-parallel-specs` | NodeID count threshold for parallel spec drafting (Path B) |

Precedence: hardcoded defaults → orchestration config → per-invocation flags.

### Builder Partitioning Rules

- No two builders touch the same file
- Analyst dependency map determines partitions
- Max `MAX_BUILDERS` concurrent builders (default 5, configurable in `knowzcode_orchestration.md`)
- If all NodeIDs share files → single builder with subtask tracking
- Builder-to-builder messages for interface changes affecting other partitions

### Persistent Agent Patterns

In `/knowzcode:work` Parallel Teams mode, agents persist across sub-phases for efficiency:

#### Build + Audit Loop
During Stage 2, each builder is paired with a dedicated reviewer for its partition:
- One reviewer per builder partition (e.g., builder-1 ↔ reviewer-1, builder-2 ↔ reviewer-2)
- Each reviewer audits only the NodeIDs in its paired builder's partition
- Gap loops run independently per partition — partition A's gap loop does not block partition B's audit
- If gaps found: lead creates fix task for the partition's builder + re-audit task for the partition's reviewer
- All builders and reviewers stay alive through the entire gap loop — shut down only after Gate #3

This eliminates both cold-start overhead (no respawning) and the sequential bottleneck (no single reviewer processing all partitions).

#### Architect Consultative Persistence
During Stage 2, the architect persists as a read-only consultative resource:
- Responds to builder DMs about spec intent, interface contracts, and design decisions
- Does NOT write code, modify specs, or create tasks
- Lead notifies architect when builders are spawned — architect sends intro message to each builder
- Shut down with builders and reviewers after Gate #3

#### Discovery Pre-loading + Speculative Research
During Stage 0, the architect pre-loads context and conducts speculative research in parallel with analysis:
- **Pre-load phase**: Architect reads architecture docs, existing specs, project config (3-5 turns)
- **Speculative research phase**: After pre-load, architect receives `[PRELIMINARY]` NodeID messages from the analyst (max 3). For each, it reads affected files, checks spec consolidation, and analyzes interface patterns — all read-only, no spec writing
- When Gate #1 is approved, architect already has context + deep research on flagged NodeIDs → specs drafted ~80% faster
- If Gate #1 rejected, architect context and research are still useful for the revised analysis cycle
- If no `[PRELIMINARY]` messages arrive (simple 1-NodeID change), architect finishes standard pre-load and waits

#### Parallel Spec Drafting (Path B — 3+ NodeIDs)
When the approved Change Set contains 3+ NodeIDs (configurable via `PARALLEL_SPEC_THRESHOLD`), spec drafting is parallelized:
- Architect proposes NodeID partitions (1-2 per partition, max 3 partitions)
- Lead spawns spec-drafter agents (using `architect` agent definition) for each partition
- Each drafter receives: its NodeIDs, architect's speculative research findings, cross-NodeID constraints
- After all drafters complete, architect runs a consistency review: cross-spec alignment, naming, VERIFY coverage
- Spec-drafters shut down after consistency review, before Gate #2
- For 1-2 NodeIDs (Path A), architect drafts all specs alone (current behavior, zero overhead)

#### Specialist Agents (Group C — opt-in via `--specialists`)

When specialists are enabled, three additional agents spawn at Stage 0 alongside Group A:

```
Group A (always):           knowledge-liaison + analyst + architect      (3 agents)
Group A (if scanners):      + scanner-direct + scanner-tests            (+2 agents)
Group C (if --specialists): security-officer + test-advisor + project-advisor  (3 agents)
```

Max Stage 0 concurrent: 3-8 agents depending on orchestration config (scanners, specialists). Scanners shut down after Stage 1, so Stage 2 peak is manageable.

##### Officer vs Advisor Authority

| Role | Authority | Gate Impact |
|------|-----------|-------------|
| **Officer** (security-officer) | CRITICAL/HIGH findings block gates | `[SECURITY-BLOCK]` tag pauses autonomous mode |
| **Advisor** (test-advisor, project-advisor) | Informational only | Findings included in gate reports, do not block |

##### Direct DM Protocol

Specialists communicate directly with builders, architect, and each other — no lead bottleneck relay:

- **security-officer → architect**: Security VERIFY criteria needs during Phase 1B
- **security-officer → builder-N**: Security guidance for sensitive partitions (max 2 DMs per builder)
- **test-advisor → architect**: VERIFY criteria testability concerns during Phase 1B
- **test-advisor → builder-N**: Specific test improvement feedback (max 2 DMs per builder)
- **project-advisor → knowledge-liaison**: Idea captures (`"Consider: {idea}"` — knowledge-liaison dispatches knowz:writer if warranted)
- **security-officer ↔ test-advisor**: Cross-cutting test gaps in security paths (max 2 inter-specialist DMs total)

##### Communication Discipline

- Max 2 DMs to any individual builder from each specialist
- Max 2 inter-specialist DMs per workflow
- Consolidate findings — no per-file noise
- project-advisor does NOT DM builders or other specialists (observes via task list only)

---

## Lead Responsibilities (All Execution Modes)

Regardless of execution mode (Parallel Teams, Sequential Teams, Subagent Delegation), the lead/outer orchestrator is responsible for:

1. **Progress documentation via knowz:writer**: At every quality gate, the lead triggers knowledge capture. In Parallel Teams, this means dispatching knowz:writer with self-contained prompts. In Sequential/Subagent modes where vault agents are not dispatched, the lead passes MCP status and vault config to the closer's spawn prompt so Phase 3 captures are handled via Direct Write Fallback.
2. **MCP status handoff**: The lead performs the MCP probe and communicates the result downstream — either by spawning vault agents (Parallel) or by including `MCP_ACTIVE` and `VAULTS_CONFIGURED` status in the closer's spawn prompt (Sequential/Subagent).
3. **Capture completeness verification**: The lead confirms all gate captures completed before shutting down the writer or proceeding to the next stage.

---

## Teammate Initialization Protocol

### Agent Teams Mode (spawned as a teammate)

When spawned as a teammate in an Agent Teams workflow, follow this sequence:

1. Read your agent definition file (referenced in your spawn prompt)
2. Claim your assigned task: `TaskUpdate(taskId: "{task-id from spawn prompt}", status: "in_progress")`
3. Read this file (`knowzcode/claude_code_execution.md`) for team conventions
4. Read the WorkGroup file for current state, Change Set, and context
5. Read context files listed in your task description
6. Begin your phase work as defined by your role
7. Update the WorkGroup file with results — prefix all todo entries with `KnowzCode:`
8. Mark your task as complete with a summary of what was delivered

### Subagent Mode (spawned via Task())

When spawned as a custom subagent type (e.g. `subagent_type: "analyst"`), your agent definition from `agents/*.md` is **auto-loaded as your system prompt**. This means:

- Step 1 above is already done — your role definition, tools, and constraints are pre-loaded
- Your `tools`, `model`, `permissionMode`, and `maxTurns` from the YAML frontmatter are enforced automatically
- You only need to read the task-specific context provided in the spawn prompt (WorkGroup file, specs, context files)
- Begin your phase work directly

### For Both Modes

If you encounter a blocker, keep the task in `in_progress` status with a description of what is blocking you. Do not mark the task as complete until the work is done.

---

## Command References

Agents may reference these Claude Code commands as escalation paths:

| Command | Used By | Context |
|---------|---------|---------|
| `/knowzcode:work` | microfix-specialist | Redirect when fix exceeds scope gate |
| `/knowzcode:audit security` | reviewer | Full security audit mode |
| `/knowzcode:audit spec` | knowledge-migrator | Post-migration validation |

On other platforms, these commands translate to running the corresponding phase prompts manually.

---

## Verification & Troubleshooting

### How to verify Agent Teams is working

1. Run `/knowzcode:status` — check the Agent Teams section for "Enabled" status and agent definitions
2. Run `/knowzcode:work` — confirm a mode announcement appears before Phase 1A (either "Agent Teams" or "Subagent Delegation")
3. In-process mode: press Shift+Down to see spawned teammates in the panel
4. Check the WorkGroup file — should show phase transitions with timestamps in the Phase History table

### Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| No mode announcement | Command didn't run setup step | Verify commands are updated (Step 2 should announce mode) |
| "Subagent Delegation" when expecting Agent Teams | Env var not set or Claude Code not restarted | Add `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to settings.json `env` block. **Restart Claude Code** — env vars are only loaded on startup. |
| Agents seem generic / no specialization | Agent definitions not loaded | Check `agents/` directory exists with `.md` files for each role |
| No quality gates appearing | Command instructions not followed | Re-run `/knowzcode:work` with an explicit goal description |
| Teammates not visible in panel | Using tmux mode on Windows | Windows uses in-process mode — teammates won't appear in a split pane |

### Verifying after a workflow

Check the WorkGroup file at `knowzcode/workgroups/{wgid}.md`:

- **Phase History table** should show all phases with timestamps and statuses
- **Change Set** should be populated (Phase 1A output) with NodeIDs and descriptions
- **Todos** should all start with the `KnowzCode:` prefix
- **Status** should show "Closed" after Phase 3 completes
