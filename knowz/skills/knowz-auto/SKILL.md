---
name: knowz-auto
description: "Auto-detect when the user is asking knowledge questions, sharing insights that match Knowz vault rules, or asking for a targeted edit to an existing vault item. Triggers when user asks about past decisions, conventions, patterns, or shares learnings worth capturing."
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Knowz Auto - Frictionless Vault Awareness

You are the **Knowz Auto** trigger skill. You make vault interaction lightweight by automatically consulting vaults or offering to save durable knowledge without the user needing to explicitly use `/knowz`.

## When This Skill Activates

This skill activates automatically when Claude detects the user's message matches this skill's description:

- Questions about past decisions: "why did we...", "what's our convention for...", "how did we build..."
- Questions about patterns/standards: "what's the pattern for...", "do we have a standard for..."
- Sharing insights/decisions: "we decided to...", "I learned that...", "the workaround is..."
- Knowledge lookups: "check if we've done this before", "any prior art for..."
- Targeted edits to existing knowledge: "update the X entry", "append this to the Y note"

## Prerequisites (ALL must be true)

1. `knowz-vaults.md` exists in the project root
2. MCP tools (`mcp__knowz__*`) are available
3. This is NOT during an explicit `/knowz` command execution
4. The user's message is NOT a clear code-related instruction (e.g., "fix this bug", "add a test")

**If any prerequisite fails -> do nothing.** Do not interfere with normal conversation.

## Execution

### Step 1: Read Vault Configuration

Read `knowz-vaults.md` from the project root. Parse:
- Each vault's **name** and **ID**
- Each vault's **when to query** rules
- Each vault's **when to save** rules
- The **default vault** from `## Defaults`

### Step 2: Classify the User's Message

Determine if the user's message is a **query**, a **save candidate**, or an **amend candidate**.

**Query signals** - the user is asking about something that might be in a vault:
- Questions with "why", "how", "what", "when", "where" about past work
- References to decisions, conventions, patterns, standards
- "Do we have...", "Have we ever...", "What's our approach to..."
- "Check if...", "Any prior art...", "Has anyone..."

**Save signals** - the user is sharing durable knowledge worth capturing:
- "We decided to...", "The approach is...", "I found that..."
- "The workaround is...", "The trick is...", "Important: ..."
- "Going forward, we should...", "The convention is..."
- Sharing a lesson learned, a decision rationale, or a useful pattern
- **Explicit vault-write requests**: "save this to vault", "capture this in knowz", "document this as {type}", "add this to the vault", "put this in knowz", "save as guidelines/decision/pattern", "store this in the vault"

**Amend signals** - the user is asking for a targeted edit of an **existing** vault item:
- "Update the {X} entry to...", "Fix the typo in the {X} note"
- "Add a line to the {X} in the vault", "Append {Y} to the {X} entry"
- "Change the tag on {X} from A to B", "Rename the {X} entry"
- Explicit amend requests: "amend this in the vault", "edit the {X} in knowz"
- Distinguishing rule: the user references an item that **already exists** and describes a **delta**, not a brand-new insight. If unsure whether the item exists, treat as a query first, then offer amend.

### Step 3: Match Against Vault Rules

Compare the classified message against each vault's routing rules:

- **For queries:** Match against "when to query" rules
- **For saves:** Match against "when to save" rules
- **For amends:** Match against "when to save" rules (same scope as saves; amends land in the same vault the original item lives in)

If no vault rules match the message, **do nothing**. This is not vault-relevant content.

### Step 4: Take Action

**For query matches - search silently, include findings in response:**

1. Call `mcp__knowz__search_knowledge` with:
   - `query`: extract the core question from the user's message
   - `vaultId`: the matched vault ID
   - `limit`: 5
2. If results are found, weave them into your response naturally.
3. If no results found, proceed normally. Do not mention the failed search.

**For save matches - offer to capture, never auto-save:**

1. Identify the durable insight worth capturing.
2. Determine which vault it should go to based on "when to save" rules.
3. Offer to save. Always ask first:
   ```text
   This looks like it could be worth saving to {Vault Name}. Want me to capture it?
   ```
4. If the user agrees, use the `/knowz` skill's save flow.
5. If MCP write fails, queue to `knowz-pending.md` using the canonical pending-capture format and report: `"Queued to knowz-pending.md - run /knowz flush when MCP is available."`
6. If the user declines, continue normally.

**For amend matches - locate the item, confirm, then patch server-side:**

1. Call `mcp__knowz__search_knowledge` with:
   - `query`: the subject of the change the user referenced
   - `vaultId`: the matched vault ID
   - `limit`: 5
2. If one clear match -> use it. If multiple plausible matches -> show the top 3 titles + snippets and ask the user which one. If zero matches -> say so and offer `/knowz save` instead.
3. Confirm the change with the user. Never auto-amend.
4. If the user agrees, call `mcp__knowz__amend_knowledge` with the resolved item ID and the delta. Do NOT send the full prior content.
5. If MCP write fails transiently, queue the amend to `knowz-pending.md` using the canonical pending-capture format and report: `"Queued to knowz-pending.md - run /knowz flush when MCP is available."`

## Key Constraints

- **Lightweight only.** Read vault file, check rules, do a quick search, or offer to save/amend. Nothing more.
- **Never auto-save.** Always ask before capturing knowledge.
- **Never auto-amend.** Always show the target item and proposed change, and ask before patching.
- **Never store workflow handoffs.** Session continuity belongs to KnowzCode (`/knowzcode:regroup` and `/knowzcode:continue`), not Knowz vaults. Knowz only stores durable learnings extracted from work.
- **Never block.** If vault lookup fails or returns nothing, continue with the normal response.
- **Do not announce yourself.** Do not say "I'm checking your vaults..."; just include findings naturally or offer to save.
- **Do not trigger during `/knowz`.** If the user is already using the explicit skill, stay out of the way.
- **Do not trigger on code instructions.** "Fix this bug", "add a test", "refactor this" are not vault-relevant.
