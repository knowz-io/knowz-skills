---
name: explore
description: "Explore a topic, investigate the codebase, or produce a structured implementation plan using vault knowledge, impact analysis, architecture assessment, and project context. Use when the user wants to EXPLORE, RESEARCH, or PLAN before deciding whether to build."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Task
# Note: Also uses MCP tools (search_knowledge, ask_question) when MCP is configured
argument-hint: "[topic, question, or feature to plan]"
---

# KnowzCode Explore

Explore a topic, investigate the codebase, or produce a structured implementation plan before committing to implementation.

**Usage**: `/knowzcode:explore <topic, question, or feature to plan>`

**Examples**:
```
/knowzcode:explore "is the API using proper error handling?"
/knowzcode:explore "add user authentication with JWT"
/knowzcode:explore "how does caching work in this codebase?"
/knowzcode:explore "plan the migration to PostgreSQL"
/knowzcode:explore "design a notification system"
```

## When NOT to Trigger

- User wants to **implement or build** -> use `/knowzcode:work`
- User wants a **single-file fix** -> use `/knowzcode:fix`
- User wants to **audit or scan** existing code -> use `/knowzcode:audit`
- User wants to **save a learning** -> use `/knowz save`
- User says "implement the plan" or "go ahead" after research -> use `/knowzcode:start-work` (trigger skill)

## Common Invocation Patterns

These phrases indicate `/knowzcode:explore` intent:
- "explore how X works", "investigate X", "research X"
- "what's the architecture of X", "how does X work"
- "is X using proper Y?", "analyze X"
- "plan for X", "plan adding X", "evaluate options for X"
- "design X", "prepare for X", "explore adding X"

---

## Step 1: Validate Input

If no argument provided, ask: "What would you like me to explore?"

## Step 1.5: Auto-Detect Depth

Classify the query into one of two modes:

### Exploration Mode (lightweight)
Triggers on: questions ("how does X work?", "is X correct?", "analyze X"), "what's the architecture of X", investigative phrasing without action verbs.

- Keep 10-tool-call-per-agent behavior
- Output: inline findings report (no file saved)
- Agents: knowledge-liaison + analyst + architect + reviewer (standard behavior)

### Planning Mode (deep)
Triggers on: "plan X", "explore adding X", "design X", "prepare for X", action verbs + feature nouns, "evaluate options for X", any phrasing that implies building or changing something.

- Remove tool call limits (agents get full research depth)
- Add project management research angle
- Add structured vault queries
- Output: plan document saved to `knowzcode/planning/{slug}.md`
- Agents: knowledge-liaison + analyst + architect + reviewer + lead project analysis

Announce the detected mode: `**Mode: Exploration** (lightweight research)` or `**Mode: Planning** (deep research with plan output)`

## Step 2: Check Initialization

If `knowzcode/` doesn't exist, inform user to run `/knowzcode:init` first. STOP.

## Step 3: Set Up Execution Mode

Attempt `TeamCreate(team_name="kc-explore-{slug}")` (2-4 word kebab-case from topic):

- **If TeamCreate succeeds** -> Agent Teams mode:
  1. Announce: `**Execution Mode: Agent Teams** — created team kc-explore-{slug}`
  2. Read `knowzcode/claude_code_execution.md` for team conventions.
  3. You are the **team lead** — coordinate research, synthesize findings.

- **If TeamCreate fails** (error, unrecognized tool, timeout) -> Subagent Delegation:
  - Announce: `**Execution Mode: Subagent Delegation** — Agent Teams not available, using Task() fallback`

The user MUST see the execution mode announcement before investigation begins.

## Step 3.5: Load Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse:
1. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)

Flag overrides: `--no-mcp` -> `MCP_AGENTS_ENABLED = false`

If file doesn't exist, use defaults. Other config settings (`max_builders`, `default_specialists`) are not applicable to `/knowzcode:explore`.

## Step 4: Launch Parallel Investigation

### MCP Probe

Before spawning agents, determine vault availability:
1. Read `knowzcode/knowzcode_vaults.md` — partition entries into CONFIGURED (non-empty ID) and UNCREATED (empty ID)
2. Call `list_vaults(includeStats=true)` **always** — regardless of whether any IDs exist in the file
3. If `list_vaults()` fails -> set `MCP_ACTIVE = false`, announce `**MCP Status: Not connected**`, skip vault setup
4. If `list_vaults()` succeeds AND UNCREATED list is non-empty -> present the **Vault Creation Prompt**:

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
   - If BOTH `create_vault()` and name-matching fail: log failure, set `VAULTS_CONFIGURED = false`, continue without vault. Report: `"Vault creation failed — proceeding without knowledge capture. Run /knowz setup to retry."`
6. After resolution, set:
   - `MCP_ACTIVE = true` (MCP works regardless of vault creation outcome)
   - `VAULTS_CONFIGURED = true` if at least 1 vault now has a valid ID, else `false`
   - Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

> **Vault research is mandatory when available.** If `VAULTS_CONFIGURED = true` and `MCP_AGENTS_ENABLED = true`, the knowledge-liaison MUST dispatch vault reader subagents in both Exploration and Planning modes. Only skip vault queries when MCP is genuinely unavailable (`MCP_ACTIVE = false`).

### Agent Teams Mode

Create tasks first, pre-assign, then spawn with task IDs:

1. `TaskCreate("Knowledge liaison: context & vault research for {topic}")` -> `TaskUpdate(owner: "knowledge-liaison")`
2. `TaskCreate("Research: code exploration")` -> `TaskUpdate(owner: "analyst")`
3. `TaskCreate("Research: architecture")` -> `TaskUpdate(owner: "architect")`
4. `TaskCreate("Research: security + quality")` -> `TaskUpdate(owner: "reviewer")`

Spawn teammates with their task IDs:

1. Spawn `knowledge-liaison` teammate:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > Read `agents/knowledge-liaison.md` for your full role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > **Goal**: Research "{topic}" — gather local context and vault knowledge.
   > **Vault config**: `knowzcode/knowzcode_vaults.md`
   > **Context gathering**: Read local context directly (specs, workgroups, tracker, architecture) using Read/Glob tools. Dispatch vault reader subagents in parallel for vault knowledge (past decisions, conventions, patterns).
   > **Deliverable**: Push Context Briefing to analyst and architect with local + vault findings.

2. Spawn `analyst` teammate:

   **Exploration mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **code exploration** angle.
   > Read `agents/analyst.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: affected files, dependencies, existing patterns.
   > Max 10 tool calls. Write findings to a concise summary.

   **Planning mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from an **impact analysis** angle.
   > Read `agents/analyst.md` for your full role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: affected files, dependencies, existing patterns.
   > Produce a preliminary Change Set estimate:
   > - Potential NodeIDs with descriptions
   > - Affected files list with change types (new/modify)
   > - Dependency map (which NodeIDs share files)
   > - Risk assessment with rationale
   > Write findings to a detailed summary.

3. Spawn `architect` teammate:

   **Exploration mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from an **architecture** angle.
   > Read `agents/architect.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: layer analysis, design implications, pattern fit.
   > Max 10 tool calls. Write findings to a concise summary.

   **Planning mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from an **architecture and design** angle.
   > Read `agents/architect.md` for your full role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: layer analysis, design implications, pattern fit.
   > Propose an implementation approach:
   > - Recommended design with rationale
   > - Alternatives considered and why rejected
   > - Constraints from architecture docs
   > - Spec consolidation opportunities (check existing specs for overlap)
   > Write findings to a detailed summary.

4. Spawn `reviewer` teammate:

   **Exploration mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **security and quality** angle.
   > Read `agents/reviewer.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: risks, performance concerns, quality gaps.
   > Max 10 tool calls. Write findings to a concise summary.

   **Planning mode** prompt:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are researching "{topic}" from a **security and quality** angle.
   > Read `agents/reviewer.md` for your full role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   > Investigate: risks, performance concerns, quality gaps.
   > Write findings to a detailed summary.

Knowledge-liaison pushes Context Briefings to analyst and architect; all core researchers consume them.
Wait for all to complete, then synthesize in Step 5.

### Subagent Mode

Delegate to up to four agents in parallel via `Task()`:

1. **knowledge-liaison** — Local context + vault knowledge:
   - `Task(subagent_type="knowzcode:knowledge-liaison", description="Context & vault research for {topic}", prompt="Read agents/knowledge-liaison.md for your full role definition. Goal: Research \"{topic}\" — gather local context and vault knowledge. Vault config: knowzcode/knowzcode_vaults.md. Read local context files directly (specs, workgroups, tracker, architecture) using Read and Glob tools. Dispatch vault reader subagents in parallel for vault knowledge (past decisions, conventions, patterns). Return consolidated Context Briefing with local + vault findings.")`

2. **analyst** — Code exploration / Impact analysis:
   - `subagent_type`: `"analyst"`

   **Exploration mode**:
   - `prompt`: Research "{topic}" from a **code exploration** angle. Investigate: affected files, dependencies, existing patterns. Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Explore research: code exploration"`

   **Planning mode**:
   - `prompt`: Research "{topic}" from an **impact analysis** angle. Read `agents/analyst.md` for your full role definition. Investigate: affected files, dependencies, existing patterns. Produce a preliminary Change Set estimate: Potential NodeIDs with descriptions, Affected files list with change types (new/modify), Dependency map (which NodeIDs share files), Risk assessment with rationale. Write findings to a detailed summary.
   - `description`: `"Explore research: impact analysis"`

3. **architect** — Architecture assessment / Design:
   - `subagent_type`: `"architect"`

   **Exploration mode**:
   - `prompt`: Research "{topic}" from an **architecture** angle. Investigate: layer analysis, design implications, pattern fit. Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Explore research: architecture"`

   **Planning mode**:
   - `prompt`: Research "{topic}" from an **architecture and design** angle. Read `agents/architect.md` for your full role definition. Investigate: layer analysis, design implications, pattern fit. Propose an implementation approach: Recommended design with rationale, Alternatives considered and why rejected, Constraints from architecture docs, Spec consolidation opportunities (check existing specs for overlap). Write findings to a detailed summary.
   - `description`: `"Explore research: architecture and design"`

4. **reviewer** — Security and quality:
   - `subagent_type`: `"reviewer"`

   **Exploration mode**:
   - `prompt`: Research "{topic}" from a **security and quality** angle. Investigate: risks, performance concerns, quality gaps. Max 10 tool calls. Write findings to a concise summary.
   - `description`: `"Explore research: security and quality"`

   **Planning mode**:
   - `prompt`: Research "{topic}" from a **security and quality** angle. Read `agents/reviewer.md` for your full role definition. Investigate: risks, performance concerns, quality gaps. Write findings to a detailed summary.
   - `description`: `"Explore research: security and quality"`

### Project Management Analysis (Planning Mode Only)

**After** spawning agents and **before** synthesizing findings, the lead performs project management research directly:

1. Read `knowzcode/knowzcode_tracker.md` for WIP conflicts (overlapping NodeIDs/files)
2. Read `knowzcode/knowzcode_tracker.md` for related REFACTOR tasks to bundle
3. Read `knowzcode/knowzcode_log.md` for recent similar completions
4. Check `knowzcode/knowzcode_architecture.md` for constraint violations

Store findings for inclusion in the plan output.

## Step 5: Synthesize Findings

### Exploration Mode Output

Present findings inline (no file saved):

```markdown
## Investigation: {topic}

### Code Analysis
{summarized findings from analyst}

### Architecture Assessment
{summarized findings from architect}

### Security & Quality
{summarized findings from reviewer}

### Existing Knowledge (from knowledge-liaison)
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
- **Tier 2** if ALL: <=3 files, single NodeID, no arch changes, no security, no external APIs

---

**Ready to implement?** Say "implement", "do option 1", or "go ahead" to start `/knowzcode:work` with this context.
```

### Planning Mode Output

Save to `knowzcode/planning/{slug}.md` where slug is derived from the topic (2-4 word kebab-case):

```markdown
# Implementation Plan: {topic}

## Goal
{clear statement of what will be built}

## Prior Knowledge (from vaults)
{relevant past decisions, conventions, patterns, prior failures}

## Impact Analysis
- **Estimated NodeIDs**: {list with descriptions}
- **Affected files**: {file list with change types}
- **Dependency map**: {which NodeIDs can parallelize}

## Architecture Proposal
- **Recommended approach**: {design with rationale}
- **Alternatives considered**: {why rejected}
- **Constraints**: {from vault knowledge + architecture docs}
- **Spec consolidation**: {existing specs to update vs new specs}

## Project Context
- **WIP conflicts**: {overlapping tracker items, or "None"}
- **Related backlog**: {REFACTOR tasks to bundle, or "None"}
- **Recent similar work**: {relevant log entries, or "None"}

## Risk Assessment
{risk with mitigation, one per bullet}

## Complexity
- **Files**: {count} — {file list}
- **Potential NodeIDs**: {count}
- **Tier**: 2 (Light) / 3 (Full)
- **Security-sensitive**: Yes/No
- **External integrations**: Yes/No

---
Ready to implement? Say "implement" or "go ahead".
```

## Step 5.5: Vault Capture Prompt

If `VAULTS_CONFIGURED = true` AND `MCP_ACTIVE = true`, present after findings:

```markdown
**Save to vault?** These findings can be captured to Knowz for future reference.
  **A) Save all findings** (analysis + architecture + discoveries)
  **B) Select which to save**
  **C) Skip**
```

**Handling**:
- **A**: Dispatch `knowz:writer` with a self-contained prompt summarizing all findings, tagged with the topic. Read `knowzcode/knowzcode_vaults.md` to resolve the target vault (use ecosystem-type vault). Check for duplicates via `search_knowledge` before writing.
- **B**: Ask user which sections to save, then dispatch `knowz:writer` with selected content.
- **C**: Proceed to Step 6.

If `VAULTS_CONFIGURED = false` or `MCP_ACTIVE = false`, skip this step silently.

## Step 6: Listen for Implementation Intent

Watch for: "implement", "do it", "go ahead", "option N", "start work", "build this"

When triggered:

**Exploration mode**: Invoke `/knowzcode:work "{original_topic}" --tier {recommended_tier}` and include a summary of investigation findings:

> **Explore investigation context:**
> - Files: {file list from complexity assessment}
> - Potential NodeIDs: {list}
> - Key risks: {top risks}
> - Recommended approach: {selected option or top recommendation}

**Planning mode**: Invoke `/knowzcode:work --context "knowzcode/planning/{slug}.md"` passing the full plan file path. The plan document contains all the context work needs to proceed.

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

- Exploration mode agents use focused, efficient scoping (max 10 tool calls each)
- Planning mode agents get full research depth (no tool call limits)
- Investigation context is preserved when transitioning to `/knowzcode:work`
- Planning mode saves structured plan documents to `knowzcode/planning/`
- This replaces the old planning types (strategy, ideas, pre-flight, etc.)
