# KnowzCode

<div align="center">

**A structured development methodology for AI coding assistants.**

[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT_+_Commons_Clause-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-purple)](https://github.com/knowz-io/knowz-skills)
[![Version](https://img.shields.io/badge/version-0.8.0-blue)](https://github.com/knowz-io/knowz-skills/releases)

[Installation](#installation) · [Quick Start](#quick-start) · [When to Use It](#when-to-use-knowzcode) · [How It Works](#how-it-works) · [Commands](#commands) · [Docs](#documentation)

</div>

---

## The Problem

AI coding assistants lack structure. Without it, they:
- Forget context between sessions
- Make changes without considering impact
- Declare "done" without verifying anything works
- Let documentation drift from reality immediately

## What KnowzCode Does

KnowzCode is a **platform-agnostic development methodology** that lives in your project's `knowzcode/` directory.

- **Adaptive Development Loop** — Scales from quick fixes to full 5-phase TDD workflows with quality gates at each phase
- **Quality Gates** — Automated verification at each phase prevents broken code from advancing
- **Living Documentation** — Architecture diagrams and specs auto-update as code changes
- **Session Memory** — WorkGroups track complete context so nothing is lost between sessions
- **Interruption Recovery** — Say "continue" to resume exactly where you left off
- **Multi-Platform** — First-class support for Claude Code, OpenAI Codex, and Gemini CLI, with adapters for Cursor, Copilot, and Windsurf

## When to Use KnowzCode

KnowzCode adds overhead — more time, more tokens, more structure than letting your coding agent plan and execute natively. That's the tradeoff. Here's when it's worth it:

**Your agent's native mode is fine for:**
- Single-file changes, bug fixes, small refactors
- Tasks where "good enough" is good enough
- Anything you can verify at a glance

**Reach for KnowzCode when:**
- **Outcomes aren't meeting expectations** — the agent keeps missing edge cases, breaking things, or delivering incomplete work
- **Multi-component changes** — features that touch multiple layers (API + DB + UI + tests) benefit from impact analysis and phased execution
- **Architecture and security matter** — quality gates catch issues before they compound
- **You need documentation that stays current** — specs and architecture docs update as part of the workflow, not as an afterthought
- **Enforcing standards** — personal conventions, team guidelines, or enterprise compliance rules baked into every phase
- **Resumability** — long-running work that spans sessions, where losing context means starting over
- **Autonomous execution** — approve specs upfront, then let the agent run; verification loops and quality gates keep output on track without constant oversight

The overhead pays for itself when the cost of getting it wrong exceeds the cost of being thorough.

## How It Works

Every feature follows a structured loop with quality gates between phases:

```
  ┌──────────────────── THE KNOWZCODE LOOP ────────────────────┐
  │                                                             │
  │  Goal → Analyze → ✓ → Design → ✓ → Build → Audit → ✓ → Ship  │
  │         Impact        Specs        (TDD)    Quality         │
  │          1A            1B           2A       2B        3    │
  │                                                             │
  │  ✓ = approval gate (you decide whether to proceed)         │
  └─────────────────────────────────────────────────────────────┘
```

KnowzCode automatically classifies tasks by complexity:
- **Micro** — single-file fixes skip the loop entirely (`/knowzcode:fix`)
- **Light** — small changes (≤3 files) use a streamlined 2-phase path
- **Full** — complex features get the complete 5-phase workflow above

Each gate requires your approval before proceeding. See the [Workflow Reference](./docs/workflow-reference.md) for details.

## Installation

### Claude Code (Recommended)

```bash
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowzcode@knowz-skills
cd your-project/
/knowzcode:init
/knowzcode:work "Build user authentication"
```

### Alternative: Script Install

```bash
npx knowzcode                                    # Interactive setup
npx knowzcode install --platforms claude,gemini   # Specific platforms
npx knowzcode install --platforms all             # All 6 platforms
```

Commands available as `/work`, `/plan`, `/fix` (without `kc:` prefix).
For `/knowzcode:` prefix, also run: `/plugin install knowzcode@knowz-skills`.

<details>
<summary><strong>Supported Platforms</strong></summary>

**Primary (full support):**

| Platform | Generated Files | Support Level |
|----------|----------------|---------------|
| Claude Code | `CLAUDE.md` + `.claude/{agents,skills}/` | Plugin + 14 agents + 13 skills |
| OpenAI Codex | `AGENTS.md` + `.agents/skills/knowzcode-*/SKILL.md` (12 skills) | Instruction file + discoverable skill files |
| Gemini CLI | `GEMINI.md` + `.gemini/commands/knowzcode/*.toml` (12 commands) + `.gemini/skills/knowzcode-*/SKILL.md` (12 skills) + `.gemini/agents/knowzcode-*.md` (14 subagents, experimental) | Native commands + skills + subagents + instruction file |

**Experimental (functional, under refinement):**

| Platform | Generated Files | Support Level |
|----------|----------------|---------------|
| GitHub Copilot | `.github/copilot-instructions.md` + `.github/prompts/knowzcode-*.prompt.md` (9 prompts) + `.vscode/mcp.json` | Instruction file + prompt files + MCP |
| Cursor | `.cursor/rules/knowzcode.mdc` | Rules file (commands via `.cursor/commands/` beta) |
| Windsurf | `.windsurf/rules/knowzcode.md` | Rules file (workflows via `.windsurf/workflows/`) |

</details>

### Manual (Repo Clone)

```bash
git clone https://github.com/knowz-io/knowz-skills.git
cd KnowzCode
./install.sh install --target /path/to/your/project   # Linux/macOS
.\install.ps1 install --target C:\path\to\your\project # Windows
```

`install.sh` and `install.ps1` are thin wrappers that delegate to the Node.js installer (`bin/knowzcode.mjs`). Node.js 18+ is required.

### Cloud Features (Optional)

Connect to KnowzCode Cloud for vector-powered semantic search, AI Q&A, and learning capture via MCP. See the [Getting Started Guide](./docs/knowzcode_getting_started.md#mcp-integration-cloud-features) for setup.

## Quick Start

### Start a Feature

```bash
/knowzcode:work "Build user authentication with email and password"
```

Runs the full loop: impact analysis → specs → TDD → audit → finalize, with approval gates between each phase.

### Research First

```bash
/knowzcode:explore "how is authentication implemented?"
```

Explores your codebase first. Say "implement" to transition into `/knowzcode:work` with findings pre-loaded.

### Quick Fix

```bash
/knowzcode:fix "Fix typo in login button text"
```

Targeted fixes that skip the full loop — for typos, small bugs, and CSS tweaks.

## Commands

| Command | Description |
|:--------|:------------|
| `/knowzcode:init` | Initialize KnowzCode in project |
| `/knowzcode:work <goal>` | Start feature workflow |
| `/knowzcode:explore <topic>` | Research before implementing |
| `/knowzcode:audit [type]` | Run quality audits |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:status` | Check MCP connection |
| `/knowzcode:telemetry` | Investigate production telemetry |
| `/knowzcode:telemetry-setup` | Configure telemetry sources |
| `/knowzcode:continue` | Resume active workflow (auto-triggered on "continue", "keep going", etc.) |
| `/knowzcode:start-work` | Auto-redirect implementation intent to `/knowzcode:work` with context |

## Architecture

```
Layer 4: Platform Enhancements (optional, best experience)
         Claude Code agents | Codex Agents SDK | Gemini Skills
         ──────────────────────────────────────────────────────
Layer 3: Platform Adapters (thin instruction files)
         CLAUDE.md | AGENTS.md | GEMINI.md | .cursor/rules/*.mdc
         ──────────────────────────────────────────────────────
Layer 2: MCP Integration (cross-platform knowledge layer)
         KnowzCode MCP server → vaults, search, learning capture
         ──────────────────────────────────────────────────────
Layer 1: Core Methodology (platform-agnostic, the actual product)
         knowzcode/ directory → loop, specs, tracker, architecture
```

The real product is Layer 1 — the `knowzcode/` directory. Everything else enhances it.
On Claude Code, Layer 4 provides 14 specialized agents with parallel orchestration. Codex and Gemini get discoverable skills and native commands. Other platforms follow the same methodology via adapter instruction files.
See [Understanding KnowzCode](./docs/understanding-knowzcode.md) for a deep dive.

## Execution Modes

### Claude Code

When using Claude Code, `/knowzcode:work` automatically selects an execution strategy based on task complexity and available features:

| Mode | When Used | How It Works |
|------|-----------|-------------|
| **Parallel Teams** | Complex features (default for >3 files) | Multiple agents work concurrently — scouts gather context, builders implement in parallel, reviewer audits incrementally |
| **Sequential Teams** | Lighter features or `--sequential` flag | One agent per phase with persistent team context |
| **Subagent Delegation** | Agent Teams not enabled | One agent spawned per phase via fallback — works on all Claude Code instances |

<details>
<summary><strong>Agent Teams Setup & Roster (14 agents)</strong></summary>

Parallel and Sequential Teams require [Agent Teams (experimental)](https://code.claude.com/docs/en/agent-teams). Enable by adding the following to your Claude Code `settings.json`:

```json
{ "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
```

Or ask Claude Code: _"Enable Agent Teams in my settings."_ Then restart. Without it, subagent delegation is used automatically.

| Agent | Role | Phase |
|-------|------|-------|
| `context-scout` | Local context research (specs, tracker, history) | Discovery |
| `analyst` | Impact analysis, Change Set proposals | 1A |
| `architect` | Specification drafting, architecture review | 1B |
| `builder` | TDD implementation, verification loops | 2A |
| `reviewer` | Quality audit, security review | 2B |
| `closer` | Finalization, learning capture | 3 |
| `security-officer` | Threat modeling, vulnerability scanning (opt-in) | All phases |
| `test-advisor` | TDD enforcement, test quality review (opt-in) | All phases |
| `project-advisor` | Backlog curation, future work ideas (opt-in) | Discovery–2A |
| `microfix-specialist` | Quick targeted fixes | Utility |
| `knowledge-migrator` | Knowledge migration between vaults | Utility |
| `update-coordinator` | Plugin update coordination | Utility |

</details>

<details>
<summary><strong>Opt-in Specialist Agents</strong></summary>

Activate specialists with `--specialists` in `/knowzcode:work` or `/knowzcode:audit`:

```bash
/knowzcode:work "Build auth system" --specialists              # All 3 specialists
/knowzcode:work "Build auth system" --specialists=security     # Security officer only
/knowzcode:audit --specialists                                 # Deep audit with specialists
```

- **security-officer**: Officer authority — CRITICAL/HIGH findings block gates
- **test-advisor**: Advisory — TDD compliance, assertion quality, coverage gaps
- **project-advisor**: Advisory — backlog ideas, tech debt tracking (shuts down mid-implementation)

Specialists communicate directly with builders (max 2 DMs each) and report findings at quality gates. Supported in Parallel Teams and Subagent modes only.

</details>

See the [Workflow Reference](./docs/workflow-reference.md) for detailed orchestration flows.

### OpenAI Codex

Codex users get discoverable skills via `.agents/skills/knowzcode-*/`:

```bash
/knowzcode:work "Build user authentication"  # Start feature workflow
/knowzcode:explore "how is auth implemented?"   # Research first
/knowzcode:fix "Fix login bug"               # Quick fix
/knowzcode:audit                             # Quality audit
```

Generated by `npx knowzcode install --platforms codex` into `.agents/skills/`.

For cross-project availability, install skills globally:
```bash
npx knowzcode install --platforms codex --global   # Skills → ~/.agents/skills/knowzcode-*/
```

### Gemini CLI

Gemini users get native `/knowzcode:` commands via TOML files, discoverable skills, and optional subagents:

```bash
/knowzcode:work "Build JWT authentication"   # Start feature workflow
/knowzcode:explore "how is auth implemented?"   # Research first
/knowzcode:fix "Fix login redirect bug"      # Quick fix
/knowzcode:audit                             # Quality audit
/knowzcode:continue                          # Resume where you left off
/knowz setup                                # Configure MCP (requires knowz plugin)
/knowzcode:telemetry "500 errors in prod"   # Investigate telemetry
```

Generated by `npx knowzcode install --platforms gemini` into `.gemini/commands/knowzcode/`, `.gemini/skills/knowzcode-*/`, and `.gemini/agents/knowzcode-*.md`.

For cross-project availability, install skills globally:
```bash
npx knowzcode install --platforms gemini --global   # Skills → ~/.gemini/skills/knowzcode-*/
```

Subagents (experimental) require `experimental.enableAgents: true` in Gemini `settings.json`.

### Other Platforms (Experimental)

Adapters for Cursor, GitHub Copilot, and Windsurf are functional but under active refinement. The AI follows the same methodology phases sequentially — reading prompt templates from `knowzcode/prompts/` and following the same quality gates.

<details>
<summary><strong>GitHub Copilot</strong></summary>

Copilot users invoke phases via prompt files in VS Code Copilot Chat:

```bash
#prompt:knowzcode-work "Build JWT authentication"  # Start feature workflow
#prompt:knowzcode-specify                          # Draft specs (after Change Set approved)
#prompt:knowzcode-implement                        # TDD implementation
#prompt:knowzcode-audit                            # READ-ONLY audit
#prompt:knowzcode-finalize                         # Finalize and commit
#prompt:knowzcode-continue                         # Resume where you left off
```

Generated by `/knowzcode:init` into `.github/prompts/`. See `knowzcode/copilot_execution.md` for details.

</details>

<details>
<summary><strong>Cursor & Windsurf</strong></summary>

Cursor generates a `.cursor/rules/knowzcode.mdc` rules file. Windsurf generates `.windsurf/rules/knowzcode.md`. Both follow methodology phases via prompt templates with no agent orchestration needed.

</details>

## Project Structure

```
your-project/
└── knowzcode/
    ├── knowzcode_loop.md          # The methodology (TDD, quality gates, phases)
    ├── knowzcode_project.md       # Project goals, tech stack, standards
    ├── knowzcode_architecture.md  # Auto-maintained architecture docs
    ├── knowzcode_tracker.md       # WorkGroup status tracking
    ├── knowzcode_log.md           # Session history
    ├── specs/                     # Component specifications
    ├── prompts/                   # Phase prompt templates (works with any AI)
    ├── workgroups/                # Session data (gitignored)
    └── enterprise/                # Optional compliance config (gitignored, experimental)
```

## Documentation

| Guide | Description |
|:------|:------------|
| [Getting Started](./docs/knowzcode_getting_started.md) | Walkthrough, MCP setup, file structure |
| [Understanding KnowzCode](./docs/understanding-knowzcode.md) | Concepts and architecture deep dive |
| [Workflow Reference](./docs/workflow-reference.md) | Phase details, execution modes, parallel orchestration |
| [Prompts Guide](./docs/knowzcode_prompts_guide.md) | Prompt templates and command reference |

## Companion Plugins

| Plugin | Purpose | Install |
|:-------|:--------|:--------|
| [knowz](https://github.com/knowz-io/knowz-skill) | MCP vault features — setup, registration, learning capture, flush | `claude plugin install knowz` |

KnowzCode works without companion plugins. The knowz plugin adds `/knowz setup`, `/knowz register`, `/knowz save`, and `/knowz flush` for MCP vault management.

## Contributing

Fork → branch → PR. See **[CLAUDE.md](CLAUDE.md)** for developer docs.

## Acknowledgments

KnowzCode is built upon the foundation of the [Noderr project](https://github.com/kaithoughtarchitect/noderr) by [@kaithoughtarchitect](https://github.com/kaithoughtarchitect). We're grateful for their pioneering work in systematic AI-driven development.

## License

MIT License with Commons Clause — See [LICENSE](LICENSE) file for details.

---

<div align="center">

**A structured development methodology for AI coding assistants.**

[Get Started](#installation) · [Read the Docs](#documentation) · [Contribute](#contributing)

Built by [Knowz](https://github.com/knowz-io)

</div>
