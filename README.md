# Knowz Skills

Official plugin marketplace for [Claude Code](https://code.claude.com/) and a repo-local plugin marketplace for Codex - development methodology and knowledge management for AI coding assistants.

## Products

| Product | Description | Claude Install |
|:--------|:------------|:---------------|
| [knowzcode](./knowzcode/) | Platform-agnostic AI development methodology with TDD, quality gates, and structured workflows | `/plugin install knowzcode@knowz-skills` |
| [knowz](./knowz/) | Frictionless knowledge management via the Knowz MCP server - search, save, and query knowledge across vaults | `/plugin install knowz@knowz-skills` |

## Marketplace Layout

This repository now carries two parallel packaging layouts:

- **Claude marketplace**: [.claude-plugin/marketplace.json](./.claude-plugin/marketplace.json) plus the existing source products in [`knowz/`](./knowz/) and [`knowzcode/`](./knowzcode/)
- **Codex marketplace**: [.agents/plugins/marketplace.json](./.agents/plugins/marketplace.json) plus packaged Codex plugins in [`plugins/knowz`](./plugins/knowz/) and [`plugins/knowzcode`](./plugins/knowzcode/)

The Codex packaging is additive. It does not replace or alter the Claude marketplace structure.

Ownership rule:

- Claude behavior is defined by the source products in [`knowz/`](./knowz/) and [`knowzcode/`](./knowzcode/) plus [.claude-plugin/marketplace.json](./.claude-plugin/marketplace.json)
- Codex behavior is defined by the packaged plugins in [`plugins/`](./plugins/) plus [.agents/plugins/marketplace.json](./.agents/plugins/marketplace.json)

Parity checklist:

- Product names stay aligned across Claude and Codex surfaces
- Versions stay aligned with the source packages
- High-level product descriptions stay equivalent even when platform-specific details differ
- Major feature sets stay aligned unless a difference is explicitly documented as platform-specific

## Claude Code Usage

### 1. Add the marketplace

```bash
/plugin marketplace add knowz-io/knowz-skills
```

### 2. Install plugins

```bash
/plugin install knowzcode@knowz-skills
/plugin install knowz@knowz-skills
```

### 3. Get started

```bash
cd your-project/
/knowzcode:init
/knowzcode:work "Build user authentication"
/knowz register
```

## Codex Usage

Codex support in this repo currently ships as local plugin packaging artifacts rather than a documented public OpenAI-hosted marketplace submission.

Relevant files:

- Marketplace manifest: [`./.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json)
- Knowz plugin package: [`./plugins/knowz`](./plugins/knowz)
- KnowzCode plugin package: [`./plugins/knowzcode`](./plugins/knowzcode)

Current Codex packaging details:

- `knowz` includes packaged skills and a plugin-local MCP manifest at `plugins/knowz/.mcp.json`
- `knowzcode` includes packaged skills plus the `knowzcode/` support files those skills read
- Knowz MCP setup for Codex uses shared Codex MCP configuration such as `~/.codex/config.toml` or `codex mcp add`, not the older project-local `.mcp.json` assumption
- Codex API-key setup uses `bearer_token_env_var` with `KNOWZ_API_KEY`; this repo does not assume a public OpenAI-hosted plugin directory or undocumented Codex auth shape

## Notes

- The Claude marketplace remains the primary published install surface in this repo.
- The Codex packaging is now an intentional repo-supported surface, not a copied placeholder.
- Validate both surfaces with `node scripts/validate-platform-surfaces.mjs`.

## License

MIT License with Commons Clause - see individual plugin directories for details.
