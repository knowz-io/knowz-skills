# knowz-skill — Plugin Development Guide

This is a Claude Code plugin that provides frictionless interaction with the Knowz MCP server.

## Structure

```
knowz-skill/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest
├── skills/
│   ├── knowz/SKILL.md           # User-invocable: /knowz <action>
│   │   └── references/
│   │       ├── registration.md  # Registration API details
│   │       └── mcp-setup.md     # MCP server config details
│   └── knowz-auto/SKILL.md     # Trigger: auto-activates on vault-relevant conversations
├── agents/
│   └── knowledge-worker.md      # Agent for multi-step research/capture
├── knowz-vaults.example.md      # Template for user's vault config file
├── knowz-pending.example.md     # Template for pending captures queue
├── CLAUDE.md                    # This file
└── README.md                    # Usage docs
```

## How It Works

1. The `/knowz` skill is the primary interface — handles ask, save, search, browse, setup, status, register, and flush
2. The `knowz-auto` trigger skill auto-activates when users ask vault-relevant questions or share insights
3. The `knowledge-worker` agent handles complex multi-step research tasks
4. All operations read `knowz-vaults.md` (in the user's project root) for vault routing rules
5. `/knowz status` provides diagnostics — MCP health, vault validation, configuration state
6. `/knowz setup` configures MCP server connection and creates vault config file
7. `/knowz register` creates a new account and auto-configures everything
8. `/knowz flush` processes the pending captures queue (`knowz-pending.md`)
9. Without a vault file, everything still works — just without vault-scoped routing

## Key Files

- **`knowz-vaults.md`** (in user's project, not this repo) — The vault configuration file that drives routing. Created via `/knowz setup`. See `knowz-vaults.example.md` for the format.
- **`knowz-pending.md`** (in user's project, not this repo) — Queue of knowledge items waiting to be synced. Created automatically when MCP writes fail. See `knowz-pending.example.md` for the format.
- **`skills/knowz/SKILL.md`** — The core skill. All explicit `/knowz` commands route through here.
- **`skills/knowz/references/registration.md`** — Registration API endpoints, error codes, response format.
- **`skills/knowz/references/mcp-setup.md`** — MCP server configuration: `claude mcp add` format, OAuth vs API key, scope options.
- **`skills/knowz-auto/SKILL.md`** — The trigger skill. Lightweight — reads vault file, matches rules, does a quick search or offers to save.
- **`agents/knowledge-worker.md`** — Dispatched for complex multi-step operations only.

## KnowzCode Interop

When the knowz plugin is used alongside the KnowzCode plugin (`knowzcode`):

- **Vault file interop:** `/knowz setup` and `/knowz register` check for `knowzcode/knowzcode_vaults.md` and update vault IDs there when both files exist.
- **No plugin dependency:** KnowzCode agents check for MCP tools directly — they don't require the knowz plugin. The knowz plugin is recommended for MCP setup but not required.
- **Two vault file formats:**
  - `knowz-vaults.md` — knowz plugin format. Plain English routing rules.
  - `knowzcode/knowzcode_vaults.md` — KnowzCode format. Structured vault types and category routing.

## Conventions

- Skills reference MCP tools with their full names: `mcp__knowz__search_knowledge`, etc.
- The vault file format uses plain English routing rules ("when to query", "when to save") — no phase/workgroup references
- Content templates are per-vault, not per-category
- The plugin works in zero-config mode (no vault file) with reduced functionality
- Never auto-save knowledge — always ask the user first
- Error messages should include actionable next steps
- When MCP writes fail, queue captures to `knowz-pending.md` instead of losing them

## Modifying Skills

- Skill frontmatter fields: `name`, `description`, `user-invocable`, `allowed-tools`, `argument-hint`
- The `description` field is critical — it determines when Claude auto-triggers the skill
- Keep `knowz-auto` lightweight — it should never do multi-step research
- Keep `knowz` comprehensive — it's the workhorse

## MCP Tools Available

The plugin assumes these Knowz MCP tools are available in the environment:

| Tool | Purpose |
|------|---------|
| `mcp__knowz__ask_question` | AI-powered Q&A |
| `mcp__knowz__search_knowledge` | Semantic search |
| `mcp__knowz__create_knowledge` | Create new knowledge item |
| `mcp__knowz__update_knowledge` | Update existing item |
| `mcp__knowz__list_vaults` | List available vaults |
| `mcp__knowz__list_vault_contents` | Browse vault items |
| `mcp__knowz__list_topics` | Get vault topics |
| `mcp__knowz__find_entities` | Find related entities |
| `mcp__knowz__get_knowledge_item` | Get full item content |
| `mcp__knowz__create_vault` | Create a new vault |
