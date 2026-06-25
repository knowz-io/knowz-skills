# Enterprise Compliance Manifest

> **Status: Beta** — Centralized enforcement via the `enterprise-enforcer` agent (introduced in v0.16.0). When `compliance_enabled: true` and at least one active non-empty guideline exists, the enforcer is auto-spawned at Stage 0 of `/knowzcode:work` Tier 3 workflows. Per-agent compliance hooks in `reviewer`, `architect`, `test-advisor`, and `security-officer` remain as fallback paths used when the enforcer is disabled via `--no-enterprise-enforcer` or unavailable (Tier 2 Light, Sequential Teams).

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

---

## MCP-Based Compliance (Optional)

When MCP is configured with an enterprise vault, compliance can be enhanced with vault-based standards and audit trails.

```yaml
# Enable MCP-based compliance features (default: false)
mcp_compliance_enabled: false

# Enterprise vault ID for standards and audit trails
compliance_vault_id: ""

# Audit trail vault ID (can be same as compliance vault)
audit_trail_vault_id: ""

# Pull team-wide standards from enterprise vault at workflow start
pull_standards_at_start: true

# Push audit results to enterprise vault after Phase 2B
push_audit_results: true

# Push WorkGroup completion records to enterprise vault after Phase 3
push_completion_records: true
```

### How It Works

When `mcp_compliance_enabled: true`:

**At workflow start (before Phase 1A):**
- Query enterprise vault for team-wide standards: `ask_question(compliance_vault, "team standards for {project_type}")`
- Merge returned standards into quality gate criteria for the WorkGroup

**After Phase 2B audit:**
- Push audit results to enterprise vault: `create_knowledge(audit_trail_vault, "Audit: {wgid} - {score}%")`
- Include security findings, compliance status, and gap summary

**After Phase 3 finalization:**
- Push completion record: `create_knowledge(audit_trail_vault, "Completion: {wgid}")`
- Include goal, NodeIDs, audit score, key decisions, and architecture changes

### Agent-to-Enterprise-Vault Operations

| Agent | Operation | When | Content |
|-------|-----------|------|---------|
| analyst | create_knowledge | After 1A approval | Scope decisions, risk assessment |
| reviewer | create_knowledge | After 2B audit | Audit findings, security posture |
| closer | create_knowledge | After Phase 3 | Completion record, architecture changes |
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
