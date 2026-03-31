# KnowzCode

<div align="center">

**Structured AI Development.**

[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT_+_Commons_Clause-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-purple)](https://github.com/knowz-io/knowz-skills)
[![Version](https://img.shields.io/badge/version-0.8.4-blue)](https://github.com/knowz-io/knowz-skills/releases)

[What You Get](#what-you-get) · [How It Works](#how-it-works) · [Install](#installation) · [Quick Start](#quick-start) · [Docs](#documentation)

</div>

---

AI coding assistants lack structure. Without it, they forget context between sessions, skip tests, make changes without considering impact, and declare "done" without verifying anything works. KnowzCode brings discipline to AI-assisted development -- quality gates, test-driven workflows, and session continuity that keeps complex projects on track.

## What You Get

- **Quality gates that catch issues before they compound** -- automated verification at each step prevents broken code from advancing
- **Tests written before code, verified against requirements** -- TDD enforcement means features work when they ship, not after three rounds of fixes
- **Living documentation that updates as code changes** -- architecture docs and specs stay current as part of the workflow, not as an afterthought
- **Session continuity** -- pick up exactly where you left off, even days later, with full context preserved
- **Complexity-aware** -- quick fixes skip ceremony, complex features get full rigor. You choose the level that fits the task
- **Works on 6 AI platforms** -- Claude Code, OpenAI Codex, Gemini CLI, GitHub Copilot, Cursor, and Windsurf. Not locked to any single tool
- **Connected to your knowledge base (optional)** -- past decisions, conventions, and learnings are searchable and inform future work
- **Autonomous mode for experienced teams** -- approve the plan upfront, then let the AI run. Verification loops and quality gates keep output on track without constant oversight

## When to Use KnowzCode

KnowzCode adds overhead -- more time, more tokens, more structure than letting your coding agent plan and execute natively. That's the tradeoff. Here's when it's worth it:

**Your agent's native mode is fine for:**
- Single-file changes, bug fixes, small refactors
- Tasks where "good enough" is good enough
- Anything you can verify at a glance

**Reach for KnowzCode when:**
- **Outcomes aren't meeting expectations** -- the agent keeps missing edge cases, breaking things, or delivering incomplete work
- **Multi-component changes** -- features that touch multiple layers (API + DB + UI + tests) benefit from impact analysis and phased execution
- **Architecture and security matter** -- quality gates catch issues before they compound
- **You need documentation that stays current** -- specs and architecture docs update as part of the workflow, not as an afterthought
- **Enforcing standards** -- personal conventions, team guidelines, or compliance rules baked into every step
- **Resumability** -- long-running work that spans sessions, where losing context means starting over
- **Autonomous execution** -- approve specs upfront, then let the agent run; verification loops and quality gates keep output on track without constant oversight

The overhead pays for itself when the cost of getting it wrong exceeds the cost of being thorough.

## How It Works

Every feature follows a structured loop with approval gates between steps:

```
  ┌──────────────────── THE KNOWZCODE LOOP ────────────────────────┐
  │                                                                 │
  │  Goal → Analyze → ✓ → Design → ✓ → Build & Test → Audit → ✓ → Ship  │
  │                                                                 │
  │  ✓ = approval gate (you decide whether to proceed)             │
  └─────────────────────────────────────────────────────────────────┘
```

| Step | What happens |
|------|-------------|
| **Analyze** | Scans your codebase for impact -- what files change, what could break, what patterns to follow |
| **Design** | Drafts specifications covering requirements, edge cases, and test criteria. You review before any code is written |
| **Build & Test** | Test-driven implementation. Tests are written first, then code to pass them. Verification loops catch regressions |
| **Audit** | Automated quality review covering code quality, security, test coverage, and adherence to your standards |
| **Ship** | Commits, updates documentation, and captures learnings for future sessions |

### Complexity Tiers

KnowzCode automatically classifies tasks by complexity and adjusts accordingly:

| Tier | When | What happens |
|------|------|-------------|
| **Quick Fix** | Single-file changes, typos, small bugs | Skips the loop entirely. Fix, verify, done |
| **Light** | Small changes (3 files or fewer) | Streamlined two-step path -- build and verify |
| **Full** | Complex features, multi-layer changes | Complete loop with all gates and TDD enforcement |

## Platform Support

KnowzCode runs on six AI development platforms:

**Primary (full support):**

| Platform | What you get |
|----------|-------------|
| Claude Code | Plugin + 14 specialized agents + 13 skills. Parallel team execution for complex features |
| OpenAI Codex | Instruction file + 12 discoverable skills |
| Gemini CLI | Native commands + 12 skills + 14 subagents (experimental) |

**Experimental (functional, under refinement):**

| Platform | What you get |
|----------|-------------|
| GitHub Copilot | Instruction file + 9 prompt files + MCP integration |
| Cursor | Rules file with full methodology |
| Windsurf | Rules file with full methodology |

<details>
<summary><strong>Claude Code: Execution Modes</strong></summary>

When using Claude Code, KnowzCode automatically selects an execution strategy based on task complexity:

| Mode | When Used | How It Works |
|------|-----------|-------------|
| **Parallel Teams** | Complex features (default for >3 files) | Multiple agents work concurrently -- context gathering, building, and reviewing happen in parallel |
| **Sequential Teams** | Lighter features or `--sequential` flag | One agent per step with persistent team context |
| **Subagent Delegation** | Agent Teams not enabled | One agent spawned per step -- works on all Claude Code instances |

Parallel and Sequential Teams require [Agent Teams (experimental)](https://code.claude.com/docs/en/agent-teams). Enable in your Claude Code `settings.json`:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

</details>

<details>
<summary><strong>Opt-in Specialist Agents (Claude Code)</strong></summary>

Activate specialists with `--specialists`:

```bash
/knowzcode:work "Build auth system" --specialists              # All 3 specialists
/knowzcode:work "Build auth system" --specialists=security     # Security officer only
/knowzcode:audit --specialists                                 # Deep audit with specialists
```

- **Security Officer**: CRITICAL/HIGH findings block gates
- **Test Advisor**: TDD compliance, assertion quality, coverage gaps
- **Project Advisor**: Backlog ideas, tech debt tracking

</details>

## Installation

### Claude Code (Recommended)

```bash
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowzcode@knowz-skills
cd your-project/
/knowzcode:init
/knowzcode:work "Build user authentication"
```

### Script Install (All Platforms)

```bash
npx knowzcode                                    # Interactive setup
npx knowzcode install --platforms claude,gemini   # Specific platforms
npx knowzcode install --platforms all             # All 6 platforms
```

Commands available as `/work`, `/plan`, `/fix` (without `kc:` prefix).
For `/knowzcode:` prefix, also run: `/plugin install knowzcode@knowz-skills`.

### Manual (Repo Clone)

```bash
git clone https://github.com/knowz-io/knowz-skills.git
cd KnowzCode
./install.sh install --target /path/to/your/project   # Linux/macOS
.\install.ps1 install --target C:\path\to\your\project # Windows
```

Node.js 18+ required.

## Quick Start

### Start a Feature

```bash
/knowzcode:work "Build user authentication with email and password"
```

Runs the full loop: analyze impact, design specs, build with TDD, audit quality, and ship -- with approval gates between each step.

### Research First

```bash
/knowzcode:explore "how is authentication implemented?"
```

Explores your codebase first. Say "implement" to transition into building with findings pre-loaded.

### Quick Fix

```bash
/knowzcode:fix "Fix typo in login button text"
```

Targeted fixes that skip the full loop -- for typos, small bugs, and CSS tweaks.

### Resume Work

```bash
/knowzcode:continue
```

Picks up exactly where you left off, with full context from the previous session.

## Commands

| Command | Description |
|:--------|:------------|
| `/knowzcode:init` | Initialize KnowzCode in your project |
| `/knowzcode:work <goal>` | Start a feature workflow |
| `/knowzcode:explore <topic>` | Research before implementing |
| `/knowzcode:audit [type]` | Run quality audits |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:status` | Check project and connection status |
| `/knowzcode:telemetry` | Investigate production telemetry |
| `/knowzcode:continue` | Resume active work |

## Connected to Knowz

KnowzCode optionally connects to [Knowz](https://knowz.io) for persistent knowledge across projects and sessions:

- **Past decisions are searchable** -- "Why did we choose JWT over sessions?" gets an answer from your actual project history
- **Learnings captured automatically** -- gotchas, patterns, and architectural decisions are saved as you work
- **Cross-project intelligence** -- conventions from one project inform work on another via MCP-powered semantic search

Setup takes two minutes. See the [Getting Started Guide](./docs/knowzcode_getting_started.md#mcp-integration-cloud-features) for details.

KnowzCode works fully without Knowz -- the cloud connection adds memory, not dependency.

## Documentation

| Guide | Description |
|:------|:------------|
| [Features](./FEATURES.md) | Full feature reference |
| [Getting Started](./docs/knowzcode_getting_started.md) | Walkthrough, setup, and configuration |
| [Understanding KnowzCode](./docs/understanding-knowzcode.md) | Concepts and architecture deep dive |
| [Workflow Reference](./docs/workflow-reference.md) | Step details, execution modes, parallel orchestration |
| [Prompts Guide](./docs/knowzcode_prompts_guide.md) | Prompt templates and command reference |

## Acknowledgments

KnowzCode is built upon the foundation of the [Noderr project](https://github.com/kaithoughtarchitect/noderr) by [@kaithoughtarchitect](https://github.com/kaithoughtarchitect). We're grateful for their pioneering work in systematic AI-driven development.

## License

MIT License with Commons Clause -- See [LICENSE](LICENSE) file for details.

---

<div align="center">

**Structured AI Development.**

[Get Started](#installation) · [Read the Docs](#documentation) · [knowz.io](https://knowz.io)

Built by [Knowz](https://github.com/knowz-io)

</div>
