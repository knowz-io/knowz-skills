---
name: knowz
description: "Search, save, query, and manage knowledge in Knowz vaults. Use when the user wants to find knowledge, save an insight, ask a question, browse vaults, configure vault connections, register for an account, or interact with the Knowz knowledge base in any way."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep, AskUserQuestion
argument-hint: "ask|save|search|browse|setup|status|register|flush [query or content]"
---

# Knowz — Frictionless Knowledge Management

You are the **Knowz skill**. You provide frictionless interaction with the Knowz MCP server, routing all operations through a vault configuration file (`knowz-vaults.md`) when available.

## Command Syntax

```bash
/knowz ask "question"              # AI-powered Q&A against vaults
/knowz save "insight"              # Capture knowledge to a vault
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
   The server was configured in this session but Claude Code hasn't loaded it yet.
   ```
   ┌─────────────────────────────────────────────────────┐
   │  RESTART REQUIRED                                   │
   │                                                     │
   │  Knowz MCP server is configured but not yet active. │
   │                                                     │
   │  Claude Code only loads MCP servers at startup —    │
   │  this is a platform limitation, not a bug.          │
   │                                                     │
   │  → Close and reopen Claude Code                     │
   │  → Then run: /knowz status                          │
   └─────────────────────────────────────────────────────┘
   ```
   STOP here — do not attempt any MCP operations.

   **b) Not configured** (command fails — no MCP entry found):
   ```
   Knowz MCP server is not connected.

   To set it up:
     /knowz register     — create an account and configure automatically
     /knowz setup        — configure with an existing API key or OAuth

   Or configure manually:
     claude mcp add --transport http --scope local knowz https://mcp.knowz.io/mcp \
       --header "Authorization: Bearer <your-api-key>"

   Then restart Claude Code and run /knowz status to verify.
   ```
   STOP here — do not attempt any MCP operations.

3. **If available:** Call `mcp__knowz__list_vaults()` as a connectivity smoke test
   - If it succeeds → MCP is connected, proceed to the action
   - If it fails with **401/unauthorized or OAuth error** → authentication issue:
     ```
     ┌─────────────────────────────────────────────────────┐
     │  AUTHENTICATION FAILED                              │
     │                                                     │
     │  The Knowz MCP server returned an auth error.       │
     │                                                     │
     │  If using OAuth:                                    │
     │    → Restart Claude Code — browser will open for    │
     │      login on the next MCP call                     │
     │    → If this keeps happening, switch to API Key:    │
     │      /knowz setup <your-api-key>                    │
     │      (no browser login or token refresh needed)  │
     │                                                     │
     │  If using API Key:                                  │
     │    → Your key may be invalid or expired             │
     │    → Get a new key at: https://knowz.io/api-keys    │
     │    → Reconfigure: /knowz setup <new-key>            │
     └─────────────────────────────────────────────────────┘
     ```
   - If it fails with **other error** → report with troubleshooting:
     ```
     Knowz MCP server is configured but returned an error:
       {error message}

     This usually means:
       - The Knowz server is temporarily unreachable
       - There's a network connectivity issue

     Try:
       - Verify network connectivity to the Knowz server
       - Run "claude mcp list" to inspect server status
       - If using OAuth and errors persist, consider switching to API Key
         for more resilient connections: /knowz setup <api-key>
     ```

---

## Action: `register`

Create a new Knowz account and automatically configure MCP + vault.

**Reference:** Read [references/registration.md](references/registration.md) for API endpoints, error codes, and response format.

### Parameters

- `--scope <local|project|user>` — Configuration scope (default: `local`)
- `--dev` — Use development environment instead of production

### Steps

#### Step R0: Smart Discovery

Before starting registration, check if user already has an API key:

1. Check `KNOWZ_API_KEY` environment variable
2. Check cross-platform configs: `.gemini/settings.json`, `.vscode/mcp.json`, `.mcp.json`
   - Extract Bearer token from Authorization headers if found

If existing API key found:
```
You already have a Knowz API key configured (ending ...{last4}) from {source}.

Options:
1. Use existing key — run /knowz setup to configure this platform
2. Register a new account anyway
3. Cancel
```

If user chooses option 1: advise running `/knowz setup` with discovered key.
If user chooses option 2: proceed with registration normally.
If user chooses option 3: stop.

#### Step R1: Check Existing MCP Configuration

1. Run: `CLAUDECODE= claude mcp get knowz`
2. If already configured:
   ```
   Knowz MCP server is already configured.

   Options:
   1. Keep existing configuration (abort registration)
   2. Remove existing and register new account
   ```
   Use AskUserQuestion. If they keep existing, STOP.
   If they continue, run `CLAUDECODE= claude mcp remove knowz` first.

#### Step R2: Welcome + Collect Information (one question at a time)

**CRITICAL: Interactive Flow — ask ONE question, then WAIT for response.**

Display welcome:
```
KNOWZ REGISTRATION

Welcome! Let's set up your Knowz account.

This will:
1. Create your Knowz account
2. Generate an API key
3. Configure the MCP server automatically

All data transmitted securely over HTTPS.
Privacy policy: https://knowz.io/privacy
```

Then use AskUserQuestion to collect (one at a time, validating each):

1. **Name** — "What name would you like for your account?"
   - Validation: non-empty, 2-100 characters
2. **Email** — "What is your email address?"
   - Validation: contains `@` and domain
3. **Password** — "Create a password (minimum 8 characters)"
   - Note: "Your password will be sent securely over HTTPS. It will NOT be stored locally."
   - Validation: minimum 8 characters

#### Step R3: Confirm Details

```
CONFIRM REGISTRATION

Name:      {name}
Email:     {email}
Password:  ********

Is this correct?
```

Use AskUserQuestion with options: Yes / No / Edit.
- If "Edit": go back to Step R2
- If "No": cancel and STOP
- If "Yes": proceed

#### Step R4: Call Registration API

Determine endpoint based on `--dev` flag (see [references/registration.md](references/registration.md)).

```bash
curl -X POST https://api.knowz.io/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name": "{name}", "email": "{email}", "password": "{password}"}'
```

Handle response codes per [references/registration.md](references/registration.md).

Extract from response: API key (`apiKey`/`api_key`/`token`), vault ID (`vault_id`/`vaultId`), vault name.

#### Step R5: Configure MCP Server

Parse scope from arguments (default: `local`). If `project` scope, warn about `.mcp.json` git visibility.

Ask auth method:
```
How would you like to authenticate with the MCP server?

  OAuth (recommended) — authenticate via browser, tokens auto-managed
  API Key — use the key from registration, no browser step needed
```

Configure per [references/mcp-setup.md](references/mcp-setup.md).

Verify: `CLAUDECODE= claude mcp get knowz`

#### Step R6: Generate Vault Configuration

1. Generate `knowz-vaults.md` with the registered vault using the format from `knowz-vaults.example.md`
2. Pre-populate routing rules based on the vault name/description
3. **KC interop:** If `knowzcode/knowzcode_vaults.md` exists, update the vault IDs there too (see KC Vault File Interop section)

#### Step R7: Success Message

```
REGISTRATION COMPLETE

Account:
  Email: {email}
  Auth: {OAuth OR API Key: masked_key}

MCP Configuration:
  Scope: {scope}
  Endpoint: {endpoint}
  Status: Configured

Vault:
  Name: {vault_name}
  ID: {vault_id prefix...}
  File: knowz-vaults.md
```

Then display the restart box:
```
┌─────────────────────────────────────────────────────┐
│  RESTART REQUIRED                                   │
│                                                     │
│  Claude Code must be restarted to load the new      │
│  MCP server — this is a platform limitation.        │
│                                                     │
│  → Close and reopen Claude Code                     │
│  → Then run: /knowz status                          │
│                                                     │
│  {If OAuth: "Your browser will open for login on    │
│   the first MCP call after restart."}               │
└─────────────────────────────────────────────────────┘

After restart:
  1. Verify connection: /knowz status
  2. Try: /knowz ask "your first question"
  3. Save knowledge: /knowz save "your first insight"
```

---

## Action: `setup`

Configure MCP server connection (if needed) and generate/update the `knowz-vaults.md` vault configuration file.

**Reference:** Read [references/mcp-setup.md](references/mcp-setup.md) for MCP configuration details.

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

If no auth found from any source:
```
No API key found. How would you like to authenticate?

  OAuth (recommended) — authenticate via browser, tokens auto-managed
  API Key — enter a Knowz API key, no browser step needed
  Register — create a new account (/knowz register)
```

If user chooses "Register" → advise running `/knowz register` and STOP.

#### Step S3: Configure MCP Server

1. Check for existing config: `CLAUDECODE= claude mcp get knowz`
   - If exists, ask to reconfigure or keep
2. Parse scope (default: `local`); warn on `project` scope
3. Determine endpoint (`https://mcp.knowz.io/mcp` or `--dev` / `--endpoint`)
4. Run `claude mcp add` per [references/mcp-setup.md](references/mcp-setup.md)
5. Verify: `CLAUDECODE= claude mcp get knowz`
6. **If Gemini CLI detected** (`.gemini/` directory exists): configure Gemini too
7. Report:
   ```
   MCP server configured!
   Scope: {scope}
   Endpoint: {endpoint}

   ┌─────────────────────────────────────────────────────┐
   │  RESTART REQUIRED                                   │
   │                                                     │
   │  Claude Code must be restarted to load the new      │
   │  MCP server — this is a platform limitation.        │
   │  MCP servers only connect at session startup.       │
   │                                                     │
   │  → Close and reopen Claude Code                     │
   │  → Then run: /knowz setup                           │
   │    (to create your vault configuration file)        │
   └─────────────────────────────────────────────────────┘
   ```
   STOP here — restart required before vault discovery.

#### Step S4: Vault File Creation/Update (existing flow, MCP available)

1. Call `mcp__knowz__list_vaults(includeStats: true)` to discover vaults
2. **If `knowz-vaults.md` already exists:**
   - Read the existing file
   - Compare configured vaults against server vaults
   - Show what's configured vs available:
     ```
     Current vault configuration:

     Configured:
       - Engineering Knowledge (abc-123) — 42 items
       - Company Wiki (def-456) — 18 items

     Available on server but not configured:
       - Personal Notes (ghi-789) — 7 items

     Would you like to:
     1. Add missing vaults to your configuration
     2. Reconfigure from scratch
     3. Keep current configuration
     ```
   - Use AskUserQuestion to get their choice
   - Update the file accordingly

3. **If `knowz-vaults.md` does not exist:**
   - **If server has vaults:** Present discovered vaults to the user:
     ```
     Found {N} vault(s) on the Knowz server:

       1. {Vault Name} — {item count} items
          "{vault description}"

       2. {Vault Name} — {item count} items
          "{vault description}"

     Which vaults would you like to connect to this project?
     (Enter numbers, "all", or "none")
     ```
   - Use AskUserQuestion to get their selection
   - For each selected vault, ask (or infer from the vault description):
     - Brief description of what this vault contains
     - When to query it (plain English rules)
     - When to save to it (plain English rules)
   - Generate `knowz-vaults.md` using the format from `knowz-vaults.example.md`
   - Write the file to the project root

   - **If server has NO vaults:** Offer to create one:
     ```
     No vaults found on the Knowz server.

     Would you like to create a vault for this project?
     I can set up a general-purpose knowledge vault to get you started.

     Suggested vault:
       Name: "{project-name} Knowledge"
       Description: "Architecture decisions, code patterns, conventions, and technical learnings for {project-name}"
     ```
   - Use AskUserQuestion for confirmation and to let user customize the name/description
   - If confirmed → call `mcp__knowz__create_vault(name, description)` to create it
   - Then generate `knowz-vaults.md` with the newly created vault
   - Pre-populate sensible "when to query" and "when to save" rules based on the vault description

4. **Smart defaults for routing rules:**
   When generating rules for a vault, infer from the vault's name and description:
   - A vault named "Engineering Knowledge" or with "decisions" in description →
     - When to query: architecture decisions, conventions, "why did we...", best practices
     - When to save: decisions about approach, new conventions, workarounds
   - A vault named "Company Wiki" or with "processes" in description →
     - When to query: team processes, onboarding, "how do we...", policies
     - When to save: new processes, policy changes, team structure updates
   - A vault with "patterns" or "code" in description →
     - When to query: code patterns, "how did we build...", implementation examples
     - When to save: reusable patterns, workarounds, performance insights
   - For vaults that don't match any heuristic → use generic rules and ask the user to customize

5. **KC Vault File Interop:** If `knowzcode/knowzcode_vaults.md` exists, update vault IDs there too (see KC Vault File Interop section).

6. Report success:
   ```
   Vault configuration saved to knowz-vaults.md

   Connected vaults:
     - {Vault Name} (query + save)
     - {Vault Name} (query only)

   You can now use:
     /knowz ask "question"    — query your vaults
     /knowz save "insight"    — save to your vaults
     /knowz search "term"     — search across vaults
   ```

---

## Action: `status`

Check MCP connection health and vault configuration.

### Steps

1. **Check MCP tool availability:**
   - If `mcp__knowz__list_vaults` is NOT in available tools → report "MCP not connected" with setup instructions:
     ```
     Knowz MCP not connected. Run /knowz setup or /knowz register to configure.
     ```
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
   - Vault IDs in the file that don't match any server vault → "Stale vault config? Run `/knowz setup` to refresh."
   - No vaults on server → "No vaults found. Create one on the Knowz platform, then run `/knowz setup`."
   - Vault file missing → "Run `/knowz setup` for vault-aware routing and auto-trigger behavior."
   - Pending captures exist → "Run `/knowz flush` to sync pending captures to vaults."

---

## Action: `flush`

Process the pending captures queue — drain `knowz-pending.md` to vaults.

### Steps

1. **Read pending captures file:**
   - Read `knowz-pending.md` from the project root
   - If the file doesn't exist or contains no `---`-delimited capture blocks:
     ```
     0 pending captures — nothing to flush.
     ```
     STOP.

2. **Verify MCP connectivity:**
   - Check that `mcp__knowz__create_knowledge` is available
   - If NOT available:
     ```
     Cannot flush — MCP not connected. Run /knowz setup first.
     ```
     STOP.
   - Read `knowz-vaults.md` to resolve vault IDs

3. **Parse capture blocks:**
   - Split file content by `---` delimiters
   - Each block contains: timestamp, title (after `###`), Category, Target Vault, Source, Content
   - Count total blocks

4. **Flush each capture to MCP:**
   For each parsed block:
   a. Resolve target vault ID from `knowz-vaults.md` matching the Target Vault name. If only one vault configured, use it for all.
   b. Build `mcp__knowz__create_knowledge` payload:
      - `title`: from the `###` header (after timestamp and ` -- `)
      - `content`: the Content field value
      - `knowledgeType`: `"Note"`
      - `vaultId`: resolved vault ID
      - `tags`: extract from `[TAGS]` section in content if present, otherwise derive from Category
      - `source`: the Source field value
   c. Call `mcp__knowz__create_knowledge` with the payload
   d. On **success**: mark the block for removal
   e. On **failure**: leave the block in place, log the error

5. **Update the pending captures file:**
   - Remove all successfully flushed blocks
   - Keep the file header (`# Knowz Pending Captures` and description line)
   - If all blocks flushed: file should contain only the header

6. **Report results:**
   ```
   Flushed {success}/{total} pending captures to vault.

   Captured:
     - {title1} → {vault name}
     - {title2} → {vault name}

   {If any failed:}
   Failed:
     - {title3} — {error reason}
     Run /knowz flush again when MCP is available.

   {If all succeeded:}
   All captures synced. Pending file cleared.
   ```

---

## Action: `ask`

AI-powered Q&A against configured vaults.

### Steps

1. Parse the question from `$ARGUMENTS` (everything after `ask`)
2. **Vault routing:** Match the question against each vault's "when to query" rules
   - If one vault matches → scope to that vault
   - If multiple vaults match → query all matching vaults
   - If no vaults match → use the default vault from `## Defaults`
   - If no vault file → no vault scoping
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
   - If one vault matches → target that vault
   - If multiple vaults match → ask the user which one using AskUserQuestion
   - If no vaults match → use the default vault
   - If no vault file → no vault scoping (use first available vault)

5. **Content formatting:** Apply the target vault's content template. Expand terse user input into detailed, self-contained content:
   - **Content Detail Principle:** Every saved item must be detailed enough to be useful when retrieved via semantic search months later. Include reasoning, technology names, code examples, and file paths.
   - If the vault has a content template, fill each field
   - If no template, use the default format:
     ```
     [CONTEXT] {Where/why this arose — component, technology, problem}
     [INSIGHT] {The knowledge — detailed, self-contained, actionable}
     [RATIONALE] {Why this approach, alternatives considered}
     [TAGS] {category, technology, domain keywords}
     ```

6. **Generate title:** `{Category}: {Descriptive summary with key technology names}`

7. **Dedup check:** Call `mcp__knowz__search_knowledge` with:
   - `query`: the generated title
   - `vaultId`: the target vault ID
   - `limit`: 3
   - If a substantially similar item exists, present it and ask:
     ```
     Similar knowledge already exists:

       "{existing title}"
       {brief snippet}

     Options:
       1. Create anyway (new entry)
       2. Skip (don't save)
       3. Update existing item
     ```
   - Use AskUserQuestion for their choice
   - If "Update existing" → call `mcp__knowz__update_knowledge` instead of create

8. **Create:** Call `mcp__knowz__create_knowledge` with:
   - `content`: the formatted content
   - `title`: the generated title
   - `knowledgeType`: `"Note"`
   - `vaultId`: target vault ID
   - `tags`: `[category, extracted-keywords]`
   - `source`: `"knowz-skill"`

9. **Report success:**
   ```
   Knowledge captured!

   Title: {title}
   Vault: {vault name}
   Tags: {tag list}
   ```

---

## Action: `search`

Semantic search across configured vaults.

### Steps

1. Parse the search query from `$ARGUMENTS` (everything after `search` or `find`)
2. **Vault routing:** Match query against "when to query" rules
   - If matches found → search those vaults
   - If no match → search all configured vaults (or no scoping in zero-config mode)
3. For each target vault, call `mcp__knowz__search_knowledge` with:
   - `query`: the search query
   - `vaultId`: the vault ID
   - `limit`: 10
4. Present results grouped by vault:
   ```
   Results from {Vault Name}:

     1. {title} — {snippet}
     2. {title} — {snippet}
     3. {title} — {snippet}

   Results from {Other Vault}:

     1. {title} — {snippet}
   ```
5. If no results across any vault:
   ```
   No results found for "{query}" across configured vaults.

   Try:
     - Broader search terms
     - /knowz browse to see what's in your vaults
     - /knowz ask "{query}" for AI-powered Q&A
   ```

---

## Action: `browse`

Browse vault contents and topics.

### Steps

1. Parse optional vault name from `$ARGUMENTS` (everything after `browse` or `list`)
2. **If vault name provided** → browse that specific vault
3. **If no vault name** → browse all configured vaults (or all available vaults in zero-config mode)
4. For each vault:
   - Call `mcp__knowz__list_topics(vaultId)` to get topic overview
   - Call `mcp__knowz__list_vault_contents(vaultId, limit: 20)` for recent items
5. Present a browsable overview:
   ```
   {Vault Name} ({item count} items)

   Topics:
     - {topic 1} ({count} items)
     - {topic 2} ({count} items)

   Recent items:
     - {title 1}
     - {title 2}
     - {title 3}
   ```
6. If a specific topic interests the user, they can follow up with `/knowz search "topic name"`

---

## KC Vault File Interop

When the knowz plugin creates or updates vault configurations and a KnowzCode project exists alongside, keep both vault files in sync.

**When to apply:** During `setup` and `register` actions, after writing `knowz-vaults.md`.

### Steps

1. Check if `knowzcode/knowzcode_vaults.md` exists in the project
2. **If it exists:**
   - Read the file and find vault entries in the `## Connected Vaults` section
   - For each vault that was just configured in `knowz-vaults.md`:
     - Find a matching vault entry in `knowzcode_vaults.md` (match by vault name or vault ID)
     - If matched: update the **ID** field if it was empty or different
     - If not matched: leave `knowzcode_vaults.md` as-is (don't add knowz-plugin vaults to KC config)
   - Write the updated file
   - Report: `"Also updated vault IDs in knowzcode/knowzcode_vaults.md for KnowzCode compatibility."`
3. **If it doesn't exist:** do nothing — no KC project present

**Reverse direction:** This interop is one-way from knowz → KC. KC's agents update their own vault file independently.

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

**How to dispatch:**
```
Use the Agent tool with subagent_type "knowledge-worker" — pass the user's query
and let the agent handle multi-step vault operations.
```

For simple single-query/single-save operations, handle directly in this skill — don't dispatch an agent for simple tasks.

---

## Usage Examples

```bash
# Account setup
/knowz register                    # create account + auto-configure
/knowz setup                       # configure MCP + create vault file
/knowz setup kz_live_abc123        # configure with specific API key
/knowz setup --oauth               # configure with OAuth

# Ask a question
/knowz ask "What's our convention for error handling in APIs?"

# Save an insight
/knowz save "We chose Redis over Memcached because we need pub/sub for real-time notifications"

# Search for knowledge
/knowz search "authentication patterns"

# Browse vaults
/knowz browse
/knowz browse "Engineering Knowledge"

# Check connection and health
/knowz status

# Process pending captures
/knowz flush

# Auto-detected intent (bare input)
/knowz "Why did we use PostgreSQL?"        # → detected as ask
/knowz "Always use UTC for timestamps"     # → detected as save
```

Execute the detected action now.
