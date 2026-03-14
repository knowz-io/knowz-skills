---
name: work
description: "Execute a full KnowzCode development workflow — TDD, quality gates, agent coordination, and structured implementation phases. Use when the user wants to BUILD, IMPLEMENT, or CREATE code, not just research or audit."
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task
# Note: Also uses MCP tools (create_knowledge, search_knowledge) when MCP is configured
argument-hint: "[feature_description]"
---

# Work on New Feature

Start a new KnowzCode development workflow session.

**Usage**: `/knowzcode:work "feature description"`
**Example**: `/knowzcode:work "Build user authentication with JWT"`

**Primary Goal**: $ARGUMENTS

## When NOT to Trigger

- User wants to **research or explore** without implementing → use `/knowzcode:plan`
- User wants a **single-file micro-fix** (<50 lines, no ripple effects) → use `/knowzcode:fix`
- User wants to **audit or scan** existing code quality → use `/knowzcode:audit`
- User is **asking a question** (starts with how/why/what/should, contains `?`)
- User wants to **save a learning** → use `/knowz save`

## Common Invocation Patterns

These phrases indicate `/knowzcode:work` intent:
- "build X", "implement X", "create X", "develop X"
- "add feature for X", "make X work", "set up X"
- "refactor X to Y", "migrate X to Y"

---

## Step 0: Prerequisite Check

Verify KnowzCode is initialized:
1. Check if `knowzcode/` directory exists
2. Check required files exist: `knowzcode_loop.md`, `knowzcode_tracker.md`, `knowzcode_project.md`, `knowzcode_architecture.md`

If missing: inform user to run `/knowzcode:init` first. STOP.

## Step 1: Generate WorkGroup ID

**Format**: `kc-{type}-{slug}-YYYYMMDD-HHMMSS`

- `{type}`: feat, fix, refactor, or issue
- `{slug}`: 2-4 word kebab-case from goal (remove common words: build, add, create, implement, the, a, with, for)
- Truncate slug to max 25 characters

## Step 2: Select Execution Mode

Determine the execution mode using try-then-fallback:

1. Note user preferences from `$ARGUMENTS`:
   - `--sequential` → prefer Sequential Teams
   - `--subagent` → force Subagent Delegation (skip team creation attempt)

2. **If `--subagent` NOT specified**, attempt `TeamCreate(team_name="kc-{wgid}")`:
   - **If TeamCreate succeeds** → Agent Teams is available. Choose mode:
     - `--sequential` or Tier 2 → **Sequential Teams**: `**Execution Mode: Sequential Teams** — created team kc-{wgid}`
     - Otherwise → **Parallel Teams** (default for Tier 3): `**Execution Mode: Parallel Teams** — created team kc-{wgid}`
   - **If TeamCreate fails** (error, unrecognized tool, timeout) → **Subagent Delegation**: `**Execution Mode: Subagent Delegation** — Agent Teams not available, using Task() fallback`

3. **If `--subagent` specified** → **Subagent Delegation** directly (no TeamCreate attempt):
   - Announce: `**Execution Mode: Subagent Delegation** — per user request`

For all Agent Teams modes (Sequential and Parallel):
- You are the **team lead** in delegate mode — you coordinate phases, present quality gates, and manage the workflow. You NEVER write code, specs, or project files directly. All work is done by teammates. (Tip: the user can press Shift+Tab to system-enforce delegate mode.)
- After completion or if the user cancels, shut down all active teammates and clean up the team (see Cleanup section)

For Subagent Delegation:
- For each phase, delegate via `Task()` with the parameters specified in phase sections below

The user MUST see the execution mode announcement before any phase work begins. The phases, quality gates, and interactions are identical across all paths.

> **Note:** Agent Teams is experimental and the API may change.

## Step 2.4: Load Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse its YAML blocks:

1. `MAX_BUILDERS` = `max_builders` value (default: 5, clamp to 1-5)
2. `SCOUT_MODE` = `scout_mode` value (default: "full")
3. `DEFAULT_SPECIALISTS` = `default_specialists` value (default: [])
4. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)
5. `CODEBASE_SCANNER_ENABLED` = `codebase_scanner_enabled` value (default: true)
6. `PARALLEL_SPEC_THRESHOLD` = `parallel_spec_threshold` value (default: 3, clamp to 2-10)

Apply flag overrides (flags win over config):
- `--max-builders=N` in `$ARGUMENTS` → override `MAX_BUILDERS`
- `--no-scouts` in `$ARGUMENTS` → override `SCOUT_MODE = "none"`
- `--no-mcp` in `$ARGUMENTS` → override `MCP_AGENTS_ENABLED = false`
- `--no-scanners` in `$ARGUMENTS` → override `CODEBASE_SCANNER_ENABLED = false`
- `--no-parallel-specs` in `$ARGUMENTS` → override `PARALLEL_SPEC_THRESHOLD = 999` (effectively disabled)

If the file doesn't exist, use hardcoded defaults (current behavior).

## Step 2.5: Autonomous Mode Detection

Set `AUTONOMOUS_MODE = true` if ANY of these match:

a. **Flags**: `$ARGUMENTS` contains `--autonomous` or `--auto`

b. **Natural language** (case-insensitive match in `$ARGUMENTS` OR the user's preceding conversation message):
   - Approval intent: "approve all", "pre-approve", "preapprove", "auto-approve"
   - Mode intent: "autonomous mode", "autonomous", "unattended", "hands off", "hands-off"
   - Proceed intent: "don't stop to ask", "don't ask me", "no approval needed", "just run through", "run it all", "run straight through", "proceed without asking", "skip the gates", "go all the way through"
   - Delegation intent: "I trust your judgement", "use your best judgement", "defer to your judgement", "you decide"

c. **Contextual** — if the user's message conveys clear intent for the lead to operate without stopping (even if none of the exact phrases above match), interpret that as autonomous mode. The spirit of the instruction matters more than exact phrasing.

Default: `AUTONOMOUS_MODE = false`

If `AUTONOMOUS_MODE = true`, announce after the execution mode announcement:
> **Autonomous Mode: ACTIVE** — Gates presented for transparency but auto-approved.
> Safety exceptions still pause: critical blockers, HIGH/CRITICAL security findings, >3 same-phase failures, complex architecture discrepancies, >3 gap-fix iterations per partition.

## Step 2.6: Specialist Detection

Set `SPECIALISTS_ENABLED = []` (empty list).

If `DEFAULT_SPECIALISTS` is non-empty (from Step 2.4), initialize:
`SPECIALISTS_ENABLED = DEFAULT_SPECIALISTS`

Determine which specialists to activate (flags and natural language add to or override the baseline):
- `--specialists` → enable all 3: `[security-officer, test-advisor, project-advisor]`
- `--specialists=csv` → enable specific subset (comma-separated, e.g., `--specialists=security,test`):
  - `security` → `security-officer`
  - `test` → `test-advisor`
  - `project` → `project-advisor`
- `--no-specialists` → explicit opt-out, `SPECIALISTS_ENABLED = []`

**Natural language detection** (case-insensitive match in `$ARGUMENTS` OR the user's preceding conversation message):
- All specialists: "with specialists", "with officers", "full specialist panel"
- security-officer: "security review", "threat model", "vulnerability scan", "pentest"
- test-advisor: "test quality", "TDD enforcement", "test coverage", "test rigor"
- project-advisor: "backlog", "future work", "brainstorm", "ideas"

**Mode constraints:**
- Tier 3 Parallel Teams: Full support (Group C)
- Tier 3 Subagent Delegation: Supported via parallel `Task()` calls
- Sequential Teams / Tier 2: Not supported — if specialists were detected, announce: `> **Specialists: SKIPPED** — not supported in {Sequential Teams / Tier 2} mode.`

Default: `SPECIALISTS_ENABLED = []` (specialists are opt-in).

If `SPECIALISTS_ENABLED` is non-empty, announce after the autonomous mode announcement (or after the execution mode announcement if autonomous is not active):
> **Specialists: ACTIVE** — {comma-separated list of enabled specialists}

## Step 3: Load Context Files (ONCE)

Read these files ONCE (do NOT re-read between phases):
- `knowzcode/knowzcode_loop.md`
- `knowzcode/knowzcode_tracker.md`
- `knowzcode/knowzcode_project.md`
- `knowzcode/knowzcode_architecture.md`

## Step 3.5: Pull Team Standards (MCP — Optional)

If MCP is configured and enterprise compliance is enabled:
1. Check `knowzcode/enterprise/compliance_manifest.md` for `mcp_compliance_enabled: true`
2. If enabled: Read `knowzcode/knowzcode_vaults.md` to find vault matching type "enterprise", then `ask_question({resolved_enterprise_vault_id}, "team standards for {project_type}")`
3. Merge returned standards into WorkGroup context for quality gate criteria

If MCP is not configured or enterprise is not enabled, skip this step.

## Step 4: Create WorkGroup File

Create `knowzcode/workgroups/{WorkGroupID}.md`:
```markdown
# WorkGroup: {WorkGroupID}

**Primary Goal**: {$ARGUMENTS}
**Created**: {timestamp}
**Status**: Active
**Current Phase**: 1A - Impact Analysis
**Autonomous Mode**: Active/Inactive

## Change Set
(Populated after Phase 1A)

## Todos
- KnowzCode: Initialize WorkGroup
- KnowzCode: Complete Phase 1A impact analysis

## Phase History
| Phase | Status | Timestamp |
|-------|--------|-----------|
| 1A | In Progress | {timestamp} |
```

## Step 5: Input Classification

**Question indicators** (suggest `/knowzcode:plan` instead): starts with is/does/how/why/what/should, contains `?`, phrased as inquiry.

**Implementation indicators** (proceed): starts with build/add/create/implement/fix/refactor, action-oriented verbs.

If ambiguous, proceed with implementation.

## Step 5.5: Complexity Classification

Assess the goal against the codebase to determine the appropriate workflow tier.

### Tier 1: Micro → redirect to `/knowzcode:fix`
- Single file, <50 lines, no ripple effects

### Tier 2: Light (2-phase workflow)

> **Note:** Light mode does not use orchestration config — single builder, no scouts, no specialists.

ALL must be true:
- ≤3 files touched
- Single NodeID (1 new capability)
- No architectural changes
- No security-sensitive components (auth, payments, PII)
- No external API integrations
- Estimated <200 lines of change

### Tier 3: Full (5-phase workflow)
ANY triggers full:
- >3 files or >1 NodeID
- Architectural impact
- Security-sensitive scope
- External integrations
- User explicitly requests: `--tier full`

**Announce the detected tier to the user.** User can override:
- "use full" or `--tier full` → Tier 3
- "use light" or `--tier light` → Tier 2

If `$ARGUMENTS` contains `--tier light`, force Tier 2. If `--tier full`, force Tier 3.

---

## Tier 2: Light Workflow (2-phase fast path)

When Tier 2 is selected, execute this streamlined workflow instead of the 5-phase Tier 3 below.

### Light Phase 1 (Inline — lead does this, no agent)

1. Quick impact scan: grep for related files, check existing specs
2. Propose a Change Set (typically 1 NodeID)
3. Draft a lightweight spec (or reference existing spec if found) — use the 4-section format from `knowzcode_loop.md` section 3.2. Minimum: 1 Rule, 1 Interface, 2 `VERIFY:` statements.
4. Present combined Change Set + Spec for approval:

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

5. **Autonomous Mode**: If `AUTONOMOUS_MODE = true`, log `[AUTO-APPROVED] Light mode gate` and proceed directly to implementation.
   If `AUTONOMOUS_MODE = false`: If rejected — adjust based on feedback and re-present. If approved:
   - Update `knowzcode_tracker.md` with NodeID status `[WIP]`
   - Pre-implementation commit: `git add knowzcode/ && git commit -m "KnowzCode: Light spec approved for {wgid}"`

### Light Phase 2A: Implementation (Builder agent)

Spawn the builder using the standard Phase 2A prompt below (same for both tiers).

The builder self-verifies against spec VERIFY criteria — no separate audit phase.

### Light Phase 3 (Inline — lead does this, no agent)

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
6. **Progress capture** (if MCP is configured): Read `knowzcode/knowzcode_vaults.md`, resolve vault IDs. Write a brief scope-and-outcome learning to the ecosystem vault via `create_knowledge`. Check for duplicates first via `search_knowledge`.

**DONE** — 3 agents skipped (analyst, architect, reviewer, closer).

---

## Tier 3: Full Workflow (5-phase)

The standard 5-phase workflow. Used when complexity warrants full analysis, specification, audit, and finalization.

Tier 3 supports three execution modes (determined in Step 2):
- **Parallel Teams** (default) — Stage 0-3 orchestration with concurrent agents
- **Sequential Teams** (`--sequential`) — one agent per phase, spawned and shut down sequentially
- **Subagent Delegation** — Task() calls, no persistent agents

## Step 6: Spec Detection (Optional Optimization)

Check for existing specs covering this work:
1. Extract key terms from goal
2. Search `knowzcode/specs/*.md` for matching specs
3. If comprehensive matching specs found, offer:
   - **A) Quick Path** — skip discovery, use existing specs
   - **B) Validation Path** (recommended) — quick check specs match codebase
   - **C) Full Workflow** — complete Phase 1A discovery

If no matches found, proceed to Phase 1A.

### Refactor Task Check

Scan `knowzcode/knowzcode_tracker.md` for outstanding `REFACTOR_` tasks that overlap with the current goal's scope. If found, mention them to the user during Phase 1A so the analyst can factor them into the Change Set.

---

## Parallel Teams Orchestration (Tier 3 Default)

**Parallel Orchestration**: Read [references/parallel-orchestration.md](references/parallel-orchestration.md) for Stages 0-3 orchestration details, WorkGroup file format, and task dependency graph.

> **MCP Probe Design Note:** Multiple agents perform independent MCP verification (`list_vaults()`) at different points in the workflow. This redundancy is intentional — agents spawn at different times and MCP connectivity can change between spawns. Each agent's probe is authoritative for its own MCP state.
>
> **Vault Creation Failure Recovery:** If BOTH `create_vault()` and name-matching fallback fail: log failure, set `VAULTS_CONFIGURED = false`, continue without vault. Report: `"⚠️ Vault creation failed — proceeding without knowledge capture. Run /knowz setup to retry."`

- **Stage 0**: Create team, MCP probe, spawn scout/analyst/architect/scanner/MCP/specialist agents in parallel
- **Stage 1**: Analyst completes Change Set → Gate #1 → Architect drafts specs → Gate #2
- **Stage 2**: Parallel builders (1 per independent partition) + paired reviewers + gap loop
- **Stage 3**: Closer finalizes, scribe captures, shutdown

---

## Phase Prompt Reference

**Spawn Prompts**: Read [references/spawn-prompts.md](references/spawn-prompts.md) before spawning any agent. Contains spawn prompts for all phases: context scouts, codebase scanners, knowz-scout, knowz-scribe, specialists (security-officer, test-advisor, project-advisor), analyst (Phase 1A), architect (Phase 1B), builder (Phase 2A), reviewer (Phase 2B), and closer (Phase 3).

**Quality Gates**: Read [references/quality-gates.md](references/quality-gates.md) at quality gate checkpoints. Contains gate templates (#1 Change Set, #2 Specifications, #3 Audit Results), autonomous mode handling, specialist report sections, gap loop mechanics, and progress capture instructions.

### Phase Summary

| Phase | Agent | Gate | Key Output |
|-------|-------|------|------------|
| 1A | analyst | #1: Change Set | NodeIDs, dependency map, risk assessment |
| 1B | architect | #2: Specifications | Specs with VERIFY criteria |
| 2A | builder(s) | — | Implementation + tests |
| 2B | reviewer(s) | #3: Audit Results | ARC completion, gap reports |
| 3 | closer | — | Final specs, tracker updates, log entry, commit |

---

## Cleanup

### After Phase 3 Completes

**Agent Teams Mode** (Parallel or Sequential):
1. Shut down all active teammates. Wait for each to confirm shutdown.
2. Once all teammates have shut down, clean up the team (delete the `kc-{wgid}` team).
   No teammates or team resources should remain after the workflow ends.

**Subagent Mode**: No cleanup needed — `Task()` calls are self-contained.

### If User Cancels Mid-Workflow

Follow the abandonment protocol from `knowzcode_loop.md` Section 12:

1. **Revert uncommitted changes** — if implementation was in progress, revert source code changes (keep knowzcode files)
2. **Update tracker** — set all affected NodeIDs back to their pre-WorkGroup status
3. **Log abandonment** — create a log entry with type `WorkGroup-Abandoned` including the reason and phase at abandonment
4. **Close WorkGroup file** — mark the WorkGroup as `Abandoned` with timestamp and reason
5. **Preserve learnings** — if any useful patterns were discovered, capture them before closing
6. **Team teardown** — (Agent Teams only) shut down all active teammates and delete the team
7. **Parallel mode**: If cancelled mid-Stage-2, revert uncommitted code changes and mark WorkGroup abandoned

The WorkGroup file remains in `knowzcode/workgroups/` for reference. It can be resumed later with `/knowzcode:work` referencing the same goal.

---

## Handling Failures

- Phase 1A rejected: re-run analyst with feedback
- Phase 1B rejected: re-run architect with specific issues (Parallel Teams: architect is already warm)
- Phase 2A blocker encountered: present Blocker Report (per loop.md Section 11) to user with 5 recovery options: (1) modify spec, (2) change approach, (3) split WorkGroup, (4) accept partial with documented gap, (5) cancel WorkGroup
- Phase 2B audit shows gaps: return to 2A with gap list (see Gap Loop in [references/quality-gates.md](references/quality-gates.md))
- If >3 failures on same phase: PAUSE and ask user for direction (applies even when `AUTONOMOUS_MODE = true` — this is a safety exception)

## Related Skills

- `/knowzcode:plan` — Research and explore before implementing
- `/knowzcode:fix` — Single-file micro-fix (<50 lines)
- `/knowzcode:audit` — Read-only quality and security scan
- `/knowz save` — Capture learnings to vault
- `/knowzcode:continue` — Resume an active WorkGroup

## KnowzCode: Prefix Enforcement

Every task item in workgroup files MUST start with `KnowzCode:`. Pass this to all agents.
