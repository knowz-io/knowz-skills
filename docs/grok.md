# Knowz + KnowzCode for Grok Build

This repository (`knowz-io/knowz-skills`) is a **Grok plugin marketplace**. Any Grok Build instance can add it and install the two plugins. Nothing in this guide is specific to the Knowz platform checkout.

## What you get

| Plugin | Skills | Vault backend |
|--------|--------|----------------|
| **knowz** | `/knowz`, `/knowz-cli`, `/knowz-auto` | **CLI first** (`knowz` on PATH) then **MCP** (`https://mcp.knowz.io/mcp`, attached on install) |
| **knowzcode** | `/work`, `/explore`, `/fix`, `/audit`, `/setup`, `/continue`, `/status`, `/regroup`, `/relay`, `/telemetry`, … | Same: CLI then MCP, via `skills/work/references/vault-access.md` |

## Install (any machine)

From a terminal, in any project:

```bash
# 1. Register the marketplace (GitHub shorthand, git URL, or a local clone)
grok plugin marketplace add knowz-io/knowz-skills
# grok plugin marketplace add https://github.com/knowz-io/knowz-skills.git
# grok plugin marketplace add /path/to/knowz-skills

# 2. Install both plugins. --trust activates MCP on the knowz plugin.
grok plugin install knowz --trust
grok plugin install knowzcode --trust

# 3. Optional: CLI (preferred for vault ops; no MCP OAuth)
npm i -g @knowzai/cli
knowz login          # or: knowz login --sso
```

Start a **new Grok session**. Then:

```text
/knowz status          # or: knowz whoami
/knowzcode:setup       # skip if the project already has knowzcode/
/knowzcode:work "…"    # TDD + specs + log
/knowzcode:explore "…" # research first
```

One-shot from a clone of this repo:

```bash
./scripts/install-grok.sh
```

## Pin it in config (optional)

User-wide, always show this marketplace:

```toml
# ~/.grok/config.toml
[[marketplace.sources]]
name = "knowz-skills"
git = "https://github.com/knowz-io/knowz-skills.git"
```

Or project-local (committed with the app):

```toml
# .grok/config.toml
[[marketplace.sources]]
name = "knowz-skills"
git = "https://github.com/knowz-io/knowz-skills.git"
```

## How vault calls resolve

1. If `knowz` is on PATH → `/knowz-cli` (`knowz search`, `knowz ask`, `knowz knowledge create`, …).
2. Else if Knowz MCP tools are in the session → `mcp__knowz__*` (plugin `.mcp.json` registers `https://mcp.knowz.io/mcp`; first call may open OAuth).
3. Else `/knowz setup` / `grok mcp add --transport http knowz https://mcp.knowz.io/mcp`.

KnowzCode work/explore/audit use the same rule (`skills/work/references/vault-access.md`). They do not hard-require MCP.

## Official xAI marketplace

A PR to `xai-org/plugin-marketplace` can point at this repo once a commit is on `main`. Until then, `grok plugin marketplace add knowz-io/knowz-skills` is the supported install.
