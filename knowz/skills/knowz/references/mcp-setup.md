# MCP Server Configuration Reference

## Enterprise Configuration

Before using any endpoints below, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json`). If present, use its `mcp_endpoint` value instead of the production/development endpoints listed here. If absent, use the defaults below.

## Server Details

| Property | Value |
|----------|-------|
| **Protocol** | HTTP transport with JSON-RPC |
| **Production endpoint** | `https://mcp.knowz.io/mcp` |
| **Development endpoint** | `https://mcp.dev.knowz.io/mcp` |
| **Authentication** | Bearer token or OAuth dynamic discovery |
| **Project context** | `X-Project-Path` header |

## Authentication Methods

### API Key

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

```bash
claude mcp add --transport http \
  --scope <local|project|user> \
  knowz \
  <endpoint-url> \
  --header "X-Project-Path: $(pwd)"
```

On first tool call after restart, the server returns `401 + WWW-Authenticate` and Claude Code opens a browser for login.

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

| Scope | Storage | Visibility | Best For |
|-------|---------|------------|----------|
| **local** (default) | Claude Code internal | Only you, this project | Personal development |
| **project** | `.mcp.json` (git) | Team via git | Shared team key |
| **user** | Claude Code user config | Only you, all projects | Personal, multi-project |

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
   - `.gemini/settings.json` → `mcpServers.knowz.authProviderType` (OAuth) or `mcpServers.knowz.headers.Authorization` (API key)
   - `~/.gemini/settings.json` → same
   - `.vscode/mcp.json` → `servers.knowz.headers`

3. **KnowzCode vault config** (if present):
   - `knowzcode/knowzcode_vaults.md` — if vaults have non-empty IDs, note for interop

If a key is discovered, offer to reuse:
```
Found existing API key (ending ...{last4}) in {source}. Use this key? [Yes/No]
```

If OAuth config found in another platform:
```
Found existing OAuth configuration in {source}.
Would you like to configure Claude Code with OAuth as well? [OAuth (recommended)] [API Key] [Skip]
```

## CLI Commands Reference

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
required before Claude Code can use a newly configured or re-authenticated
MCP server — this is a platform limitation, not a bug.

To authenticate:
  Claude Code: Restart Claude Code — browser will open on first tool call
  Gemini CLI: Run /mcp auth knowz to re-authenticate via browser

If the problem persists:
  - Re-configure: /knowz setup --oauth
  - Or switch to API key (no browser login or token refresh needed): /knowz setup <api-key>
```

### API Key Invalid
```
Authentication failed. The API key appears to be invalid or expired.

Get a new key at: https://knowz.io/api-keys
Or switch to OAuth (no key needed): /knowz setup --oauth
```

### Already Configured
```
Knowz MCP server is already configured.
Current scope: <scope>

Do you want to reconfigure? [Yes/No]
```
If yes, run `CLAUDECODE= claude mcp remove knowz` first.

### Claude CLI Not Available
```
Cannot configure MCP server — the 'claude' CLI command is not available.
Please restart Claude Code or report this issue.
```

### Network/Connection Error
```
Cannot reach Knowz MCP server at {endpoint}.
Check your internet connection and try again.
```
