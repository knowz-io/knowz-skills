# MCP Server Configuration Reference

## Contents

1. [Enterprise Configuration](#enterprise-configuration)
2. [Server Details](#server-details)
3. [Protocol Compatibility](#protocol-compatibility)
4. [Authentication Methods](#authentication-methods)
5. [Scope Options](#scope-options)
6. [Smart Config Discovery](#smart-config-discovery)
7. [CLI Commands Reference](#cli-commands-reference)
8. [Error Handling](#error-handling)

---

## Enterprise Configuration

Before using any endpoints below, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json`). If present, use its `mcp_endpoint` value instead of the production/development endpoints listed here. If absent, use the defaults below.

## Server Details

| Property | Value |
|----------|-------|
| **Protocol** | MCP over Streamable HTTP (`--transport http`), revisions `2024-11-05` through `2026-07-28` |
| **Production endpoint** | `https://mcp.knowz.io/mcp` |
| **Development endpoint** | `https://mcp.dev.knowz.io/mcp` |
| **Authentication** | Bearer token or OAuth dynamic discovery |
| **Project context** | `X-Project-Path` header |

## Protocol Compatibility

The Knowz MCP server speaks every MCP protocol revision a client may use. The client chooses the
revision; no configuration change is needed when a client upgrades.

| Client speaks | How it connects | What it gets |
|---------------|-----------------|--------------|
| `2026-07-28` (stateless, sometimes called "MCP 2.0") | No handshake. Every request carries its protocol version, client capabilities and credentials. `server/discover` is available. | `resultType` on every result; `tools/list` marked cacheable for 5 minutes, scope `private` |
| `2025-11-25`, `2025-06-18`, `2025-03-26`, `2024-11-05` | `initialize` handshake. The `Mcp-Session-Id` the server returns is optional. | Same tools and results as before |
| Deprecated HTTP+SSE transport (`/sse`) | Older clients only | Still served; new configs must use `--transport http` on `/mcp` |

Rules that follow from this:

- **Always configure credentials on the server entry** (OAuth, or the `Authorization` header).
  Under `2026-07-28` there is no session to fall back on: every request authenticates on its own.
- **Use `--transport http`**, never `sse`. The endpoint is `<base>/mcp`.
- **A new Knowz tool can take up to 5 minutes to appear** in a `2026-07-28` client, which may reuse a
  cached tool list for that long. Restarting the client refreshes it at once.
- **Long-running amends stay tool-based**: call `amend_knowledge_async` and poll
  `get_amend_request_status`. The server does not offer the optional `io.modelcontextprotocol/tasks`
  extension, so do not wait for task notifications.
- **Proxies and gateways in front of the server must forward the MCP headers** unchanged:
  `MCP-Protocol-Version`, `Mcp-Method`, `Mcp-Name` and `Authorization`. A `2026-07-28` request
  without matching `Mcp-Method` / `Mcp-Name` headers is rejected.
- The local, offline `knowz mcp serve` (stdio, from the knowz CLI) supports the same revisions.

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

1. **Claude OAuth / marketplace connect**: prefer Claude's OAuth or marketplace connect flow. Never scrape secrets from the local machine.

2. **Cross-platform config files** (check for API key or OAuth):
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

Get a new key at: https://app.knowz.io/settings/api-keys
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

### Protocol Version Errors

| Symptom | Meaning | Fix |
|---------|---------|-----|
| JSON-RPC error `-32022` (Unsupported protocol version), `data.supported` lists versions | The client asked for a revision this server does not speak | Update the MCP client, or the self-hosted Knowz MCP image if `data.supported` lacks the client's revision |
| JSON-RPC error `-32020` (header mismatch), HTTP 400 | `Mcp-Method` / `Mcp-Name` headers are missing or do not match the request body | A proxy in between is stripping or rewriting headers; let them through unchanged |
| JSON-RPC error `-32601` for `initialize` or `ping` | A `2026-07-28` request used a method that revision removed | Client bug: a `2026-07-28` client must not send them. Older clients are unaffected |
| HTTP 405 on `GET /mcp` | Expected: the server keeps no stream open; `2026-07-28` replaced it with `subscriptions/listen` | None. Clients fall back automatically |

```
Knowz MCP rejected the protocol version ({code}).
Supported: {data.supported}

Update your MCP client (or the Knowz MCP image on self-hosted installs), then restart it.
```

### Network/Connection Error
```
Cannot reach Knowz MCP server at {endpoint}.
Check your internet connection and try again.
```
