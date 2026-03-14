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

## Scout Configuration

```yaml
# Scout mode controls context-scout spawning at Stage 0 (default: full)
#   full    — 3 scouts: specs, workgroups, backlog (default)
#   minimal — 1 scout: combined scan of all local context
#   none    — skip scouts entirely (lead loads context inline)
scout_mode: full
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
# Enable MCP agents (knowz-scout, knowz-scribe) when vaults are configured (default: true)
# Set to false to skip vault agents even when vaults exist — reduces agent count.
mcp_agents_enabled: true
```

---

## Override Precedence

| Setting | Config Default | Flag Override |
|---------|---------------|--------------|
| max_builders | `max_builders:` | `--max-builders=N` |
| scout_mode | `scout_mode:` | `--no-scouts` |
| default_specialists | `default_specialists:` | `--specialists`, `--no-specialists` |
| mcp_agents_enabled | `mcp_agents_enabled:` | `--no-mcp` |

Per-invocation flags always win. `--specialists` adds to defaults; `--no-specialists` clears all.
