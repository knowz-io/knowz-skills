---
name: knowz-cli
description: "Use the knowz CLI (not the MCP server) for knowledge operations — search, ask, create/list/get/amend knowledge, comments and versions, vaults, live chat, file attachment, local code indexing/chunking/graph, agent memory capture/recall, ingestion, sync, backup/restore, Model-3 CMEK, and the portable self-hosted platform. Use this whenever you'd otherwise reach for the knowz MCP tools (mcp__knowz__*), when the MCP server is unauthenticated/unavailable, or for any local-first (offline) knowledge work."
user-invocable: true
allowed-tools: Bash, Read, Glob, Grep
---

# knowz CLI (MCP-free knowledge operations)

You are operating the **`knowz` CLI** — the direct-to-REST, local-first command-line client. Use it
**instead of the knowz MCP server** (`mcp__knowz__*`). It needs no MCP OAuth: cloud commands use the
credential you set with `knowz login`; local commands (`index`, `ingest`, `local`, `capture`,
`recall`, `cmek`, `web`) need no auth at all.

When the user asks to search/ask/create/list knowledge, browse vaults, chat, attach a file, index a
repo, ingest files, or sync — **prefer this CLI over MCP tools**.

## Step 1 — Resolve the `knowz` binary (once per session)

Run this to set `$KNOWZ`. Prefer the published global install; fall back to a repo checkout's built
bin if you happen to be inside one.

```bash
if command -v knowz >/dev/null 2>&1; then KNOWZ="knowz";
elif [ -f cli/packages/cli/bin/run.js ]; then KNOWZ="node $(pwd)/cli/packages/cli/bin/run.js";
else echo "knowz CLI not installed"; fi
$KNOWZ --version
```

If it is not installed, install it globally from npm:

```bash
npm i -g @knowzai/cli
```

The npm package is `@knowzai/cli` (scoped). Do **not** install the unscoped `knowz` package — that
name belongs to an unrelated icon-set library.

Inside a `knowz-platform` checkout you can instead build from source:
`cd cli && pnpm install && pnpm build`, then use `node cli/packages/cli/bin/run.js`.

## Step 2 — Use `--json` for anything you need to parse

Every command supports `--json` (single JSON document on stdout; logs go to stderr). Pipe to `jq`.
Human mode (no `--json`) is fine when you're just showing the user.

## Global flags and exit codes

Every command accepts `--profile <name>`, `--api-url <url>`, `--vault <id|name>`, `--json`, and
`-v/--verbose`.

Exit codes are meaningful — branch on them rather than scraping text:

| Code | Meaning |
|---|---|
| `0` | success |
| `2` | usage / validation error |
| `3` | auth — run `$KNOWZ login` |
| `4` | API or transport error |
| `5` | not found |
| `1` | unexpected |

## MCP tool → CLI command map

| Instead of MCP tool | Run |
|---|---|
| `search_knowledge` / `advanced_search` | `$KNOWZ search "<query>" [--vault <id\|name>] [--limit N] --json` |
| `ask_question` | `$KNOWZ ask "<question>" [--vault <id\|name>] [--research] [--shared] --json` |
| `create_knowledge` | `$KNOWZ knowledge create "<title>" --content "<text>" [--type Note\|Document\|Code\|Link\|File] [--tag t] [--vault v]` (or `--file <path>` / pipe stdin) |
| `update_knowledge` | `$KNOWZ knowledge update <id> [--title] [--content\|--file] [--tag ...] [--vault]` |
| `amend_knowledge` / `amend_knowledge_async` | `$KNOWZ knowledge amend <id> "<instruction>" [--wait]` |
| `get_knowledge_item` | `$KNOWZ knowledge get <id> [--content] --json` |
| `list_knowledge_items` / `count_knowledge` | `$KNOWZ knowledge list [--vault v] [--type T] [--tag t] [--page N --page-size M] --json` |
| `get_version_history` | `$KNOWZ knowledge versions <id> --json` |
| `add_comment` / `list_comments` | `$KNOWZ knowledge comment <id> "<text>"` / `$KNOWZ knowledge comments <id> --json` |
| `upload_file` / `attach_files` | `$KNOWZ knowledge attach <id> <files...> [--content-type <mime>]` |
| `list_vaults` | `$KNOWZ vault list --json` |
| `list_vault_contents` | `$KNOWZ vault contents <id\|name> --json` |
| `create_vault` | `$KNOWZ vault create "<name>" [--description] [--vault-type]` |
| `find_entities` | `$KNOWZ entities find <type> [--query q] --json` |
| `list_topics` | `$KNOWZ topics list --json` |
| `get_statistics` | `$KNOWZ stats --json` |
| (live chat) | `$KNOWZ chat "<message>" [--vault v] [--mode Balanced\|Standard\|Creative] --json` |
| knowledge status | `$KNOWZ knowledge status <id> --json` |

## Local-first (no cloud, no MCP) — the CLI's superpower

| Task | Run |
|---|---|
| Index a repo/dir (tree-sitter chunking + code graph) | `$KNOWZ index scan <path> [--force]` |
| Local semantic search over indexed code | `$KNOWZ index search "<query>" [--limit N] --json` |
| Code-graph stats / top symbols | `$KNOWZ index graph --json` |
| Bind a checkout and emit agent context | `$KNOWZ repo setup` · `$KNOWZ repo context [--inject]` |
| Ingest arbitrary files into the local store | `$KNOWZ ingest add <paths...> [--type] [--tag]` |
| Local store info / init / reset | `$KNOWZ local info\|init\|reset --json` |
| Agent memory (Claude Code hooks) | `$KNOWZ hooks install` · `$KNOWZ capture observe` · `$KNOWZ recall [--inject]` |
| Browser dashboard (stats/search/graph) | `$KNOWZ web` (prints a localhost URL) |

## Auth, sync, encryption, Postgres, platform

- **Auth:** `$KNOWZ login` (paste an API key, register, or self-hosted) · `$KNOWZ whoami` ·
  `$KNOWZ auth status`.
- **Sync local ↔ cloud:** `$KNOWZ sync status|pull|push|run`, with `sync conflicts|resolve|recover`
  when a run reports conflicts.
- **Model-3 CMEK** (cloud stores ciphertext only): `$KNOWZ cmek init` then sync — push encrypts,
  pull decrypts locally.
- **Local Postgres + pgvector** (optional, scales the local store): `$KNOWZ pg up` auto-provisions a
  local cluster and points the profile at it, so all `index`/`ingest`/`sync`/`local` commands then
  use Postgres. Stop with `$KNOWZ pg down`.
- **Portable platform** (the whole Knowz stack on this machine): `$KNOWZ up` is the one-command
  path; `$KNOWZ platform up|status|logs|down` is the granular form. `$KNOWZ doctor` diagnoses a
  broken stack; `$KNOWZ backup` / `$KNOWZ restore` archive it.

## Guidance

- Default to `--json` when you'll parse the result; show human output when reporting to the user.
- For **local** code questions ("search the codebase", "what calls X"), use `index scan` +
  `index search` / `index graph` — fully offline, no auth, no MCP.
- For **cloud knowledge** (the user's vaults), ensure `whoami` succeeds first; if it exits `3`, run
  `login`.
- Do **not** fall back to `mcp__knowz__*` tools for these tasks — this CLI is the intended path and
  avoids the MCP server entirely.

<!-- BEGIN GENERATED COMMANDS — regenerate with `pnpm gen:skill`; do not hand-edit -->

## Full command inventory

Generated from the CLI's own oclif manifest — every command below exists in the installed `knowz`.
Run `knowz <command> --help` for the flags not listed here.

### Top-level

| Command | What it does | Key flags |
|---|---|---|
| `knowz activate [credential]` | Link a portable Knowz installation to a mothership account. | `--mothership-url` `--name` `--config-dir` `--paste` `--scope` `--store` `--installation-id` `--open` _(+1 more)_ |
| `knowz ask <question>` | Ask a question and get an AI-synthesized answer with sources. | `--research` `--shared` |
| `knowz backup [path]` | Create a private portable-platform backup archive. | `--out` `--encrypt` `--name` `--config-dir` |
| `knowz chat [message]` | Live chat with your knowledge (SSE streaming, with sources). | `--mode` `--persona` `--temperature` `--conversation` `--no-fallback` |
| `knowz completion [shell]` | Output a shell completion script. Install with: eval "$(knowz completion bash)" (or zsh) in your shell rc. | — |
| `knowz doctor [path]` | Check local Knowz CLI setup by indexing a generated or supplied repository, searching it, and reading graph stats. | `--db` `--keep-sample` `--query` |
| `knowz down` | Stop the portable Knowz platform, preserving all data volumes (alias of `platform down`). | `--name` `--config-dir` |
| `knowz login` | Authenticate: paste an API key, register a new tenant, or use a self-hosted key. Verifies before storing. | `--register` `--self-hosted` `--key` `--key-stdin` `--store-tenant-key` `--email` `--name` `--password` _(+1 more)_ |
| `knowz logout` | Remove stored credentials for the active profile (or all profiles). | `--all` |
| `knowz menu` | Interactive menu — browse and run every knowz operation (this is what `knowz` with no command opens). | `--frontend` |
| `knowz recall` | Recall relevant agent memory (local-first, vault-scoped). SessionStart hook target with --inject. | `--inject` `--local-only` `--deep` `--quiet` `--query` `--limit` `--max-chars` `--driver` _(+2 more)_ |
| `knowz restore <archive>` | Restore a portable-platform backup after validating its manifest and checksums. | `--replace-installation` `--clone` `--name` `--config-dir` `--yes` |
| `knowz search <query>` | Hybrid (keyword + semantic) search across knowledge. | `--limit` `--include-children` |
| `knowz setup` | Open the one-shot loopback setup console for a local portable Knowz platform. | `--name` `--config-dir` `--version` `--api-port` `--web-port` `--mcp-port` `--public-site-port` `--with-mcp` _(+2 more)_ |
| `knowz stats` | Show aggregate knowledge statistics for the tenant. | — |
| `knowz status` | Show CLI status: active profile, resolved API URL, config path, and version. Works offline. | — |
| `knowz tui` | Interactive browser: list/search/open knowledge, vaults, entities, stats, chat, and edit settings in one REPL. | `--frontend` |
| `knowz up` | One command: pick an AI provider, start the portable Knowz platform, and sign in a local profile. | `--name` `--config-dir` `--version` `--provider` `--storage` `--api-port` `--web-port` `--mcp-port` _(+36 more)_ |
| `knowz web` | Launch the local web dashboard (store stats, semantic search, code graph, sync/CMEK status). | `--port` `--open` `--db` |
| `knowz whoami` | Verify the active credentials against the server and print identity. | — |

### `auth` — Authentication status

| Command | What it does | Key flags |
|---|---|---|
| `knowz auth status` | Show authentication status (no secrets) for the active profile. | — |

### `capture`

| Command | What it does | Key flags |
|---|---|---|
| `knowz capture observe` | Record one agent tool-use observation (Claude Code PostToolUse hook target). Fail-open, offline. | `--session` `--tool` `--summary` `--driver` `--db` `--dsn` |
| `knowz capture seal` | Seal captured agent memory into the durable outbox and flush it to the cloud knowledge graph. | `--from-pending` `--session` `--all` `--quiet` `--file` `--dir` `--dry-run` `--archive` _(+4 more)_ |
| `knowz capture status` | Show the agent-memory capture outbox (pending/inflight/done/dead) and observation backlog. | `--driver` `--db` `--dsn` |

### `cmek` — Model-3 customer-managed encryption (cloud stores ciphertext only)

| Command | What it does | Key flags |
|---|---|---|
| `knowz cmek decrypt` | Decrypt a CMEK envelope (from --file or stdin) back to plaintext (local only). | `--file` `--passphrase` |
| `knowz cmek encrypt [text]` | Encrypt text/file into a CMEK envelope (local only; prints the envelope). | `--file` `--passphrase` |
| `knowz cmek init` | Enable Model-3 CMEK for the active profile (passphrase-derived key, or a key file). | `--keyfile` |
| `knowz cmek status` | Show Model-3 CMEK status for the active profile. | — |

### `config` — View and edit CLI settings

| Command | What it does | Key flags |
|---|---|---|
| `knowz config get <key>` | Get a setting on the active (or --profile) profile, or a global key like ui.frontend. | — |
| `knowz config list` | Show the full config (profiles + active profile). No secrets are stored here. | — |
| `knowz config path` | Print the path to the config file. | — |
| `knowz config set <key> <value>` | Set a setting on the active (or --profile) profile, or a global key like ui.frontend. | — |

### `entities` — Browse named entities (people, locations, events)

| Command | What it does | Key flags |
|---|---|---|
| `knowz entities find [type]` | Find named entities (people, locations, events, …) extracted from your knowledge. | `--query` `--limit` |

### `hooks`

| Command | What it does | Key flags |
|---|---|---|
| `knowz hooks install` | Install Claude Code hooks that auto-capture agent memory (PostToolUse/Stop/SessionEnd/PreCompact) and inject recall (SessionStart). | `--dir` `--global` `--print` `--command-prefix` `--db` |

### `index` — Index local code/docs (tree-sitter chunking + graph) and search it offline

| Command | What it does | Key flags |
|---|---|---|
| `knowz index graph` | Show code-graph stats from the last index run. | `--db` |
| `knowz index scan [path]` | Index local code into the local store (tree-sitter intelligent chunking + code graph). | `--force` `--db` |
| `knowz index search <query>` | Local semantic search over indexed code chunks (no cloud). | `--limit` `--db` |

### `ingest` — Ingest arbitrary files into the local store

| Command | What it does | Key flags |
|---|---|---|
| `knowz ingest add` | Ingest one or more files into the local store (chunk + embed; pushable with `knowz sync push`). | `--type` `--tag` `--db` |

### `knowledge` — Create, read, update, search, version, amend, and comment on knowledge

| Command | What it does | Key flags |
|---|---|---|
| `knowz knowledge amend <id> <instruction>` | Amend a knowledge item with a natural-language instruction (async; optionally wait). | `--wait` |
| `knowz knowledge attach [id] [files]` | Upload local files and attach them to an existing knowledge item. | `--content-type` |
| `knowz knowledge comment <id> <body>` | Add a comment to a knowledge item. | `--author` `--parent-id` |
| `knowz knowledge comments <id>` | List comments on a knowledge item. | — |
| `knowz knowledge create [title]` | Create a knowledge item (content from --content, --file, or stdin). | `--title` `--content` `--file` `--type` `--tag` `--attach` `--wait` |
| `knowz knowledge delete <id>` | Soft-delete a knowledge item. | `--yes` |
| `knowz knowledge get <id>` | Fetch a knowledge item by id (rich formatted view). | `--content` |
| `knowz knowledge list` | List knowledge items (paginated, filterable). | `--type` `--tag` `--page` `--page-size` |
| `knowz knowledge status <id>` | Show enrichment/indexing status for a knowledge item. | — |
| `knowz knowledge update <id>` | Update a knowledge item (title, content, tags, or vault). | `--title` `--content` `--file` `--tag` |
| `knowz knowledge versions <id>` | List the version history of a knowledge item. | — |

### `local` — Manage and browse the local store (SQLite/Postgres)

| Command | What it does | Key flags |
|---|---|---|
| `knowz local info` | Show local store stats (schema version, dim, item/chunk counts). | `--driver` `--db` `--dsn` |
| `knowz local init` | Initialize the local store (SQLite + sqlite-vec, or Postgres + pgvector). | `--driver` `--db` `--dsn` `--dim` |
| `knowz local list` | List items in the local store (offline; no cloud). | `--type` `--state` `--db` |
| `knowz local reset` | Delete the local SQLite store for the active profile. | `--db` `--yes` |
| `knowz local show <id>` | Show a local store item by id (offline). | `--content` `--db` |

### `pg` — Auto-provision a local Postgres + pgvector cluster

| Command | What it does | Key flags |
|---|---|---|
| `knowz pg destroy` | Stop and DELETE the local Postgres cluster + data for this profile. | `--port` `--yes` |
| `knowz pg down` | Stop the local Postgres cluster for this profile (data is kept). | `--port` |
| `knowz pg status` | Show the local Postgres cluster status for this profile. | `--port` |
| `knowz pg up` | Provision a local Postgres + pgvector cluster (auto download/install/configure) and point this profile at it. | `--port` `--run-as` |

### `platform` — Run and manage the complete portable Knowz platform

| Command | What it does | Key flags |
|---|---|---|
| `knowz platform destroy` | Stop the portable platform and permanently delete its volumes and runtime configuration. | `--name` `--config-dir` `--yes` `--purge-profile` |
| `knowz platform doctor` | Check Docker or Podman, Docker Compose v2, and the initialized portable runtime configuration. | `--name` `--config-dir` |
| `knowz platform down` | Stop the portable platform while preserving all named volumes and runtime configuration. | `--name` `--config-dir` |
| `knowz platform logs` | Show redacted Docker Compose logs for the initialized portable platform. | `--name` `--config-dir` `--tail` |
| `knowz platform reset` | Stop the portable platform and permanently delete its volumes and runtime configuration (alias of `platform destroy`). | `--name` `--config-dir` `--yes` `--purge-profile` |
| `knowz platform setup` | Open the one-shot loopback setup console for a local portable Knowz platform. | `--name` `--config-dir` `--version` `--api-port` `--web-port` `--mcp-port` `--public-site-port` `--with-mcp` _(+2 more)_ |
| `knowz platform status` | Show persisted platform configuration and Docker Compose service status. | `--name` `--config-dir` |
| `knowz platform up` | Install and start the complete portable Knowz platform with Docker Compose. | `--name` `--config-dir` `--version` `--provider` `--storage` `--api-port` `--web-port` `--mcp-port` _(+23 more)_ |
| `knowz platform upgrade` | Pull and apply a new pinned platform version while preserving data and secrets. | `--name` `--config-dir` `--version` |

### `profile` — Manage connection profiles (dev/prod/self-hosted/custom)

| Command | What it does | Key flags |
|---|---|---|
| `knowz profile add <name>` | Add a new profile. | `--use` |
| `knowz profile list` | List configured profiles (the active one is marked *). | — |
| `knowz profile remove <name>` | Remove a profile (cannot remove the active one). | `--yes` |
| `knowz profile use <name>` | Switch the active profile. | — |

### `repo` — Bind, index, search, graph, and wire local-first context for repository checkouts

| Command | What it does | Key flags |
|---|---|---|
| `knowz repo context [path]` | Emit a bounded local-first context block for agent hooks. | `--inject` `--quiet` `--db` `--max-chars` |
| `knowz repo graph [path]` | Query local code graph stats, symbols, or file neighborhoods for the bound repository. | `--symbol` `--file` `--neighborhood` `--kind` `--limit` |
| `knowz repo index [path]` | Index the bound repository into its repo-local Knowz SQLite store. | `--force` `--sync` |
| `knowz repo search <query>` | Search the bound repository locally using its repo-local Knowz SQLite index. | `--dir` `--limit` |
| `knowz repo setup [path]` | Bind a repository checkout to a Knowz vault and repo-local SQLite context store. | `--db` `--graph` `--force` `--sync` `--create-vault` `--description` `--parent-id` `--vault-type` _(+3 more)_ |
| `knowz repo status [path]` | Show the Knowz repo binding and local index status. | — |

### `sync` — Sync the local store with the cloud — pull, push, resolve conflicts, recover

| Command | What it does | Key flags |
|---|---|---|
| `knowz sync conflicts` | List items in conflict (local + remote both changed). Resolve with `sync resolve`. | `--db` `--dsn` |
| `knowz sync pull` | Pull knowledge from the cloud into the local store. | `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync push` | Push local new/dirty knowledge to the cloud. | `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync recover` | Recovery: re-pull authoritative cloud state to repair the local store; reports conflicts + orphans. | `--passphrase` `--db` `--dsn` |
| `knowz sync resolve <id>` | Resolve a sync conflict by keeping the remote copy or the local copy. | `--keep-remote` `--keep-local` `--passphrase` `--db` `--dsn` |
| `knowz sync run` | Full sync: pull then push. | `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync status` | Show local↔cloud sync state (new/dirty/synced/conflict counts). | `--driver` `--db` `--dsn` |

### `topics` — Browse topics/categories

| Command | What it does | Key flags |
|---|---|---|
| `knowz topics list` | List topics/categories across your knowledge. | `--limit` |

### `vault` — List, create, and inspect vaults

| Command | What it does | Key flags |
|---|---|---|
| `knowz vault contents <ref>` | List the knowledge items in a vault. | `--page` `--page-size` |
| `knowz vault create <name>` | Create a vault. | `--description` `--parent-id` `--vault-type` |
| `knowz vault get <ref>` | Get a vault by id or name. | — |
| `knowz vault list` | List vaults for the active tenant. | — |

<!-- END GENERATED COMMANDS -->
