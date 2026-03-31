<div align="center">

# Knowz Skills

**AI-Powered Knowledge & Development Tools**

Connect your knowledge base to any AI assistant. Build software with structure and quality gates.

[MCP Server](#the-mcp-server) · [Plugins](#two-plugins) · [Install](#install) · [Features](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md)

</div>

---

## The MCP Server

Your knowledge, accessible to every AI tool you use.

The Knowz MCP server is a universal connector between your knowledge base and the AI models you already work with. It exposes your vaults, search, and Q&A capabilities through the open [Model Context Protocol](https://modelcontextprotocol.io/) standard — so any compatible agent can read, write, and reason over your organization's knowledge.

**Works with any MCP-compatible AI:**

- Claude, ChatGPT, Gemini, GitHub Copilot, Cursor, Windsurf, and more
- Custom agents built with LangChain, CrewAI, AutoGen, or any framework that supports MCP
- Your own integrations via the Knowz API

One knowledge base. Every AI tool in your workflow.

---

## Two Plugins

Built on top of the MCP server, these plugins add higher-level workflows for two common use cases.

### Knowz — Knowledge Management at Your Fingertips

Search, save, and query your knowledge base without leaving your editor. Knowz auto-detects when a conversation is relevant to your vaults and surfaces the right context — or offers to capture new insights — without being asked.

```bash
/knowz ask "What's our convention for error handling?"
/knowz save "We chose Redis over Memcached for pub/sub support"
/knowz search "authentication patterns"
```

[Full documentation ->](./knowz/README.md)

### KnowzCode — Structured AI Development

Turns chaotic AI coding into a disciplined loop: analyze impact, draft specs, build with tests, audit quality, and ship. Approval gates at every phase keep you in control while the AI does the heavy lifting.

Scales automatically — quick fixes skip the ceremony, complex features get the full workflow. Works across Claude Code, OpenAI Codex, Gemini CLI, and more.

```bash
/knowzcode:work "Build user authentication with email and password"
/knowzcode:explore "how is auth currently implemented?"
/knowzcode:fix "Fix typo in login button text"
```

[Full documentation ->](./knowzcode/README.md)

---

## Who It's For

- **Individual developers** — Stop losing context between sessions. Search past decisions, capture new learnings, and build with guardrails that catch mistakes before they ship.
- **Teams** — Share a knowledge base that every team member's AI tools can access. Enforce coding standards and quality gates across the whole team.
- **Organizations** — Centralize institutional knowledge, ensure compliance, and give every AI integration a consistent, governed view of your data.

---

## Install

### 1. Add the marketplace

```bash
/plugin marketplace add knowz-io/knowz-skills
```

### 2. Install plugins

```bash
/plugin install knowz@knowz-skills       # Knowledge management
/plugin install knowzcode@knowz-skills   # Structured development
```

### 3. Get started

```bash
/knowz register                               # Create account + configure MCP
/knowzcode:init                               # Initialize in your project
/knowzcode:work "Build user authentication"   # Start building
```

---

## Learn More

- [Full feature overview](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md)
- [Knowz plugin documentation](./knowz/README.md)
- [KnowzCode plugin documentation](./knowzcode/README.md)
- [knowz.io](https://knowz.io)

---

MIT License with Commons Clause — See individual plugin directories for details.
