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

## Override Precedence

| Setting | Config Default | Flag Override |
|---------|---------------|--------------|
| max_builders | `max_builders:` | `--max-builders=N` |
| builder_node_limit | `builder_node_limit:` | `--builder-node-limit=N` |
| default_specialists | `default_specialists:` | `--specialists`, `--no-specialists` |
| mcp_agents_enabled | `mcp_agents_enabled:` | `--no-mcp` |

Per-invocation flags always win. `--specialists` adds to defaults; `--no-specialists` clears all.
