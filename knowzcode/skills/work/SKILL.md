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

- User wants to **research or explore** without implementing → use `/knowzcode:explore`
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

If missing: inform user to run `/knowzcode:setup` first. STOP.

## Step 1: Generate WorkGroup ID

**Format**: `kc-{type}-{slug}-YYYYMMDD-HHMMSS`

- `{type}`: feat, fix, refactor, or issue
- `{slug}`: 2-4 word kebab-case from goal (remove common words: build, add, create, implement, the, a, with, for)
- Truncate slug to max 25 characters

## Step 2: Select Execution Mode

**Agent Teams is the expected execution mode for Tier 2+ workflows.** It enables persistent knowledge-liaison coverage, parallel orchestration, and consistent vault capture. Subagent delegation is a degraded fallback — it works, but knowledge capture is reduced and orchestration is single-threaded.

Determine the execution mode using try-then-fallback:

1. Note user preferences from `$ARGUMENTS`:
   - `--sequential` → prefer Sequential Teams
   - `--subagent` → force Subagent Delegation (skip team creation attempt)

2. **If `--subagent` NOT specified**, attempt `TeamCreate(team_name="kc-{wgid}")`:
   - **If TeamCreate succeeds** → Agent Teams is available. Choose mode:
     - `--sequential` → **Sequential Teams**: `**Execution Mode: Sequential Teams** — created team kc-{wgid}`
     - Tier 2 → **Lightweight Teams**: `**Execution Mode: Lightweight Teams** — created team kc-{wgid} (knowledge-liaison + builder)`
     - Tier 3 (default) → **Parallel Teams**: `**Execution Mode: Parallel Teams** — created team kc-{wgid}`
   - **If TeamCreate fails** (error, unrecognized tool, timeout) → **Subagent Delegation** with degradation warning:
     ```
     **Execution Mode: Subagent Delegation** — Agent Teams not available
     > WARNING: Knowledge capture and parallel orchestration degraded. The knowledge-liaison
     > will not run persistently — vault reads are one-shot and captures may be inconsistent.
     ```
     On Claude Code, append: `> Enable Agent Teams: set CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 in .claude/settings.local.json`
     On other platforms: no enablement instruction (Agent Teams is Claude Code-only).

3. **If `--subagent` specified** → **Subagent Delegation** directly (no TeamCreate attempt):
   - Announce: `**Execution Mode: Subagent Delegation** — per user request`

For all Agent Teams modes (Sequential, Lightweight, and Parallel):
- You are the **team lead** in delegate mode — you coordinate phases, present quality gates, and manage the workflow. You NEVER write code, specs, or project files directly. All work is done by teammates. (Tip: the user can press Shift+Tab to system-enforce delegate mode.)
- After completion or if the user cancels, shut down all active teammates and clean up the team (see Cleanup section)

For Subagent Delegation:
- For each phase, delegate via `Task()` with the parameters specified in phase sections below

The user MUST see the execution mode announcement before any phase work begins. The phases, quality gates, and interactions are identical across all paths.

> **Note:** Agent Teams is experimental and the API may change.

## Step 2.3: Resolve Execution Profile

Read `knowzcode/skills/work/references/profile-models.md` once if not already loaded. It defines profile semantics, agent-model mappings, and the `MODEL_FOR(agent, profile)` resolution rule.

### Profile resolution order

1. **Flag wins**: If `$ARGUMENTS` contains `--profile=<value>`, set `PROFILE = <value>` (validate: must be `advisor`, `teams`, or `classic`; otherwise error and halt).
2. **Config fallback**: Else, use `PROFILE_CONFIG` from Step 2.4 (which reads `profile:` from `knowzcode_orchestration.md`, defaulting to `"teams"`).
3. **Hardcoded default**: If config file absent, `PROFILE = "teams"`.

(Step 2.4 runs after this step. When `PROFILE` depends on config, perform a quick inline re-check: read `knowzcode/knowzcode_orchestration.md` directly here for the `profile:` line, then the full Step 2.4 parse happens as usual. If the file is absent, `PROFILE = "teams"`.)

### Mode-constraint validation

After resolving `PROFILE`:

- `PROFILE == "advisor"`: If `$ARGUMENTS` contains `--sequential` OR `--subagent`, halt with this exact error and do NOT proceed:
  ```
  **Error:** --profile advisor requires Parallel Teams mode.
  Conflicting flag: --sequential (or --subagent).
  Remove the conflicting flag, or choose --profile teams instead.
  ```
- `PROFILE == "classic"`: Ignore any Step 2 mode selection and force Subagent Delegation. Re-announce: `**Execution Mode: Subagent Delegation** — forced by --profile classic (or profile: classic in config)`
- `PROFILE == "teams"`: No mode constraint. Respect whatever Step 2 selected.

If Step 2 already created a team (`TeamCreate` succeeded) and `PROFILE == "classic"`, delete the team now: `TeamDelete(team_name="kc-{wgid}")`. Then proceed as Subagent Delegation.

### Advisor detection & graceful fallback

Only when `PROFILE == "advisor"`, run these checks in order:

1. If environment variable `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS == "1"` → fall back. Reason: `"CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1 is set — advisor tool is behind a beta flag."` Workaround: `"unset CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"`.
2. If environment variable `ANTHROPIC_BASE_URL` is set AND does NOT contain `"anthropic.com"` (case-insensitive) → fall back. Reason: `"ANTHROPIC_BASE_URL points to {value}, not *.anthropic.com (likely Bedrock/Vertex/custom endpoint)."` Workaround: `"unset ANTHROPIC_BASE_URL, or route through the Anthropic API directly."`
3. Otherwise → trust the user's setup; proceed with `PROFILE = "advisor"`.

If a fallback is triggered, set `PROFILE = "teams"` and announce:

```
**Profile: ADVISOR requested — falling back to TEAMS**
> Reason: {specific reason from check}
> The advisor tool requires Claude Code v2.1.100+ with direct Anthropic API access.
> To force advisor profile anyway: {specific workaround}, then retry.
```

We do NOT perform an API probe (see spec §5.4 — rationale). Runtime `advisor_tool_result_error` during a spawn is handled by the Claude Code runtime — the executor continues without advice for that call.

### Announce profile

After any fallback resolution, announce the final profile to the user:

```
**Execution Profile: {PROFILE}**
```

For `advisor`: also print `> Builder, reviewer, closer, smoke-tester, and microfix-specialist will run on Sonnet with advisor-tool guidance. Other agents stay on Opus.`

### Downstream use

- Every spawn site (Stage 0/1/2/3 in Parallel Teams, each spawn in Sequential/Subagent) MUST resolve `MODEL_FOR(agent_name, PROFILE)` per `references/profile-models.md` and include `model: <value>` in the spawn call when non-null, or omit the `model` parameter when null.
- Every spawn prompt with a `{advisor_guidance}` placeholder MUST substitute the Advisor Guidance block (from `references/spawn-prompts.md`) when `PROFILE == "advisor"` AND `MODEL_FOR(agent, PROFILE) == "sonnet"`; otherwise substitute an empty string.

## Step 2.4: Load Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse its YAML blocks:

1. `MAX_BUILDERS` = `max_builders` value (default: 5, clamp to 1-5)
2. `DEFAULT_SPECIALISTS` = `default_specialists` value (default: [])
3. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)
4. `CODEBASE_SCANNER_ENABLED` = `codebase_scanner_enabled` value (default: true)
5. `PARALLEL_SPEC_THRESHOLD` = `parallel_spec_threshold` value (default: 3, clamp to 2-10)
6. `PROFILE_CONFIG` = `profile` value (default: `"teams"`; valid: `"advisor"`, `"teams"`, `"classic"`). If the value is not one of the three, log a warning and fall back to `"teams"`. Used as the input to Step 2.3.

Apply flag overrides (flags win over config):
- `--max-builders=N` in `$ARGUMENTS` → override `MAX_BUILDERS`
- `--no-mcp` in `$ARGUMENTS` → override `MCP_AGENTS_ENABLED = false`
- `--no-scanners` in `$ARGUMENTS` → override `CODEBASE_SCANNER_ENABLED = false`
- `--no-parallel-specs` in `$ARGUMENTS` → override `PARALLEL_SPEC_THRESHOLD = 999` (effectively disabled)

(Profile flag handling — `--profile=...` — is applied in Step 2.3, not here, because it affects execution-mode selection which runs before orchestration config load.)

If the file doesn't exist, use hardcoded defaults (current behavior); `PROFILE_CONFIG = "teams"`.

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

**Autonomous + Vault Write Rule**: Autonomous mode auto-approves quality gates — it does NOT auto-skip vault writes, WorkGroup files, tracker updates, or log entries. Every gate capture and completion artifact is still MUST. "Autonomous" means "no user approval needed for gates" — it does not mean "skip the workflow structure."

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
- Sequential Teams / Lightweight Teams (Tier 2): Not supported — if specialists were detected, announce: `> **Specialists: SKIPPED** — not supported in {Sequential Teams / Lightweight Teams} mode.`

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
2. If enabled: Read `knowz-vaults.md` from project root, find vault with enterprise/compliance description, then `ask_question({resolved_enterprise_vault_id}, "team standards for {project_type}")`
3. Merge returned standards into WorkGroup context for quality gate criteria

If MCP is not configured or enterprise is not enabled, skip this step.

## Step 3.6: MCP Probe + Baseline Vault Query (Non-Skippable)

If `MCP_AGENTS_ENABLED = false` (from Step 2.4, e.g. `--no-mcp`), skip this entire step. Set `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`, `VAULT_BASELINE = null`.

Otherwise:

### MCP Probe

1. Read `knowz-vaults.md` from project root — parse vault IDs. If file not found, call `list_vaults(includeStats=true)` to discover vaults.
2. If `list_vaults()` fails AND no `knowz-vaults.md` exists → `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`. Announce: `**MCP Status: Not connected**`
3. If `list_vaults()` fails BUT `knowz-vaults.md` has vault IDs → `MCP_ACTIVE = true`, `VAULTS_CONFIGURED = true`. Announce: `**MCP Status: Lead probe failed — vault agents will verify independently**`
4. If vaults discovered but no `knowz-vaults.md` exists → suggest `"Run /knowz setup to configure vault routing."` Set `VAULTS_CONFIGURED = true` (use discovered IDs for baseline).
5. Set `MCP_ACTIVE` and `VAULTS_CONFIGURED` based on results. Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

If no vaults are configured, suggest `/knowz setup`.

### Baseline Vault Query

If `VAULTS_CONFIGURED = true` AND `MCP_ACTIVE = true`:

1. For each configured vault, call `search_knowledge({vault_id}, "past decisions, patterns, conventions related to {goal}")`.
   - For `finalizations`-type vaults: `search_knowledge({vault_id}, "past work related to {goal}")`.
   - One broad query per vault — the goal is baseline coverage, not exhaustive research.
2. Store all results as `VAULT_BASELINE`:
   ```
   VAULT_BASELINE:
   - {vault_name} ({vault_type}): {summary of results, or "No relevant results found"}
   ```
3. **Failure handling**: If `search_knowledge` fails for a vault, log failure and continue with remaining vaults. If ALL queries fail, set `VAULT_BASELINE = "Vault queries failed — MCP may be degraded"` and continue.
4. Announce: `**Vault Baseline: {N} vault(s) queried — {M} results found**`

If `VAULTS_CONFIGURED = false` OR `MCP_ACTIVE = false`, set `VAULT_BASELINE = null` and skip the baseline query.

> **This step runs for ALL tiers (2 and 3) when MCP is available.** It does not depend on agent availability. The baseline provides guaranteed vault context before any phase work begins.

## Step 4: Create WorkGroup File

Create `knowzcode/workgroups/{WorkGroupID}.md`:
```markdown
# WorkGroup: {WorkGroupID}

**Primary Goal**: {$ARGUMENTS}
**Created**: {timestamp}
**Status**: Active
**Current Phase**: 1A - Impact Analysis
**Autonomous Mode**: Active/Inactive
**KnowledgeId:**

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

Use task lists to plan and track work throughout. Add new tasks as discoveries or needs emerge during each phase.

## Step 5: Input Classification

**Question indicators** (suggest `/knowzcode:explore` instead): starts with is/does/how/why/what/should, contains `?`, phrased as inquiry.

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

> **Tier 2 still requires**: WorkGroup file (Step 4), tracker updates, log entry, and vault capture attempt. "Light" means fewer agents and phases — not fewer artifacts or vault writes.

### Tier 2 Team Setup

If Agent Teams is available (TeamCreate succeeded in Step 2):
1. Create team `kc-{wgid}` (already done in Step 2)
2. Spawn `knowledge-liaison` as persistent teammate using the Stage 0 spawn prompt from `references/spawn-prompts.md`. Pass `VAULT_BASELINE` from Step 3.6 in the spawn prompt.
3. Knowledge-liaison performs startup protocol (reads local context, dispatches vault readers if vaults configured, sends Context Briefing — but only to lead since no analyst/architect in Tier 2)

If Agent Teams is NOT available (subagent fallback):
- Knowledge-liaison dispatched as one-shot `Task(subagent_type="knowzcode:knowledge-liaison")` for vault baseline research before Phase 2
- Degradation warning already shown in Step 2

### Light Phase 1 (Inline — lead coordinates, knowledge-liaison active)

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

### Light Phase 2A: Implementation (Builder teammate)

**Agent Teams mode**: Spawn the builder as a teammate in the `kc-{wgid}` team using the standard Phase 2A spawn prompt from `references/spawn-prompts.md` (same prompt for both tiers). The builder runs as a persistent teammate alongside the knowledge-liaison.

**Subagent fallback**: Spawn the builder via `Task(subagent_type="knowzcode:builder")` with the standard Phase 2A prompt (current behavior).

The builder self-verifies against spec VERIFY criteria — no separate audit phase.

### Light Phase 2B: Smoke Testing (Opt-in)

Only if user explicitly requested smoke testing (e.g., `--smoke-test` in `$ARGUMENTS` or natural language: "smoke test", "test it running", "verify it works"):

**Agent Teams mode**: Spawn the smoke-tester as a teammate in the `kc-{wgid}` team using the Phase 2B smoke-tester spawn prompt from `references/spawn-prompts.md`.

**Subagent fallback**: Spawn via `Task(subagent_type="smoke-tester", description="Smoke test", prompt=<spawn prompt>)`.

If smoke test fails: create fix tasks for builder, re-run smoke-tester. 3-iteration cap, then escalate. App lifecycle managed by smoke-tester (see `agents/smoke-tester.md`).

If user did not request smoke testing, skip to Light Phase 3.

### Light Phase 3 (Inline — lead coordinates, knowledge-liaison captures)

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

---

## Tier 3: Full Workflow (5-phase)

The standard 5-phase workflow. Used when complexity warrants full analysis, specification, audit, and finalization.

Tier 3 supports three execution modes (determined in Step 2):
- **Parallel Teams** (default) — Stage 0-3 orchestration with concurrent agents
- **Sequential Teams** (`--sequential`) — one agent per phase, spawned and shut down sequentially
- **Subagent Delegation** — Task() calls, no persistent agents

**Smoke testing**: Tier 3 recommends smoke testing at Phase 2B. At Gate #2, note to the user that smoke testing will run alongside the reviewer. The user can decline. If not declined, the smoke-tester is spawned at Stage 2 alongside reviewers (see [parallel-orchestration.md](references/parallel-orchestration.md)).

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

> **MCP Probe Design Note:** Multiple agents perform independent MCP verification (`list_vaults()`) at different points in the workflow. This redundancy is intentional — agents spawn at different times and MCP connectivity can change between spawns. Each agent's probe is authoritative for its own MCP state. Vault configuration is read from `knowz-vaults.md` at the project root.

- **Stage 0**: Create team, use MCP/vault baseline from Step 3.6, spawn knowledge-liaison/analyst/architect/scanner/specialist agents in parallel
- **Stage 1**: Analyst completes Change Set → Gate #1 → Architect drafts specs → Gate #2
- **Stage 2**: Parallel builders (1 per independent partition) + paired reviewers + gap loop
- **Stage 3**: Closer finalizes, dispatches writer for captures, shutdown

---

## Phase Prompt Reference

**Spawn Prompts**: Read [references/spawn-prompts.md](references/spawn-prompts.md) before spawning any agent. Contains spawn/dispatch prompts for all phases: knowledge-liaison, codebase scanners, knowz:reader, knowz:writer dispatches, specialists (security-officer, test-advisor, project-advisor), analyst (Phase 1A), architect (Phase 1B), builder (Phase 2A), reviewer (Phase 2B), and closer (Phase 3).

**Quality Gates**: Read [references/quality-gates.md](references/quality-gates.md) at quality gate checkpoints. Contains gate templates (#1 Change Set, #2 Specifications, #3 Audit Results), autonomous mode handling, specialist report sections, gap loop mechanics, and progress capture instructions.

### Phase Summary

| Phase | Agent | Gate | Key Output |
|-------|-------|------|------------|
| 1A | analyst | #1: Change Set | NodeIDs, dependency map, risk assessment |
| 1B | architect | #2: Specifications | Specs with VERIFY criteria |
| 2A | builder(s) | — | Implementation + tests |
| 2B | reviewer(s) | #3: Audit Results | ARC completion, gap reports |
| 2B | smoke-tester | #3: Audit Results | Runtime verification, smoke pass/fail |
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

## Orchestration Flags

These flags override corresponding config defaults in `knowzcode/knowzcode_orchestration.md`:

| Flag | Effect |
|------|--------|
| `--max-builders=N` | Cap concurrent builders in Parallel Teams (1-5) |
| `--specialists[=csv]` | Enable specialist agents (security, test, project) |
| `--no-specialists` | Disable specialists even if configured |
| `--no-mcp` | Skip MCP vault agents |
| `--no-scanners` | Skip codebase scanners at Stage 0 |
| `--no-parallel-specs` | Force Path A spec drafting regardless of NodeID count |
| `--sequential` | Prefer Sequential Teams (incompatible with `--profile advisor`) |
| `--subagent` | Force Subagent Delegation (incompatible with `--profile advisor`) |
| `--profile={advisor\|teams\|classic}` | Select execution profile — see `references/profile-models.md` |
| `--autonomous` / `--auto` | Autonomous mode — gates auto-approved |
| `--tier {light\|full}` | Override complexity tier |
| `--smoke-test` | Request smoke testing in Tier 2 |

The `advisor` profile forces Parallel Teams and requires Claude Code v2.1.100+ with direct Anthropic API access. See `references/profile-models.md` for the full profile → agent-model mapping.

## Related Skills

- `/knowzcode:explore` — Research and explore before implementing
- `/knowzcode:fix` — Single-file micro-fix (<50 lines)
- `/knowzcode:audit` — Read-only quality and security scan
- `/knowz save` — Capture learnings to vault
- `/knowzcode:continue` — Resume an active WorkGroup

## KnowzCode: Prefix Enforcement

Every task item in workgroup files MUST start with `KnowzCode:`. Pass this to all agents.
