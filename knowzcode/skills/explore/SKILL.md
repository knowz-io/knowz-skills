---
name: explore
description: "Explore a topic, investigate the codebase, or produce a structured implementation plan using vault knowledge, impact analysis, architecture assessment, and project context. Use when the user wants to EXPLORE, RESEARCH, or PLAN before deciding whether to build."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Agent
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
- Start local or with one analyst; add another role only for a named unresolved evidence question.

### Planning Mode (deep)
Triggers on: "plan X", "explore adding X", "design X", "prepare for X", action verbs + feature nouns, "evaluate options for X", any phrasing that implies building or changing something.

- Give each selected evidence slice a bounded research budget; extend only when the first result identifies a material unresolved question.
- Add project management research angle
- Add targeted vault queries only when prior decisions or policies are relevant
- Output: plan document saved to `knowzcode/planning/{slug}.md`
- Start one analyst; add architect, reviewer, liaison, or lead project analysis only when its distinct deliverable is needed.

Announce the detected mode: `**Mode: Exploration** (lightweight research)` or `**Mode: Planning** (deep research with plan output)`

## Step 2: Check Initialization

If `knowzcode/` doesn't exist, inform user to run `/knowzcode:setup` first. STOP.

## Step 3: Set Up Execution Mode

Before the MCP probe or any spawn, derive the minimum evidence slices from the topic and detected depth. Start with deterministic local search and one analyst. Add architect, reviewer, knowledge-liaison, or scanner only for a material independent question.

For each slice, route in order: local, compatible named-agent resume, a real callable conversation fork for high relevant/safe context affinity, then fresh capsule. A skill declared with `context: fork` is isolated and does not inherit this conversation.

Select `coordinated-team` only when at least two active researchers must share a task graph or directly message/challenge peers and Agent Teams is configured/callable. Before the first teammate spawn, require that the user requested teammates/Team mode for this task or obtain current-run confirmation; environment configuration alone is not approval. The first teammate spawn forms the session-derived team. If unavailable, record `CAPABILITY_FALLBACK` and use named agents with the same research criteria.

Announce `**Execution Mode: Adaptive Research**`, or `**Execution Mode: Coordinated Research Team** — peer coordination required`. Runtime Team cleanup is automatic after graceful release.

The user MUST see the execution mode announcement before investigation begins.

## Step 3.5: Load Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse:
1. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)
2. `PROFILE` = `--profile=<value>` flag if present (valid: `advisor`, `teams`, `classic`, `frontier`), else the `^profile:\s*(\S+)` line in config, else `frontier` (the default profile). Invalid value → warn + `frontier`.
3. Parse `context_efficiency.enabled` (default true), `rollout` (default off), `profile`, caps, lease, result-policy threshold, telemetry, and canary percentage for the route below.

Flag overrides: `--no-mcp` -> `MCP_AGENTS_ENABLED = false`

If file doesn't exist, use defaults. Other config settings (`max_builders`, `default_specialists`) are not applicable to `/knowzcode:explore`.

### Model routing (frontier profile)

`/knowzcode:explore` is pure planning/analysis, so it honors only the profile's **model routing** — not advisor tooling or forced execution modes. Only `frontier` changes behavior here:

- **`frontier`**: the three researchers (analyst, architect, reviewer) run on **Fable** — spawn/dispatch each with `model: "fable"`. The knowledge-liaison keeps its frontmatter model (Sonnet — retrieval/IO), so omit `model` on its spawn. Apply the Fable detection from `/knowzcode:work` Step 2.3: if `ANTHROPIC_BASE_URL` is set AND does NOT contain `"anthropic.com"` (case-insensitive), set `FABLE_DOWNGRADE = true`, use `model: "opus"` for the researchers instead, and announce the downgrade. If a `fable` spawn is instead rejected at runtime for any reason (no Fable entitlement, a zero-data-retention org, or an older Claude Code that doesn't recognize the alias), re-spawn that researcher with `model: "opus"` and continue — the research never fails because Fable is unavailable.
- **`advisor` / `teams` / `classic`**: unchanged — omit the `model` parameter on all spawns (research runs on frontmatter defaults; the advisor tool is not wired into explore).

When `PROFILE == "frontier"` and not downgraded, announce: `**Execution Profile: FRONTIER** — analyst, architect, and reviewer research on Fable.`

### Context Runtime Boundary

When `context_efficiency.enabled = true`, every non-trivial local/resume/fork/capsule/team decision MUST call the installed read-only CLI:

`node knowzcode/context_efficiency_runtime.mjs dispatch`

Send one JSON object on stdin with `{routing, rollout, lineage?, result_policy?}` and require one `{ok:true,operation:"dispatch",result}` object on stdout. Before a fresh capsule, call operation `capsule` with `{capsule,max_bytes?,artifact_path?,artifact_roots?}` and pass `artifact_roots:["knowzcode/artifacts"]` for evidence externalization; before resume/inheritance call `lineage` with `{lineage,current,now?}`; before choosing ephemeral/durable/artifact output call `result-policy` with `{input}`. Each call is read-only.

Privacy/schema or lineage rejection is fail-closed: do not dispatch or reuse that context. Rebuild and revalidate a private/invalid capsule; replace invalid lineage with a newly validated fresh capsule. Never relabel a safety rejection as `CAPABILITY_FALLBACK`. Rollout controls only recommendation application and redacted telemetry—not validation. If only a non-safety recommendation/telemetry operation is unavailable while direct safety checks still pass, record `CAPABILITY_FALLBACK` and use the validated local/fresh baseline. If safety validation itself is unavailable, keep the work local and report `CONTEXT_RUNTIME_UNAVAILABLE`.

## Step 4: Launch Parallel Investigation

Track slices locally by default. Use runtime task state only after coordinated-team mode is selected.

### MCP Probe (Conditional)

If `MCP_AGENTS_ENABLED = false` (from Step 3.5, e.g. `--no-mcp`), skip the MCP Probe and Step 4.1 entirely. Set `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`, `VAULT_BASELINE = null`.

Probe only when the topic asks for prior decisions/conventions, active enterprise policy names a vault source, a relevant configured vault is already known, or the user requests a vault save. Otherwise set `MCP_ACTIVE = false`, `VAULT_BASELINE = null`, and continue without a connectivity warning.

When needed, determine vault availability:
0. Reuse a timestamped health result/baseline inside `mcp_health_ttl_minutes` (default 15). Skip repeated probes and broad queries unless the result expired or vault/connectivity configuration changed.
1. Otherwise read `knowz-vaults.md` from project root — parse vault IDs. If file not found, call `list_vaults(includeStats=true)` to discover vaults.
2. If `list_vaults()` fails AND no `knowz-vaults.md` exists -> `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`. Announce: `**MCP Status: Not connected**`
3. If `list_vaults()` fails BUT `knowz-vaults.md` has vault IDs -> `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = true`. Announce: `**MCP Status: Probe failed — configured vaults retained; captures will queue**`. Children reuse the failed result inside the TTL.
4. If vaults discovered but no `knowz-vaults.md` exists -> suggest `"Run /knowz setup to configure vault routing."` Set `VAULTS_CONFIGURED = true` (use discovered IDs for baseline).
5. Set `MCP_ACTIVE` and `VAULTS_CONFIGURED` based on results. Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

If no vaults are configured, suggest `/knowz setup`.

Vault research is question-gated, not connection-gated. State the unresolved question and query only vaults whose routing description can answer it. Local code and current project files remain authoritative.

### Step 4.1: Baseline Vault Query (Lead-Direct)

If no fresh relevant baseline was reused and `VAULTS_CONFIGURED = true` and `MCP_ACTIVE = true`, the lead performs a targeted baseline before agent dispatch.

1. Using vault configuration from the MCP Probe above (already loaded), resolve configured vault IDs and types.
2. Select only vaults relevant by configured type/description and call one topic-specific query per selected vault. Do not query every configured vault for generic coverage.
3. Store all results as `VAULT_BASELINE`:
   ```
   VAULT_BASELINE:
   - {vault_name} ({vault_type}): {summary of results, or "No relevant results found"}
   ```
4. **Failure handling**: If `search_knowledge` fails for a vault, log the failure and continue with remaining vaults. A partial baseline is better than none. If ALL queries fail, set `VAULT_BASELINE = "Vault queries failed — MCP may be degraded"` and continue.
5. Announce: `**Vault Baseline: {N} vault(s) queried — {M} results found**`

If `VAULTS_CONFIGURED = false` OR `MCP_ACTIVE = false`, set `VAULT_BASELINE = null` and skip this step.

> Reuse a fresh baseline inside the configured TTL. Agents may make only documented targeted follow-ups.

### Conditional Dispatch Details

Named-agent mode is the default. Dispatch one analyst first; add a liaison, architect, or reviewer only for the evidence decisions recorded in Step 3. At most three independently useful read-only workers run concurrently by default.

Read [references/research-dispatch.md](references/research-dispatch.md) only immediately before a named-agent or coordinated-team dispatch, and load only the selected route and role packet. Do not load it for local research. The reference defines bounded exploration/planning prompts, optional liaison behavior, task ownership in Team mode, and result contracts; it cannot broaden file-write, artifact, MCP, Team-eligibility, or runtime-validation rules in this skill.

### Local Mode

If local work is cheaper or named-agent dispatch is unavailable, the lead performs the research directly:

1. Announce: `**Execution Mode: Local Research** — bounded direct investigation`

2. **Vault knowledge**: Already available from Step 4.1 (`VAULT_BASELINE`). If deeper vault queries are needed for specific aspects:
   - Call `search_knowledge({vault_id}, "{specific_aspect_of_topic}")` for targeted follow-ups.
   - Call `ask_question({vault_id}, "{question_about_topic}")` for synthesized answers.

3. **Local context**: Start with topic grep/file inventory. Read matching specs first; load architecture only for a boundary/design question, project standards only for a convention decision, tracker only for active-scope conflict, and prior WorkGroups only when historical implementation evidence is needed.

4. **Codebase exploration** (lead reads directly):
   - Grep for topic-related keywords across source files
   - Read top affected files to understand patterns and dependencies
   - Check test coverage for the topic area

5. Proceed to Step 5 (Synthesis) with `VAULT_BASELINE` + local findings + codebase findings.

### Project Management Analysis (Planning Mode Only)

**After** any agent dispatches (or local research) and **before** synthesizing findings, the lead performs project management research directly:

1. Read targeted tracker rows for WIP conflicts and related refactors.
2. Read recent log entries only when the plan depends on prior similar completion evidence.
3. Read relevant architecture sections only when the proposed design crosses a documented boundary.

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

### Existing Knowledge
- **Relevant Specs**: {list or "None found"}
- **Prior WorkGroups**: {list or "None found"}
- **Vault Knowledge (Baseline)**: {VAULT_BASELINE results or "N/A — MCP not configured"}
- **Vault Knowledge (Deep)**: {knowledge-liaison findings beyond baseline, or "N/A — agents not available" or "N/A — MCP not configured"}

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
**Baseline** (lead-direct): {VAULT_BASELINE results or "N/A — MCP not configured"}
**Deep research** (knowledge-liaison): {liaison findings beyond baseline, or "N/A — agents not available"}

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
- **A**: Build one delta summarizing all findings and invoke `node knowzcode/context_efficiency_runtime.mjs vault-delta` with `explicit_save: true` and available prior identities/hashes.
- **B**: Ask which sections to save, then classify only the selected delta the same way.
- **C**: Proceed to Step 6.

For A/B, `skip` makes no write, `batch` remains local pending the explicit boundary, `amend`/`update` targets the returned stable identity, and `flush` dispatches one consolidated writer/direct mutation. Pass the exact classified action and identity to `knowz:writer`; never dispatch a raw candidate.

If `VAULTS_CONFIGURED = false` or `MCP_ACTIVE = false`, skip this step silently.

### Vault Write Continuation

After Step 5.5 resolves (including if the user chose C/Skip), remain responsive to vault-write intent in follow-up messages. Watch for:

- "save this to vault", "capture this", "document this in the vault"
- "save as {type}" (e.g., "save as Guidelines", "save as a Decision")
- "put this in knowz", "add this to the vault"
- Any follow-up referencing vault/knowz + save/capture/document intent

When detected:
1. Ask the user what content to save (or confirm if they specified)
2. Resolve target vault from `knowz-vaults.md` (project root)
3. Invoke `vault-delta` with `explicit_save: true`, prior identities/hashes, and the selected content. For `skip`, report no-op; for `batch`, retain locally; only `amend`, `update`, or `flush` continues.
4. Dispatch `knowz:writer` via `Agent(subagent_type="knowz:writer", description="Persist exploration delta", prompt=<classified action + stable identity + payload>)` with a self-contained prompt containing:
   - Content to save (from exploration findings or user-specified content)
   - Target vault ID
   - Title and tags derived from the content
   - Category hint if the user specified one (e.g., "Guidelines")
5. Report success/failure to the user

This ensures vault writes work even after the structured A/B/C window closes.

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

**Coordinated Team Mode**: Request graceful shutdown from active teammates and wait for their bounded results. Runtime cleanup occurs automatically; do not invoke a separate delete action.

**Named-agent mode**: Release completed lineages. Retain a handle only for a compatible bounded follow-up lease; planning artifacts provide cold recovery.

---

## Related Skills

- `/knowzcode:work` — Execute implementation after research
- `/knowzcode:audit` — Read-only quality scan (not exploratory)
- `/knowzcode:fix` — Single-file micro-fix
- `/knowzcode:start-work` — Trigger: "implement the plan" after research

## Notes

- Exploration mode agents use focused, efficient scoping (max 10 tool calls each)
- Planning mode uses bounded evidence slices and extends only for a material unresolved question
- Investigation context is preserved when transitioning to `/knowzcode:work`
- Planning mode saves structured plan documents to `knowzcode/planning/`
- This replaces the old planning types (strategy, ideas, pre-flight, etc.)
