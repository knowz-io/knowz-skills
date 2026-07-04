# KnowzCode

<div align="center">

**Structured AI Development.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Claude Code Plugin](https://img.shields.io/badge/Claude_Code-Plugin-purple)](https://github.com/knowz-io/knowz-skills)

[What You Get](#what-you-get) · [How It Works](#how-it-works) · [Install](#install) · [Quick Start](#quick-start) · [Platforms](#platform-support) · [Privacy](#privacy--support)

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

## Execution Profiles (advisor / teams / classic / frontier)

KnowzCode on Claude Code supports four execution profiles that trade cost, quality, and parallelism. Pick one by setting `profile:` in `knowzcode/knowzcode_orchestration.md` or passing `--profile=<name>` on the command line.

| Profile | When to Use | Mode | Requires |
|---------|-------------|------|----------|
| `teams` (default) | Standard work. No external dependencies. | Parallel / Sequential / Subagent (your choice) | Any Claude Code version, any provider |
| `advisor` | Cost-sensitive work where Sonnet + advisor-tool is acceptable quality. ~12% cheaper on coding tasks (per Anthropic benchmarks). | Parallel Teams (forced) | Claude Code v2.1.100+, direct Anthropic API |
| `classic` | Agent Teams unavailable, or you want deterministic single-threaded execution. | Subagent Delegation (forced) | — |
| `frontier` | Highest-stakes work. Fable 5 plans/specs/reviews every change; Opus 4.8 executes. Opt-in (Fable is the most expensive model). | Parallel / Sequential / Subagent (your choice) | Direct Anthropic API (or Claude Platform on AWS) |

### How the `advisor` profile works

Claude Code's advisor tool lets a Sonnet-based agent consult Opus mid-generation within a single API call. Under `advisor` profile, the agents listed below switch to Sonnet and get an advisor-guidance block in their spawn prompt:

| Agent | `advisor` | `teams` | `classic` |
|-------|-----------|---------|-----------|
| architect, analyst, security-officer, enterprise-enforcer | opus | opus | opus |
| builder, reviewer, closer, smoke-tester, microfix-specialist, frontend-designer | **sonnet** | opus | opus |
| knowledge-liaison, test-advisor, project-advisor | sonnet | sonnet | sonnet |
| knowledge-migrator, update-coordinator (utility) | opus | opus | opus |

Strategic agents (architect, analyst, security-officer, enterprise-enforcer) stay on Opus — the advisor tool adds no value where the whole task is reasoning.

### How the `frontier` profile works

`frontier` routes the reasoning-heavy phases to Fable 5 and the build to Opus 4.8:

| Agent | `frontier` |
|-------|-----------|
| analyst, architect, reviewer, security-officer, test-advisor, project-advisor, enterprise-enforcer | **fable** |
| builder, closer, smoke-tester, frontend-designer, microfix-specialist, knowledge-migrator, update-coordinator | opus |
| knowledge-liaison | sonnet |

The idea: Fable 5 produces an *exhaustive, per-change specification* (every change enumerated, each with a dedicated VERIFY criterion), then Opus 4.8 — itself state-of-the-art at agentic execution — implements against it. You get frontier judgment on both ends (Fable writes the spec at Gate #2 and audits the build as reviewer at Gate #3) without paying Fable's premium on the highest-token phase, building. `/knowzcode:explore` also runs its research agents on Fable under this profile.

For the rare job where the implementation itself needs frontier reasoning, add `--fable-execution` (or set `execute_on_fable: true`) to run the execution agents on Fable too.

### Configure

In `knowzcode/knowzcode_orchestration.md`:

```yaml
profile: teams    # or: advisor, classic
```

Or override per-invocation:

```bash
/knowzcode:work "build X" --profile=advisor
/knowzcode:work "build critical auth flow" --profile=frontier
/knowzcode:audit --profile=teams
```

### Graceful fallback

When `profile: advisor` is set but the environment can't support the advisor tool (e.g., `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, or `ANTHROPIC_BASE_URL` pointing to Bedrock/Vertex/custom endpoints), `/work` and `/audit` automatically fall back to `teams` with a clear message. Your workflow proceeds — you just don't get the cost savings.

Similarly, `profile: frontier` requires Fable 5, which runs on the direct Anthropic API (or Claude Platform on AWS) and needs 30-day data retention. If Fable is unavailable (e.g. `ANTHROPIC_BASE_URL` pointing at Bedrock/Vertex/Foundry), the planning/review agents fall back to Opus 4.8 with a clear message and the run proceeds as an all-Opus flow.

### Conflicts

`--profile=advisor` with `--sequential` or `--subagent` is an error: the advisor profile requires Parallel Teams. Remove the conflicting flag, or choose `--profile=teams` if you want sequential/subagent execution.

### Roll back

Delete the `profile:` line from `knowzcode/knowzcode_orchestration.md` (or omit `--profile` on the CLI). Default is `teams`. No migration needed.

## Enterprise Compliance & Custom Guidelines

**Beta.** Wire your organization's own guidelines — security rules, API conventions, code-quality patterns, accessibility/design standards — into the workflow so they're enforced at the same quality gates you already approve.

You author guidelines as markdown, register them in a manifest, and a persistent `enterprise-enforcer` officer injects the required checks into specs and **blocks the audit gate** on violations of anything you mark *blocking*.

```
knowzcode/enterprise/
├── compliance_manifest.md     # master switch + which guidelines are active
├── guidelines/
│   ├── security.md            # ships with real rules
│   └── custom/                # your org's guidelines go here
└── templates/guideline-template.md
```

Three steps to turn it on:

1. Author a guideline from `templates/guideline-template.md` (or edit `security.md`).
2. Register it in the manifest's **Active Guidelines** table with `Active: true`.
3. Set `compliance_enabled: true`, then run `/knowzcode:audit compliance` to verify.

Guidelines are **blocking** (violations stop the workflow) or **advisory** (reported only). It's opt-in and off by default. Full guide: **[docs/enterprise-compliance.md](./docs/enterprise-compliance.md)**.

> Note: the white-label `enterprise.json` (brand + MCP/API endpoints) is a *separate* feature, unrelated to compliance guidelines.

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

# Save local resume state before clearing context
/knowzcode:regroup "Continue from the active WorkGroup after context clear"

# Resume where you left off — just say "continue"
```

KnowzCode can also offer regroup automatically when you say things like "wrap up", "clear context", "step away", or "resume this later". The trigger only asks; it never writes a handoff without approval.

## Commands

| Command | Description |
|---------|-------------|
| `/knowzcode:work <goal>` | Start a feature workflow |
| `/knowzcode:explore <topic>` | Research before implementing |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:regroup [next step]` | Save a local handoff for clearing context |
| `/knowzcode:regroup-trigger` | (Trigger) Detects pause/wrap-up intent and offers regroup |
| `/knowzcode:start-work` | (Trigger) Detects "implement the plan" intent and invokes `/knowzcode:work` |
| `/knowzcode:audit [type]` | Run quality audits (`spec`, `architecture`, `security`, `integration`, `compliance`) |
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

## Privacy & Support

KnowzCode stores workflow state in local project files by default. It only sends data to Knowz when the user has configured Knowz and chooses a workflow that queries or writes vault knowledge. Telemetry workflows only connect to user-configured telemetry providers.

- Privacy policy: [../PRIVACY.md](../PRIVACY.md) and https://knowz.io/privacy
- Support contact: support@knowz.io
- Security reports: [../SECURITY.md](../SECURITY.md)
- Status: https://status.knowz.io

---

## Acknowledgments

KnowzCode builds upon ideas from the [Noderr project](https://github.com/kaithoughtarchitect/noderr) by [@kaithoughtarchitect](https://github.com/kaithoughtarchitect).

## License

MIT License — See [LICENSE](LICENSE) for details.

---

<div align="center">

[Full capabilities](https://github.com/knowz-io/knowz-platform/blob/develop/FEATURES.md#knowzcode--structured-ai-development) · [Documentation](./docs/) · [knowz.io](https://knowz.io)

</div>
