# Knowz

**Your knowledge base, inside your AI assistant.**

Knowz connects your AI coding assistant to a persistent, searchable knowledge base. Every decision your team makes, every convention you establish, every hard-won lesson — captured once, available forever, woven into every conversation automatically.

---

## Why Knowz

Teams make the same decisions twice because no one remembers the first time. Meeting notes get buried. Architecture decisions live in someone's head. That pattern you agreed on last month? Good luck finding it in Slack.

AI assistants make this worse, not better. They're stateless. Every conversation starts from zero. Your AI doesn't know what you decided last week, what conventions your team follows, or why you chose PostgreSQL over DynamoDB.

Knowz fixes this. It gives your AI a memory that persists across sessions, projects, and team members. Ask a question and get an answer grounded in what your team actually knows — not a generic response from training data.

---

## What You Can Do

- **Ask questions** against your knowledge base — "What's our convention for error handling?" returns your team's actual answer, not a textbook one
- **Save decisions and learnings** as you work — capture insights without leaving your flow
- **Search across all your vaults** — semantic search that understands meaning, not just keywords
- **Browse and explore** what your team knows — see topics, patterns, and gaps at a glance

---

## The Magic: Auto-Detection

This is where Knowz disappears into your workflow.

When you ask about a past decision, Knowz silently searches your vaults and weaves the answer into the conversation. No command needed. No context switching. You just get better answers.

When you share an insight worth keeping — "we decided to use UTC everywhere" — Knowz recognizes it and offers to save it. Again, no command needed.

It's like having a team member with perfect memory sitting alongside you. They never interrupt, but they always remember.

---

## Works With Any AI

The Knowz MCP server works with any AI model and any MCP-compatible agent — Claude, GPT, Gemini, local models, custom agents. This plugin is a convenience layer for Claude Code, but the knowledge base itself is accessible from anywhere that speaks MCP.

Your knowledge isn't locked into one tool. Save something from Claude Code, query it from your IDE, surface it in a code review. One knowledge base, many interfaces.

---

## Quick Start

### New users — create an account

```bash
/knowz register            # create account + configure MCP + set up vault
# restart Claude Code
/knowz status              # verify connection
```

### Existing users — configure MCP

```bash
/knowz setup kz_live_abc123    # configure with API key
# or
/knowz setup --oauth           # configure with OAuth
# restart Claude Code
/knowz setup                   # create vault configuration file
```

### Daily usage

```bash
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz search "authentication patterns"
/knowz browse
```

## Commands

| Command | Description |
|---------|-------------|
| `/knowz ask "question"` | AI-powered Q&A against configured vaults |
| `/knowz save "insight"` | Capture knowledge with auto-routing and formatting |
| `/knowz search "query"` | Semantic search across vaults |
| `/knowz browse [vault]` | Browse vault contents and topics |
| `/knowz setup [key] [--oauth]` | Configure MCP server + create/update `knowz-vaults.md` |
| `/knowz status` | Check MCP connection, vault health, and configuration |
| `/knowz register [--dev]` | Create account, configure MCP, set up vault |
| `/knowz flush` | Process pending captures queue |

## Setup

### `/knowz register` — Full account setup

Creates a Knowz account, generates an API key, configures the MCP server, and creates `knowz-vaults.md` — all in one flow. Best for new users.

### `/knowz setup` — MCP + vault configuration

If MCP is not connected, guides you through server configuration (API key or OAuth). Then creates or updates `knowz-vaults.md` in your project root. This file tells the plugin:
- Which vaults to connect to
- When to query each vault (routing rules)
- When to save to each vault
- How to format saved content (templates)

Without a vault file, the plugin still works — it just won't scope operations to specific vaults or auto-trigger on relevant conversations.

### `/knowz flush` — Process pending captures

When MCP writes fail (server unreachable, auth expired), captures are queued to `knowz-pending.md`. Run `/knowz flush` to sync them when MCP is available again.

## Vault File Format

See `knowz-vaults.example.md` for the full template. Key sections:

```markdown
### Vault Name
- **ID**: <vault-id>
- **Description**: What this vault contains
- **When to query**: Plain English rules for when to search this vault
- **When to save**: Plain English rules for when to save here
- **Content template**: Format for saved items
```

## Using with KnowzCode

The knowz plugin works alongside the KnowzCode plugin (`knowzcode`) for teams using the KnowzCode development methodology:

```bash
claude plugin install knowzcode
claude plugin install knowz
/knowz register            # configure MCP
# restart
/knowzcode:init            # initialize KC project
/knowzcode:work "feature"  # KC agents use MCP automatically (knowledge-liaison/reader/writer)
/knowz save "insight"      # manual capture via knowz
```

Vault file interop: `/knowz setup` and `/knowz register` automatically update `knowzcode/knowzcode_vaults.md` when it exists, keeping both configurations in sync.

## Using Standalone

The knowz plugin works completely independently — no KnowzCode required:

```bash
claude plugin install knowz
/knowz register
# restart
/knowz setup
/knowz ask "question"
/knowz save "insight"
```

---

Full capabilities and advanced usage: [FEATURES.md](FEATURES.md)
