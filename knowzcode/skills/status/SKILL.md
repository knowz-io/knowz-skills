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
- Cross-agent relay host, target resolution, readiness, configuration, and active state
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

   If `knowzcode/` is missing: suggest `/knowzcode:setup` and STOP.

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

5. **Check Cross-Agent Relay**

   Read the provider-neutral procedures in `knowzcode/skills/work/references/relay-execution.md` and the `relay*` keys in `knowzcode/knowzcode_orchestration.md` if present.

   **Determine host from the active platform package, not installed binaries:**

   - Claude Code skill → `RELAY_HOST=claude`
   - Codex skill/plugin → `RELAY_HOST=codex`
   - Gemini/other → unsupported relay host; report native-only and do not probe or offer relay

   Parse `relay:` as `none|auto|other|claude|codex` (default `none`) and resolve its configuration-only meaning:

   - `none` → native Phase 2A; the opposite provider may still be probed as a disabled candidate
   - `auto` or `other` → opposite supported provider
   - `claude` or `codex` → literal target
   - invalid value → Warning and native Phase 2A

   A concrete target equal to `RELAY_HOST` is a stale same-host configuration. Report a Warning: ordinary `/knowzcode:work` will visibly fall back to native Phase 2A, while an explicit same-host flag or natural-language delegation would halt. Never reverse it silently; suggest `relay: other` or the actual external provider.

   **Probe the external provider:** use the resolved external target, or the opposite-provider candidate when relay is `none`. Skip the probe for invalid same-host config and unsupported hosts.

   - Codex: `command -v codex` → `codex --version` → `codex login status`
   - Claude: `command -v claude` → `claude --version` → `claude auth status --json`

   For Claude auth, use the command's exit code and parse only `.loggedIn` plus non-identifying method/provider fields. Never display or persist raw auth JSON, email, organization name/ID, tokens, or keys. Normalize both providers to `ready`, `installed-unauthed`, `not-installed`, or `broken-install` and provide `codex login` / `claude auth login` or install/reinstall guidance as applicable. Authentication problems are warnings that will pause a relay even in autonomous mode.

   **Resolve target configuration:**

   - Shared: `relay_transport` (default `auto`), `relay_max_fix_rounds` (default `2`), `relay_timeout_minutes` (default `45`)
   - Codex target: `relay_codex_model`, `relay_codex_effort`, `relay_codex_fix_effort`, `relay_codex_sandbox`. For v0.20 compatibility only, fall back respectively to `relay_model`, `relay_effort`, `relay_fix_effort`, and `relay_sandbox` when a provider-qualified key is absent.
   - Claude target: `relay_claude_model`, `relay_claude_effort`, `relay_claude_fix_effort`, `relay_claude_permission_mode`. Never use Codex legacy values as Claude defaults. Flag `bypassPermissions` as unsafe configuration and report that `dontAsk` is the safe default with the protocol's bounded tool allowlist and strict Bash sandbox.
   - If target is Claude and transport is `mcp`, warn that Claude MCP is not an agent relay and `auto` or `exec` is required.

   **Check active relay state:** for active WorkGroups with a `## Relay` section, read `{wgid}-relay/state.md`. Report schema-2 Host, Target, State, Round, and whether a Session ID is present (do not print the identifier). For legacy state with `Mode: codex` and no Schema, report `claude → codex`, append `legacy schema 1`, and map `CODEX_*` / `CLAUDE_TAKEOVER` to their role-based meaning per `/knowzcode:continue`. State host/target remains authoritative for continuation even if project config has since changed.

   Report:

   ```
   ## Cross-Agent Relay

   Host: {claude | codex | gemini/other — native-only}
   Selector: relay: {none | auto | other | claude | codex | invalid}
   Resolved Target: {claude | codex | native Phase 2A | invalid same-host}
   Target Detection: {ready (vX.Y.Z, authenticated) | installed-unauthed | not-installed | broken-install | not run}
   Target Config: {provider-specific model, effort/fix effort, permission mode or sandbox}; transport={value}; fix rounds={N}; timeout={N}m
   Active State: {none | wgid — host → target, state, round N, session present|pending [legacy schema 1]}
   ```

   Guidance and warnings:

   - `relay: none` + candidate ready: `Enable portably with /knowzcode:relay or set relay: other.`
   - Automatically/configured unavailable target: warn that ordinary work may visibly fall back to native Phase 2A.
   - Explicit unavailable intent cannot be known from a status-only check; remind that explicit requests stop with remediation.
   - Any active-state/config mismatch: show both; do not mutate either during status.
   - Gemini: `Relay is native-only on Gemini in this version; relay configuration is informational.`

6. **Brief MCP/Vault Summary**

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

7. **Report Overall Status**

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
- `/knowzcode:setup` — Initialize KnowzCode in project
- `/knowzcode:work` — Start feature (uses MCP if available)

## Important Notes

- **Graceful degradation**: KnowzCode works without MCP (just less powerful)
- **No credentials shown**: Never display full API keys
- **Clear guidance**: Always suggest next steps if issues found

Execute this status check now.
