# KnowzCode Vault Configuration

Multi-vault routing configuration for intelligent vault selection based on query intent and write conditions.

---

## Connected Vaults

### (not created)
- **Name**: Code Patterns
- **ID**:
- **Type**: code
- **Description**: Key learnings, gotchas, takeaways, and architecture insights from the codebase.
- **Write Conditions**:
  - After Phase 2A: implementation patterns and workarounds from TDD cycles
  - After Phase 3: Pattern/Workaround/Performance learnings from WorkGroup scan
- **Content Filter**: Pattern:, Workaround:, Performance:

### (not created)
- **Name**: Ecosystem Knowledge
- **ID**:
- **Type**: ecosystem
- **Description**: Business rules, platform logic, conventions, decisions, and cross-system details. Used for lookups of details beyond scope of current codebase, including how other systems interact.
- **Write Conditions**:
  - After Phase 1A: scope decisions, risk assessment
  - After Phase 2B: security findings, quality decisions
  - After Phase 3: Decision/Convention/Security/Integration learnings
- **Content Filter**: Decision:, Convention:, Security:, Integration:, Scope:

### (not created)
- **Name**: Finalizations
- **ID**:
- **Type**: finalizations
- **Description**: Final summaries at WorkGroup completion. All finalization details documenting complete execution and outcomes. Written only when work is verified and WorkGroup is marked completed.
- **Write Conditions**:
  - After Phase 3: full WorkGroup summary with goal, NodeIDs, audit score, decisions, outcomes
- **Content Filter**: (completion records)

---

## Vault Types

| Type | Purpose | Read By | Written By | Example Queries |
|------|---------|---------|------------|-----------------|
| **code** | Implementation patterns, workarounds, performance | knowz-scout, knowz-scribe, agents | knowz-scribe | "Find auth middleware pattern", "Retry logic workaround" |
| **ecosystem** | Decisions, conventions, security, integrations, business rules | knowz-scout, knowz-scribe, agents | knowz-scribe | "Error handling conventions", "Why Redis over Memcached?" |
| **finalizations** | WorkGroup completion summaries, outcome records | knowz-scout, knowz-scribe | knowz-scribe | "What happened in WG-feat-auth?", "Recent completions" |

> **Types are user-configurable labels, not framework constants.** Users can add, rename, or create custom vault types freely. The 3 defaults above cover common needs. For example, teams needing compliance tracking can add an `enterprise` type.
>
> **Backwards compatibility**: `research`, `domain`, and `platform` are aliases for `ecosystem`. `sessions` is an alias for `finalizations`. Existing vaults configured with these types continue to work — agents treat aliases identically when resolving vault targets.

---

## Vault Routing Rules

### Read Routing (knowz-scout + agents)

| Query Type | Description | Target Vault Type |
|------------|-------------|-------------------|
| **Code patterns** | Implementations, patterns, "how did we build X?" | `code` |
| **Decisions / conventions** | Past decisions, best practices, "why did we?" | `ecosystem` |
| **Integration questions** | Third-party APIs, platform behaviors | `ecosystem` |
| **Standards / compliance** | Team standards, audit results | user's enterprise vault (if configured) |
| **Session history** | Past WorkGroups, outcomes | `finalizations` |

### Write Routing (knowz-scribe)

| Learning Category | Target Vault Type | Title Prefix |
|-------------------|-------------------|--------------|
| Pattern | `code` | `Pattern:` |
| Workaround | `code` | `Workaround:` |
| Performance | `code` | `Performance:` |
| Decision | `ecosystem` | `Decision:` |
| Convention | `ecosystem` | `Convention:` |
| Security | `ecosystem` | `Security:` |
| Integration | `ecosystem` | `Integration:` |
| Scope | `ecosystem` | `Scope:` |
| Completion record | `finalizations` | `Completion:` |
| Audit trail (enterprise) | user's enterprise vault | `Audit:` |

### How Routing Works

1. **For reads**: Agent reads vault descriptions and matches query intent to vault type
2. **For writes**: Knowz-scribe matches learning category to vault type using the write routing table, then applies the vault's content filter to format the payload
3. **Fallback**: If no specific match, use the first vault of type `ecosystem`. If only one vault exists, use it for everything

---

## Uncreated Vault Detection

Default vault entries ship with an empty **ID** field (null GUID), indicating "not yet created on server."

### Detection Points

Uncreated vaults are detected at multiple points in the workflow:

1. **`/knowz register` and `/knowz setup`** — detect empty IDs during initial setup and prompt to create vaults
2. **`/knowzcode:work`, `/knowzcode:plan`, and `/knowzcode:audit`** — detect empty IDs during the MCP Probe at workflow start. These commands always call `list_vaults()` regardless of whether vault IDs exist, then present a Vault Setup table showing each uncreated vault's name, type, description, and which phases write to it. The user can create all, select specific vaults, or skip (proceeding without knowledge capture).

### Creation Flow

When uncreated vaults are detected, the user sees:

```markdown
## Vault Setup

Your Knowz API key is valid and MCP is connected, but {N} default vault(s) haven't been created yet.
Creating vaults enables knowledge capture throughout the workflow:

| Vault | Type | Description | Written During |
|-------|------|-------------|----------------|
```

Table rows are built dynamically from uncreated entries — only showing vaults that haven't been created. The "Written During" column is derived from each vault's Write Conditions field.

Options: **A) Create all** (recommended), **B) Select which to create**, **C) Skip**.

On confirmation, each vault is created via the MCP `create_vault(name, description)` tool. If `create_vault` is not available, the command falls back to matching by name against `list_vaults()` results. The entry's **ID** field is updated with the server-returned vault ID. The H3 heading is updated from `(not created)` to the vault ID.

---

## Write Conditions and Content Filters

Each vault type defines when it accepts writes (Write Conditions) and how content should be formatted (Content Filter).

### Content Detail Principle

Vault entries live in a vector search index — they are chunked and retrieved via semantic search. Unlike local files (specs, workgroups, logs) which are read directly and benefit from being scannable, vault entries must be **self-contained, detailed, and keyword-rich** because they are discovered by meaning, not by file path.

**Include in every vault entry:**
- Full reasoning and context — why, not just what
- Specific technology names, library versions, framework details
- Code examples, file paths, error messages where relevant
- Consequences and alternatives considered

**Anti-pattern** (poor search recall, useless when retrieved):

> `"[NodeIDs] AuthMiddleware\n[Risk] Medium"`

**Good pattern** (rich search matches, self-contained on retrieval):

> `[CONTEXT] During JWT authentication implementation for the Express API, the jsonwebtoken library's verify() method silently accepts expired tokens when clockTolerance is set above 0.`
> `[INSIGHT] Always set clockTolerance to 0 (default) and handle TokenExpiredError explicitly. Some tutorials suggest 30s tolerance which creates a security window where revoked tokens remain valid.`
> `[RATIONALE] A 30-second tolerance means stolen tokens stay usable after revocation. Our auth middleware in src/middleware/auth.ts now checks expiry with zero tolerance.`
> `[TAGS] security, jwt, express, authentication`

Write vault content as if the reader has no project context — they will find this entry via a search query months from now.

### code

**Write Conditions**: Learning category is Pattern, Workaround, or Performance.

**Content Filter**:
```
[CONTEXT] {Where and why the pattern was encountered — include the component, framework, and problem being solved. Provide enough background for someone with no project familiarity.}
[PATTERN] {What was built or discovered — describe the approach, the key insight, and how it differs from the obvious/naive solution.}
[EXAMPLE] {Code snippet, usage example, or file path reference — concrete enough to be directly useful when retrieved.}
[TAGS] {learning category, domain, language, framework — include specific technology names for search discoverability}
```

### ecosystem

**Write Conditions**: Learning category is Decision, Convention, Security, Scope, or Integration.

**Content Filter**:
```
[CONTEXT] {What prompted the decision — the problem, the alternatives considered, and the constraints. Include component names and file paths where relevant.}
[INSIGHT] {The decision, convention, security finding, or integration detail — state it clearly and completely so it stands alone without context.}
[RATIONALE] {Why this approach was chosen over alternatives — include trade-offs, risks of the rejected options, and any conditions that might change this decision.}
[TAGS] {learning category, domain, specific technology names — be generous with tags for search discoverability}
```

### finalizations

**Write Conditions**: Phase 3 finalization — WorkGroup completion record.

**Content Filter**:
```
[GOAL] {Original goal from WorkGroup — restate fully, not just the WorkGroup slug}
[OUTCOME] {success | partial | abandoned — include what was delivered and what was deferred}
[NODES] {NodeIDs changed — list each with a one-line summary of what it covers}
[DURATION] {Phases completed (e.g. "1A-3"), total iterations, any notable delays or blockers}
[SUMMARY] {Key learnings from this WorkGroup — architectural discoveries, patterns established, gotchas encountered. This is the most valuable field for future search queries.}
[TAGS] {finalization, domain, outcome, key technology names}
```

---

## Single Vault Model

KnowzCode works with a single vault. If only one vault is configured (regardless of its declared type), all reads and writes route to it. This is the recommended starting point:

```
┌──────────────────────────────────────────────────────┐
│                   KnowzCode Vault                    │
│                                                      │
│  Purpose: All learnings, decisions, patterns, etc.   │
│  Read by: knowz-scout, knowz-scribe, all agents       │
│  Written by: knowz-scribe, /knowz save                       │
│  Code search: Uses local grep/glob (no code vault)   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Why start with one vault?**
- Simpler onboarding — no vault type decisions needed
- Code search works with grep/glob for most projects
- MCP vault is optimized for organizational knowledge
- Add specialized vaults later via `/knowz setup`

---

## Manual Configuration

You can manually add vaults by editing this file. Use this format:

```markdown
### {vault-id}
- **Name**: {Display Name}
- **ID**: {vault-id}
- **Type**: code | ecosystem | finalizations | {custom}
- **Description**: {Detailed description of what this vault contains. Be specific about what types of questions should be routed here. Include example queries.}
- **Write Conditions**: {When knowz-scribe should write to this vault}
- **Content Filter**: {Format template for create_knowledge content}
```

**Tips for good descriptions:**
- Be specific about content type (patterns vs decisions vs integrations)
- Include example queries that should route to this vault
- Mention key topics or domains covered
- Write conditions should reference learning categories from the routing table

---

## Integration with Agents

| Agent | Vault Interaction | Purpose |
|-------|-------------------|---------|
| `knowz-scout` | Read all configured vaults | Find past decisions, conventions, patterns |
| `knowz-scribe` | Read and write to matching vaults | Route and capture learnings |
| `analyst` | Read via knowz-scout | Past decisions + affected code patterns |
| `architect` | Read via knowz-scout | Conventions + implementation examples |
| `builder` | Read via knowz-scout | Best practices + similar patterns |
| `reviewer` | Read via knowz-scout | Standards + precedent checks |
| `closer` | Triggers knowz-scribe captures | Finalization learnings |

**Fallback behavior**: If vault routing cannot determine the best vault, agents use the first `ecosystem`-type vault or prompt the user.

---

## Configuration Commands

- `/knowz register` - Create account and auto-configure first vault
- `/knowz setup` - Interactive vault setup
- `/knowzcode:status` - Check vault connection status
- `/knowz save "insight"` - Manually create learning (routes via knowz-scribe if available, direct write otherwise)
