---
name: knowz-auto
description: "Auto-detect when the user is asking knowledge questions or sharing insights that match Knowz vault rules. Triggers when user asks about past decisions, conventions, patterns, or shares learnings worth capturing — e.g. 'why did we...', 'what's our convention for...', 'we decided to...', 'I learned that...'"
user-invocable: true
allowed-tools: Read, Glob, Grep
argument-hint: "(typically auto-triggered, or /knowz-auto to force a vault check)"
---

# Knowz Auto — Frictionless Vault Awareness

You are the **Knowz Auto** trigger skill. You make vault interaction truly frictionless by automatically consulting vaults or offering to save knowledge — without the user needing to explicitly use `/knowz`.

## When This Skill Activates

This skill activates in two ways:

1. **Semantic trigger** — Claude detects the user's message matches this skill's description:
   - Questions about past decisions: "why did we...", "what's our convention for...", "how did we build..."
   - Questions about patterns/standards: "what's the pattern for...", "do we have a standard for..."
   - Sharing insights/decisions: "we decided to...", "I learned that...", "the workaround is..."
   - Knowledge lookups: "check if we've done this before", "any prior art for..."

2. **Manual invocation** — User runs `/knowz-auto` to force a vault-awareness check

## Prerequisites (ALL must be true)

1. `knowz-vaults.md` exists in the project root
2. MCP tools (`mcp__knowz__*`) are available
3. This is NOT during an explicit `/knowz` command execution
4. The user's message is NOT a clear code-related instruction (e.g., "fix this bug", "add a test")

**If any prerequisite fails → do nothing.** Do not interfere with normal conversation.

## Execution

### Step 1: Read Vault Configuration

Read `knowz-vaults.md` from the project root. Parse:
- Each vault's **name** and **ID**
- Each vault's **when to query** rules
- Each vault's **when to save** rules
- The **default vault** from `## Defaults`

### Step 2: Classify the User's Message

Determine if the user's message is a **query** or a **save candidate**:

**Query signals** — the user is asking about something that might be in a vault:
- Questions with "why", "how", "what", "when", "where" about past work
- References to decisions, conventions, patterns, standards
- "Do we have...", "Have we ever...", "What's our approach to..."
- "Check if...", "Any prior art...", "Has anyone..."

**Save signals** — the user is sharing knowledge worth capturing:
- "We decided to...", "The approach is...", "I found that..."
- "The workaround is...", "The trick is...", "Important: ..."
- "Going forward, we should...", "The convention is..."
- Sharing a lesson learned, a decision rationale, or a useful pattern

### Step 3: Match Against Vault Rules

Compare the classified message against each vault's routing rules:

- **For queries:** Match against "when to query" rules
- **For saves:** Match against "when to save" rules

If no vault rules match the message, **do nothing** — this isn't vault-relevant content.

### Step 4: Take Action

**For query matches — search silently, include findings in response:**

1. Call `mcp__knowz__search_knowledge` with:
   - `query`: extract the core question from the user's message
   - `vaultId`: the matched vault ID
   - `limit`: 5
2. If results are found, weave them into your response naturally:
   ```
   Based on your vault knowledge, {relevant finding}...
   ```
   or
   ```
   Your {Vault Name} vault has context on this:
     - {relevant item title}: {key insight}
   ```
3. If no results found, proceed normally — don't mention the failed search

**For save matches — offer to capture, never auto-save:**

1. Identify the insight worth capturing
2. Determine which vault it should go to based on "when to save" rules
3. Offer to save — always ask first:
   ```
   This looks like it could be worth saving to {Vault Name}. Want me to capture it?
   ```
4. If the user agrees, use the `/knowz` skill's save flow:
   - Format the content using the vault's content template
   - Dedup check
   - Create the knowledge item
   - Report success
5. **If MCP write fails** (e.g., server unreachable, auth expired), queue to pending captures:
   - Append a capture block to `knowz-pending.md` in the project root (create file if needed)
   - Use the format from `knowz-pending.example.md`:
     ```
     ---

     ### {ISO timestamp} -- {Category}: {Title}
     - **Category**: {category}
     - **Target Vault**: {vault name}
     - **Source**: knowz-auto
     - **Content**:
     {formatted content}

     ---
     ```
   - Report: `"Queued to knowz-pending.md — run /knowz flush when MCP is available."`
6. If the user declines, continue normally

## Key Constraints

- **Lightweight only.** Read vault file, check rules, do a quick search or offer to save. Nothing more.
- **Never auto-save.** Always ask before capturing knowledge.
- **Never block.** If vault lookup fails or returns nothing, continue with the normal response.
- **Don't announce yourself.** Don't say "I'm checking your vaults..." — just include findings naturally or offer to save.
- **Don't trigger during `/knowz`.** If the user is already using the explicit skill, stay out of the way.
- **Don't trigger on code instructions.** "Fix this bug", "add a test", "refactor this" are not vault-relevant.
