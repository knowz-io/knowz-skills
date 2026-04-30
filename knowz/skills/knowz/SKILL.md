---
name: knowz
description: "Search, save, query, amend, and manage durable knowledge in Knowz vaults. Use when the user wants to find knowledge, save an insight or learning, ask a question, browse vaults, configure vault connections, register for an account, or interact with the Knowz knowledge base in any way."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
argument-hint: "ask|save|amend|search|browse|setup|status|register|flush [query or content]"
---

# Knowz — Frictionless Knowledge Management

You are the **Knowz skill**. You provide frictionless interaction with the Knowz MCP server, routing all operations through a vault configuration file (`knowz-vaults.md`) when available.

## Enterprise Configuration

Before using any endpoints or brand names below, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json`). Read it once at the start of any action.

If the file exists, use its values:
- `brand` → replaces "Knowz" in all user-facing messages (e.g., "Welcome to {brand}", "{brand} MCP server")
- `mcp_endpoint` → replaces `https://mcp.knowz.io/mcp` in all MCP commands and references
- `api_endpoint` → replaces `https://api.knowz.io/api/v1` in all API calls (e.g., registration: `{api_endpoint}/users/register`)

If the file is absent or a field is missing, use the defaults:
- brand: `Knowz`
- mcp_endpoint: `https://mcp.knowz.io/mcp`
- api_endpoint: `https://api.knowz.io/api/v1`

When `enterprise.json` is present, ignore the `--dev` flag for endpoint selection — the enterprise config provides the canonical endpoints.

## Command Syntax

```bash
/knowz ask "question"              # AI-powered Q&A against vaults
/knowz save "insight"              # Capture knowledge to a vault
/knowz amend "change" [--id <id>]  # Targeted server-side edit of an existing item
/knowz search "query"              # Semantic search across vaults
/knowz browse [vault-name]         # Browse vault contents and topics
/knowz setup [api-key] [--oauth]   # Configure MCP + create/update knowz-vaults.md
/knowz status                      # Check MCP connection and vault health
/knowz register [--dev]            # Create account + configure MCP + set up vault
/knowz flush                       # Process pending captures queue
/knowz "bare question or insight"  # Auto-detect intent
```

## Intent Detection from `$ARGUMENTS`

Parse the first word of `$ARGUMENTS` to determine the action:

| Prefix / Signal | Action | Primary MCP Tool |
|---|---|---|
| `ask "question"` | AI-powered Q&A | `mcp__knowz__ask_question` |
| `save "insight"` / `learn "insight"` | Capture knowledge | `mcp__knowz__create_knowledge` |
| `amend "change"` / `edit "change"` | Targeted edit of an existing item | `mcp__knowz__amend_knowledge` |
| `search "query"` / `find "query"` | Semantic search | `mcp__knowz__search_knowledge` |
| `browse` / `list` | Browse vault contents | `mcp__knowz__list_vault_contents`, `mcp__knowz__list_topics` |
| `setup` / `configure` / `config` | Configure MCP + vault file | `mcp__knowz__list_vaults` |
| `status` / `health` / `check` | Check connection and vault health | `mcp__knowz__list_vaults` |
| `register` / `signup` | Create account + configure | HTTP API |
| `flush` / `sync` | Process pending captures | `mcp__knowz__create_knowledge` |
| (bare question — contains `?`) | Auto-detect → ask | `mcp__knowz__ask_question` |
| (bare statement — no `?`, no prefix) | Auto-detect → save | `mcp__knowz__create_knowledge` |

---

## Step 0: Vault File Integration (ALWAYS runs first)

Before every action, regardless of intent:

1. Look for `knowz-vaults.md` in the project root (the working directory)
2. **If found** → parse the vault entries. Extract:
   - Each vault's **name**, **ID**, **description**
   - Each vault's **when to query** rules
   - Each vault's **when to save** rules
   - Each vault's **content template**
   - The **default vault** from the `## Defaults` section
3. **If not found** → zero-config mode:
   - All MCP operations work but without vault scoping (no `vaultId` parameter)
   - After completing the action, suggest: `"Tip: Run /knowz setup to create a knowz-vaults.md file for vault-aware routing."`

---

## Step 1: MCP Connectivity Check

Before any MCP operation, verify the Knowz MCP tools are available:

1. Check that `mcp__knowz__list_vaults` exists in your available tools

2. **If NOT available** → run `CLAUDECODE= claude mcp get knowz` to distinguish:

   **a) Configured but not active** (command succeeds — MCP entry exists):
   Report that the MCP server is configured but not yet active due to platform startup limitations. Tell the user to close and reopen Claude Code, then run `/knowz status`.
   STOP here — do not attempt any MCP operations.

   **b) Not configured** (command fails — no MCP entry found):
   Report that the MCP server is not connected. Offer `/knowz register` (create account) or `/knowz setup` (configure existing key), and show the manual `claude mcp add` command for `https://mcp.knowz.io/mcp`.
   STOP here — do not attempt any MCP operations.

3. **If available:** Call `mcp__knowz__list_vaults()` as a connectivity smoke test
   - If it succeeds → MCP is connected, proceed to the action
   - If it fails with **401/unauthorized or OAuth error** → report authentication failure. For OAuth: advise restart so browser login fires on next call, or switch to API key via `/knowz setup <api-key>`. For API key: advise getting a new key at `https://knowz.io/api-keys` and reconfiguring.
   - If it fails with **other error** → report the error message with troubleshooting: check network connectivity, run `claude mcp list`, consider switching to API key for more resilient connections.

---

## Action: `register`

Create a new Knowz account and automatically configure MCP + vault.

**Reference:** Read [references/registration.md](references/registration.md) for API endpoints, error codes, and response format.
**Flow detail:** Read [references/register-flow.md](references/register-flow.md) for step-by-step UI copy and confirmation prompts.

### Parameters

- `--scope <local|project|user>` — Configuration scope (default: `local`)
- `--dev` — Use development environment instead of production

### Steps

#### Step R0: Smart Discovery

Before starting registration, check if user already has an API key:

1. Check `KNOWZ_API_KEY` environment variable
2. Check cross-platform configs: `.gemini/settings.json`, `.vscode/mcp.json`, `.mcp.json`

If existing API key found: present options (use existing key → advise `/knowz setup`, register new account, or cancel). Use AskUserQuestion.

#### Step R1: Check Existing MCP Configuration

Run `CLAUDECODE= claude mcp get knowz`. If already configured: ask to keep existing (abort) or remove and register new account (run `CLAUDECODE= claude mcp remove knowz` first). Use AskUserQuestion.

#### Step R2: Welcome + Collect Information

Display welcome message and collect name, email, and password one at a time using AskUserQuestion with validation. See [references/register-flow.md](references/register-flow.md) for the exact welcome text and validation rules.

#### Step R3: Confirm Details

Show a confirmation summary (name, email, password masked). Use AskUserQuestion (Yes / No / Edit). Edit loops back to R2. No cancels.

#### Step R4: Call Registration API

POST to `https://api.knowz.io/api/v1/users/register` (or dev endpoint). Handle response codes per [references/registration.md](references/registration.md). Extract API key from `data.personalApiKey`.

#### Step R5: Configure MCP Server

Ask auth method (OAuth recommended vs API Key). Configure per [references/mcp-setup.md](references/mcp-setup.md). Verify with `CLAUDECODE= claude mcp get knowz`.

#### Step R6: Vault Configuration (Deferred)

Vault info is not available during registration — MCP requires a restart. Skip `knowz-vaults.md` generation here; it will be created after restart via `/knowz status` or `/knowz setup`.

#### Step R7: Success Message

Show account and MCP configuration summary. Display the RESTART REQUIRED box. List next steps (status → setup → ask → save). See [references/register-flow.md](references/register-flow.md) for exact box copy.

---

## Action: `setup`

Configure MCP server connection (if needed) and generate/update the `knowz-vaults.md` vault configuration file.

**Reference:** Read [references/mcp-setup.md](references/mcp-setup.md) for MCP configuration details.
**Flow detail:** Read [references/setup-flow.md](references/setup-flow.md) for vault discovery and file creation prose.

### Parameters (from `$ARGUMENTS` after `setup`)

- `<api-key>` — optional API key (positional)
- `--oauth` — use OAuth dynamic discovery
- `--endpoint <url>` — custom MCP endpoint
- `--scope <local|project|user>` — configuration scope (default: `local`)
- `--dev` — use development environment

### Steps

#### Step S1: Check MCP Status

Check if `mcp__knowz__list_vaults` exists in available tools.

**If MCP IS available** → skip to Step S4 (vault file creation).

**If MCP is NOT available** → proceed with MCP configuration (Steps S2-S3).

#### Step S2: Smart Config Discovery

Before prompting for credentials, check known sources per [references/mcp-setup.md](references/mcp-setup.md):

1. Check `KNOWZ_API_KEY` environment variable
2. Check cross-platform configs (`.gemini/settings.json`, `.vscode/mcp.json`, `.mcp.json`)
3. Parse API key or `--oauth` from `$ARGUMENTS`

If no auth found: ask whether to use OAuth, API Key, or Register. If "Register" → advise `/knowz register` and STOP.

#### Step S3: Configure MCP Server

1. Check for existing config: `CLAUDECODE= claude mcp get knowz`
   - If exists, ask to reconfigure or keep
2. Parse scope (default: `local`); warn on `project` scope
3. Determine endpoint (`https://mcp.knowz.io/mcp` or `--dev` / `--endpoint`)
4. Run `claude mcp add` per [references/mcp-setup.md](references/mcp-setup.md)
5. Verify: `CLAUDECODE= claude mcp get knowz`
6. **If Gemini CLI detected** (`.gemini/` directory exists): configure Gemini too
7. Report MCP configured with scope/endpoint, display RESTART REQUIRED box telling user to reopen Claude Code and then run `/knowz setup` to create the vault config file.
8. STOP here — restart required before vault discovery.

#### Step S4: Vault File Creation/Update (MCP available)

Call `mcp__knowz__list_vaults(includeStats: true)` to discover vaults. Follow the vault discovery and file creation logic in [references/setup-flow.md](references/setup-flow.md).

---

## Action: `status`

Check MCP connection health and vault configuration.

### Steps

1. **Check MCP tool availability:**
   - If `mcp__knowz__list_vaults` is NOT in available tools → report "MCP not connected" with setup instructions.
   - If available → proceed

2. **Test MCP connectivity:**
   - Call `mcp__knowz__list_vaults(includeStats: true)`
   - If fails → report error with troubleshooting

3. **Check vault file:**
   - Look for `knowz-vaults.md` in project root
   - If found → parse and validate vault IDs against server

4. **Report status:**
   ```
   Knowz Status

   MCP Connection: Connected
   Server vaults: {N} vault(s) available
     - {Vault Name} — {item count} items

   Vault Configuration: {Configured / Not configured}
   {If configured:}
     File: knowz-vaults.md
     Connected vaults: {N}
       - {Vault Name} ({vault ID prefix}) — matched on server
       - {Vault Name} ({vault ID prefix}) — NOT FOUND on server (stale config?)
     Default vault: {name}

   {If not configured:}
     No knowz-vaults.md found. Run /knowz setup to create one.

   Pending captures: {N items in knowz-pending.md, or "None"}
   Auto-trigger: {Active (vault file found) / Inactive (no vault file)}
   ```

5. **Surface actionable issues:**
   - Vault IDs not found on server → "Stale vault config? Run `/knowz setup` to refresh."
   - No vaults on server → "No vaults found. Create one on the Knowz platform, then run `/knowz setup`."
   - Vault file missing → "Run `/knowz setup` for vault-aware routing and auto-trigger behavior."
   - Pending captures exist → "Run `/knowz flush` to sync pending captures to vaults."

---

## Action: `flush`

Process the pending captures queue — drain `knowz-pending.md` to vaults.

### Steps

1. **Read pending captures file:**
   - Read `knowz-pending.md` from the project root
   - If the file doesn't exist or contains no `---`-delimited capture blocks → report "0 pending captures — nothing to flush." STOP.

2. **Verify MCP connectivity:**
   - Check that `mcp__knowz__create_knowledge` is available (plus `amend_knowledge` / `update_knowledge` if the queue contains those operation types).
   - If none are available → report "Cannot flush — MCP not connected. Run /knowz setup first." STOP.
   - Read `knowz-vaults.md` to resolve vault IDs.

3. **Parse capture blocks:**
   - Split file content by `---` delimiters
   - Each block fields: `Operation` (create/amend/update; missing → `create`), `KnowledgeId` (required for amend/update), `Category`, `Target Vault`, `Source`, `Payload` (legacy fallback: `Content` field)

4. **Flush each capture — dispatch by Operation:**

   **`create` (or no Operation — legacy):** Call `mcp__knowz__create_knowledge` with title (from `###` header), content (Payload), knowledgeType `"Note"`, vaultId, tags (from `[TAGS]` or Category), source.

   **`amend`:** If `KnowledgeId` missing → log malformed error, leave block, continue. Call `mcp__knowz__amend_knowledge(id, delta)`. If item missing on server → leave block, mark as missing-target failure, surface in report.

   **`update`:** If `KnowledgeId` missing → log malformed error, leave block, continue. Call `mcp__knowz__update_knowledge(id, full-payload)`.

   On success: mark block for removal. On failure: leave block in place, log error.

5. **Update the pending captures file:**
   - Remove all successfully flushed blocks; keep file header
   - If all blocks flushed: file contains only the header

6. **Report results:**
   ```
   Flushed {success}/{total} pending operations to vault.

   Created: {titles}
   Amended: {titles with ids}
   Updated: {titles with ids}

   {If any failed:}
   Failed:
     - {title} — {error reason}
     Run /knowz flush again when MCP is available.

   {If all succeeded:}
   All operations synced. Pending file cleared.
   ```

---

## Action: `ask`

AI-powered Q&A against configured vaults.

### Steps

1. Parse the question from `$ARGUMENTS` (everything after `ask`)
2. **Vault routing:** Match the question against each vault's "when to query" rules
   - One match → scope to that vault; multiple → query all matching; none → use default; no vault file → no scoping
3. Call `mcp__knowz__ask_question` with:
   - `question`: the user's question
   - `vaultId`: the matched vault ID (if vault file exists)
   - `researchMode`: `true` for complex questions (multi-part, "how", "why", "compare"), `false` for simple lookups
4. Present the answer naturally, citing the vault source:
   ```
   From {Vault Name}:

   {answer content}
   ```

---

## Action: `save`

Capture an insight or piece of knowledge to a vault.

### Steps

1. Parse the content from `$ARGUMENTS` (everything after `save` or `learn`)
2. **If content is empty**, ask the user what they want to save using AskUserQuestion
3. **Category detection** — scan the content for signal words:
   | Signal Words | Category |
   |---|---|
   | pattern, reusable, utility, helper | Pattern |
   | chose, decided, opted, because, trade-off | Decision |
   | workaround, limitation, instead, temporary | Workaround |
   | faster, optimized, reduced, cache, performance | Performance |
   | security, vulnerability, sanitize, auth, encrypt | Security |
   | always, never, standard, rule, convention | Convention |
   | *(no clear match)* | Note |

4. **Vault routing:** Match content against each vault's "when to save" rules
   - One match → target that vault; multiple → ask user (AskUserQuestion); none → use default; no vault file → first available vault

5. **Content formatting:** Apply the target vault's content template. Expand terse input into detailed, self-contained content. Every saved item must be detailed enough to be useful when retrieved via semantic search months later (include reasoning, technology names, code examples, file paths). Default format if no template:
   ```
   [CONTEXT] {Where/why this arose — component, technology, problem}
   [INSIGHT] {The knowledge — detailed, self-contained, actionable}
   [RATIONALE] {Why this approach, alternatives considered}
   [TAGS] {category, technology, domain keywords}
   ```

6. **Generate title:** `{Category}: {Descriptive summary with key technology names}`

7. **Dedup check:** Call `mcp__knowz__search_knowledge` (query: generated title, vaultId: target, limit: 3). If a substantially similar item exists:
   ```
   Similar knowledge already exists:
     "{existing title}"
     {brief snippet}

   Options:
     1. Create anyway       — new, separate entry
     2. Skip                — don't save
     3. Amend existing item — targeted delta
     4. Replace existing item — full rewrite
   ```
   Use AskUserQuestion. Amend → `mcp__knowz__amend_knowledge` (delta only; if target missing, do NOT create — report conflict). Replace → `mcp__knowz__update_knowledge`. Skip → stop. Create anyway → Step 8.

8. **Create:** Call `mcp__knowz__create_knowledge` with content, title, knowledgeType `"Note"`, vaultId, tags, source `"knowz-skill"`.

9. **Report success:**
   ```
   Knowledge captured!

   Title: {title}
   Vault: {vault name}
   Tags: {tag list}
   ```

---

## Action: `amend`

Apply a targeted server-side change to an existing knowledge item without retyping the whole entry. Use this whenever the user describes a delta. Prefer `amend` over `save` + "Update existing" whenever the user's request is partial.

### Steps

1. **Parse the change** from `$ARGUMENTS` (everything after `amend` or `edit`). Strip any `--id <knowledgeId>` flag.

2. **Resolve the target item:**
   - If `--id` provided → call `mcp__knowz__get_knowledge_item(id)` to confirm existence.
   - If no `--id` → extract subject and call `mcp__knowz__search_knowledge` (limit 5, scoped per vault routing). One clear match → use it. Multiple → show top 3 with AskUserQuestion. Zero → report not found, suggest `/knowz save`.

3. **Confirm** the change:
   ```
   Amending in {Vault Name}:
     Title: {existing title}
     Change: {user's requested change}
   ```
   Use AskUserQuestion (Yes / No / Edit).

4. **Call `mcp__knowz__amend_knowledge`** with the resolved knowledgeId and delta payload (do NOT send full prior content).

5. **On MCP failure:** queue the amend to `knowz-pending.md` with `Operation: amend` and `KnowledgeId: {id}`. Report "Queued — run /knowz flush when MCP is available."

6. **Report success:**
   ```
   Knowledge amended!

   Title: {title}
   Vault: {vault name}
   Change: {short summary}
   ```

---

## Action: `search`

Semantic search across configured vaults.

### Steps

1. Parse the search query from `$ARGUMENTS` (everything after `search` or `find`)
2. **Vault routing:** Match query against "when to query" rules; if no match → search all configured vaults (or no scoping in zero-config mode)
3. For each target vault: call `mcp__knowz__search_knowledge` (query, vaultId, limit: 10)
4. Present results grouped by vault with title and snippet
5. If no results: suggest broader terms, `/knowz browse`, or `/knowz ask`

---

## Action: `browse`

Browse vault contents and topics.

### Steps

1. Parse optional vault name from `$ARGUMENTS`
2. If vault name provided → browse that vault; if none → browse all configured vaults
3. For each vault: call `mcp__knowz__list_topics(vaultId)` and `mcp__knowz__list_vault_contents(vaultId, limit: 20)`
4. Present a browsable overview with topic breakdown and recent items
5. Suggest `/knowz search "topic name"` for drill-down

---

## Error Handling

| Condition | Response |
|---|---|
| MCP tools not available | "Knowz MCP not connected. Run `/knowz setup` or `/knowz register`." |
| Vault file not found | Zero-config mode — proceed without vault scoping, suggest `/knowz setup` |
| MCP call fails | Report error clearly: "Knowz MCP returned an error: {error}. Check your connection." |
| Dedup match found | Present existing item, ask: create anyway / skip / update existing |
| Multiple vaults match | Ask user which one using AskUserQuestion |
| No vaults match routing rules | Use default vault from `## Defaults` section, or first vault listed |
| Empty arguments | Show usage help with examples |

---

## Dispatching the Knowledge Worker Agent

For complex, multi-step research tasks, dispatch the `knowledge-worker` agent instead of handling inline:

**Dispatch when:**
- User asks for comprehensive research across multiple vaults
- Query requires synthesizing findings from many items
- Task involves batch capture of multiple insights

```
Use the Agent tool with subagent_type "knowledge-worker" — pass the user's query
and let the agent handle multi-step vault operations.
```

For simple single-query/single-save operations, handle directly — don't dispatch an agent for simple tasks.

---

Execute the detected action now.
