# Knowz Plugins

Official plugin marketplace for [Claude Code](https://code.claude.com/) — development methodology and knowledge management for AI coding assistants.

## Plugins

| Plugin | Description | Install |
|:-------|:------------|:--------|
| [knowzcode](./knowzcode/) | Platform-agnostic AI development methodology with TDD, quality gates, and structured workflows | `/plugin install knowzcode@knowz-plugins` |
| [knowz](./knowz/) | Frictionless knowledge management via the Knowz MCP server — search, save, and query knowledge across vaults | `/plugin install knowz@knowz-plugins` |

## Installation

### 1. Add the marketplace

```bash
/plugin marketplace add knowz-io/knowz-plugins
```

### 2. Install plugins

```bash
/plugin install knowzcode@knowz-plugins   # Development methodology
/plugin install knowz@knowz-plugins       # Knowledge management
```

### 3. Get started

```bash
cd your-project/
/knowzcode:init                               # Initialize KnowzCode in your project
/knowzcode:work "Build user authentication"   # Start building
/knowz register                               # Set up knowledge vaults
```

## License

MIT License with Commons Clause — See individual plugin directories for details.
