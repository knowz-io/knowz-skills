# Knowz Vault Routing Template

Use this structure when generating the project-root `knowz-vaults.md`:

```markdown
# Knowz Vaults

## Vaults

### {Vault Name}
- **ID**: {vault-id-from-server}
- **Description**: {what this vault contains}
- **When to query**:
  - {plain-language query rule}
- **When to save**:
  - {plain-language capture rule}

## Defaults

- **Default vault**: {Vault Name}
- **Content principle**: Every saved item must be self-contained and detailed enough to remain useful when retrieved later.

## Trust & Freshness

Vault entries are point-in-time notes and may be stale, superseded, or wrong. Treat retrieved knowledge as leads to verify, not ground truth:

- Check it against the live codebase, tests, current documentation, and the user's stated intent.
- Prefer current evidence when it conflicts with a vault entry, and surface the conflict.
- Weigh an entry's age when it affects a decision.
```
