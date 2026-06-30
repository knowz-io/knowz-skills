# Enterprise Compliance & Custom Guidelines

> **Status: Beta.** Stable enough to adopt; defaults are off so it never gets in your way until you opt in.

KnowzCode lets an organization wire its **own** guidelines — security rules, API
conventions, code-quality patterns, design/accessibility standards — into the development
workflow so they are checked and enforced at the same quality gates a human approves.

You author guidelines as markdown, register them in a manifest, and flip one switch. From
then on a persistent **`enterprise-enforcer`** officer loads them, injects required
verification criteria into specs, and **blocks the audit gate** on violations of any rule
you mark *blocking*.

> **"Wasn't this removed?"** No. Earlier versions shipped a separate `/knowzcode:compliance`
> command and a default `enterprise/` folder. In v0.16.0 the command was folded into
> `/knowzcode:audit compliance` and the folder became opt-in (created on demand), and
> enforcement was re-homed onto the `enterprise-enforcer` agent. The capability is current
> and more powerful than before — only its packaging changed.

---

## Quick start (3 steps)

1. **Create the folder** (if it isn't there yet). Run `/knowzcode:init` and answer *yes* to
   "set up enterprise compliance", or copy the skeleton from
   `knowzcode/knowzcode/enterprise/` into your project's `knowzcode/enterprise/`.

2. **Author a guideline** — copy `enterprise/templates/guideline-template.md` into
   `enterprise/guidelines/custom/your-rule.md` and fill it in (see [format](#guideline-file-format)).
   Or edit the shipped `security.md`, which already contains real rules.

3. **Activate it** — in `enterprise/compliance_manifest.md`, add a row to the **Active
   Guidelines** table with `Active: true`, and set `compliance_enabled: true`.

```bash
# Verify it loads
/knowzcode:audit compliance
```

That's it. The next `/knowzcode:work` run auto-spawns the enforcer and enforces your rules.

---

## Folder layout

```
knowzcode/enterprise/
├── compliance_manifest.md        # master switch + which guidelines are active + config
├── compliance_status.md          # audit history (written back after each run)
├── guidelines/
│   ├── security.md               # ships with real rules (SEC-* IDs), blocking
│   ├── code-quality.md           # starter template (CQ-* IDs)
│   ├── design.md                 # starter template (DSN-* IDs) — a11y, responsive, tokens
│   └── custom/                   # YOUR org's guidelines go here
└── templates/
    └── guideline-template.md     # copy this to author a new guideline
```

---

## Guideline file format

A guideline is markdown with YAML frontmatter and one or more testable requirements. Each
requirement carries **ARC criteria** — the discrete, checkable conditions the workflow maps
onto your code and verifies coverage of.

```markdown
---
guideline_id: CUSTOM-001
name: "Your Rule Name"
enforcement: blocking        # blocking | advisory
applies_to: both             # spec | implementation | both
priority: high
---

### CUSTOM-API-01: All endpoints require OpenAPI docs

**Requirement:** Every new HTTP endpoint MUST have an OpenAPI operation entry.

**Applies To:** both

**Severity:** high

**ARC Verification:**
- ARC_CUSTOM_API_01a: Verify each new route appears in the OpenAPI spec
- ARC_CUSTOM_API_01b: Verify request/response schemas are defined, not `any`
```

ARC IDs use **underscores** (`ARC_CUSTOM_API_01a`); requirement IDs use **hyphens**
(`CUSTOM-API-01`). Empty/commented sections are skipped automatically, so the shipped
`code-quality.md` and `design.md` templates never produce false findings until you fill
them in.

---

## The manifest

`enterprise/compliance_manifest.md` is the control file.

**Active Guidelines table** — only files listed here with `Active: true` are loaded:

```markdown
| Guideline File | Enforcement | Applies To | Active |
|:---------------|:------------|:-----------|:-------|
| security.md          | blocking | both           | true  |
| custom/your-rule.md  | blocking | both           | true  |
| code-quality.md      | advisory | implementation | false |
```

**Enforcement levels:**

| Level | Behavior |
|:------|:---------|
| **blocking** | Violations **stop** workflow progression. In autonomous mode they pause for you, tagged `[COMPLIANCE-BLOCK]`. Must be resolved. |
| **advisory** | **Reported** only; the workflow continues with documented acceptance. |

**Applies-to scope:** `spec` (checked at Gate #2), `implementation` (checked at Gate #3),
or `both`.

---

## How enforcement works

When `compliance_enabled: true` and at least one enforcement source exists, the
`enterprise-enforcer` officer auto-spawns at Stage 0 of a `/knowzcode:work` Tier 3 run and
rides through every gate:

| Stage / Gate | What the enforcer does |
|:--|:--|
| **Stage 0** | Loads the manifest + guidelines, broadcasts the "Compliance Posture", hands `SEC-*` IDs to the security-officer and `DSN-*` IDs to the frontend-designer. |
| **Stage 1 → Gate #2 (Specs)** | Maps each unit of work to applicable guidelines and **injects required VERIFY/ARC criteria into the specs**. Missing blocking criteria → `[COMPLIANCE-BLOCK-SPEC]`. |
| **Stage 2A (build)** | DMs builders working on guideline-relevant code with the exact requirements. |
| **Stage 2B → Gate #3 (Audit)** | Cross-references changed files, produces the canonical finding table with ARC coverage %, and issues `PASS` or `[COMPLIANCE-BLOCK]`. A blocking tag **pauses autonomous mode**. |
| **Phase 3 (finalize)** | Hands the audit summary to the closer, which appends it to `compliance_status.md`. |

**Fallback path.** When the enforcer is disabled (`--no-enterprise-enforcer`) or unavailable
(Tier 2 Light, Sequential Teams), per-agent compliance hooks in `reviewer`, `architect`,
`test-advisor`, and `security-officer` perform the checks inline instead.

---

## Configuration keys

All keys live in the manifest's `## Configuration` and `## MCP-Based Compliance` blocks.
Every key below is honored by the workflow (defaults in parentheses):

| Key | Default | Effect |
|:----|:--------|:-------|
| `compliance_enabled` | `false` | Master switch. |
| `skip_empty_guidelines` | `true` | Skip guideline files that are only commented templates. |
| `include_in_audit` | `true` | In a *general* `/knowzcode:audit`, run the compliance reviewer. (An explicit `/knowzcode:audit compliance` always runs regardless.) |
| `require_signoff_for_finalization` | `false` | Block Phase 3 finalization until blocking-tier compliance is resolved (Phase 3 "Compliance Sign-Off" gate). |
| `show_advisory_issues` | `true` | When false, gate/audit reports show blocking-tier findings only. |
| `mcp_compliance_enabled` | `false` | Enable vault-based standards + audit trails. |
| `compliance_vault_id` / `audit_trail_vault_id` | `""` | Enterprise vault(s) for standards and audit history. |
| `guideline_knowledge_ids` / `guideline_vault_sources` | `[]` | Pull guidelines from specific Knowz items/vaults. |
| `pull_standards_at_start` | `true` | Pull team-wide standards from the enterprise vault at workflow start. |
| `push_audit_results` | `true` | Push Phase 2B audit results to the audit-trail vault. |
| `push_completion_records` | `true` | Push WorkGroup completion records after Phase 3. |
| `preserve_guideline_provenance` | `true` | Record vault/KnowledgeId provenance in WorkGroup + reports. |

---

## Alternate guideline sources

You don't have to use the `guidelines/` folder. The enforcer also accepts:

- **A single `knowzcode/enterprise.md` file** — a lightweight way to drop in one set of
  rules without the folder structure.
- **MCP vault sources** — set `mcp_compliance_enabled: true` with a `compliance_vault_id`,
  or list specific `guideline_vault_sources` / `guideline_knowledge_ids`, to pull org-wide
  standards from Knowz vaults at kickoff (with provenance preserved and audit trails pushed
  back).

Any one of these is enough to activate enforcement.

---

## CI integration

For a deterministic, agent-free **spec-presence pre-screen** in a pipeline, use the bundled
scripts:

```bash
# Bash (Linux/macOS)
bash scripts/compliance-check.sh full      # or: spec | impl

# PowerShell (Windows)
pwsh -File scripts/compliance-check.ps1 -Scope full
```

They no-op (exit 0) unless `compliance_enabled: true`. Spec-tier checks verify each active
guideline's ARC criteria appear in `knowzcode/specs/`. Implementation-tier checks are
reported as **REVIEW** (deferred to the enforcer agent) rather than auto-passed — the static
script never claims an implementation is compliant when it can't actually tell. Exit code is
`1` on blocking **spec** violations (or on advisory violations under `KC_COMPLIANCE_STRICT=true` /
`-Strict`).

> **Scope caveat:** a green run means the spec-presence checks passed — it does **not** verify
> implementation-tier blocking rules (those emit REVIEW and never fail the build). Substantive
> implementation compliance requires the agent audit (`/knowzcode:work` with the
> `enterprise-enforcer`, or `/knowzcode:audit compliance`). Treat this script as a fast floor,
> not the whole gate.

---

## Platform notes

- **Claude Code** uses the `enterprise-enforcer` agent as the centralized owner.
- **Codex** has no separate agents; its coordinator owns enforcement directly (see
  `knowzcode/codex_execution.md`). All the config keys above behave identically.

---

## See also

- [`enterprise/compliance_manifest.md`](../knowzcode/enterprise/compliance_manifest.md) — the live control file and full key reference.
- [`enterprise/templates/guideline-template.md`](../knowzcode/enterprise/templates/guideline-template.md) — starting point for a new guideline.
- [`agents/enterprise-enforcer.md`](../agents/enterprise-enforcer.md) — the enforcer's full behavior spec.
- White-label config (`enterprise.json`) is a **separate** feature — brand name + MCP/API
  endpoints — not related to compliance guidelines.
