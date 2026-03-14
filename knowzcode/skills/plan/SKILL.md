---
name: plan
description: "Research a topic, feature, or codebase question using parallel investigation agents — WITHOUT implementing changes. Use when the user wants to EXPLORE, RESEARCH, or ANALYZE before deciding whether to build."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Task
# Note: Also uses MCP tools (search_knowledge, ask_question) when MCP is configured
argument-hint: "[topic or question]"
---

# KnowzCode Plan

Research a topic, feature, or question using parallel investigation before committing to implementation.

**Usage**: `/knowzcode:plan <topic or question>`

**Examples**:
```
/knowzcode:plan "is the API using proper error handling?"
/knowzcode:plan "add user authentication with JWT"
/knowzcode:plan "how does caching work in this codebase?"
```

## When NOT to Trigger

- User wants to **implement or build** → use `/knowzcode:work`
- User wants a **single-file fix** → use `/knowzcode:fix`
- User wants to **audit or scan** existing code → use `/knowzcode:audit`
- User wants to **save a learning** → use `/knowz save`
- User says "implement the plan" or "go ahead" after research → use `/knowzcode:start-work` (trigger skill)

## Common Invocation Patterns

These phrases indicate `/knowzcode:plan` intent:
- "explore how X works", "investigate X", "research X"
- "what's the architecture of X", "how does X work"
- "is X using proper Y?", "analyze X"
- "plan for X", "evaluate options for X"

---

## Step 1: Validate Input

If no argument provided, ask: "What would you like me to research?"

## Step 2: Check Initialization

If `knowzcode/` doesn't exist, inform user to run `/knowzcode:init` first. STOP.

## Step 3: Set Up Execution Mode

Attempt `TeamCreate(team_name="kc-plan-{slug}")` (2-4 word kebab-case from topic):

- **If TeamCreate succeeds** → Agent Teams mode:
  1. Announce: `**Execution Mode: Agent Teams** — created team kc-plan-{slug}`
  2. Read `knowzcode/claude_code_execution.md` for team conventions.
  3. You are the **team lead** — coordinate research, synthesize findings.

- **If TeamCreate fails** (error, unrecognized tool, timeout) → Subagent Delegation:
  - Announce: `**Execution Mode: Subagent Delegation** — Agent Teams not available, using Task() fallback`

The user MUST see the execution mode announcement before investigation begins.

## Step 3.5: Load Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse:
1. `SCOUT_MODE` = `scout_mode` value (default: "full")
2. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)

Flag overrides: `--no-scouts` → `SCOUT_MODE = "none"`, `--no-mcp` → `MCP_AGENTS_ENABLED = false`

If file doesn't exist, use defaults. Other config settings (`max_builders`, `default_specialists`) are not applicable to `/knowzcode:plan`.

## Step 4: Launch Parallel Investigation

### MCP Probe

Before spawning agents, determine vault availability:
1. Read `knowzcode/knowzcode_vaults.md` — partition entries into CONFIGURED (non-empty ID) and UNCREATED (empty ID)
2. Call `list_vaults(includeStats=true)` **always** — regardless of whether any IDs exist in the file
3. If `list_vaults()` fails → set `MCP_ACTIVE = false`, announce `**MCP Status: Not connected**`, skip vault setup
4. If `list_vaults()` succeeds AND UNCREATED list is non-empty → present the **Vault Creation Prompt**:

   ```markdown
   ## Vault Setup

   Your Knowz API key is valid and MCP is connected, but {N} default vault(s) haven't been created yet.
   Creating vaults enables knowledge capture throughout the workflow:

   | Vault | Type | Description | Written During |
   |-------|------|-------------|----------------|
   ```

   Build table rows dynamically from the UNCREATED entries only. Derive "Written During" from each vault's Write Conditions field in `knowzcode_vaults.md`.

   Then present options:
   ```
   Options:
     **A) Create all {N} vaults** (recommended)
     **B) Select which to create**
     **C) Skip** — proceed without vaults (can create later with `/knowz setup`)
   ```

5. Handle user selection:
   - **A**: For each UNCREATED entry, call MCP `create_vault(name, description)`. If `create_vault` is not available, fall back to matching by name against `list_vaults()` results. Update `knowzcode_vaults.md`: fill ID field, change H3 heading from `(not created)` to vault ID. Report any failures.
   - **B**: Ask which vaults to create, then create only selected ones.
   - **C**: Log `"Vault creation skipped — knowledge capture disabled."` Continue.
   - If BOTH `create_vault()` and name-matching fail: log failure, set `VAULTS_CONFIGURED = false`, continue without vault. Report: `"⚠️ Vault creation failed — proceeding without knowledge capture. Run /knowz setup to retry."`
6. After resolution, set:
   - `MCP_ACTIVE = true` (MCP works regardless of vault creation outcome)
   - `VAULTS_CONFIGURED = true` if at least 1 vault now has a valid ID, else `false`
   - Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

### Agent Teams Mode (with scouts)

Create tasks first, pre-assign, then spawn with task IDs:

1. If `SCOUT_MODE != "none"`: `TaskCreate("Scout: local context for {topic}")` → `TaskUpdate(owner: "context-scout")`
2. `TaskCreate("Scout: vault knowledge for {topic}")` → `TaskUpdate(owner: "knowz-scout")` (if `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`)
3. `TaskCreate("Research: code exploration")` → `TaskUpdate(owner: "analyst")`
4. `TaskCreate("Research: architecture")` → `TaskUpdate(owner: "architect")`
5. `TaskCreate("Research: security + quality")` → `TaskUpdate(owner: "reviewer")`

Spawn teammates with their task IDs (count depends on SCOUT_MODE and MCP settings):

1. If `SCOUT_MODE != "none"`, spawn `context-scout` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **knowzcode history** angle.
   > Read `agents/context-scout.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Find: existing specs, prior WorkGroups, tracker entries relevant to this topic.
   > Broadcast findings to all teammates.

2. If `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`, spawn `knowz-scout` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **vault knowledge** angle.
   > Read `agents/knowz-scout.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Query: team conventions, past decisions, similar implementations.
   > Broadcast findings to all teammates.

3. Spawn `analyst` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **code exploration** angle.
   > Read `agents/analyst.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: affected files, dependencies, existing patterns.
   > Max 10 tool calls. Write findings to a concise summary.

4. Spawn `architect` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from an **architecture** angle.
   > Read `agents/architect.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: layer analysis, design implications, pattern fit.
   > Max 10 tool calls. Write findings to a concise summary.

5. Spawn `reviewer` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **security and quality** angle.
   > Read `agents/reviewer.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: risks, performance concerns, quality gaps.
   > Max 10 tool calls. Write findings to a concise summary.

Scouts broadcast findings; all three core researchers consume them.
Wait for all to complete, then synthesize in Step 5.

### Subagent Mode

Delegate to up to five agents in parallel via `Task()`:

1. **context-scout** — Local context (if `SCOUT_MODE != "none"`):
   - `SCOUT_MODE = "full"` (default): 3 parallel instances:
     - `Task(subagent_type="context-scout", name="context-scout-specs", description="Scout: specs context", prompt="Research \"{topic}\". Focus: knowzcode/specs/*.md — scan existing specifications for relevant NodeIDs, status, VERIFY criteria. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-workgroups", description="Scout: workgroups context", prompt="Research \"{topic}\". Focus: knowzcode/workgroups/*.md — scan previous WorkGroups for similar goals, what was tried, what succeeded/failed. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-backlog", description="Scout: backlog context", prompt="Research \"{topic}\". Focus: knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md, knowzcode/knowzcode_project.md — scan for active WIP, REFACTOR tasks, architecture summary, recent log patterns. Max 10 tool calls. Write findings to a concise summary.")`
   - `SCOUT_MODE = "minimal"`: 1 combined instance:
     - `Task(subagent_type="context-scout", name="context-scout", description="Scout: combined context", prompt="Research \"{topic}\". Focus: ALL local context — knowzcode/specs/*.md, knowzcode/workgroups/*.md, knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md, knowzcode/knowzcode_project.md. Max 10 tool calls. Write findings to a concise summary.")`

2. **knowz-scout** — MCP knowledge (if `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`):
   - `Task(subagent_type="knowz-scout", description="Scout: vault knowledge", prompt="Research \"{topic}\". Read knowzcode/knowzcode_vaults.md to discover configured vaults. Query each for relevant knowledge: team conventions, past decisions, similar implementations. Max 10 tool calls. Write findings to a concise summary.")`

3. **analyst** — Code exploration:
   - `subagent_type`: `"analyst"`
   - `prompt`: Task-specific context only (role definition is auto-loaded from `agents/analyst.md`):
     > Research "{topic}" from a **code exploration** angle.
     > Investigate: affected files, dependencies, existing patterns.
     > Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Plan research: code exploration"`

4. **architect** — Architecture assessment:
   - `subagent_type`: `"architect"`
   - `prompt`: Task-specific context only (role definition is auto-loaded from `agents/architect.md`):
     > Research "{topic}" from an **architecture** angle.
     > Investigate: layer analysis, design implications, pattern fit.
     > Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Plan research: architecture"`

5. **reviewer** — Security and quality:
   - `subagent_type`: `"reviewer"`
   - `prompt`: Task-specific context only (role definition is auto-loaded from `agents/reviewer.md`):
     > Research "{topic}" from a **security and quality** angle.
     > Investigate: risks, performance concerns, quality gaps.
     > Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Plan research: security and quality"`

Each uses focused, efficient scoping (max 10 tool calls).

## Step 5: Synthesize Findings

```markdown
## Investigation: {topic}

### Code Analysis
{summarized findings from analyst}

### Architecture Assessment
{summarized findings from architect}

### Security & Quality
{summarized findings from reviewer}

### Existing Knowledge (from scouts)
- **Relevant Specs**: {list or "None found"}
- **Prior WorkGroups**: {list or "None found"}
- **Vault Knowledge**: {list or "N/A — MCP not configured"}

### Recommended Approaches

**Option 1**: {approach}
- Pros: ...
- Cons: ...

**Option 2**: {approach}
- Pros: ...
- Cons: ...

### Risks & Considerations
{synthesized risks}

### Complexity Assessment
- **Files identified**: {count} — {file list}
- **Potential NodeIDs**: {count} — {brief descriptions}
- **Architectural impact**: Yes/No — {reason if yes}
- **Security-sensitive**: Yes/No — {reason if yes}
- **External integrations**: Yes/No — {list if yes}
- **Estimated scope**: ~{N} lines across {M} files
- **Recommended tier**: Tier 2 (Light) / Tier 3 (Full)

Tier recommendation follows work.md's classification rules:
- **Tier 3** if ANY: >3 files, >1 NodeID, architectural impact, security-sensitive, external integrations
- **Tier 2** if ALL: ≤3 files, single NodeID, no arch changes, no security, no external APIs

---

**Ready to implement?** Say "implement", "do option 1", or "go ahead" to start `/knowzcode:work` with this context.
```

## Step 6: Listen for Implementation Intent

Watch for: "implement", "do it", "go ahead", "option N", "start work", "build this"

When triggered, invoke `/knowzcode:work "{original_topic}" --tier {recommended_tier}` and include
a summary of investigation findings:

> **Plan investigation context:**
> - Files: {file list from complexity assessment}
> - Potential NodeIDs: {list}
> - Key risks: {top risks}
> - Recommended approach: {selected option or top recommendation}

This context gives work's analyst a head start and ensures correct tier classification.

---

## Cleanup

After synthesis is complete (or if the user cancels):

**Agent Teams Mode**:
1. Shut down all active teammates. Wait for each to confirm shutdown.
2. Once all teammates have shut down, clean up the team.
   No teammates or team resources should remain after the research ends.

**Subagent Mode**: No cleanup needed — `Task()` calls are self-contained.

---

## Related Skills

- `/knowzcode:work` — Execute implementation after research
- `/knowzcode:audit` — Read-only quality scan (not exploratory)
- `/knowzcode:fix` — Single-file micro-fix
- `/knowzcode:start-work` — Trigger: "implement the plan" after research

## Notes

- Research agents use focused, efficient scoping (max 10 tool calls each)
- Investigation context is preserved when transitioning to `/knowzcode:work`
- This replaces the old planning types (strategy, ideas, pre-flight, etc.)
