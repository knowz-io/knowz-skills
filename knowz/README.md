# knowz-skill

A Claude Code plugin for frictionless knowledge management via the Knowz MCP server.

Search, save, and query knowledge across vaults — with automatic vault-aware routing.

## Installation

```bash
# From the marketplace
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowz@knowz-skills

# From local path
claude plugin install /path/to/knowz
```

## Quick Start

### New users — create an account

```bash
/knowz register            # create account + configure MCP + set up vault
# restart Claude Code
/knowz status              # verify connection
```

### Existing users — configure MCP

```bash
/knowz setup kz_live_abc123    # configure with API key
# or
/knowz setup --oauth           # configure with OAuth
# restart Claude Code
/knowz setup                   # create vault configuration file
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
| `/knowz setup [key] [--oauth]` | Configure MCP server + create/update `knowz-vaults.md` |
| `/knowz status` | Check MCP connection, vault health, and configuration |
| `/knowz register [--dev]` | Create account, configure MCP, set up vault |
| `/knowz flush` | Process pending captures queue |

## Setup

### `/knowz register` — Full account setup

Creates a Knowz account, generates an API key, configures the MCP server, and creates `knowz-vaults.md` — all in one flow. Best for new users.

### `/knowz setup` — MCP + vault configuration

If MCP is not connected, guides you through server configuration (API key or OAuth). Then creates or updates `knowz-vaults.md` in your project root. This file tells the plugin:
- Which vaults to connect to
- When to query each vault (routing rules)
- When to save to each vault
- How to format saved content (templates)

Without a vault file, the plugin still works — it just won't scope operations to specific vaults or auto-trigger on relevant conversations.

### `/knowz flush` — Process pending captures

When MCP writes fail (server unreachable, auth expired), captures are queued to `knowz-pending.md`. Run `/knowz flush` to sync them when MCP is available again.

## Auto-Trigger

When you have a `knowz-vaults.md` file, the plugin automatically:
- **Searches vaults** when you ask questions matching "when to query" rules (e.g., "why did we choose PostgreSQL?")
- **Offers to save** when you share insights matching "when to save" rules (e.g., "we decided to use UTC everywhere")

This happens transparently during normal conversation — no need to explicitly use `/knowz`.

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

## Using with KnowzCode

The knowz plugin works alongside the KnowzCode plugin (`knowzcode`) for teams using the KnowzCode development methodology:

```bash
claude plugin install knowzcode
claude plugin install knowz
/knowz register            # configure MCP
# restart
/knowzcode:init            # initialize KC project
/knowzcode:work "feature"  # KC agents use MCP automatically (knowledge-liaison/reader/writer)
/knowz save "insight"      # manual capture via knowz
```

Vault file interop: `/knowz setup` and `/knowz register` automatically update `knowzcode/knowzcode_vaults.md` when it exists, keeping both configurations in sync.

## Using Standalone

The knowz plugin works completely independently — no KnowzCode required:

```bash
claude plugin install knowz
/knowz register
# restart
/knowz setup
/knowz ask "question"
/knowz save "insight"
```

## Enterprise Configuration

Enterprises that self-host the Knowz platform can customize endpoints and branding by creating an `enterprise.json` file in the plugin root:

```json
{
  "brand": "Acme Corp",
  "mcp_endpoint": "https://mcp.acme.internal/mcp",
  "api_endpoint": "https://api.acme.internal/api/v1"
}
```

All fields are optional. When absent, the plugin defaults to the Knowz cloud platform (`knowz.io`). See `enterprise.example.json` for the template.

When `enterprise.json` is present:
- Setup and registration flows use the configured endpoints
- User-facing messages use the configured brand name (e.g., "Welcome to **Acme Corp**")
- The `--dev` flag is ignored (enterprise manages its own environments)

Enterprise forks should commit this file so it distributes to all team members via the marketplace.

## Architecture

- **`/knowz` skill** — Primary interface for all explicit vault operations
- **`knowz-auto` trigger** — Auto-activates on vault-relevant conversations
- **`knowledge-worker` agent** — Handles complex multi-step research tasks
- **`knowz-pending.md`** — Offline queue for captures when MCP is unavailable
