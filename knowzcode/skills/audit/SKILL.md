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
- User wants to **research or explore** a topic → use `/knowzcode:explore`
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

1. `DEFAULT_SPECIALISTS` = `default_specialists` value (default: [])
2. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)

Apply flag overrides (flags win over config):
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
1. Read `knowz-vaults.md` from project root — parse vault IDs. If file not found, call `list_vaults(includeStats=true)` to discover vaults.
2. If `list_vaults()` fails AND no `knowz-vaults.md` exists → `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`. Announce: `**MCP Status: Not connected**`
3. If `list_vaults()` fails BUT `knowz-vaults.md` has vault IDs → `MCP_ACTIVE = true`, `VAULTS_CONFIGURED = true`. Announce: `**MCP Status: Lead probe failed — vault agents will verify independently**`
4. If vaults discovered but no `knowz-vaults.md` exists → suggest `"Run /knowz setup to configure vault routing."` Set `VAULTS_CONFIGURED = true` (use discovered IDs for baseline).
5. Set `MCP_ACTIVE` and `VAULTS_CONFIGURED` based on results. Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

If no vaults are configured, suggest `/knowz setup`.

> **Vault research is mandatory when available.** If `VAULTS_CONFIGURED = true` and `MCP_AGENTS_ENABLED = true`, the `knowz:reader` dispatch MUST execute in both Exploration and Planning modes. The 10-tool-call budget in Exploration Mode is a scope limit, not a reason to skip. Only skip when MCP is genuinely unavailable (`MCP_ACTIVE = false`).

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
- Dispatch `knowz:reader` for vault standards (if `VAULTS_CONFIGURED = true`)

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

4. If `VAULTS_CONFIGURED = true` AND `MCP_AGENTS_ENABLED = true`, dispatch `knowz:reader` for standards lookup in parallel with reviewers:
   > Read `knowz-vaults.md` (project root) to discover configured vaults — their IDs, types, descriptions.
   > Query for team standards: search ecosystem-type vaults for standards, conventions, and past audit decisions.
   > Return synthesized findings.

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

Launch knowledge-liaison + reviewer in parallel via `Task()`:

1. **knowledge-liaison** — Local context + vault knowledge:
   - `Task(subagent_type="knowzcode:knowledge-liaison", description="Liaison: audit context", prompt="Research audit scope: {audit_type}. Gather local context (specs, workgroups, tracker, log, architecture) and vault knowledge (standards, conventions, past audit decisions). Push Context Briefing with findings. Max 15 tool calls. Write findings to a concise summary.")`

2. **reviewer** — The audit itself:
   - `subagent_type`: `"reviewer"`
   - `prompt`: Task-specific context only (role definition is auto-loaded from `agents/reviewer.md`):
     > **Audit scope**: {audit_type}
     > **Context files**: knowzcode_tracker.md, knowzcode_architecture.md, knowzcode_project.md
     > **Specs directory**: knowzcode/specs/
     >
     > Deliverable: Audit report with health scores, critical issues, recommendations.
   - `description`: `"Audit: {audit_type}"`

All launched in parallel. Synthesize knowledge-liaison context alongside reviewer results.

#### Full Audit

Launch knowledge-liaison + parallel reviewers via `Task()`:

1. **knowledge-liaison** — Local context + vault knowledge:
   - `Task(subagent_type="knowzcode:knowledge-liaison", description="Liaison: audit context", prompt="Research for comprehensive audit. Gather local context (specs, workgroups, tracker, log, architecture) and vault knowledge (standards, conventions, security policies, compliance requirements). Push Context Briefing with findings. Max 15 tool calls. Write findings to a concise summary.")`

2. **Parallel reviewers**:
   - `Task(subagent_type="reviewer", description="Audit: spec + architecture", prompt="Audit scope: Specification quality AND architecture health ONLY. ...")`
   - `Task(subagent_type="reviewer", description="Audit: security + integration", prompt="Audit scope: Security vulnerability scan AND integration consistency ONLY. ...")`
   - `Task(subagent_type="reviewer", description="Audit: compliance", prompt="Audit scope: Enterprise compliance ONLY. ...")` (if enterprise configured)

Synthesize knowledge-liaison context alongside reviewer results.

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

## Step 4.5: Vault Capture Prompt

If `VAULTS_CONFIGURED = true` AND `MCP_ACTIVE = true`, present after audit results:

```markdown
**Save to vault?** These audit findings can be captured to Knowz for future reference.
  **A) Save all findings** (scores + issues + recommendations)
  **B) Select which to save**
  **C) Skip**
```

**Handling**:
- **A**: Dispatch `knowz:writer` with a self-contained prompt summarizing all findings, tagged with the topic. Read `knowz-vaults.md` (project root) to resolve the target vault (use ecosystem-type vault). Check for duplicates via `search_knowledge` before writing.
- **B**: Ask user which sections to save, then dispatch `knowz:writer` with selected content.
- **C**: Proceed to Step 5.

If `VAULTS_CONFIGURED = false` or `MCP_ACTIVE = false`, skip this step silently.

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
