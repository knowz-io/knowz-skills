# MCP Server Configuration Reference

## Contents

1. [Enterprise Configuration](#enterprise-configuration)
2. [Host CLI](#host-cli)
3. [Server Details](#server-details)
4. [Authentication Methods](#authentication-methods)
5. [Scope Options](#scope-options)
6. [Smart Config Discovery](#smart-config-discovery)
7. [CLI Commands Reference](#cli-commands-reference)
8. [Error Handling](#error-handling)

---

## Enterprise Configuration

Before using any endpoints below, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json` or `.grok-plugin/plugin.json`). If present, use its `mcp_endpoint` value instead of the production/development endpoints listed here. If absent, use the defaults below.

## Host CLI

Detect which agent is hosting this skill, then use **that** host's MCP commands for the rest of this file. Do not run Claude commands from Grok, or Grok commands from Claude.

| Host | Detect | Add | List / get | Remove |
|------|--------|-----|------------|--------|
| **Grok Build** | `command -v grok` succeeds, or this session is Grok Build | `grok mcp add --transport http --scope <user\|project> knowz <endpoint-url> [--header "..."]` | `grok mcp list` | `grok mcp remove knowz` |
| **Claude Code** | `command -v claude` succeeds, or this session is Claude Code | `claude mcp add --transport http --scope <local\|project\|user> knowz <endpoint-url> --header "..."` | `CLAUDECODE= claude mcp get knowz` / `claude mcp list` | `CLAUDECODE= claude mcp remove knowz` |

If both CLIs are on PATH, prefer the host of the current session (Grok Build vs Claude Code). If neither CLI is available, report that the host MCP CLI is missing and stop.

Grok scopes: `user` writes `~/.grok/config.toml` (all projects); `project` writes `./.grok/config.toml` (this repo). There is no `local` scope — map Claude `local` to Grok `user`.

When this plugin is installed and trusted in Grok, `.mcp.json` already registers `https://mcp.knowz.io/mcp` (OAuth on first tool call). Only run `grok mcp add` when that server is missing, the user wants an API key, a `--dev` / `--endpoint` override, or an `X-Project-Path` header.

## Server Details

| Property | Value |
|----------|-------|
| **Protocol** | HTTP transport with JSON-RPC |
| **Production endpoint** | `https://mcp.knowz.io/mcp` |
| **Development endpoint** | `https://mcp.dev.knowz.io/mcp` |
| **Authentication** | Bearer token or OAuth dynamic discovery |
| **Project context** | `X-Project-Path` header |

## Authentication Methods

Use the [Host CLI](#host-cli) detected above. Examples below show both hosts.

### API Key

**Grok Build:**

```bash
grok mcp add --transport http \
  --scope <user|project> \
  knowz \
  <endpoint-url> \
  --header "Authorization: Bearer <api-key>" \
  --header "X-Project-Path: $(pwd)"
```

**Claude Code:**

```bash
claude mcp add --transport http \
  --scope <local|project|user> \
  knowz \
  <endpoint-url> \
  --header "Authorization: Bearer <api-key>" \
  --header "X-Project-Path: $(pwd)"
```

### OAuth (recommended)

No API key required — authentication happens via browser on first use.

**Grok Build:**

```bash
grok mcp add --transport http \
  --scope <user|project> \
  knowz \
  <endpoint-url> \
  --header "X-Project-Path: $(pwd)"
```

**Claude Code:**

```bash
claude mcp add --transport http \
  --scope <local|project|user> \
  knowz \
  <endpoint-url> \
  --header "X-Project-Path: $(pwd)"
```

On first tool call after restart, the server returns `401 + WWW-Authenticate` and the host opens a browser for login.

### Gemini CLI Configuration

**OAuth:**
```json
{ "mcpServers": { "knowz": { "httpUrl": "<endpoint>", "authProviderType": "dynamic_discovery" } } }
```
Write to `.gemini/settings.json`. After writing, instruct: `Run /mcp auth knowz in Gemini CLI to complete authentication.`

**API Key:**
```json
{
  "mcpServers": {
    "knowz": {
      "httpUrl": "<endpoint>",
      "headers": {
        "Authorization": "Bearer <api-key>",
        "X-Project-Path": "<project_path>"
      }
    }
  }
}
```

## Scope Options

| Scope | Claude storage | Grok storage | Visibility | Best For |
|-------|----------------|--------------|------------|----------|
| **local** (Claude default) | Claude Code internal | n/a — use `user` | Only you, this project | Personal development |
| **user** (Grok default) | Claude Code user config | `~/.grok/config.toml` | Only you, all projects | Personal, multi-project |
| **project** | `.mcp.json` (git) | `./.grok/config.toml` | Team via git | Shared team key |

### Security Warning for Project Scope

If `--scope project` is selected:
```
Security Note: Project Scope Selected

With project scope, your API key will be stored in .mcp.json
which is typically committed to git.

This is appropriate for:
  - Team/shared API keys
  - CI/CD automation keys

For personal keys, consider using --scope local (default)
```

## Smart Config Discovery

Before prompting for an API key, check known config sources in order:

1. **Environment variable**: `KNOWZ_API_KEY`
   - If set: use as API key, display "Using API key from KNOWZ_API_KEY (ending ...{last4})"

2. **Cross-platform config files** (check for API key or OAuth):
   - `~/.grok/config.toml` → `[mcp_servers.knowz]`
   - `./.grok/config.toml` → same
   - `.gemini/settings.json` → `mcpServers.knowz.authProviderType` (OAuth) or `mcpServers.knowz.headers.Authorization` (API key)
   - `~/.gemini/settings.json` → same
   - `.vscode/mcp.json` → `servers.knowz.headers`

If a key is discovered, offer to reuse:
```
Found existing API key (ending ...{last4}) in {source}. Use this key? [Yes/No]
```

If OAuth config found in another platform:
```
Found existing OAuth configuration in {source}.
Would you like to configure this host with OAuth as well? [OAuth (recommended)] [API Key] [Skip]
```

## CLI Commands Reference

**Grok Build:**

```bash
grok mcp add --transport http --scope <user|project> knowz <endpoint> --header "..."
grok mcp list
grok mcp remove knowz
```

**Claude Code:**

```bash
# Add MCP server
claude mcp add --transport http --scope <scope> knowz <endpoint> --header "..."

# Check existing config
CLAUDECODE= claude mcp get knowz

# Remove existing config
CLAUDECODE= claude mcp remove knowz

# List all MCP servers
claude mcp list
```

## Error Handling

### OAuth Authentication Required
```
OAuth authentication needed.

This is expected if:
  - First-time setup — you haven't completed browser login yet
  - Token expired — your OAuth session needs renewal

Important: MCP servers only connect at session startup. A restart is
required before the host can use a newly configured or re-authenticated
MCP server — this is a platform limitation, not a bug.

To authenticate:
  Grok Build: Start a new Grok session — browser will open on first tool call
  Claude Code: Restart Claude Code — browser will open on first tool call
  Gemini CLI: Run /mcp auth knowz to re-authenticate via browser

If the problem persists:
  - Re-configure: /knowz setup --oauth
  - Or switch to API key (no browser login or token refresh needed): /knowz setup <api-key>
```

### API Key Invalid
```
Authentication failed. The API key appears to be invalid or expired.

Get a new key at: https://app.knowz.io/settings/api-keys
Or switch to OAuth (no key needed): /knowz setup --oauth
```

### Already Configured
```
Knowz MCP server is already configured.
Current scope: <scope>

Do you want to reconfigure? [Yes/No]
```
If yes, run the host **Remove** command from [Host CLI](#host-cli) first.

### Host CLI Not Available
```
Cannot configure MCP server — the host MCP CLI is not available.
Grok Build: ensure `grok` is on PATH, then retry.
Claude Code: restart Claude Code, or report this issue.
```

### Network/Connection Error
```
Cannot reach Knowz MCP server at {endpoint}.
Check your internet connection and try again.
```
