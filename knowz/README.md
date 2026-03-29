# knowz-skill

Knowz provides frictionless knowledge management via the Knowz MCP server.

Search, save, and query knowledge across vaults with automatic vault-aware routing.

## Packaging In This Repo

This repository now carries two Knowz packaging shapes:

- **Claude product source** in [`./`](./) with the existing Claude plugin files
- **Codex packaged plugin** in [`../plugins/knowz`](../plugins/knowz)

The Codex package is additive. It does not replace the Claude plugin source tree.

## Claude Installation

```bash
# From the marketplace
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowz@knowz-skills

# From local path
claude plugin install /path/to/knowz
```

## Codex Packaging

The Codex plugin package for Knowz lives at [`../plugins/knowz`](../plugins/knowz).

Important Codex details:

- Packaged skills live under `plugins/knowz/skills/`
- The plugin-local MCP manifest is `plugins/knowz/.mcp.json`
- Codex MCP auth/config is **shared Codex configuration** through `~/.codex/config.toml` or `codex mcp add`
- Codex API-key auth uses `bearer_token_env_var = "KNOWZ_API_KEY"` plus `http_headers = { X-Project-Path = "<absolute-project-path>" }`
- The Codex-facing `knowz-setup`, `knowz-register`, and `knowz-status` skills in the packaged plugin reflect that shared-config model

## Quick Start

### New users - create an account

```bash
/knowz register
/knowz status
```

### Existing users - configure MCP

```bash
/knowz setup kz_live_abc123
/knowz setup
```

For Codex, the setup flow should guide users toward shared MCP configuration rather than writing project-local `.mcp.json`.

Example Codex shared-config command:

```bash
codex mcp add knowz --url https://mcp.knowz.io/mcp --bearer-token-env-var KNOWZ_API_KEY
```

### Daily usage

```bash
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz search "authentication patterns"
/knowz browse
```

## Commands

| Command | Description |
|---------|-------------|
| `/knowz ask "question"` | AI-powered Q&A against configured vaults |
| `/knowz save "insight"` | Capture knowledge with auto-routing and formatting |
| `/knowz search "query"` | Semantic search across vaults |
| `/knowz browse [vault]` | Browse vault contents and topics |
| `/knowz setup [key]` | Configure MCP server and create or update `knowz-vaults.md` |
| `/knowz status` | Check MCP connection, vault health, and configuration |
| `/knowz register [--dev]` | Create account, configure MCP, and set up a vault |
| `/knowz flush` | Process pending captures queue |

## Setup

### `/knowz register` - full account setup

Creates a Knowz account, obtains an API key, configures MCP, and creates `knowz-vaults.md`.

### `/knowz setup` - MCP and vault configuration

If MCP is not connected, the skill guides the user through server configuration. Then it creates or updates `knowz-vaults.md` in the project root. This file tells the plugin:

- Which vaults to connect to
- When to query each vault
- When to save to each vault
- How to format saved content

Without a vault file, the plugin still works, but vault-scoped routing is reduced.

### `/knowz flush` - process pending captures

When MCP writes fail, captures are queued to `knowz-pending.md`. Run `/knowz flush` to sync them when MCP is available again.

## Auto-Trigger

When you have a `knowz-vaults.md` file, the plugin can:

- Search vaults when you ask questions matching "when to query" rules
- Offer to save insights matching "when to save" rules

For Codex, treat `knowz-auto` as a lightweight intent-routing skill. It may be surfaced automatically by Codex, but the package does not assume guaranteed background auto-execution.

## Vault File Format

See `knowz-vaults.example.md` for the full template. Key sections:

```markdown
### Vault Name
- **ID**: <vault-id>
- **Description**: What this vault contains
- **When to query**: Plain English rules for when to search this vault
- **When to save**: Plain English rules for when to save here
- **Content template**: Format for saved items
```

## Using With KnowzCode

The Knowz plugin works alongside the KnowzCode product:

```bash
/knowz register
/knowzcode:init
/knowzcode:work "feature"
/knowz save "insight"
```

Vault file interop: `/knowz setup` and `/knowz register` can update `knowzcode/knowzcode_vaults.md` when it exists.

## Enterprise Configuration

Enterprises that self-host the Knowz platform can customize endpoints and branding by creating an `enterprise.json` file in the plugin root:

```json
{
  "brand": "Acme Corp",
  "mcp_endpoint": "https://mcp.acme.internal/mcp",
  "api_endpoint": "https://api.acme.internal/api/v1"
}
```

All fields are optional. When absent, the plugin defaults to the Knowz cloud platform.

## Architecture

- **`/knowz` skill** - primary interface for explicit vault operations
- **`knowz-auto` skill** - lightweight intent routing for vault-relevant conversations
- **`knowledge-worker` agent** - handles complex multi-step research tasks in the Claude-oriented source product
- **`knowz-pending.md`** - offline queue for captures when MCP is unavailable
