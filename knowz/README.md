<div align="center">

# Knowz

**Your knowledge base, inside your AI assistant.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![knowz-mcp on npm](https://img.shields.io/npm/v/knowz-mcp?label=knowz-mcp)](https://www.npmjs.com/package/knowz-mcp)

[Quick Start](#quick-start) · [Commands](#commands) · [Auto-Detection](#auto-detection) · [Works With KnowzCode](#works-with-knowzcode)

</div>

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

The standout feature. After you opt in by configuring vault routing, Knowz can perform a lightweight read-only vault lookup when you ask about a past decision and weave relevant results into the conversation. When you share an insight worth keeping, Knowz offers to save it.

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
/knowz setup --oauth       # configure with OAuth (recommended)
/knowz setup <api-key>     # or configure with an API key

# Daily usage
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz amend "Add a caveat to the auth pattern: SameSite=None requires Secure in production"
/knowz search "authentication patterns"
/knowz browse
```

## Commands

| Command | Description |
|---------|-------------|
| `/knowz ask "question"` | AI-powered Q&A against your vaults |
| `/knowz save "insight"` | Capture knowledge with automatic routing |
| `/knowz amend "change"` | Targeted edit of an existing vault item — just describe the change |
| `/knowz search "query"` | Semantic search across vaults |
| `/knowz browse [vault]` | Browse vault contents and topics |
| `/knowz setup` | Configure MCP connection and vault routing |
| `/knowz status` | Check connection and vault health |
| `/knowz register` | Create account and set up everything |
| `/knowz flush` | Process pending captures queued while MCP was unavailable |

---

## Skills

| Skill | Invocation | User-Invocable | Description |
|-------|-----------|----------------|-------------|
| `knowz` | `/knowz <action>` | Yes | Search, save, query, amend, and manage durable knowledge in Knowz vaults. Handles ask, save, amend, search, browse, setup, status, register, and flush. |
| `knowz-auto` | Automatic | No | Auto-detects vault-relevant conversations — silently searches vaults on knowledge questions, and offers to save or amend insights without an explicit command. |

---

## Works With KnowzCode

Knowz integrates with the [KnowzCode](../knowzcode/) development methodology — past decisions are searchable during planning, and durable learnings are captured automatically after each feature ships. KnowzCode owns local workflow continuity such as `/knowzcode:regroup` and `/knowzcode:continue`.

Works fully standalone too. No KnowzCode required.

---

## Privacy & Support

The Knowz plugin is a local Claude Code plugin. It connects to the Knowz MCP server only after the user configures Knowz and invokes or enables vault workflows. It never writes to a vault without confirmation.

- Privacy policy: [../PRIVACY.md](../PRIVACY.md) and https://knowz.io/privacy
- Support contact: support@knowz.io
- Security reports: [../SECURITY.md](../SECURITY.md)
- API keys: https://app.knowz.io/settings/api-keys
- Status: https://status.knowz.io

---

## License

MIT License — see [LICENSE](./LICENSE).

---

[Full capabilities](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md#knowz-skills--knowledge-at-your-fingertips) · [knowz.io](https://knowz.io)
