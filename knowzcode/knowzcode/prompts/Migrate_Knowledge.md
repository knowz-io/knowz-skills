# KnowzCode: Migrate Knowledge

**Sources:** [List of source paths, patterns, or text]
**Format Override:** [auto|kc-v1|noderr|generic]
**Mode:** [normal|dry-run]
**Conflict Strategy:** [merge|overwrite|prompt]

> **Automation Path:** Invoke the `knowledge-migrator` agent for streamlined migration.

---

## Your Mission

You have been instructed to migrate external knowledge into KnowzCode spec format. This protocol handles legacy KnowzCode (v1.x), Noderr output, and generic markdown analysis.

**CRITICAL RULE: Preserve valuable information.** Never discard content that might be useful. When in doubt, include it with appropriate markers for later review.

**Reference:** Your actions are governed by the spec template in `knowzcode/knowzcode_loop.md`.

---

## Extraction Rules by Format

### KnowzCode v1.x

**Detection Markers:**
```
## Node Specification:
**NodeID:** {value}
## ARC Criteria
**Type:** Component|UseCase
```

**Field Mapping:**

| v1.x Field | KnowzCode Section |
|------------|--------------|
| `**NodeID:**` | Filename (knowzcode/specs/{NodeID}.md) |
| `## Purpose` / `## Overview` | Rules & Decisions |
| `## Dependencies` | Rules & Decisions (convert to bullet list with context) |
| `## Interfaces` / `## API` | Interfaces |
| `## Implementation` / `## Logic` | Rules & Decisions |
| `## Data` / `## Models` | Interfaces (as contracts) |
| `## ARC Criteria` / `## Verification` | Verification Criteria (VERIFY: format) |
| `## Tech Debt` / `## Issues` | Debt & Gaps |

**Transformation Rules:**
1. Convert bullet lists to markdown tables where appropriate
2. Preserve code blocks exactly as-is
3. Update date fields to current timestamp
4. Add `[MIGRATED]` marker to Tech Debt section

---

### Noderr Format

**Detection Markers:**
```
## Component: {name}
## Service: {name}
### Dependencies
{
  "type": "component|service",
  "name": "...",
  "dependencies": [...]
}
```

**Field Mapping:**

| Noderr Field | KnowzCode Section |
|--------------|--------------|
| `name` / `## Component:` | NodeID (with prefix inference) |
| First paragraph / `description` | Rules & Decisions |
| `dependencies` / `### Dependencies` | Rules & Decisions (as context bullets) |
| `inputs` / `## Inputs` | Interfaces → Inputs |
| `outputs` / `## Outputs` | Interfaces → Outputs |
| `logic` / `## Process` | Rules & Decisions |
| `schema` / `## Data` | Interfaces (as contracts) |
| — | Verification Criteria (VERIFY: format, generate placeholders) |
| `issues` / `## Known Issues` | Debt & Gaps |

**NodeID Prefix Inference from Noderr:**

| Noderr Type | Inferred Prefix |
|-------------|-----------------|
| `component` with `ui` in name/path | `UI_` |
| `component` otherwise | `SVC_` |
| `service` | `SVC_` |
| `api` / `endpoint` | `API_` |
| `model` / `data` | `DB_` |
| `utility` / `helper` | `LIB_` |
| `config` | `CONFIG_` |
| `flow` / `workflow` | `UC_` |

---

### Generic Markdown

**Detection:** Fallback when no specific format markers found.

**Entity Extraction Heuristics:**

1. **Component Names** (scan for):
   - Capitalized multi-word phrases in headers: `## User Authentication`
   - Capitalized references in body: "The `AuthService` handles..."
   - Function/class references: `class UserManager`, `function handleLogin`

2. **Relationships** (scan for patterns):
   - "X depends on Y" → Dependency
   - "X calls Y" → Dependency
   - "X uses Y" → Dependency
   - "X is responsible for Y" → Purpose description
   - "X handles Y" → Purpose description
   - "X returns Y" → Output interface

3. **Type Inference** (from keywords):

   | Keywords in Context | Inferred Type |
   |---------------------|---------------|
   | button, form, component, page, modal, dialog | `UI_` |
   | endpoint, route, REST, GraphQL, API | `API_` |
   | service, handler, processor, worker, manager | `SVC_` |
   | model, schema, table, entity, record | `DB_` |
   | util, helper, lib, format, parse, validate | `LIB_` |
   | config, settings, env, options | `CONFIG_` |
   | flow, journey, process, workflow, use case | `UC_` |

4. **ARC Criteria Generation** (when not present):
   - Generate 3-5 testable criteria based on extracted purpose
   - Format: "[ ] {Action verb} {expected behavior}"
   - Examples:
     - "[ ] Returns valid JWT token on successful authentication"
     - "[ ] Displays error message when validation fails"
     - "[ ] Persists data to database within 100ms"

---

## Consolidation Decision Tree

```
FOR EACH extracted NodeID:
│
├─► Does knowzcode/specs/{NodeID}.md exist?
│   │
│   ├─► NO: Create new spec
│   │
│   └─► YES: Compare content
│       │
│       ├─► Identical? → Skip (log: "already up-to-date")
│       │
│       ├─► Existing is SUBSET of new? → Merge (add new sections)
│       │
│       ├─► New is SUBSET of existing? → Skip (log: "existing is more complete")
│       │
│       └─► Divergent content?
│           │
│           ├─► Strategy = merge → Merge with [MIGRATED] markers
│           │
│           ├─► Strategy = overwrite → Replace entirely
│           │
│           └─► Strategy = prompt → Ask user
│               │
│               ├─► User: "merge" → Merge with markers
│               ├─► User: "overwrite" → Replace
│               ├─► User: "skip" → Skip this NodeID
│               └─► User: "abort" → Stop migration
```

---

## Spec Completeness Assessment

Before merging, assess completeness of both sources:

| Section | Weight | Complete If |
|---------|--------|-------------|
| Rules & Decisions | 35 | >150 characters, includes purpose, key decisions, or constraints |
| Interfaces | 25 | Inputs/Outputs defined OR dependency context provided |
| Verification Criteria | 25 | At least 3 VERIFY: statements present |
| Debt & Gaps | 15 | Any content present |

**Score Calculation:**
- Sum weights of complete sections
- Score 0-100

**Comparison:**
- `new_score > existing_score + 10` → New is significantly better
- `existing_score > new_score + 10` → Existing is significantly better
- Otherwise → Comparable, merge recommended

---

## Template Application Instructions

When generating a spec, follow this exact structure:

```markdown
# {NodeID}: {Human-Readable Name}

**Updated:** {timestamp}
**Status:** Migrated
**Migrated From:** {source_path} ({source_format} format)

## Rules & Decisions
- [Extracted purpose, constraints, and key decisions from source]
- [Dependencies context: "Requires X for Y functionality"]
- [Implementation rules: "Must use pattern X because Y"]
- [Migrated from: {source_path} ({source_format} format)]

## Interfaces
**Inputs:**
- [Extracted inputs OR "Inputs to be documented"]

**Outputs:**
- [Extracted outputs OR "Outputs to be documented"]

**Dependencies:**
- [Extracted dependencies with context OR "Dependencies to be documented"]

{Preserve any code blocks from source showing API contracts or data structures}

## Verification Criteria
- VERIFY: [Testable assertion extracted or inferred from source]
- VERIFY: [Testable assertion extracted or inferred from source]
- VERIFY: [Testable assertion extracted or inferred from source]

{If no criteria extracted, generate 3-5 placeholders based on purpose:}
- VERIFY: Component initializes without errors
- VERIFY: Primary function executes successfully
- VERIFY: Error handling covers edge cases

## Debt & Gaps
- TODO: Review migrated spec for accuracy
- TODO: Verify all extracted information matches current codebase
- [MIGRATED] Migrated from {format} format on {date}

{Any additional extracted tech debt items}
```

---

## Output Artifacts

### 1. Specs (unless dry-run)
Location: `knowzcode/specs/{NodeID}.md`

### 2. Migration Report
Location: `knowzcode/planning/migration-{YYYYMMDD-HHMMSS}.md`

Content:
- Summary statistics
- Full NodeID extraction table
- Conflict resolution log
- Warnings and issues
- Next steps checklist

### 3. Log Entry (unless dry-run)
Location: `knowzcode/knowzcode_log.md` (prepend)

Format:
```markdown
---
**Type:** Migration
**Timestamp:** {timestamp}
**NodeID(s):** {comma-separated}
**Logged By:** knowledge-migrator
**Details:**
- **Sources:** {count} processed
- **Format:** {format(s)}
- **Created:** {n} specs
- **Updated:** {n} specs
- **Report:** {report_path}
---
```

---

## Final Report Format

After completing migration:

```markdown
✓ Migration completed.

**Summary:**
- Sources: {n} files processed
- Format: {detected format(s)}
- Created: {n} new specs
- Updated: {n} existing specs
- Skipped: {n} (already complete or identical)

**Report:** knowzcode/planning/migration-{timestamp}.md

**Next Steps:**
1. Review migrated specs for accuracy
2. Run a spec audit to validate completeness
3. Update any `[NEEDS_REVIEW]` markers

Awaiting next goal.
```
