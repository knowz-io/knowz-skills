---
name: audit
description: "Run read-only quality audits on the existing codebase — spec completeness, architecture health, OWASP security scanning, integration consistency. Use when the user wants to AUDIT or SCAN existing code, not build new features."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, Task
# Note: Also uses MCP tools (search_knowledge, ask_question) when MCP is configured
argument-hint: "[audit_type]"
---

# Run KnowzCode Audit

Run specialized audit workflows.

**Usage**: `/knowzcode:audit [audit_type]`
**Example**: `/knowzcode:audit spec` or `/knowzcode:audit security`

**Audit Type**: $ARGUMENTS

## When NOT to Trigger

- User wants to **build or implement** a new feature → use `/knowzcode:work`
- User wants a **single-file fix** → use `/knowzcode:fix`
- User wants to **research or explore** a topic → use `/knowzcode:plan`
- User wants to **save a learning** → use `/knowz save`

## Common Invocation Patterns

These phrases indicate `/knowzcode:audit` intent:
- "audit the codebase", "run a security scan"
- "check code quality", "scan for vulnerabilities"
- "review architecture health", "check spec completeness"

---

## Audit Types

| Type | Focus |
|------|-------|
| **spec** | Specification quality and completeness |
| **architecture** | Architecture health and drift |
| **security** | OWASP vulnerability scanning |
| **integration** | Cross-component consistency |
| **compliance** | Enterprise guideline compliance (if configured, experimental) |
| *(no argument)* | Full parallel audit of all types |

---

## Step 1: Load Context

Read:
- `knowzcode/knowzcode_tracker.md`
- `knowzcode/knowzcode_architecture.md`
- `knowzcode/knowzcode_project.md`
- `knowzcode/knowzcode_orchestration.md` (if exists)

## Step 1.1: Parse Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse its YAML blocks:

1. `SCOUT_MODE` = `scout_mode` value (default: "full")
2. `DEFAULT_SPECIALISTS` = `default_specialists` value (default: [])
3. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)

Apply flag overrides (flags win over config):
- `--no-scouts` in `$ARGUMENTS` → override `SCOUT_MODE = "none"`
- `--no-specialists` in `$ARGUMENTS` → override `DEFAULT_SPECIALISTS = []`
- `--no-mcp` in `$ARGUMENTS` → override `MCP_AGENTS_ENABLED = false`

If the file doesn't exist, use hardcoded defaults (current behavior).

## Step 2: Set Up Execution Mode

Attempt `TeamCreate(team_name="kc-audit-{timestamp}")`:

- **If TeamCreate succeeds** → Agent Teams mode:
  1. Announce: `**Execution Mode: Agent Teams** — created team kc-audit-{timestamp}`
  2. Read `knowzcode/claude_code_execution.md` for team conventions.
  3. You are the **team lead** — coordinate the audit and present results.

- **If TeamCreate fails** (error, unrecognized tool, timeout) → Subagent Delegation:
  - Announce: `**Execution Mode: Subagent Delegation** — Agent Teams not available, using Task() fallback`

The user MUST see the execution mode announcement before audit work begins.

## Step 3: Execute Audit

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

### Agent Teams Mode

#### Specific Audit Type (argument provided)

`TaskCreate("Audit: {audit_type}")` → `TaskUpdate(owner: "reviewer")`.

Spawn a single `reviewer` teammate:
> **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
> You are the **reviewer** running a {audit_type} audit.
> Read `agents/reviewer.md` for your role definition.
> Read `knowzcode/claude_code_execution.md` for team conventions.
>
> **Audit scope**: {audit_type}
> **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
> **Specs directory**: knowzcode/specs/
>
> Deliverable: Audit report with health scores, critical issues, recommendations.

Wait for completion. Shut down teammate. Clean up the team.

The reviewer focuses on the requested type with type-specific depth:
- **spec**: Validates 4-section format, VERIFY statement count, consolidation opportunities
- **architecture**: Checks layer violations, drift, pattern consistency
- **security**: OWASP Top 10 scanning with concrete detection patterns
- **integration**: API contracts, dependency graph, orphaned code, data flow
- **compliance**: Enterprise guideline enforcement levels

#### Full Audit (no argument — DEFAULT)

Create tasks first, pre-assign, then spawn with task IDs:
- `TaskCreate("Audit: spec + architecture")` → `TaskUpdate(owner: "reviewer-spec-arch")`
- `TaskCreate("Audit: security + integration")` → `TaskUpdate(owner: "reviewer-sec-int")`
- (Optional) `TaskCreate("Audit: compliance")` → `TaskUpdate(owner: "reviewer-compliance")` (if enterprise configured)
- `TaskCreate("Scout: vault standards")` → `TaskUpdate(owner: "knowz-scout")` (if `VAULTS_CONFIGURED = true`)

Spawn reviewers with their task IDs:

1. Spawn `reviewer` teammate (name: `reviewer-spec-arch`):
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are the **reviewer** running a targeted audit.
   > Read `agents/reviewer.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   >
   > **Audit scope**: Specification quality AND architecture health ONLY.
   > Do NOT audit security or integration — another reviewer handles those.
   > **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
   > **Specs directory**: knowzcode/specs/
   >
   > Deliverable: Audit report with spec quality scores, architecture health, critical issues.

2. Spawn `reviewer` teammate (name: `reviewer-sec-int`):
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > You are the **reviewer** running a targeted audit.
   > Read `agents/reviewer.md` for your role definition.
   > Read `knowzcode/claude_code_execution.md` for team conventions.
   >
   > **Audit scope**: Security vulnerability scan AND integration consistency ONLY.
   > Do NOT audit specs or architecture — another reviewer handles those.
   > **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
   > **Specs directory**: knowzcode/specs/
   >
   > Deliverable: Audit report with security posture, integration health, critical issues.

3. (Optional) If enterprise compliance configured, spawn `reviewer` (name: `reviewer-compliance`):
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > **Audit scope**: Enterprise compliance ONLY.
   > Check against guidelines in `knowzcode/enterprise/compliance_manifest.md`.

4. If `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`, spawn `knowz-scout` for standards lookup in parallel with reviewers:
   > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
   > Read `knowzcode/knowzcode_vaults.md` to resolve vault IDs by type. Query for team standards: `ask_question({vault matching "ecosystem" type}, "standards for {project_type}", researchMode=true)`

Wait for all to complete.

#### Specialist Integration (Optional)

Initialize `AUDIT_SPECIALISTS = DEFAULT_SPECIALISTS` (from orchestration config, default: []).

If `$ARGUMENTS` contains `--specialists` (or `--specialists=security`, `--specialists=test`, `--specialists=security,test`):
- `--specialists` → enable all applicable: `[security-officer, test-advisor]`
- `--specialists=csv` → enable specified subset
- `--no-specialists` → clear to `[]` (overrides config defaults)

If neither `--specialists` nor `--no-specialists` is present, use `DEFAULT_SPECIALISTS` from config.

Parse which specialists to enable. Then spawn alongside reviewers:

1. **security-officer** (if enabled) — spawn alongside `reviewer-sec-int` for deeper security scanning:
   - `TaskCreate("Security officer: deep security audit")` → `TaskUpdate(owner: "security-officer")`
   - Spawn `security-officer` teammate:
     > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
     > You are the **security-officer** running a deep security audit.
     > Read `agents/security-officer.md` for your role definition.
     > Read `knowzcode/claude_code_execution.md` for team conventions.
     >
     > **Audit scope**: Full codebase security scan — vulnerability patterns, hardcoded secrets, injection vectors, auth bypass, SSRF, path traversal.
     > **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
     > **Specs directory**: knowzcode/specs/
     >
     > Deliverable: Security finding report with severity ratings. Tag CRITICAL/HIGH findings with `[SECURITY-BLOCK]`.
     > If `knowzcode/enterprise/compliance_manifest.md` exists and `compliance_enabled: true`, also cross-reference findings with enterprise guideline IDs.

2. **test-advisor** (if enabled) — spawn alongside reviewers for test quality assessment:
   - `TaskCreate("Test advisor: test quality audit")` → `TaskUpdate(owner: "test-advisor")`
   - Spawn `test-advisor` teammate:
     > **Your Task**: #{task-id} — claim immediately (`TaskUpdate(status: "in_progress")`). Mark completed with summary when done.
     > You are the **test-advisor** running a test quality audit.
     > Read `agents/test-advisor.md` for your role definition.
     > Read `knowzcode/claude_code_execution.md` for team conventions.
     >
     > **Audit scope**: Test coverage, TDD compliance, assertion quality, edge case coverage, test isolation.
     > **Context files**: knowzcode_tracker.md, knowzcode_project.md
     >
     > Deliverable: Test quality report with coverage metrics, TDD compliance, and improvement recommendations.
     > If `knowzcode/enterprise/compliance_manifest.md` exists and `compliance_enabled: true`, also check enterprise ARC criteria for test coverage.

Wait for all reviewers and specialists to complete. Synthesize results in Step 4.

### Subagent Mode

#### Specific Audit Type

Launch scouts + reviewer in parallel via `Task()`:

1. **context-scout** — Local context (if `SCOUT_MODE != "none"`):
   - `SCOUT_MODE = "full"` (default): 3 parallel instances:
     - `Task(subagent_type="context-scout", name="context-scout-specs", description="Scout: specs context", prompt="Research audit scope: {audit_type}. Focus: knowzcode/specs/*.md — scan existing specifications for relevant NodeIDs, status, VERIFY criteria. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-workgroups", description="Scout: workgroups context", prompt="Research audit scope: {audit_type}. Focus: knowzcode/workgroups/*.md — scan previous WorkGroups for related audit findings. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-backlog", description="Scout: backlog context", prompt="Research audit scope: {audit_type}. Focus: knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md — scan for active WIP, prior audit results, architecture health. Max 10 tool calls. Write findings to a concise summary.")`
   - `SCOUT_MODE = "minimal"`: 1 combined instance:
     - `Task(subagent_type="context-scout", name="context-scout", description="Scout: combined context", prompt="Research audit scope: {audit_type}. Focus: ALL local context — knowzcode/specs/*.md, knowzcode/workgroups/*.md, knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md. Max 10 tool calls. Write findings to a concise summary.")`

2. **knowz-scout** — MCP knowledge (if `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`):
   - `Task(subagent_type="knowz-scout", description="Scout: vault standards", prompt="Research audit scope: {audit_type}. Read knowzcode/knowzcode_vaults.md to discover configured vaults. Query for team standards, conventions, and past audit decisions. Max 10 tool calls. Write findings to a concise summary.")`

3. **reviewer** — The audit itself:
   - `subagent_type`: `"reviewer"`
   - `prompt`: Task-specific context only (role definition is auto-loaded from `agents/reviewer.md`):
     > **Audit scope**: {audit_type}
     > **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
     > **Specs directory**: knowzcode/specs/
     >
     > Deliverable: Audit report with health scores, critical issues, recommendations.
   - `description`: `"Audit: {audit_type}"`

All launched in parallel. Synthesize scout findings alongside reviewer results.

#### Full Audit

Launch scouts + parallel reviewers via `Task()`:

1. **context-scout** — Local context (if `SCOUT_MODE != "none"`):
   - `SCOUT_MODE = "full"` (default): 3 parallel instances:
     - `Task(subagent_type="context-scout", name="context-scout-specs", description="Scout: specs context", prompt="Research for comprehensive audit. Focus: knowzcode/specs/*.md — scan all specifications for quality, completeness, VERIFY criteria. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-workgroups", description="Scout: workgroups context", prompt="Research for comprehensive audit. Focus: knowzcode/workgroups/*.md — scan all WorkGroups for patterns, recurring issues, audit history. Max 10 tool calls. Write findings to a concise summary.")`
     - `Task(subagent_type="context-scout", name="context-scout-backlog", description="Scout: backlog context", prompt="Research for comprehensive audit. Focus: knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md — scan for WIP status, prior audit results, architecture health. Max 10 tool calls. Write findings to a concise summary.")`
   - `SCOUT_MODE = "minimal"`: 1 combined instance:
     - `Task(subagent_type="context-scout", name="context-scout", description="Scout: combined context", prompt="Research for comprehensive audit. Focus: ALL local context — knowzcode/specs/*.md, knowzcode/workgroups/*.md, knowzcode/knowzcode_tracker.md, knowzcode/knowzcode_log.md, knowzcode/knowzcode_architecture.md. Max 10 tool calls. Write findings to a concise summary.")`

2. **knowz-scout** — MCP knowledge (if `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`):
   - `Task(subagent_type="knowz-scout", description="Scout: vault standards", prompt="Research for comprehensive audit. Read knowzcode/knowzcode_vaults.md to discover configured vaults. Query for team standards, conventions, security policies, and compliance requirements. Max 10 tool calls. Write findings to a concise summary.")`

3. **Parallel reviewers**:
   - `Task(subagent_type="reviewer", description="Audit: spec + architecture", prompt="Audit scope: Specification quality AND architecture health ONLY. ...")`
   - `Task(subagent_type="reviewer", description="Audit: security + integration", prompt="Audit scope: Security vulnerability scan AND integration consistency ONLY. ...")`
   - `Task(subagent_type="reviewer", description="Audit: compliance", prompt="Audit scope: Enterprise compliance ONLY. ...")` (if enterprise configured)

Synthesize scout context alongside reviewer results.

#### Specialist Integration (Subagent Mode — Optional)

Initialize `AUDIT_SPECIALISTS = DEFAULT_SPECIALISTS` (from orchestration config, default: []).

If `$ARGUMENTS` contains `--specialists` (or `--specialists=security`, `--specialists=test`, `--specialists=security,test`):
- `--specialists` → enable all applicable
- `--specialists=csv` → enable specified subset
- `--no-specialists` → clear to `[]`

If `AUDIT_SPECIALISTS` is non-empty, launch specialist `Task()` calls in parallel with reviewers:

1. **security-officer** (if enabled):
   - `Task(subagent_type="security-officer", description="Security officer: deep security audit", prompt="Audit scope: Full codebase security scan. Context files: knowzcode_tracker.md, knowzcode_architecture.md. Specs: knowzcode/specs/. Deliverable: Security finding report with severity ratings. Tag CRITICAL/HIGH with [SECURITY-BLOCK]. If knowzcode/enterprise/compliance_manifest.md exists and compliance_enabled: true, also cross-reference findings with enterprise guideline IDs.")`

2. **test-advisor** (if enabled):
   - `Task(subagent_type="test-advisor", description="Test advisor: test quality audit", prompt="Audit scope: Test coverage, TDD compliance, assertion quality, edge cases. Context files: knowzcode_tracker.md. Deliverable: Test quality report with coverage metrics and recommendations. If knowzcode/enterprise/compliance_manifest.md exists and compliance_enabled: true, also check enterprise ARC criteria for test coverage.")`

Synthesize specialist findings alongside reviewer results.

## Step 4: Present Results

```markdown
## KnowzCode Audit Results

**Timestamp**: {timestamp}
**Audit Type**: {type or "Comprehensive"}

### Summary Scores
| Area | Health Score | Critical Issues |
|------|-------------|-----------------|
| Spec Quality | {score}% | {count} |
| Architecture | {score}% | {count} |
| Security | {score}% | {count} |
| Integration | {score}% | {count} |

### Critical Issues
{sorted by severity}

### Recommendations
{prioritized action items}

### Specialist Reports                    [only when --specialists active]
**Security Officer**: {finding count, severity breakdown, SECURITY-BLOCK tags}
**Test Advisor**: {coverage %, TDD compliance, quality assessment}
```

## Step 5: Log Audit

Log to `knowzcode/knowzcode_log.md`:
```markdown
| {timestamp} | AUDIT | {audit_type} | {summary} |
```

If MCP is configured and enterprise vault exists: push audit results via `create_knowledge` for team audit trail.

## Related Skills

- `/knowzcode:work` — Build features (not audit)
- `/knowzcode:fix` — Fix a specific bug found during audit
- `/knowz save` — Capture audit findings to vault
- `/knowzcode:telemetry` — Investigate production errors
