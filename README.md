<div align="center">

# Knowz Skills

**AI-Powered Knowledge & Development Tools**

Your knowledge base, accessible to every AI tool you use. Structured development that actually ships quality code.

[MCP Server](#mcp-server) · [Knowz Plugin](#knowz--knowledge-management) · [KnowzCode Plugin](#knowzcode--structured-development) · [Install](#install) · [Full Features](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md)

</div>

---

## MCP Server

The Knowz MCP server is a universal connector between your knowledge base and the AI tools you already use. Built on the open [Model Context Protocol](https://modelcontextprotocol.io/) standard, it works with any compatible AI — Claude, ChatGPT, Gemini, Copilot, Cursor, Windsurf, custom agents, or your own integrations.

One knowledge base. Every AI tool in your workflow.

---

## Knowz — Knowledge Management

Search, save, and query your knowledge base without leaving your editor. Knowz auto-detects when a conversation is relevant and surfaces the right context — or offers to capture new insights — without being asked.

```bash
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz search "authentication patterns"
```

[Learn more ->](./knowz/)

## KnowzCode — Structured Development

Turns chaotic AI coding into a disciplined loop: analyze impact, design specs, build with tests, audit quality, and ship. Approval gates at every step. Scales from quick fixes to complex multi-file features.

Works across 6 AI platforms — Claude Code, OpenAI Codex, Gemini CLI, GitHub Copilot, Cursor, and Windsurf.

```bash
/knowzcode:work "Build user authentication with email and password"
/knowzcode:explore "how is auth currently implemented?"
/knowzcode:regroup "Continue from the active WorkGroup after context clear"
/knowzcode:fix "Fix typo in login button text"
```

[Learn more ->](./knowzcode/)

---

## Install

```bash
# Add the marketplace
/plugin marketplace add knowz-io/knowz-skills

# Install plugins
/plugin install knowz@knowz-skills       # Knowledge management
/plugin install knowzcode@knowz-skills   # Structured development

# Get started
/knowz register                               # Create account + configure MCP
/knowzcode:setup                               # Initialize in your project
/knowzcode:work "Build user authentication"   # Start building
```

---

## Learn More

- [Full feature overview](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md)
- [Knowz plugin](./knowz/)
- [KnowzCode plugin](./knowzcode/)
- [knowz.io](https://knowz.io)

---

MIT License with Commons Clause — See individual plugin directories for details.
