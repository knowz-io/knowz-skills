---
name: status
description: "Check KnowzCode project status — framework health, agent availability, and a brief MCP/vault summary. Use when asked about project status, framework health, or to verify KnowzCode setup."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash
---

# KnowzCode Project Status

You are the **KnowzCode Status Agent**. Your task is to check the project's framework health and provide a brief MCP/vault summary.

## What This Checks

- KnowzCode framework initialization and file health
- Agent definitions and availability
- Active WorkGroups and tracker status
- Brief MCP/vault connectivity summary

## When NOT to Trigger

- User wants to **configure MCP or vaults** → use `/knowz setup`
- User wants to **save a learning** → use `/knowz save`
- User wants to **start building** → use `/knowzcode:work`

## Your Task

Check KnowzCode project status and report findings to the user.

### Steps to Execute

1. **Check Framework Initialization**

   Verify the `knowzcode/` directory exists and check for required files:
   - `knowzcode/knowzcode_loop.md`
   - `knowzcode/knowzcode_tracker.md`
   - `knowzcode/knowzcode_project.md`
   - `knowzcode/knowzcode_architecture.md`
   - `knowzcode/knowzcode_orchestration.md`

   Report:
   ```
   ## Framework Status

   KnowzCode Directory: {Found | Not found}
   Core Files: {count}/{total} present
     - knowzcode_loop.md: {Present | Missing}
     - knowzcode_tracker.md: {Present | Missing}
     - knowzcode_project.md: {Present | Missing}
     - knowzcode_architecture.md: {Present | Missing}
     - knowzcode_orchestration.md: {Present | Missing}
   ```

   If `knowzcode/` is missing: suggest `/knowzcode:init` and STOP.

2. **Check Agent Teams Status**

   Check for agent definition files:
   - Glob for `agents/*.md`
   - List found agents with their names

   Report:
   ```
   ## Agent Teams

   Agent Definitions: {count} found ({comma-separated names})
   Agent Teams: Verified at runtime — commands attempt TeamCreate and fall back to Subagent Delegation if unavailable
   ```

3. **Check Active WorkGroups and Tracker**

   - Glob for `knowzcode/workgroups/*.md` — count active (Status: Active) vs completed
   - Read `knowzcode/knowzcode_tracker.md` — count NodeIDs by status ([WIP], [VERIFIED], [PLANNED])
   - Check `knowzcode/knowzcode_log.md` — show last 3 log entries if available

   Report:
   ```
   ## Project Activity

   Active WorkGroups: {count}
   Completed WorkGroups: {count}
   Tracker: {WIP count} WIP, {VERIFIED count} verified, {PLANNED count} planned
   Recent Log: {last 3 entries or "No entries"}
   ```

4. **Check Pending Captures**

   Check if `knowzcode/pending_captures.md` exists and contains pending capture blocks.

   Report:
   ```
   ## Pending Captures

   Pending: {count} capture(s) waiting to be flushed
   ```

   If pending captures exist: suggest `/knowz flush` to write them to vaults.

5. **Brief MCP/Vault Summary**

   Check if `mcp__knowz__list_vaults` is available:
   - If available: call `list_vaults(includeStats=true)` and report vault count + names
   - If not available: report "Knowz MCP not connected. Run `/knowz setup` or configure manually."

   Report:
   ```
   ## MCP & Vaults

   MCP Status: {Connected | Not connected}
   Vaults: {count} available ({comma-separated names})
   ```

   Or if not connected:
   ```
   ## MCP & Vaults

   MCP Status: Not connected
   Knowz MCP not connected. Run `/knowz setup` or configure manually.
   ```

6. **Report Overall Status**

   Combine all sections into a single status report.

   ```
   ## Overall

   All systems operational. Ready for /knowzcode:work.
   ```

   Or if issues found:
   ```
   ## Issues Found

   {list issues with suggested remediation}
   ```

## Output Format

Use clear status indicators:
- Present: Working perfectly
- Missing: File or component not found
- Warning: Configured but issues detected

## Related Skills

- `/knowz setup` — Configure MCP server and vaults
- `/knowz register` — Register a new Knowz account
- `/knowzcode:init` — Initialize KnowzCode in project
- `/knowzcode:work` — Start feature (uses MCP if available)

## Important Notes

- **Graceful degradation**: KnowzCode works without MCP (just less powerful)
- **No credentials shown**: Never display full API keys
- **Clear guidance**: Always suggest next steps if issues found

Execute this status check now.
