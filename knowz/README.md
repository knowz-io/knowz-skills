# Knowz

**Your knowledge base, inside your AI assistant.**

Knowz gives your AI a persistent memory. Every decision your team makes, every convention you establish, every hard-won lesson — captured once, available forever, woven into every conversation automatically.

---

## Why

Teams make the same decisions twice because no one remembers the first time. AI assistants make it worse — they're stateless. Every conversation starts from zero.

Knowz fixes this. Ask a question and get an answer grounded in what your team actually knows. Share an insight and it's captured for everyone. Your AI stops guessing and starts remembering.

---

## What You Can Do

- **Ask questions** — "What's our convention for error handling?" returns your team's actual answer, not a generic one
- **Save learnings** — capture decisions and patterns as you work, without leaving your flow
- **Search everything** — semantic search that understands meaning, not just keywords
- **Browse knowledge** — see topics, patterns, and gaps at a glance

---

## Auto-Detection

The standout feature. When you ask about a past decision, Knowz silently searches your vaults and weaves the answer into the conversation — no command needed. When you share an insight worth keeping, Knowz offers to save it.

It's like having a team member with perfect memory sitting alongside you.

---

## Works With Any AI

The Knowz MCP server works with any AI model and any MCP-compatible agent. This plugin is a convenience layer for Claude Code, but the knowledge base is accessible from Claude, ChatGPT, Gemini, Copilot, or any tool that supports MCP.

---

## Quick Start

```bash
# New users
/knowz register            # create account + configure MCP + set up vault
# restart Claude Code
/knowz status              # verify connection

# Existing users
/knowz setup <api-key>     # configure with API key
/knowz setup --oauth       # or configure with OAuth

# Daily usage
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz search "authentication patterns"
/knowz browse
```

## Commands

| Command | Description |
|---------|-------------|
| `/knowz ask "question"` | AI-powered Q&A against your vaults |
| `/knowz save "insight"` | Capture knowledge with automatic routing |
| `/knowz search "query"` | Semantic search across vaults |
| `/knowz browse [vault]` | Browse vault contents and topics |
| `/knowz setup` | Configure MCP connection and vault routing |
| `/knowz status` | Check connection and vault health |
| `/knowz register` | Create account and set up everything |
| `/knowz flush` | Process pending captures queued while MCP was unavailable |

---

## Works With KnowzCode

Knowz integrates with the [KnowzCode](../knowzcode/) development methodology — past decisions are searchable during planning, and learnings are captured automatically after each feature ships.

Works fully standalone too. No KnowzCode required.

---

[Full capabilities](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md#knowz-skills--knowledge-at-your-fingertips) · [knowz.io](https://knowz.io)
