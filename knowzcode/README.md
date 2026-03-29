# KnowzCode

<div align="center">

**A structured development methodology for AI coding assistants.**

[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT_+_Commons_Clause-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-purple)](https://github.com/knowz-io/knowz-skills)
[![Version](https://img.shields.io/badge/version-0.10.0-blue)](https://github.com/knowz-io/knowz-skills/releases)

[Installation](#installation) · [Quick Start](#quick-start) · [When to Use It](#when-to-use-knowzcode) · [How It Works](#how-it-works) · [Commands](#commands) · [Docs](#documentation)

</div>

---

## What This Repo Now Contains

The KnowzCode source repo now has two parallel distribution shapes:

- **Claude/source product** under [`./`](./)
- **Codex packaged plugin** under [`../plugins/knowzcode`](../plugins/knowzcode)

The Codex package is additive. It does not replace the existing Claude-oriented source layout.

## The Problem

AI coding assistants lack structure. Without it, they:

- Forget context between sessions
- Make changes without considering impact
- Declare "done" without verifying anything works
- Let documentation drift from reality immediately

## What KnowzCode Does

KnowzCode is a **platform-agnostic development methodology** that lives in your project's `knowzcode/` directory.

- **Adaptive Development Loop** - scales from quick fixes to full 5-phase TDD workflows with quality gates at each phase
- **Quality Gates** - automated verification at each phase prevents broken code from advancing
- **Living Documentation** - architecture diagrams and specs update as code changes
- **Session Memory** - WorkGroups track complete context so nothing is lost between sessions
- **Interruption Recovery** - say "continue" to resume exactly where you left off
- **Multi-Platform** - support for Claude Code, Codex, Gemini CLI, and adapter-based workflows for other platforms

## When to Use KnowzCode

KnowzCode adds overhead. Use it when the cost of getting implementation wrong is higher than the cost of being systematic.

**Native agent mode is usually enough for:**

- Single-file changes
- Small bug fixes
- Quick refactors
- Tasks you can verify at a glance

**Reach for KnowzCode when:**

- Outcomes are repeatedly incomplete or brittle
- Work spans multiple layers or components
- Architecture, security, and quality gates matter
- Documentation must stay current
- Team or enterprise standards must be enforced
- Work needs to survive interruptions across sessions

## How It Works

Every feature follows a structured loop with quality gates between phases:

```text
Goal -> Analyze -> Approve -> Design -> Approve -> Build -> Audit -> Approve -> Ship
```

KnowzCode automatically classifies tasks by complexity:

- **Micro** - single-file fixes skip the full loop (`/knowzcode:fix`)
- **Light** - small changes use a streamlined path
- **Full** - complex features use the full workflow

## Installation

### Claude Code

```bash
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowzcode@knowz-skills
cd your-project/
/knowzcode:init
/knowzcode:work "Build user authentication"
```

### Codex Packaging In This Repo

The packaged Codex plugin lives at [`../plugins/knowzcode`](../plugins/knowzcode).

That package currently contains:

- `skills/` for discoverable KnowzCode workflows
- `knowzcode/` support content required by the workflows
- `.codex-plugin/plugin.json` for Codex plugin metadata

It intentionally does **not** ship Claude-style agent-team definitions as active Codex package content. Codex workflows use Codex-native skills and, when needed, Codex-native delegation primitives.

This gives you a Codex-local plugin packaging shape in the repo. It is separate from the CLI-generated cross-platform install flow described below.

### Alternative: Script Install

```bash
npx knowzcode
npx knowzcode install --platforms claude,gemini
npx knowzcode install --platforms all
```

### Supported Platforms

**Primary:**

| Platform | Shape |
|----------|-------|
| Claude Code | Plugin marketplace + Claude-oriented source product |
| OpenAI Codex | Discoverable skills and packaged local plugin artifacts |
| Gemini CLI | Native commands, skills, and adapter files |

**Additional adapters:** Cursor, GitHub Copilot, and Windsurf.

## Quick Start

### Start a Feature

```bash
/knowzcode:work "Build user authentication with email and password"
```

### Research First

```bash
/knowzcode:explore "how is authentication implemented?"
```

### Quick Fix

```bash
/knowzcode:fix "Fix typo in login button text"
```

## Commands

| Command | Description |
|:--------|:------------|
| `/knowzcode:init` | Initialize KnowzCode in project |
| `/knowzcode:work <goal>` | Start feature workflow |
| `/knowzcode:explore <topic>` | Research before implementing |
| `/knowzcode:audit [type]` | Run quality audits |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:status` | Check status |
| `/knowzcode:telemetry` | Investigate production telemetry |
| `/knowzcode:telemetry-setup` | Configure telemetry sources |
| `/knowzcode:continue` | Resume active workflow |
| `/knowzcode:start-work` | Redirect implementation intent into `/knowzcode:work` |

## Codex Notes

Current Codex support in this repo is split between:

- the packaged plugin under [`../plugins/knowzcode`](../plugins/knowzcode)
- generator/install logic elsewhere in the product source tree

Key Codex rules for this repo:

- discoverable skills are the command surface
- `AGENTS.md` is optional supporting context, not the required package mechanism
- Knowz MCP setup should use shared Codex config (`codex mcp add` or `~/.codex/config.toml`)
- validate metadata and Codex skill frontmatter with `node ../scripts/validate-platform-surfaces.mjs`

## Project Structure

```text
your-project/
└── knowzcode/
    ├── knowzcode_loop.md
    ├── knowzcode_project.md
    ├── knowzcode_architecture.md
    ├── knowzcode_tracker.md
    ├── knowzcode_log.md
    ├── specs/
    ├── prompts/
    ├── workgroups/
    └── enterprise/
```

## Documentation

| Guide | Description |
|:------|:------------|
| [Getting Started](./docs/knowzcode_getting_started.md) | Walkthrough, MCP setup, file structure |
| [Understanding KnowzCode](./docs/understanding-knowzcode.md) | Concepts and architecture deep dive |
| [Workflow Reference](./docs/workflow-reference.md) | Phase details and orchestration |
| [Prompts Guide](./docs/knowzcode_prompts_guide.md) | Prompt templates and command reference |

## Companion Product

| Product | Purpose |
|:--------|:--------|
| [knowz](../knowz/) | MCP vault features such as setup, registration, learning capture, and flush |

KnowzCode works without the companion product, but Knowz adds vault-backed memory and knowledge workflows.

## Enterprise Configuration

Enterprises that self-host the Knowz platform can customize endpoints and branding by creating an `enterprise.json` file in the plugin root:

```json
{
  "brand": "Acme Corp",
  "mcp_endpoint": "https://mcp.acme.internal/mcp",
  "api_endpoint": "https://api.acme.internal/api/v1"
}
```

## Contributing

Fork -> branch -> PR. See [CLAUDE.md](./CLAUDE.md) for developer docs.

## License

MIT License with Commons Clause - see [LICENSE](./LICENSE) for details.
