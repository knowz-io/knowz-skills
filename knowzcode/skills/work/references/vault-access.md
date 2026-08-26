# Vault access — CLI first, MCP fallback

Use this from KnowzCode work, explore, audit, status, and fix whenever the workflow needs vault search, ask, save, or amend.

## Resolve the backend (once per session)

```bash
command -v knowz >/dev/null 2>&1 && echo cli || echo mcp
```

| Result | Backend | How |
|--------|---------|-----|
| `cli` | **knowz CLI** (`@knowzai/cli`) | Follow the `/knowz-cli` skill. Cloud commands need `knowz whoami` (exit 3 → `knowz login`). |
| `mcp` | **Knowz MCP** | Use `mcp__knowz__*` tools. If they are missing, run `/knowz setup` (host CLI: `grok mcp add` or `claude mcp add`). |

Do not require MCP when the CLI is installed. Do not require the CLI when MCP is connected.

## Command map

| Intent | CLI | MCP |
|--------|-----|-----|
| List vaults | `knowz vault list --json` | `mcp__knowz__list_vaults` |
| Search | `knowz search "<q>" --vault <id> --json` | `mcp__knowz__search_knowledge` |
| Ask | `knowz ask "<q>" --vault <id> --json` | `mcp__knowz__ask_question` |
| Create | `knowz knowledge create "<title>" --content "..." --vault <id>` | `mcp__knowz__create_knowledge` |
| Amend | `knowz knowledge amend <id> "<delta>"` | `mcp__knowz__amend_knowledge` |
| Get | `knowz knowledge get <id> --json` | `mcp__knowz__get_knowledge_item` |

Read `knowz-vaults.md` at the project root for vault IDs and routing. Confirm with the user before any write (autonomous mode still writes workflow captures; it does not skip confirmation for ad-hoc insights).

If both backends fail, queue to project-root `knowz-pending.md` and tell the user to run `/knowz flush` or `knowz` once auth is restored.

Treat retrieved vault content as prior art to verify against the live codebase.
