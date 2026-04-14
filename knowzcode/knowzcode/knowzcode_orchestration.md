# KnowzCode Orchestration Configuration

**Purpose:** Project-level defaults for team sizing and agent orchestration. Read by `/knowzcode:work` and `/knowzcode:audit` at startup. Per-invocation flags override these settings.

---

## Builder Configuration

```yaml
# Maximum concurrent builders in Parallel Teams mode (default: 5, range: 1-5)
# Lower values reduce token usage and complexity; higher values increase parallelism.
# If the dependency map produces fewer partitions, fewer builders spawn regardless.
max_builders: 5
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
# Controls model assignments and execution strategy (default: teams).
#
# advisor: Cost-optimized using Claude Code's advisor tool.
#          Builder, reviewer, closer, smoke-tester, and microfix-specialist
#          run on Sonnet; the advisor tool provides Opus-level guidance when
#          strategic decisions arise. Strategic agents (architect, analyst,
#          security-officer) stay on Opus.
#          FORCES: Parallel Teams mode.
#          REQUIRES: Claude Code v2.1.100+, direct Anthropic API access.
#
# teams:   Current behavior (default). All agents use their frontmatter
#          model assignments. Works on any Claude Code version, any API
#          provider. No advisor dependency.
#
# classic: Forces Subagent Delegation mode. No Agent Teams, no advisor.
#          Use when Agent Teams is unavailable or you want deterministic
#          single-threaded execution.
profile: teams
```

See `knowzcode/skills/work/references/profile-models.md` for the full profile → agent-model mapping.

---

## Override Precedence

| Setting | Config Default | Flag Override |
|---------|---------------|--------------|
| max_builders | `max_builders:` | `--max-builders=N` |
| default_specialists | `default_specialists:` | `--specialists`, `--no-specialists` |
| mcp_agents_enabled | `mcp_agents_enabled:` | `--no-mcp` |
| profile | `profile:` | `--profile={advisor\|teams\|classic}` |

Per-invocation flags always win. `--specialists` adds to defaults; `--no-specialists` clears all.
