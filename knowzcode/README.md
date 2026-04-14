# KnowzCode

<div align="center">

**Structured AI Development.**

[![License: MIT + Commons Clause](https://img.shields.io/badge/License-MIT_+_Commons_Clause-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-purple)](https://github.com/knowz-io/knowz-skills)

[What You Get](#what-you-get) · [How It Works](#how-it-works) · [Install](#install) · [Quick Start](#quick-start) · [Platforms](#platform-support)

</div>

---

AI coding assistants lack structure. Without it, they forget context between sessions, skip tests, make changes without considering impact, and declare "done" without verifying anything works.

KnowzCode brings discipline to AI-assisted development — quality gates, test-driven workflows, and session continuity that keeps complex projects on track.

## What You Get

- **Quality gates** that catch issues before they compound
- **Tests written before code**, verified against requirements
- **Living documentation** that updates as code changes
- **Session continuity** — pick up exactly where you left off, even days later
- **Complexity-aware** — quick fixes skip ceremony, complex features get full rigor
- **Works on 6 AI platforms** — not locked to any single tool
- **Connected to your knowledge base** — past decisions inform future work (optional)
- **Autonomous mode** — approve the plan upfront, then let the AI run with safety guardrails

## When to Use It

KnowzCode adds overhead. Here's when it's worth it:

**Your agent's native mode is fine for:** single-file changes, small refactors, anything you can verify at a glance.

**Reach for KnowzCode when:**
- Outcomes aren't meeting expectations — the agent keeps missing edge cases or delivering incomplete work
- Multi-component changes — features that touch API + database + UI + tests
- Architecture and security matter
- You need documentation that stays current
- Long-running work that spans sessions

The overhead pays for itself when the cost of getting it wrong exceeds the cost of being thorough.

## How It Works

```
  Goal → Analyze → ✓ → Design → ✓ → Build & Test → Audit → ✓ → Ship

  ✓ = approval gate (you decide whether to proceed)
```

| Step | What Happens |
|------|-------------|
| **Analyze** | Scans your codebase for impact — what files change, what could break, what patterns to follow |
| **Design** | Drafts specifications with requirements and test criteria. You review before any code is written |
| **Build & Test** | Tests first, then code. Verification loops catch regressions |
| **Audit** | Quality review covering code quality, security, test coverage, and adherence to your standards |
| **Ship** | Commits, updates documentation, and captures learnings |

KnowzCode automatically classifies tasks by complexity:

| Tier | When | What Happens |
|------|------|-------------|
| **Quick Fix** | Single file, small bug | Skips the loop. Fix, verify, done |
| **Light** | 3 files or fewer | Streamlined two-step path |
| **Full** | Complex features | Complete loop with all gates |

## Execution Profiles (advisor / teams / classic)

KnowzCode on Claude Code supports three execution profiles that trade cost, quality, and parallelism. Pick one by setting `profile:` in `knowzcode/knowzcode_orchestration.md` or passing `--profile=<name>` on the command line.

| Profile | When to Use | Mode | Requires |
|---------|-------------|------|----------|
| `teams` (default) | Standard work. No external dependencies. | Parallel / Sequential / Subagent (your choice) | Any Claude Code version, any provider |
| `advisor` | Cost-sensitive work where Sonnet + advisor-tool is acceptable quality. ~12% cheaper on coding tasks (per Anthropic benchmarks). | Parallel Teams (forced) | Claude Code v2.1.100+, direct Anthropic API |
| `classic` | Agent Teams unavailable, or you want deterministic single-threaded execution. | Subagent Delegation (forced) | — |

### How the `advisor` profile works

Claude Code's advisor tool lets a Sonnet-based agent consult Opus mid-generation within a single API call. Under `advisor` profile, the agents listed below switch to Sonnet and get an advisor-guidance block in their spawn prompt:

| Agent | `advisor` | `teams` | `classic` |
|-------|-----------|---------|-----------|
| architect, analyst, security-officer | opus | opus | opus |
| builder, reviewer, closer, smoke-tester, microfix-specialist | **sonnet** | opus | opus |
| knowledge-liaison, test-advisor, project-advisor | sonnet | sonnet | sonnet |
| knowledge-migrator, update-coordinator (utility) | opus | opus | opus |

Strategic agents (architect, analyst, security-officer) stay on Opus — the advisor tool adds no value where the whole task is reasoning.

### Configure

In `knowzcode/knowzcode_orchestration.md`:

```yaml
profile: teams    # or: advisor, classic
```

Or override per-invocation:

```bash
/knowzcode:work "build X" --profile=advisor
/knowzcode:audit --profile=teams
```

### Graceful fallback

When `profile: advisor` is set but the environment can't support the advisor tool (e.g., `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, or `ANTHROPIC_BASE_URL` pointing to Bedrock/Vertex/custom endpoints), `/work` and `/audit` automatically fall back to `teams` with a clear message. Your workflow proceeds — you just don't get the cost savings.

### Conflicts

`--profile=advisor` with `--sequential` or `--subagent` is an error: the advisor profile requires Parallel Teams. Remove the conflicting flag, or choose `--profile=teams` if you want sequential/subagent execution.

### Roll back

Delete the `profile:` line from `knowzcode/knowzcode_orchestration.md` (or omit `--profile` on the CLI). Default is `teams`. No migration needed.

## Install

```bash
# Claude Code (recommended)
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowzcode@knowz-skills
cd your-project/
/knowzcode:setup

# All platforms
npx knowzcode                                    # Interactive setup
npx knowzcode install --platforms claude,gemini   # Specific platforms
npx knowzcode install --platforms all             # All 6 platforms
```

## Quick Start

```bash
# Build a feature (full loop)
/knowzcode:work "Build user authentication with email and password"

# Research first, build later
/knowzcode:explore "how is authentication implemented?"

# Quick fix (skips the loop)
/knowzcode:fix "Fix typo in login button text"

# Resume where you left off — just say "continue"
```

## Commands

| Command | Description |
|---------|-------------|
| `/knowzcode:work <goal>` | Start a feature workflow |
| `/knowzcode:explore <topic>` | Research before implementing |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:audit [type]` | Run quality audits |
| `/knowzcode:setup` | Initialize in your project |
| `/knowzcode:status` | Check project status |
| `/knowzcode:telemetry` | Investigate production errors |
| `/knowzcode:telemetry-setup` | Configure telemetry sources (Sentry, App Insights) |

## Platform Support

**Full support:**

| Platform | Install |
|----------|---------|
| Claude Code | `/plugin install knowzcode@knowz-skills` |
| OpenAI Codex | `npx knowzcode install --platforms codex` |
| Gemini CLI | `npx knowzcode install --platforms gemini` |

**Experimental:**

| Platform | Install |
|----------|---------|
| GitHub Copilot | `npx knowzcode install --platforms copilot` |
| Cursor | `npx knowzcode install --platforms cursor` |
| Windsurf | `npx knowzcode install --platforms windsurf` |

## Connected to Knowz

KnowzCode optionally connects to [Knowz](https://knowz.io) for persistent knowledge across projects:

- Past decisions are searchable — "Why did we choose JWT over sessions?" gets a real answer
- Learnings captured automatically as you work
- Conventions from one project inform work on another

Works fully without Knowz. The connection adds memory, not dependency.

---

## Acknowledgments

KnowzCode builds upon the [Noderr project](https://github.com/kaithoughtarchitect/noderr) by [@kaithoughtarchitect](https://github.com/kaithoughtarchitect).

## License

MIT License with Commons Clause — See [LICENSE](LICENSE) for details.

---

<div align="center">

[Full capabilities](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md#knowzcode--structured-ai-development) · [Documentation](./docs/) · [knowz.io](https://knowz.io)

</div>
