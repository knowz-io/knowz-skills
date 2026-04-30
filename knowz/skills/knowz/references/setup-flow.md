# Setup Flow Reference

Detailed vault discovery, file creation, and routing logic for the `/knowz setup` action (Step S4 and beyond).

## Contents

1. [Step S4: Vault File Creation / Update](#step-s4-vault-file-creation--update)
2. [Smart Defaults for Routing Rules](#smart-defaults-for-routing-rules)
3. [Success Report Template](#success-report-template)

---

## Step S4: Vault File Creation / Update

**Precondition:** MCP is available. Call `mcp__knowz__list_vaults(includeStats: true)` to discover vaults.

### If `knowz-vaults.md` already exists

Read the existing file. Compare configured vaults against server vaults. Show what is configured vs available:

```
Current vault configuration:

Configured:
  - Engineering Knowledge (abc-123) — 42 items
  - Company Wiki (def-456) — 18 items

Available on server but not configured:
  - Personal Notes (ghi-789) — 7 items

Would you like to:
1. Add missing vaults to your configuration
2. Reconfigure from scratch
3. Keep current configuration
```

Use AskUserQuestion to get their choice. Update the file accordingly.

### If `knowz-vaults.md` does not exist

**Case A — server has vaults:** Present discovered vaults to the user:

```
Found {N} vault(s) on the Knowz server:

  1. {Vault Name} — {item count} items
     "{vault description}"

  2. {Vault Name} — {item count} items
     "{vault description}"

Which vaults would you like to connect to this project?
(Enter numbers, "all", or "none")
```

Use AskUserQuestion to get their selection. For each selected vault, ask (or infer from the vault description):
- Brief description of what this vault contains
- When to query it (plain English rules)
- When to save to it (plain English rules)

Generate `knowz-vaults.md` using the format from `knowz-vaults.example.md`. Write the file to the project root.

**Case B — server has NO vaults:** Offer to create one:

```
No vaults found on the Knowz server.

Would you like to create a vault for this project?
I can set up a general-purpose knowledge vault to get you started.

Suggested vault:
  Name: "{project-name} Knowledge"
  Description: "Architecture decisions, code patterns, conventions, and technical learnings for {project-name}"
```

Use AskUserQuestion for confirmation and to let user customize the name/description. If confirmed → call `mcp__knowz__create_vault(name, description)` to create it. Then generate `knowz-vaults.md` with the newly created vault and pre-populate sensible routing rules based on the vault description.

---

## Smart Defaults for Routing Rules

When generating rules for a vault, infer from the vault's name and description:

| Vault Signal | When to Query | When to Save |
|---|---|---|
| "Engineering Knowledge", "decisions" in description | Architecture decisions, conventions, "why did we...", best practices | Decisions about approach, new conventions, workarounds |
| "Company Wiki", "processes" in description | Team processes, onboarding, "how do we...", policies | New processes, policy changes, team structure updates |
| "patterns" or "code" in description | Code patterns, "how did we build...", implementation examples | Reusable patterns, workarounds, performance insights |
| No match | Generic rules | Ask the user to customize |

---

## Success Report Template

```
Vault configuration saved to knowz-vaults.md

Connected vaults:
  - {Vault Name} (query + save)
  - {Vault Name} (query only)

You can now use:
  /knowz ask "question"    — query your vaults
  /knowz save "insight"    — save to your vaults
  /knowz search "term"     — search across vaults
```
