# KnowzCode Orchestration Configuration

**Purpose:** Project-level defaults for team sizing and agent orchestration. Read by `/knowzcode:work` and `/knowzcode:audit` at startup. Per-invocation flags override these settings.

---

## Builder Configuration

```yaml
# Maximum concurrent builders in Parallel Teams mode (default: 2, range: 1-3)
# Lower values reduce duplicated context loading and partial-completion churn.
# Higher values should be reserved for truly independent, disjoint microtasks.
# If the dependency map produces fewer ready microtasks, fewer builders spawn regardless.
max_builders: 2

# Maximum NodeIDs assigned to one builder dispatch by default (default: 1, range: 1-2).
# Keep this at 1 for dependency-heavy or multi-layer work. Raise only when the
# NodeIDs are tiny, share the same owned files, and fit in one bounded TDD pass.
builder_node_limit: 1
```

---

## Specialist Defaults

```yaml
# Specialists enabled by default for this project (default: none)
# These activate without needing --specialists on every invocation.
# Per-invocation --no-specialists overrides this setting.
# Values: security-officer, test-advisor, project-advisor
default_specialists: []

# Examples:
# default_specialists: [security-officer]
# default_specialists: [security-officer, test-advisor]
# default_specialists: [security-officer, test-advisor, project-advisor]
```

---

## MCP Agent Configuration

```yaml
# Enable MCP vault agents (knowz:reader dispatch, knowz:writer dispatches) when vaults are configured (default: true)
# Set to false to skip vault operations even when vaults exist — reduces agent count.
mcp_agents_enabled: true
```

---

## Execution Profile

```yaml
# Controls model assignments and execution strategy (default: frontier).
# This value is chosen ONCE: /knowzcode:setup asks at setup; if the line is
# missing, the first /knowzcode:work asks and persists the answer here.
# No workflow run re-asks — edit this line (or pass --profile) to change.
#
# frontier: (default) Frontier-grade planning. Planning, analysis, specification,
#          and review (analyst, architect, reviewer, security-officer,
#          test-advisor, project-advisor, enterprise-enforcer) run on Fable
#          and produce an exhaustive per-change spec; execution (builder,
#          closer, smoke-tester, frontend-designer, microfix-specialist,
#          knowledge-migrator, update-coordinator) runs on Opus.
#          knowledge-liaison stays on Sonnet. Any orchestration mode. Fable is
#          the most expensive model; the run falls back to Opus automatically if
#          Fable is unavailable (no error).
#          REQUIRES (for Fable): direct Anthropic API or Claude Platform on AWS.
#
# teams:   All agents use their frontmatter model assignments (mostly Opus).
#          Works on any Claude Code version, any API provider. No Fable or
#          advisor dependency — set this to opt OUT of frontier's Fable cost.
#
# advisor: Cost-optimized using Claude Code's advisor tool.
#          Builder, reviewer, closer, smoke-tester, and microfix-specialist
#          run on Sonnet; the advisor tool provides Opus-level guidance when
#          strategic decisions arise. Strategic agents (architect, analyst,
#          security-officer) stay on Opus.
#          FORCES: Parallel Teams mode.
#          REQUIRES: Claude Code v2.1.100+, direct Anthropic API access.
#
# classic: Forces Subagent Delegation mode. No Agent Teams, no advisor.
#          Use when Agent Teams is unavailable or you want deterministic
#          single-threaded execution.
profile: frontier

# High-value escape hatch for the `frontier` profile (default: false).
# When true, the execution agents (builder, closer, smoke-tester,
# frontend-designer, microfix-specialist, knowledge-migrator,
# update-coordinator) ALSO run on Fable — for the rare job where the
# implementation itself needs frontier-level reasoning. No effect unless
# profile is `frontier`. Per-invocation flag: --fable-execution.
execute_on_fable: false
```

See `knowzcode/skills/work/references/profile-models.md` for the full profile → agent-model mapping.

> **Codex note:** profile-based per-agent model routing (frontier's Fable/Opus split, advisor's Sonnet routing, and `execute_on_fable`) is a **Claude Code** capability. The Codex skills run their native coordinator/subagent flow and do not switch models per agent, so on Codex `profile:` and `execute_on_fable:` are informational only — kept for cross-platform config parity — and do not change behavior. (Claude Code honors them in full.)

---

## Cross-Agent Relay Configuration

```yaml
# The current host plans, reviews, and finalizes; the resolved external target
# implements and performs bounded fix rounds. Values:
#   none   — native Phase 2A (default)
#   other  — portable opt-in: Claude host -> Codex, Codex host -> Claude
#   auto   — same complement resolution as other on supported hosts
#   claude — literal Claude CLI target
#   codex  — literal Codex CLI target (backward compatible with v0.20)
# Persist `other` when the project should relay from either supported host.
# Per-invocation: --relay=none|auto|other|claude|codex. An unambiguous natural-
# language request such as "have Claude implement" overrides this config too.
relay: none

# Target transport (default: auto).
# Codex target: auto uses codex MCP when callable, otherwise exec.
# Claude target: auto uses exec/stream-json; Claude MCP is not an agent relay.
# mcp: force Codex MCP (register first:
#       claude mcp add --transport stdio --scope user codex -- codex mcp-server).
# exec: force the target CLI subprocess transport with in-turn polling.
relay_transport: auto

# Codex target settings. Existing v0.20 configs using relay_model,
# relay_effort, relay_fix_effort, and relay_sandbox remain valid fallback keys.
relay_codex_model: gpt-5.6-sol
relay_codex_effort: xhigh
relay_codex_fix_effort: high
relay_codex_sandbox: workspace-write

# Claude target settings. `dontAsk` keeps headless runs non-interactive; the
# relay separately allowlists implementation tools and enables strict Bash
# sandboxing (`failIfUnavailable: true`, `allowUnsandboxedCommands: false`).
# Never make bypassPermissions the default.
relay_claude_model: opus
relay_claude_effort: high
relay_claude_fix_effort: high
relay_claude_permission_mode: dontAsk

# Target fix rounds before the host takes over remaining fixes (default: 2,
# range: 1-3). Per-invocation flag: --relay-max-fix-rounds=N.
relay_max_fix_rounds: 2

# Minutes before a running leg reaches its time-budget decision checkpoint
# (default: 90). At 15 minutes remaining the runner recommends continue-live,
# interrupt-and-resume, or stop; reaching the checkpoint is not an automatic
# kill. Clamp to at least 7 for Codex and 12 for Claude. No flag override.
relay_timeout_minutes: 90
```

See `knowzcode/relay_execution.md` for the full relay protocol (resolution, detection, state machine, and failure fallbacks).

> **Platform note:** relay is supported when the host is Claude Code or Codex. Gemini keeps these keys only for cross-platform config parity and runs native Phase 2A.

---

## Frontend Designer Configuration

```yaml
# Frontend designer activation (default: auto).
#
# auto:  Auto-activate when UI surface is detected (Glob for index.html, *.tsx,
#        *.jsx, *.vue, *.svelte, *.razor, _Host.cshtml, main.dart, manifest.json,
#        *.xaml). Skip on CLI-only / library projects.
# true:  Force-enable even on CLI/library projects.
# false: Force-skip entirely.
#
# Per-invocation flags: --frontend-designer / --no-frontend-designer override.
# Mode constraints: Tier 3 only. Skipped in Tier 2 Light and Sequential Teams.
frontend_designer: auto

# Officer mode for frontend-designer (default: false).
# When true: HIGH design findings are tagged [DESIGN-CONCERN-BLOCK] and pause
# autonomous mode at Gate #3 (analogous to security-officer's [SECURITY-BLOCK]).
# When false (default): HIGH findings are advisory ([DESIGN-CONCERN] tag) and
# do not pause gates.
#
# Per-invocation flag: --frontend-designer-blocking overrides to true.
frontend_designer_blocking: false

# Behavior for Design Questions Bundle in autonomous mode (default: pause).
#
# pause:                   Lead pauses autonomous mode and surfaces questions to
#                          the user via AskUserQuestion (safety default — avoids
#                          building the wrong UI silently).
# accept-recommendations:  Lead auto-replies with the frontend-designer's
#                          recommended option per question and logs
#                          [AUTO-DESIGN-DEFAULTED]. Use only when you trust the
#                          recommendations and want fully unattended runs.
frontend_designer_autonomous_defaults: pause
```

---

## Enterprise Enforcer Configuration

The enterprise-enforcer agent (v0.16.0+) auto-activates when `knowzcode/enterprise/compliance_manifest.md` exists with `compliance_enabled: true` and at least one enforcement source is present — an active non-empty guideline, a `knowzcode/enterprise.md` file, or a configured vault/KnowledgeId guideline source (`skills/work/SKILL.md` Step 2.6.2 holds the authoritative logic). No additional config key is needed — the manifest itself declares intent. Per-invocation flags `--enterprise-enforcer` (force-on) and `--no-enterprise-enforcer` (force-skip, use per-agent fallback paths) override.

---

## Override Precedence

| Setting | Config Default | Flag Override |
|---------|---------------|--------------|
| max_builders | `max_builders:` | `--max-builders=N` |
| builder_node_limit | `builder_node_limit:` | `--builder-node-limit=N` |
| default_specialists | `default_specialists:` | `--specialists`, `--no-specialists` |
| mcp_agents_enabled | `mcp_agents_enabled:` | `--no-mcp` |
| profile | `profile:` | `--profile={advisor\|teams\|classic\|frontier}` |
| execute_on_fable | `execute_on_fable:` | `--fable-execution` |
| relay | `relay:` | `--relay=none\|auto\|other\|claude\|codex` or unambiguous natural language |
| relay target model | `relay_codex_model:` / `relay_claude_model:` | `--relay-model=` |
| relay target effort | `relay_codex_effort:` / `relay_claude_effort:` | `--relay-effort=` |
| relay_max_fix_rounds | `relay_max_fix_rounds:` | `--relay-max-fix-rounds=N` |
| frontend_designer | `frontend_designer:` | `--frontend-designer`, `--no-frontend-designer` |
| frontend_designer_blocking | `frontend_designer_blocking:` | `--frontend-designer-blocking` |
| enterprise-enforcer (auto from manifest) | `compliance_manifest.md` `compliance_enabled:` | `--enterprise-enforcer`, `--no-enterprise-enforcer` |

Per-invocation flags always win. `--specialists` adds to defaults; `--no-specialists` clears all.
