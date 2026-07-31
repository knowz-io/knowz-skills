---
name: audit
description: "Run read-only quality audits on the existing codebase — spec completeness, architecture health, OWASP security scanning, integration consistency, and enterprise compliance. Use when the user wants to AUDIT or SCAN existing code (including compliance reviews), not build new features."
user-invocable: true
allowed-tools: Read, Glob, Grep
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
| *(no argument)* | Full audit of all types (sequential by default) |

---

## Step 1: Load Context

Default to `RESULT_MODE = ephemeral`, `PERSIST_AUTHORIZED = false`, and `RUNTIME_WRITES_AUTHORIZED = false`. An audit is strictly zero-write unless the user separately authorizes a write class:

- `--persist` or an explicit local-report request authorizes one local report artifact only. Log and vault targets must be named separately.
- An explicit request to run write-capable tests, launch agents, or use Team/task runtime state sets `RUNTIME_WRITES_AUTHORIZED = true`. This never authorizes a report, artifact, log, WorkGroup/tracker/settings mutation, or vault capture.
- General audit intent, autonomous mode, an available vault, a prior preference, or persistence authorization does not authorize runtime writes.

In the strict default, use only `Read`, `Glob`, and `Grep`. Do not invoke Bash, tests/builds/formatters, Task/Agent, Agent Teams, task-list operations, hooks that persist output, or scripts that may write caches or generated files. Return one bounded chat report. When runtime writes are explicitly authorized, Bash and agent tools remain normally permission-gated rather than pre-approved; state the exact command/runtime state before use and keep persistence authorization separate.

Classify the requested audit before loading context, then read the minimum relevant slices:

- `spec`: targeted tracker rows and matching specs; project conventions only if needed to score them.
- `architecture`: architecture plus the implicated modules; tracker/specs only for claimed boundaries.
- `security` or `integration`: affected code/config/tests and applicable specs; load architecture only for a concrete data-flow or boundary question.
- `compliance`: manifest and active non-empty guideline sources; load project/spec/code slices named by those controls.
- full audit: build a deterministic file inventory first, then load each slice only when it is evaluated.

Read `knowzcode_orchestration.md` with targeted key searches only when profile, specialist, Team eligibility, or MCP TTL affects the selected route. Do not preload every framework document.

## Step 1.1: Parse Orchestration Config (Optional)

If `knowzcode/knowzcode_orchestration.md` exists, parse its YAML blocks:

1. `DEFAULT_SPECIALISTS` = `default_specialists` value (default: [])
2. `MCP_AGENTS_ENABLED` = `mcp_agents_enabled` value (default: true)
3. `PROFILE` = `profile` value (default: `"frontier"`). Valid: `"advisor"`, `"teams"`, `"classic"`, `"frontier"`. Fall back to `"frontier"` on invalid value.

Apply flag overrides (flags win over config):
- `--no-specialists` in `$ARGUMENTS` → override `DEFAULT_SPECIALISTS = []`
- `--no-mcp` in `$ARGUMENTS` → override `MCP_AGENTS_ENABLED = false`
- `--profile={advisor|teams|classic|frontier}` in `$ARGUMENTS` → override `PROFILE`

If the file doesn't exist, use hardcoded defaults; `PROFILE = "frontier"` (the default profile).

If `PROFILE == "advisor"`, apply the same detection/fallback checks as `/knowzcode:work` Step 2.3 (CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS, ANTHROPIC_BASE_URL). On fallback, reset `PROFILE = "teams"` and announce.

If `PROFILE == "frontier"`, apply the Fable detection from `/knowzcode:work` Step 2.3: if `ANTHROPIC_BASE_URL` is set and does NOT contain `"anthropic.com"` (case-insensitive), set `FABLE_DOWNGRADE = true` and announce that the reviewer/specialists fall back to Opus. When `FABLE_DOWNGRADE = true`, treat every `MODEL_FOR(...) == "fable"` result as `"opus"` at spawn time. Additionally — regardless of `FABLE_DOWNGRADE` — if a `fable` spawn is rejected at runtime for any reason (no Fable entitlement, a zero-data-retention org, or an older Claude Code that doesn't recognize the alias), re-spawn that agent with `model: opus` and continue. The audit never fails because Fable is unavailable.

See `${CLAUDE_PLUGIN_ROOT}/skills/work/references/profile-models.md` for profile semantics and `MODEL_FOR()` resolution.

For each reviewer/specialist spawn authorized under Step 2, resolve `model` via `MODEL_FOR(agent_name, PROFILE)`. Include `model: <value>` when non-null; otherwise omit. Under `PROFILE == "advisor"`, the reviewer runs on Sonnet; append the Advisor Guidance block from `${CLAUDE_PLUGIN_ROOT}/skills/work/references/spawn-prompts.md` to the prompt in `references/authorized-execution.md` (resolve `{advisor_guidance}` to that block when `MODEL_FOR` returns `"sonnet"`, otherwise to an empty string). Under `PROFILE == "frontier"`, audit is pure review reasoning, so the reviewer, security-officer, and test-advisor run on Fable (or Opus when `FABLE_DOWNGRADE`); `{advisor_guidance}` remains empty because advisor guidance is advisor-profile only.

## Step 2: Set Up Execution Mode

Classify audit slices before the MCP probe or any spawn. Record scope, coupling, sensitivity, expected context reuse, independence, and compatible lineage.

- With `RUNTIME_WRITES_AUTHORIZED = false`, every audit runs `local` and sequentially. Do not form a team, create task state, spawn/resume an agent, or run a test command.
- With runtime writes explicitly authorized, a narrow audit may still run `local`; resume only a compatible reviewer for the same audit/fix lineage, and give a new independent audit a fresh reviewer capsule.
- A full authorized audit may use bounded fresh named reviewers for independently useful slices.
- Select `coordinated-team` only after runtime-write authorization and only when at least two reviewers/officers must directly challenge or message peers and Agent Teams is explicitly configured/callable. Before the first teammate spawn, require that the user requested teammates/Team mode for this audit or obtain current-run confirmation; environment configuration alone is not approval. The first teammate spawn forms the runtime-managed team. If unavailable, record `CAPABILITY_FALLBACK` and use named reviewers with identical criteria.
- `PROFILE == "classic"` disables Team mode and conversation inheritance but does not disable compatible named-agent resume.

Announce `**Execution Mode: Strict Local Audit** — zero-write Read/Glob/Grep only`, `**Execution Mode: Adaptive Audit** — runtime writes explicitly authorized`, or `**Execution Mode: Coordinated Audit Team** — runtime writes authorized and peer coordination required`. Team identity is session-derived and opaque; runtime cleanup is automatic after graceful teammate release.

The user MUST see the execution mode announcement before audit work begins.

## Step 3: Execute Audit

### MCP Probe (Conditional)

Run this probe only when the user explicitly requested vault-backed history/policy evidence, compliance names a vault/KnowledgeId source, or `PERSIST_AUTHORIZED` includes a vault save. Otherwise set `MCP_ACTIVE = false` for this audit and skip all vault calls without warning.

When needed, determine vault availability:
0. Reuse a timestamped MCP health/baseline result inside `mcp_health_ttl_minutes` (default 15). Probe again only after expiry or material vault/connectivity change.
1. Otherwise read `knowz-vaults.md` from project root — parse vault IDs. If file not found, call `list_vaults(includeStats=true)` to discover vaults.
2. If `list_vaults()` fails AND no `knowz-vaults.md` exists → `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`. Announce: `**MCP Status: Not connected**`
3. If `list_vaults()` fails BUT `knowz-vaults.md` has vault IDs -> `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = true`. Announce: `**MCP Status: Probe failed — configured vaults retained; captures will queue**`. Children reuse this result inside the TTL.
4. If vaults discovered but no `knowz-vaults.md` exists → suggest `"Run /knowz setup to configure vault routing."` Set `VAULTS_CONFIGURED = true` (use discovered IDs for baseline).
5. Set `MCP_ACTIVE` and `VAULTS_CONFIGURED` based on results. Announce: `**MCP Status: Connected — N vault(s) available**` or `**MCP Status: Connected — no vaults configured (knowledge capture disabled)**`

If no vaults are configured, suggest `/knowz setup`.

### Enterprise Guideline Sources

Run this section only for an explicit compliance audit or a full audit whose existing manifest enables audit inclusion. Otherwise do not read enterprise files or query guideline sources. When active:

0. Parse the `compliance_manifest.md` config block into `COMPLIANCE_CONFIG`. Audit-relevant behavior keys:
   - `include_in_audit` (default true) gates the compliance reviewer in a *general* full audit; an explicit `/knowzcode:audit compliance` ignores it and always runs.
   - `preserve_guideline_provenance` (default true) skips provenance capture in step 4 when false.
   - `show_advisory_issues` (default true) suppresses advisory-tier compliance rows/counts when false; blocking-tier findings are never suppressed.
   - `push_audit_results` (default true) gates enterprise-vault audit-result writes in Step 5.
1. Read local guidelines from `knowzcode/enterprise.md`, `knowzcode/enterprise/compliance_manifest.md`, and `knowzcode/enterprise/guidelines/**/*.md` when present.
2. If the manifest, user request, or `$ARGUMENTS` provides `guideline_knowledge_ids`, call `get_knowledge_item(id)` for each and treat the item as an active enterprise guideline source.
3. If `mcp_compliance_enabled: true` AND (`compliance_vault_id`, `guideline_vault_sources`, or a user-provided vault ID/name exists), query those vaults for goal-relevant policies, standards, active requirements, and past compliance findings. When `mcp_compliance_enabled: false`, use only local guideline files — do not query the enterprise vault.
4. Preserve provenance for vault-sourced rules unless `preserve_guideline_provenance: false`: vault ID/name, KnowledgeId, title, created/updated date when available, retrieval date, applies-to scope, and enforcement level.
5. Treat retrieved vault guidance as historical context. Verify it against live code, tests, local enterprise files, official docs, and current observations. If sources conflict, surface the conflict in the audit report. Blocking-tier conflicts are HIGH severity until resolved.

Vault research is question-gated, never mandatory merely because MCP is connected. State the unresolved audit question, query only the relevant vault/source, and reuse a fresh TTL baseline. Skip broad `knowz:reader` dispatch when local evidence is sufficient.

Every reviewer receives only its audit slice, exact read paths, applicable specs/guideline sources, checkpoint, and evidence budget. Any generic `Context files` list in the authorized execution reference MUST be replaced by the minimum exact paths selected in Step 1; it is not a preload list. Agent definitions load automatically. Require a bounded result: status, scored findings, severity, `file:line`/test evidence, unresolved risks, and remaining work. Keep commands/output bounded in memory by default. Artifact paths are permitted only when `PERSIST_AUTHORIZED` explicitly covers artifacts.

### Execution Details (Load Only When Authorized)

The strict default performs every selected audit slice locally and sequentially with `Read`, `Glob`, and `Grep`; continue directly to Step 4 without loading another execution reference.

Only when `RUNTIME_WRITES_AUTHORIZED = true`, read [references/authorized-execution.md](references/authorized-execution.md), and load only the section for the chosen named-agent or coordinated-team route. That reference defines scoped reviewer packets, full-audit slice boundaries, conditional liaison/specialist dispatch, Team task state, model/profile substitution, and release behavior. It never grants persistence and cannot override the zero-write or authorization rules above.

Type-specific depth remains:
- **spec**: 4-section format, VERIFY count, and consolidation opportunities.
- **architecture**: layer violations, drift, and pattern consistency.
- **security**: OWASP vulnerability patterns and concrete evidence.
- **integration**: contracts, dependency graph, orphaned code, and data flow.
- **compliance**: active enterprise guideline enforcement levels and provenance.

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

### Enterprise Guideline Provenance        [when enterprise guidelines active]
{local files, vaults, KnowledgeIds, created/updated dates when available, retrieval date, enforcement level}
```

## Step 4.5: Vault Capture Prompt

Skip this step unless the invoking user explicitly authorized vault persistence. Do not treat a connected vault or `--autonomous` as consent. If authorization exists and `VAULTS_CONFIGURED = true` and `MCP_ACTIVE = true`, confirm the authorized scope and present:

```markdown
**Save to vault?** These audit findings can be captured to Knowz for future reference.
  **A) Save all findings** (scores + issues + recommendations)
  **B) Select which to save**
  **C) Skip**
```

**Handling**:
- **A**: Build one bounded `AuthorizedVaultDelta` summarizing all findings, tagged with the topic and marked `explicit_save: true`.
- **B**: Ask which sections to save, then build the same packet with only the selected content.
- **C**: Proceed to Step 5.

Strict audit intentionally has no Bash, Task, or write-capable MCP authority. Return A/B packets to the lead/runtime owner, which MUST invoke `vault-delta`; `skip`/`batch` creates no writer or pending entry, and only classified `amend`, `update`, or `flush` may enter a separately authorized persistence path. If no runtime owner is available, report the save as deferred and offer the bounded packet for a later `/knowz save`; do not bypass classification from audit mode.

If `VAULTS_CONFIGURED = false` or `MCP_ACTIVE = false`, skip this step silently.

## Step 5: Optional Persistence

Default: return the bounded Step 4 report and make zero writes.

Only when `PERSIST_AUTHORIZED = true`, persist exactly the authorized targets. If local log persistence was explicitly requested, request write permission and append to `knowzcode/knowzcode_log.md`:
```markdown
| {timestamp} | AUDIT | {audit_type} | {summary} |
```

An enterprise-vault push additionally requires explicit vault-save authorization, `mcp_compliance_enabled: true`, a resolved enterprise vault, and `COMPLIANCE_CONFIG.push_audit_results != false`. Configuration can forbid a write but cannot authorize one. Never broaden local-log authorization into vault authorization or vice versa.

## Related Skills

- `/knowzcode:work` — Build features (not audit)
- `/knowzcode:fix` — Fix a specific bug found during audit
- `/knowz save` — Capture audit findings to vault
- `/knowzcode:telemetry` — Investigate production errors
