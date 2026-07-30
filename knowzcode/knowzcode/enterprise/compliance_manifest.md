# Enterprise Compliance Manifest

> **Status: Beta** — Centralized enforcement via the `enterprise-enforcer` agent (introduced in v0.16.0). When `compliance_enabled: true` and at least one active non-empty guideline exists, the enforcer is auto-spawned at Stage 0 of `/knowzcode:work` Tier 3 workflows. Per-agent compliance hooks in `reviewer`, `architect`, `test-advisor`, and `security-officer` remain as fallback paths used when the enforcer is disabled via `--no-enterprise-enforcer` or unavailable (Tier 2 Light or sequential delegation).

**Purpose:** Defines which enterprise guidelines are active and their enforcement level.

---

## Enforcement Owner

When `compliance_enabled: true`, the `enterprise-enforcer` agent (`agents/enterprise-enforcer.md`) is the sole owner of guideline loading, spec injection, builder guidance, and the Gate #3 compliance audit. Other agents defer compliance work to it via the coordination protocols documented in their agent files. See `knowzcode/skills/work/SKILL.md` Step 2.6.2 for activation logic.

To opt out of centralized enforcement and use the per-agent fallback paths: pass `--no-enterprise-enforcer` on the `/knowzcode:work` invocation.

---

## Active Guidelines

| Guideline File | Enforcement | Applies To | Active |
|:---------------|:------------|:-----------|:-------|
| security.md | blocking | both | false |
| code-quality.md | advisory | implementation | false |
| design.md | advisory | both | false |

> **Note:** Set `Active` to `true` to enable a guideline. Guidelines with empty content are skipped.

---

## Enforcement Levels

| Level | Behavior |
|:------|:---------|
| **blocking** | Violations STOP workflow progression. Must be resolved before proceeding. |
| **advisory** | Violations are REPORTED but workflow can continue with documented acceptance. |

---

## Applies-To Scope

| Scope | When Checked | What Is Validated |
|:------|:-------------|:------------------|
| **spec** | Phase 1B (Specification) | Specs address required concerns, ARC criteria included |
| **implementation** | Phase 2B (Verification) | Code meets requirements, patterns compliant |
| **both** | Phase 1B AND Phase 2B | Full coverage at both stages |

---

## Custom Guidelines

Add custom guidelines to `knowzcode/enterprise/guidelines/custom/` following the template in `templates/guideline-template.md`.

To activate a custom guideline, add it to the Active Guidelines table above.

## Additional Guideline Sources

Enterprise rules can also be supplied outside the Active Guidelines table:

- `knowzcode/enterprise.md` — single-file enterprise policy for smaller teams.
- Enterprise/compliance vault entries resolved from `knowz-vaults.md`.
- Explicit vault IDs provided by the user or workflow.
- Explicit Knowz `KnowledgeId` values provided by the user or workflow.

When a vault or KnowledgeId source is marked as enterprise guidance, it is an enforcement input. The enforcer or Codex coordinator must retrieve it at kickoff, preserve provenance, translate it into NodeID/component mappings and `VERIFY:` criteria, and check it at the appropriate gates.

Precedence:

1. Explicit user-provided KnowledgeIds or vault IDs for the current WorkGroup.
2. Local manifest entries and active guideline files.
3. `knowzcode/enterprise.md`.
4. Configured enterprise/compliance vault standards.
5. General vault search results.

If sources conflict, surface the conflict at the next gate. Blocking-tier conflicts pause autonomous mode until the user or lead resolves which source applies.

---

## Configuration

```yaml
# Enable/disable compliance checking globally (default: false)
compliance_enabled: false

# Auto-run compliance during /knowzcode:audit when enabled
include_in_audit: true

# Require compliance sign-off before Phase 3 finalization
require_signoff_for_finalization: false

# Show advisory issues in workflow output
show_advisory_issues: true

# Skip guidelines with empty content (default: true)
skip_empty_guidelines: true
```

> **Where these keys are honored** (wired as of v0.16.0+):
> - `compliance_enabled` / `skip_empty_guidelines` → enterprise-enforcer Stage 0 + `skills/work/SKILL.md` Step 2.6.2.
> - `include_in_audit` → `/knowzcode:audit` gates the auto-compliance reviewer in a *general* audit (an explicit `/knowzcode:audit compliance` always runs).
> - `require_signoff_for_finalization` → the Phase 3 "Compliance Sign-Off" gate in `skills/work/references/quality-gates.md` blocks finalization on unresolved blocking-tier violations.
> - `show_advisory_issues` → the enterprise-enforcer report and the quality gates omit advisory-tier rows/counts when false.
>
> MCP keys below are honored at the work/closer/enforcer sites described in "How It Works".

---

## MCP-Based Compliance (Optional)

When MCP is configured with an enterprise vault, compliance can be enhanced with vault-based standards and audit trails.

```yaml
# Enable MCP-based compliance features (default: false)
mcp_compliance_enabled: false

# Enterprise vault ID for standards and audit trails
compliance_vault_id: ""

# Optional explicit guideline KnowledgeIds to enforce at kickoff
guideline_knowledge_ids: []

# Optional explicit vault IDs/names to search for enterprise guidelines at kickoff
guideline_vault_sources: []

# Audit trail vault ID (can be same as compliance vault)
audit_trail_vault_id: ""

# Pull team-wide standards from enterprise vault at workflow start
pull_standards_at_start: true

# Preserve vault/KnowledgeId provenance in WorkGroup and compliance reports
preserve_guideline_provenance: true

# Push audit results to enterprise vault after Phase 2B
push_audit_results: true

# Push WorkGroup completion records to enterprise vault after Phase 3
push_completion_records: true
```

### How It Works

When `mcp_compliance_enabled: true`:

**At workflow start (before Phase 1A):**
- Query enterprise vault for team-wide standards: `ask_question(compliance_vault, "team standards for {project_type}")`
- Fetch each `guideline_knowledge_ids` item with `get_knowledge_item(id)` and treat it as an active enterprise guideline source.
- Search each `guideline_vault_sources` vault for goal-relevant policies, standards, and active requirements.
- Merge returned standards into quality gate criteria for the WorkGroup
- Preserve provenance for every vault-sourced rule: vault ID/name, KnowledgeId, title, created/updated date when available, retrieval date, and enforcement level.

**After Phase 2B audit:**
- Classify the audit delta through the lead-owned `vault-delta` runtime. Persist only `amend`, `update`, or `flush`; retain normal `batch` until final consolidation.
- Include security findings, compliance status, and gap summary in that classified delta.

**After Phase 3 finalization:**
- Include the completion record in the consolidated delta and classify with `explicit_save: true`.
- Apply one exact returned persistence action; when MCP is unavailable, queue the consolidated classified delta once.

### Agent-to-Enterprise-Vault Operations

| Agent | Operation | When | Content |
|-------|-----------|------|---------|
| lead | vault-delta then classified mutation | After candidate/gate/final boundary | Scope, audit, or completion delta; `skip`/`batch` never writes |
| analyst | return candidate to lead | After 1A approval | Scope decisions, risk assessment |
| reviewer | return candidate to lead | After 2B audit | Audit findings, security posture |
| closer | return FinalCaptureDelta to lead | After Phase 3 | Completion record, architecture changes |
| security-officer | search_knowledge | Stage 0, Stage 2 | Organization security standards, past security findings |
| test-advisor | (read-only) | Stage 2 | Enterprise ARC criteria for test coverage check |
| project-advisor | (read-only) | Stage 0 | Compliance config gaps for backlog proposals |
| enterprise-enforcer | search_knowledge | Stage 0, Stage 2 | Organization-specific guideline interpretations, past compliance findings |
| frontend-designer | search_knowledge | Stage 0, Stage 2B | Organization design standards, past UI/UX decisions |

---

## Usage

### Check Compliance Status
```bash
/knowzcode:audit compliance           # Full review (spec + implementation)
/knowzcode:audit compliance spec      # Review specs only
/knowzcode:audit compliance impl      # Review implementation only
```

---

## Adding New Guidelines

1. Create guideline file in `guidelines/` or `guidelines/custom/`
2. Use `templates/guideline-template.md` as starting point
3. Add entry to Active Guidelines table above
4. Run `/knowzcode:audit compliance` to verify guideline loads correctly

### Adding Vault-Backed Guidelines
1. Save or identify the guideline in a Knowz enterprise/compliance vault.
2. Add its KnowledgeId to `guideline_knowledge_ids` OR add the source vault to `guideline_vault_sources`.
3. Set `mcp_compliance_enabled: true`.
4. Run `/knowzcode:work --enterprise-enforcer` or `/knowzcode:audit compliance` to verify it loads and maps to concrete criteria.
