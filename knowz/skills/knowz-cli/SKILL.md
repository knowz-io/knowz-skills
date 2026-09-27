---
name: knowz-cli
description: "Use the knowz CLI for knowledge operations — search, ask, create/list/get/amend knowledge, comments and versions, vaults, live chat, file attachment, local code indexing/chunking/graph, agent memory capture/recall, ingestion, sync, backup/restore, Model-3 CMEK, public selfhosted setup, and contracted portable deployments. Use this whenever you'd otherwise reach for the knowz MCP tools (mcp__knowz__*), when the MCP server is unauthenticated/unavailable, or for any local-first (offline) knowledge work."
user-invocable: true
---

# knowz CLI (MCP-free knowledge operations)

You are operating the **`knowz` CLI** — the direct-to-REST, local-first command-line client. Use it
**for compatible endpoint operations**. Cloud commands use the credential established via
`knowz login`; local commands (`index`, `ingest`, `local`, `capture`, `recall`, `cmek`, `web`)
need no auth.

When the user asks to search/ask/create/list knowledge, browse vaults, chat, attach a file, index a
repo, ingest files, or sync — **prefer this CLI over MCP tools** when the CLI is already available.

## Step 1 — Confirm the CLI is available

If `knowz` is already on PATH (or a local Knowz platform checkout already built the CLI),
use that binary. Check with `knowz --version` (expect CLI `0.5.0` for this inventory).

If it is not available, ask the user to install Knowz CLI from the
[knowz.io docs](https://knowz.io) / GitHub Releases for knowz-io — do not run remote bootstrap or
package-manager install commands on their behalf. Until then, prefer Knowz MCP tools
(`mcp__knowz__*`) or tell the user the CLI is required for this path.

Only use a binary already present on the machine.

## Step 2 — Prefer structured output

Every command supports `--json` (single JSON document on stdout; logs go to stderr). Prefer
`--json` when you need to parse results. Human mode (no `--json`) is fine when showing the user.

## Global flags and exit codes

Every command accepts `--profile <name>`, `--api-url <url>`, `--vault <id|name>`, `--json`, and
`-v/--verbose`.

Exit codes are meaningful — branch on them rather than scraping text:

| Code | Meaning |
|---|---|
| `0` | success |
| `2` | usage / validation error |
| `3` | auth — run `knowz login` |
| `4` | API or transport error |
| `5` | not found |
| `1` | unexpected |

## MCP tool → CLI command map

| Instead of MCP tool | Run |
|---|---|
| `search_knowledge` / `advanced_search` | `knowz search "<query>" [--vault <id\|name>] [--limit N] --json` |
| `ask_question` | `knowz ask "<question>" [--vault <id\|name>] [--research] [--shared] --json` |
| `create_knowledge` | `knowz knowledge create "<title>" --content "<text>" [--type Note\|Document\|Code\|Link\|File] [--tag t] [--vault v]` (or `--file <path>`) |
| `update_knowledge` | `knowz knowledge update <id> [--title] [--content\|--file] [--tag ...] [--vault]` |
| `amend_knowledge` / `amend_knowledge_async` | `knowz knowledge amend <id> "<instruction>" [--wait]` |
| `get_knowledge_item` | `knowz knowledge get <id> [--content] --json` |
| `list_knowledge_items` / `count_knowledge` | `knowz knowledge list [--vault v] [--type T] [--tag t] [--page N --page-size M] --json` |
| `get_version_history` | `knowz knowledge versions <id> --json` |
| `add_comment` / `list_comments` | `knowz knowledge comment <id> "<text>"` / `knowz knowledge comments <id> --json` |
| `upload_file` / `attach_files` | `knowz knowledge attach <id> <files...> [--content-type <mime>]` |
| `list_vaults` | `knowz vault list --json` |
| `list_vault_contents` | `knowz vault contents <id\|name> --json` |
| `create_vault` | `knowz vault create "<name>" [--description] [--vault-type]` |
| `find_entities` | `knowz entities find <type> [--query q] --json` |
| `list_topics` | `knowz topics list --json` |
| `get_statistics` | `knowz stats --json` |
| (live chat) | `knowz chat "<message>" [--vault v] [--mode Balanced\|Standard\|Creative] --json` |
| knowledge status | `knowz knowledge status <id> --json` |

## Local-first (no cloud, no MCP)

| Task | Run |
|---|---|
| Index a repo/dir (tree-sitter chunking + code graph) | `knowz index scan <path> [--force]` |
| Local semantic search over indexed code | `knowz index search "<query>" [--limit N] --json` |
| Code-graph stats / top symbols | `knowz index graph --json` |
| Bind a checkout and emit agent context | `knowz repo setup` · `knowz repo context [--inject]` |
| Ingest arbitrary files into the local store | `knowz ingest add <paths...> [--type] [--tag]` |
| Local store info / init / reset | `knowz local info\|init\|reset --json` |
| Agent memory (Claude Code hooks) | `knowz hooks install` · `knowz capture observe` · `knowz recall [--inject]` |
| Browser dashboard (stats/search/graph) | `knowz web` (prints a localhost URL) |

## Auth, sync, encryption, Postgres, platform

- **Auth:** `knowz login --sso` (browser SSO) · `knowz login` (interactive) · `knowz whoami` · `knowz auth status`.
- **Sync local ↔ cloud:** `knowz sync status|pull|push|run`, with `sync conflicts|resolve|recover` when a run reports conflicts.
- **Model-3 CMEK** (cloud stores ciphertext only): `knowz cmek init` then sync — push encrypts, pull decrypts locally.
- **Local Postgres + pgvector** (optional): `knowz pg up` / `knowz pg down` (user-initiated; see `knowz pg up --help`).
- **Public selfhosted:** `knowz up` opens browser-guided local setup. Use `--help` to confirm options for the installed version.
- **Managed runtimes:** `knowz runtime status|logs|doctor|upgrade|destroy` target the recorded edition. Legacy `platform *` commands manage the contracted portable edition.
- **Endpoint compatibility:** selfhosted supports a smaller API surface. Never move a stored credential to another API origin when overriding `--api-url`.

## Guidance

- Default to `--json` when you will parse the result; show human output when reporting to the user.
- For **local** code questions, use `index scan` + `index search` / `index graph` — fully offline.
- For **cloud knowledge**, ensure `whoami` succeeds first; if it exits `3`, run `login`.
- Prefer the CLI when installed and suitable. Supported MCP connections remain a fallback when the CLI is unavailable or the user chooses MCP.

## Full command inventory (summary)

CLI release expected: `0.5.0`. Before using this inventory, confirm `knowz --version` matches.
If the version differs, ask the user to update Knowz CLI from knowz.io docs, then re-check.
Run `knowz <command> --help` for flags not listed here.

### Top-level highlights

| Command | What it does |
|---|---|
| `knowz ask <question>` | AI-synthesized answer with sources |
| `knowz search <query>` | Hybrid keyword + semantic search |
| `knowz chat [message]` | Live chat with knowledge (SSE) |
| `knowz knowledge create\|get\|list\|update\|amend\|…` | Knowledge CRUD, versions, comments, attach |
| `knowz vault list\|create\|contents\|get` | Vault operations |
| `knowz entities find` / `knowz topics list` / `knowz stats` | Browse entities, topics, stats |
| `knowz login` / `knowz logout` / `knowz whoami` / `knowz auth status` | Authentication |
| `knowz index scan\|search\|graph` | Local code index |
| `knowz ingest add` / `knowz local info\|init\|list\|show\|reset` | Local store |
| `knowz sync status\|pull\|push\|run\|conflicts\|resolve\|recover` | Local ↔ cloud sync |
| `knowz cmek init\|status\|encrypt\|decrypt` | Model-3 CMEK |
| `knowz repo setup\|index\|search\|graph\|context\|status` | Repo-local binding |
| `knowz recall` / `knowz capture observe\|seal\|status` / `knowz hooks install` | Agent memory |
| `knowz up` / `knowz down` / `knowz setup` / `knowz backup` / `knowz restore` | Selfhosted / portable runtime |
| `knowz runtime status\|logs\|doctor\|upgrade\|destroy` | Managed runtime |
| `knowz platform *` | Legacy contracted portable edition |
| `knowz pg up\|down\|status\|destroy` | Local Postgres + pgvector |
| `knowz profile *` / `knowz config *` / `knowz status` / `knowz completion` | Profiles and settings |
| `knowz export` / `knowz import` / `knowz transfer` / `knowz peer *` | Portability and federation |
| `knowz web` / `knowz menu` / `knowz tui` / `knowz doctor` | Interactive / diagnostic |

For the complete flag list per command, run `knowz <command> --help` on the installed CLI.
