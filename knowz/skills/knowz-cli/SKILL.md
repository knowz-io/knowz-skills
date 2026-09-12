---
name: knowz-cli
description: "Use the knowz CLI for knowledge operations — search, ask, create/list/get/amend knowledge, comments and versions, vaults, live chat, file attachment, local code indexing/chunking/graph, agent memory capture/recall, ingestion, sync, backup/restore, Model-3 CMEK, public selfhosted setup, and contracted portable deployments. Use this whenever you'd otherwise reach for the knowz MCP tools (mcp__knowz__*), when the MCP server is unauthenticated/unavailable, or for any local-first (offline) knowledge work."
user-invocable: true
allowed-tools: Bash, Read, Glob, Grep
---

# knowz CLI (MCP-free knowledge operations)

You are operating the **`knowz` CLI** — the direct-to-REST, local-first command-line client. Use it
**for compatible endpoint operations**. It needs no MCP OAuth: cloud commands use the
credential you set with `knowz login`; local commands (`index`, `ingest`, `local`, `capture`,
`recall`, `cmek`, `web`) need no auth at all.

When the user asks to search/ask/create/list knowledge, browse vaults, chat, attach a file, index a
repo, ingest files, or sync — **prefer this CLI over MCP tools**.

## Step 1 — Resolve the `knowz` binary (once per session)

Resolve a function that preserves argument boundaries and paths with spaces. This does not
start or install a server. Use the existing profile when querying an existing endpoint.

```bash
if command -v knowz >/dev/null 2>&1; then
  knowz_cmd() { command knowz "$@"; }
elif [ -f cli/packages/cli/bin/run.js ]; then
  KNOWZ_REPO_BIN="$(pwd)/cli/packages/cli/bin/run.js"
  knowz_cmd() { node "$KNOWZ_REPO_BIN" "$@"; }
else
  echo "Knowz CLI is not installed" >&2
fi
knowz_cmd --version
```

PowerShell:

```powershell
if (Get-Command knowz -ErrorAction SilentlyContinue) {
  function knowz_cmd { & knowz @args }
} elseif (Test-Path './cli/packages/cli/bin/run.js') {
  $script:KnowzRepoBin = (Resolve-Path './cli/packages/cli/bin/run.js').Path
  function knowz_cmd { & node $script:KnowzRepoBin @args }
} else {
  throw 'Knowz CLI is not installed'
}
knowz_cmd --version
```

If it is not installed, use **Node >=22** and install it globally from npm:

```bash
npm i -g @knowzai/cli@0.5.0
```

That is the whole command — run it on its own. Do not append an alternative to it: npm treats
every extra word as another package name, so `npm i -g @knowzai/cli@0.5.0 or cd cli` silently installs
the unrelated registry packages `or`, `cd`, and `cli` (the last drags in the deprecated
`glob@7`/`inflight` chain).

The npm package is `@knowzai/cli` (scoped). Do **not** install the unscoped `knowz` package — that
name belongs to an unrelated icon-set library.

Inside a `knowz-platform` checkout you can build from source **instead** (a separate,
two-step alternative — never combined with the `npm i -g` line above):

```bash
cd cli
pnpm install
pnpm build
```

From that `cli` directory invoke `node packages/cli/bin/run.js`, or return to the repository root before resolving the function above.

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
| `3` | auth — run `knowz_cmd login` |
| `4` | API or transport error |
| `5` | not found |
| `1` | unexpected |

## MCP tool → CLI command map

| Instead of MCP tool | Run |
|---|---|
| `search_knowledge` / `advanced_search` | `knowz_cmd search "<query>" [--vault <id\|name>] [--limit N] --json` |
| `ask_question` | `knowz_cmd ask "<question>" [--vault <id\|name>] [--research] [--shared] --json` |
| `create_knowledge` | `knowz_cmd knowledge create "<title>" --content "<text>" [--type Note\|Document\|Code\|Link\|File] [--tag t] [--vault v]` (or `--file <path>` / pipe stdin) |
| `update_knowledge` | `knowz_cmd knowledge update <id> [--title] [--content\|--file] [--tag ...] [--vault]` |
| `amend_knowledge` / `amend_knowledge_async` | `knowz_cmd knowledge amend <id> "<instruction>" [--wait]` |
| `get_knowledge_item` | `knowz_cmd knowledge get <id> [--content] --json` |
| `list_knowledge_items` / `count_knowledge` | `knowz_cmd knowledge list [--vault v] [--type T] [--tag t] [--page N --page-size M] --json` |
| `get_version_history` | `knowz_cmd knowledge versions <id> --json` |
| `add_comment` / `list_comments` | `knowz_cmd knowledge comment <id> "<text>"` / `knowz_cmd knowledge comments <id> --json` |
| `upload_file` / `attach_files` | `knowz_cmd knowledge attach <id> <files...> [--content-type <mime>]` |
| `list_vaults` | `knowz_cmd vault list --json` |
| `list_vault_contents` | `knowz_cmd vault contents <id\|name> --json` |
| `create_vault` | `knowz_cmd vault create "<name>" [--description] [--vault-type]` |
| `find_entities` | `knowz_cmd entities find <type> [--query q] --json` |
| `list_topics` | `knowz_cmd topics list --json` |
| `get_statistics` | `knowz_cmd stats --json` |
| (live chat) | `knowz_cmd chat "<message>" [--vault v] [--mode Balanced\|Standard\|Creative] --json` |
| knowledge status | `knowz_cmd knowledge status <id> --json` |

## Local-first (no cloud, no MCP) — the CLI's superpower

| Task | Run |
|---|---|
| Index a repo/dir (tree-sitter chunking + code graph) | `knowz_cmd index scan <path> [--force]` |
| Local semantic search over indexed code | `knowz_cmd index search "<query>" [--limit N] --json` |
| Code-graph stats / top symbols | `knowz_cmd index graph --json` |
| Bind a checkout and emit agent context | `knowz_cmd repo setup` · `knowz_cmd repo context [--inject]` |
| Ingest arbitrary files into the local store | `knowz_cmd ingest add <paths...> [--type] [--tag]` |
| Local store info / init / reset | `knowz_cmd local info\|init\|reset --json` |
| Agent memory (Claude Code hooks) | `knowz_cmd hooks install` · `knowz_cmd capture observe` · `knowz_cmd recall [--inject]` |
| Browser dashboard (stats/search/graph) | `knowz_cmd web` (prints a localhost URL) |

## Auth, sync, encryption, Postgres, platform

- **Auth:** `knowz_cmd login --sso` (browser SSO) · `knowz_cmd login` (paste an API key, register, or self-hosted) · `knowz_cmd whoami` ·
  `knowz_cmd auth status`.
- **Sync local ↔ cloud:** `knowz_cmd sync status|pull|push|run`, with `sync conflicts|resolve|recover`
  when a run reports conflicts.
- **Model-3 CMEK** (cloud stores ciphertext only): `knowz_cmd cmek init` then sync — push encrypts,
  pull decrypts locally.
- **Local Postgres + pgvector** (optional, scales the local store): `knowz_cmd pg up` auto-provisions a
  local cluster and points the profile at it, so all `index`/`ingest`/`sync`/`local` commands then
  use Postgres. Stop with `knowz_cmd pg down`.
- **Public selfhosted:** `knowz_cmd up` opens browser-guided local setup. No commercial
  license is required. Use `--help` to confirm the installed version supports a desired option.
- **Managed runtimes:** when available in the inventory below, `knowz_cmd runtime status`,
  `logs`, `doctor`, `upgrade`, and `destroy` target the recorded edition. `up`, `down`,
  `backup`, and `restore` are edition-aware in releases advertising that support.
  Legacy `platform *` commands explicitly manage the contracted portable edition.
- **Contracted portable:** explicit `--edition portable` requires active contracted platform
  artifact rights. Paid SaaS alone, registry credentials, mirrors, `--offline`, or `--preloaded`
  do not grant those rights. Expiry blocks new image acquisition; data export/backup/stop
  remain available according to the existing runtime contract.
- **Endpoint compatibility:** selfhosted supports a smaller API surface. Check endpoint
  capabilities and distinguish unsupported features from authentication failures. Never
  promise every cloud command works against every Knowz endpoint, or move a stored key to
  another API origin when overriding `--api-url`.

## Guidance

- Default to `--json` when you'll parse the result; show human output when reporting to the user.
- For **local** code questions ("search the codebase", "what calls X"), use `index scan` +
  `index search` / `index graph` — fully offline, no auth, no MCP.
- For **cloud knowledge** (the user's vaults), ensure `whoami` succeeds first; if it exits `3`, run
  `login`.
- Prefer the CLI when installed and suitable. Supported MCP connections remain a fallback
  when the CLI is unavailable or the user chooses MCP; do not start selfhosted just to query cloud knowledge.

<!-- BEGIN GENERATED COMMANDS — regenerate with `pnpm gen:skill`; do not hand-edit -->

## Full command inventory

CLI release: `0.5.0`. Manifest SHA-256: `9f5063969235f7b26ba0af15f85e4cd38dee2d02967e0c24797f4d9a2e657e45`.
Before using this inventory, run `knowz_cmd --version` and require CLI `0.5.0`. If it is missing or differs, install `npm i -g @knowzai/cli@0.5.0`, resolve the binary again, and verify the version. Use this inventory only after the version matches.
Run `knowz <command> --help` for the flags not listed here.

### Top-level

| Command | What it does | Key flags |
|---|---|---|
| `knowz activate [credential]` | Link a portable Knowz installation to a mothership account. | `--hereforever` `--brand` `--mothership-url` `--name` `--config-dir` `--paste` `--scope` `--store` _(+3 more)_ |
| `knowz ask <question>` | Ask a question and get an AI-synthesized answer with sources. | `--hereforever` `--brand` `--research` `--shared` |
| `knowz backup [path]` | Create a private backup of the selected selfhosted or portable runtime. | `--hereforever` `--brand` `--edition` `--out` `--encrypt` `--name` `--config-dir` |
| `knowz chat [message]` | Live chat with your knowledge (SSE streaming, with sources). | `--hereforever` `--brand` `--mode` `--persona` `--temperature` `--conversation` `--research` `--no-fallback` |
| `knowz completion [shell]` | Output a shell completion script. Install with: eval "$(knowz completion bash)" (or zsh) in your shell rc. | `--hereforever` `--brand` |
| `knowz doctor [path]` | Check local Knowz CLI setup by indexing a generated or supplied repository, searching it, and reading graph stats. | `--hereforever` `--brand` `--db` `--keep-sample` `--query` |
| `knowz down` | Stop the selected Knowz runtime while preserving data and credentials. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` |
| `knowz export` | Export knowledge data to a portable package (Full ZIP with file bytes, or Light JSON). | `--hereforever` `--brand` `--out` `--mode` `--items` `--scope` `--async` `--job` _(+1 more)_ |
| `knowz import <file>` | Import a portable export package (JSON or ZIP) into this instance. | `--hereforever` `--brand` `--strategy` `--target-vault` `--validate-only` `--yes` |
| `knowz login` | Authenticate: browser SSO, paste an API key, register a new tenant, or use a self-hosted key. Verifies before storing. | `--hereforever` `--brand` `--sso` `--oauth` `--no-open` `--register` `--self-hosted` `--username` _(+12 more)_ |
| `knowz logout` | Remove stored credentials for the active profile (or all profiles) and clear its tenant binding. | `--hereforever` `--brand` `--all` |
| `knowz menu` | Interactive menu — browse and run every knowz operation (this is what `knowz` with no command opens). | `--hereforever` `--brand` `--frontend` |
| `knowz recall` | Recall relevant agent memory (local-first, vault-scoped). SessionStart hook target with --inject. | `--hereforever` `--brand` `--inject` `--local-only` `--deep` `--quiet` `--query` `--limit` _(+4 more)_ |
| `knowz restore <archive>` | Restore a selfhosted or portable backup after validating edition, integrity and target identity. | `--hereforever` `--brand` `--edition` `--replace-installation` `--clone` `--name` `--config-dir` `--yes` |
| `knowz search <query>` | Hybrid (keyword + semantic) search across knowledge. | `--hereforever` `--brand` `--limit` `--include-children` |
| `knowz setup` | Open local browser setup for Knowz; public selfhosted is the default edition. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` `--version` `--api-port` `--web-port` _(+5 more)_ |
| `knowz stats` | Show aggregate knowledge statistics for the tenant. | `--hereforever` `--brand` |
| `knowz status` | Show CLI status: active profile, resolved API URL, config path, and version. Works offline. | `--hereforever` `--brand` |
| `knowz transfer` | Move knowledge between two Knowz instances via their portability APIs (export → validate → import). | `--hereforever` `--brand` `--from` `--to` `--items` `--mode` `--strategy` `--target-vault` _(+3 more)_ |
| `knowz tui` | Interactive browser: list/search/open knowledge, vaults, entities, stats, chat, and edit settings in one REPL. | `--hereforever` `--brand` `--frontend` |
| `knowz up` | Start Knowz with browser setup and a local profile; public selfhosted is the default edition. | `--hereforever` `--brand` `--name` `--config-dir` `--version` `--provider` `--storage` `--api-port` _(+40 more)_ |
| `knowz web` | Launch the local web dashboard (store stats, semantic search, code graph, sync/CMEK status). | `--hereforever` `--brand` `--port` `--open` `--db` |
| `knowz whoami` | Verify the active credentials against the server and print identity. | `--hereforever` `--brand` |

### `auth` — Authentication status

| Command | What it does | Key flags |
|---|---|---|
| `knowz auth status` | Show authentication status (no secrets) for the active profile. | `--hereforever` `--brand` |

### `capture`

| Command | What it does | Key flags |
|---|---|---|
| `knowz capture observe` | Record one agent tool-use observation (Claude Code PostToolUse hook target). Fail-open, offline. | `--hereforever` `--brand` `--session` `--tool` `--summary` `--driver` `--db` `--dsn` |
| `knowz capture seal` | Seal captured agent memory into the durable outbox and flush it to the cloud knowledge graph. | `--hereforever` `--brand` `--from-pending` `--session` `--all` `--quiet` `--file` `--dir` _(+6 more)_ |
| `knowz capture status` | Show the agent-memory capture outbox (pending/inflight/done/dead) and observation backlog. | `--hereforever` `--brand` `--driver` `--db` `--dsn` |

### `cmek` — Model-3 customer-managed encryption (cloud stores ciphertext only)

| Command | What it does | Key flags |
|---|---|---|
| `knowz cmek decrypt` | Decrypt a CMEK envelope (from --file or stdin) back to plaintext (local only). | `--hereforever` `--brand` `--file` `--passphrase` |
| `knowz cmek encrypt [text]` | Encrypt text/file into a CMEK envelope (local only; prints the envelope). | `--hereforever` `--brand` `--file` `--passphrase` |
| `knowz cmek init` | Enable Model-3 CMEK for the active profile (passphrase-derived key, or a key file). | `--hereforever` `--brand` `--keyfile` |
| `knowz cmek status` | Show Model-3 CMEK status for the active profile. | `--hereforever` `--brand` |

### `config` — View and edit CLI settings

| Command | What it does | Key flags |
|---|---|---|
| `knowz config get <key>` | Get a setting on the active (or --profile) profile, or a global key like ui.frontend. | `--hereforever` `--brand` |
| `knowz config list` | Show the full config (profiles + active profile). A stored Postgres DSN password is redacted in this output only — the config file on disk still holds the credential in full. | `--hereforever` `--brand` |
| `knowz config path` | Print the path to the config file. | `--hereforever` `--brand` |
| `knowz config set <key> <value>` | Set a setting on the active (or --profile) profile, or a global key like ui.frontend. | `--hereforever` `--brand` |

### `entities` — Browse named entities (people, locations, events)

| Command | What it does | Key flags |
|---|---|---|
| `knowz entities find [type]` | Find named entities (people, locations, events, …) extracted from your knowledge. | `--hereforever` `--brand` `--query` `--limit` |

### `hooks`

| Command | What it does | Key flags |
|---|---|---|
| `knowz hooks install` | Install Claude Code hooks that auto-capture agent memory (PostToolUse/Stop/SessionEnd/PreCompact) and inject recall (SessionStart). | `--hereforever` `--brand` `--dir` `--global` `--print` `--command-prefix` `--db` |

### `index` — Index local code/docs (tree-sitter chunking + graph) and search it offline

| Command | What it does | Key flags |
|---|---|---|
| `knowz index graph` | Show code-graph stats from the last index run. | `--hereforever` `--brand` `--db` |
| `knowz index scan [path]` | Index local code into the local store (tree-sitter intelligent chunking + code graph). | `--hereforever` `--brand` `--force` `--db` |
| `knowz index search <query>` | Local semantic search over indexed code chunks (no cloud). | `--hereforever` `--brand` `--limit` `--db` |

### `ingest` — Ingest arbitrary files into the local store

| Command | What it does | Key flags |
|---|---|---|
| `knowz ingest add` | Ingest one or more files into the local store (chunk + embed; pushable with `knowz sync push`). | `--hereforever` `--brand` `--type` `--tag` `--db` |

### `knowledge` — Create, read, update, search, version, amend, and comment on knowledge

| Command | What it does | Key flags |
|---|---|---|
| `knowz knowledge amend <id> <instruction>` | Amend a knowledge item with a natural-language instruction (async; optionally wait). Blocked on CMEK-enabled profiles: the cloud applies the amendment and holds only ciphertext, and no encrypted-amendment envelope format exists yet — edit locally and use `knowledge update` instead. | `--hereforever` `--brand` `--wait` `--passphrase` |
| `knowz knowledge attach [id] [files]` | Upload local files and attach them to an existing knowledge item. | `--hereforever` `--brand` `--content-type` `--passphrase` |
| `knowz knowledge comment <id> <body>` | Add a comment to a knowledge item. | `--hereforever` `--brand` `--author` `--parent-id` |
| `knowz knowledge comments <id>` | List comments on a knowledge item. | `--hereforever` `--brand` |
| `knowz knowledge create [title]` | Create a knowledge item (content from --content, --file, or stdin). | `--hereforever` `--brand` `--title` `--content` `--file` `--type` `--tag` `--attach` _(+2 more)_ |
| `knowz knowledge delete <id>` | Soft-delete a knowledge item. | `--hereforever` `--brand` `--yes` |
| `knowz knowledge get <id>` | Fetch a knowledge item by id (rich formatted view). | `--hereforever` `--brand` `--content` |
| `knowz knowledge list` | List knowledge items (paginated, filterable). | `--hereforever` `--brand` `--type` `--tag` `--page` `--page-size` |
| `knowz knowledge status <id>` | Show enrichment/indexing status for a knowledge item. | `--hereforever` `--brand` |
| `knowz knowledge update <id>` | Update a knowledge item (title, content, tags, or vault). | `--hereforever` `--brand` `--title` `--content` `--file` `--tag` `--passphrase` |
| `knowz knowledge versions <id>` | List the version history of a knowledge item. | `--hereforever` `--brand` |

### `local` — Manage and browse the local store (SQLite/Postgres)

| Command | What it does | Key flags |
|---|---|---|
| `knowz local info` | Show local store stats (schema version, dim, item/chunk counts). | `--hereforever` `--brand` `--driver` `--db` `--dsn` |
| `knowz local init` | Initialize the local store (SQLite + sqlite-vec, or Postgres + pgvector). | `--hereforever` `--brand` `--driver` `--db` `--dsn` `--dim` |
| `knowz local list` | List items in the local store (offline; no cloud). | `--hereforever` `--brand` `--type` `--state` `--db` |
| `knowz local reset` | Delete the local SQLite store for the active profile. | `--hereforever` `--brand` `--db` `--yes` |
| `knowz local show <id>` | Show a local store item by id (offline). | `--hereforever` `--brand` `--content` `--db` |

### `mcp` — Serve bounded repository context over local-only stdio MCP

| Command | What it does | Key flags |
|---|---|---|
| `knowz mcp serve` | Serve the bound working-tree index over local-only stdio MCP. Never performs network I/O. | `--path` `--max-chars` |

### `peer`

| Command | What it does | Key flags |
|---|---|---|
| `knowz peer accept-fingerprint <peerRef>` | Accept a federation peer's NEW identity fingerprint (interactive-only; Owner). | `--hereforever` `--brand` `--email` |
| `knowz peer add <slug>` | Register a federation peer instance (requires a ukz_ personal API key for the remote). | `--hereforever` `--brand` `--url` `--name` `--key` `--email` |
| `knowz peer cancel <peerRef> <runId>` | Cancel an in-flight sync run. | `--hereforever` `--brand` `--email` |
| `knowz peer link <peerRef>` | Link a local vault to a remote vault on a federation peer. | `--hereforever` `--brand` `--local-vault` `--remote-vault` `--direction` `--email` |
| `knowz peer links <peerRef>` | List the vault links configured for a federation peer. | `--hereforever` `--brand` `--email` |
| `knowz peer list` | List federation peers. | `--hereforever` `--brand` `--all` `--email` |
| `knowz peer pull <peerRef>` | Pull vault content FROM a federation peer over a vault link (202 + runId). | `--hereforever` `--brand` `--link` `--since` `--skip-re-enrichment` `--max-file-mb` `--wait` `--timeout` _(+1 more)_ |
| `knowz peer push <peerRef>` | Push vault content TO a federation peer over a vault link (202 + runId). | `--hereforever` `--brand` `--link` `--since` `--skip-re-enrichment` `--max-file-mb` `--wait` `--timeout` _(+1 more)_ |
| `knowz peer remove <peerRef>` | Remove a federation peer. | `--hereforever` `--brand` `--email` |
| `knowz peer rotate-key <peerRef>` | Rotate the API key this instance presents to a federation peer. | `--hereforever` `--brand` `--key` `--email` |
| `knowz peer run <peerRef> <runId>` | Show one sync run (summary + item failure counts). | `--hereforever` `--brand` `--email` |
| `knowz peer runs <peerRef>` | List sync runs for a federation peer. | `--hereforever` `--brand` `--status` `--limit` `--cursor` `--email` |
| `knowz peer test <peerRef>` | Test the connection to a federation peer and show its identity fingerprint. | `--hereforever` `--brand` `--email` |
| `knowz peer unlink <peerRef> <linkId>` | Delete a vault link on a federation peer. | `--hereforever` `--brand` `--email` |

### `pg` — Auto-provision a local Postgres + pgvector cluster

| Command | What it does | Key flags |
|---|---|---|
| `knowz pg destroy` | Stop and DELETE the local Postgres cluster + data for this profile. | `--hereforever` `--brand` `--port` `--yes` |
| `knowz pg down` | Stop the local Postgres cluster for this profile (data is kept). | `--hereforever` `--brand` `--port` |
| `knowz pg status` | Show the local Postgres cluster status for this profile. | `--hereforever` `--brand` `--port` |
| `knowz pg up` | Provision a local Postgres + pgvector cluster (auto download/install/configure) and point this profile at it. | `--hereforever` `--brand` `--port` `--run-as` |

### `platform` — Legacy commands for explicit contracted portable runtimes

| Command | What it does | Key flags |
|---|---|---|
| `knowz platform destroy` | Permanently destroy only the selected runtime and its owned data volumes. | `--hereforever` `--brand` `--name` `--config-dir` `--yes` `--purge-profile` |
| `knowz platform doctor` | Check the selected runtime engine, service health, versions and provider configuration. | `--hereforever` `--brand` `--name` `--config-dir` |
| `knowz platform down` | Stop the selected Knowz runtime while preserving data and credentials. | `--hereforever` `--brand` `--name` `--config-dir` |
| `knowz platform logs` | Show redacted logs from the selected Knowz runtime. | `--hereforever` `--brand` `--name` `--config-dir` `--tail` |
| `knowz platform reset` | Stop the portable platform and permanently delete its volumes and runtime configuration (alias of `platform destroy`). | `--hereforever` `--brand` `--name` `--config-dir` `--yes` `--purge-profile` |
| `knowz platform setup` | Open the one-shot loopback setup console for a local portable Knowz platform. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` `--version` `--api-port` `--web-port` _(+5 more)_ |
| `knowz platform status` | Show actual container health and installed version for either Knowz edition. | `--hereforever` `--brand` `--name` `--config-dir` |
| `knowz platform up` | Install and start the complete portable Knowz platform with Docker Compose. | `--hereforever` `--brand` `--name` `--config-dir` `--version` `--provider` `--storage` `--api-port` _(+25 more)_ |
| `knowz platform upgrade` | Pull and apply a new pinned platform version while preserving data and secrets. | `--hereforever` `--brand` `--name` `--config-dir` `--version` |

### `profile` — Manage connection profiles (dev/prod/self-hosted/custom)

| Command | What it does | Key flags |
|---|---|---|
| `knowz profile add <name>` | Add a new profile. | `--hereforever` `--brand` `--use` |
| `knowz profile list` | List configured profiles (the active one is marked *). | `--hereforever` `--brand` |
| `knowz profile purge` | Delete every stored credential for every profile (run before removing the Knowz config directory). | `--hereforever` `--brand` `--all` `--yes` `--keep-profiles` |
| `knowz profile remove <name>` | Remove a profile (cannot remove the active one). | `--hereforever` `--brand` `--yes` |
| `knowz profile use <name>` | Switch the active profile. | `--hereforever` `--brand` |

### `repo` — Bind, index, search, graph, and wire local-first context for repository checkouts

| Command | What it does | Key flags |
|---|---|---|
| `knowz repo context [path]` | Emit a bounded local-first context block for agent hooks. | `--hereforever` `--brand` `--inject` `--quiet` `--db` `--max-chars` |
| `knowz repo graph [path]` | Query local code graph stats, symbols, or file neighborhoods for the bound repository. | `--hereforever` `--brand` `--symbol` `--file` `--neighborhood` `--kind` `--limit` `--offset` |
| `knowz repo index [path]` | Index the bound repository into its repo-local Knowz SQLite store. | `--hereforever` `--brand` `--force` `--sync` `--passphrase` |
| `knowz repo search <query>` | Search the bound repository locally using its repo-local Knowz SQLite index. | `--hereforever` `--brand` `--dir` `--limit` |
| `knowz repo setup [path]` | Bind a repository checkout to a Knowz vault and repo-local SQLite context store. | `--hereforever` `--brand` `--db` `--graph` `--force` `--sync` `--offline` `--create-vault` _(+9 more)_ |
| `knowz repo status [path]` | Show the Knowz repo binding and local index status. | `--hereforever` `--brand` |

### `runtime` — Manage the selected selfhosted or contracted portable runtime

| Command | What it does | Key flags |
|---|---|---|
| `knowz runtime destroy` | Permanently destroy only the selected runtime and its owned data volumes. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` `--yes` `--purge-profile` |
| `knowz runtime doctor` | Check the selected runtime engine, service health, versions and provider configuration. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` |
| `knowz runtime logs` | Show redacted logs from the selected Knowz runtime. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` `--tail` |
| `knowz runtime status` | Show actual container health and installed version for either Knowz edition. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` |
| `knowz runtime upgrade` | Upgrade an existing runtime to an explicit compatible version, preserving its data. | `--hereforever` `--brand` `--name` `--config-dir` `--edition` `--version` |

### `sync` — Sync the local store with the cloud — pull, push, resolve conflicts, recover

| Command | What it does | Key flags |
|---|---|---|
| `knowz sync conflicts` | List items in conflict (local + remote both changed). Resolve with `sync resolve`. | `--hereforever` `--brand` `--db` `--dsn` |
| `knowz sync pull` | Pull knowledge from the cloud into the local store. | `--hereforever` `--brand` `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync push` | Push local new/dirty knowledge to the cloud. | `--hereforever` `--brand` `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync recover` | Recovery: re-pull authoritative cloud state to repair the local store; reports conflicts + orphans. | `--hereforever` `--brand` `--passphrase` `--db` `--dsn` |
| `knowz sync resolve <id>` | Resolve a sync conflict by keeping the remote copy or the local copy. | `--hereforever` `--brand` `--keep-remote` `--keep-local` `--passphrase` `--db` `--dsn` |
| `knowz sync run` | Full sync: pull then push. | `--hereforever` `--brand` `--driver` `--db` `--dsn` `--passphrase` |
| `knowz sync status` | Show local↔cloud sync state (new/dirty/synced/conflict counts). | `--hereforever` `--brand` `--driver` `--db` `--dsn` |

### `topics` — Browse topics/categories

| Command | What it does | Key flags |
|---|---|---|
| `knowz topics list` | List topics/categories across your knowledge. | `--hereforever` `--brand` `--limit` |

### `vault` — List, create, and inspect vaults

| Command | What it does | Key flags |
|---|---|---|
| `knowz vault contents <ref>` | List the knowledge items in a vault. | `--hereforever` `--brand` `--page` `--page-size` |
| `knowz vault create <name>` | Create a vault. | `--hereforever` `--brand` `--description` `--parent-id` `--vault-type` |
| `knowz vault get <ref>` | Get a vault by id or name. | `--hereforever` `--brand` |
| `knowz vault list` | List vaults for the active tenant. | `--hereforever` `--brand` |

<!-- END GENERATED COMMANDS -->
