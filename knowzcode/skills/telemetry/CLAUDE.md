# telemetry — Operational Rules

Telemetry investigation workflow for diagnosing production errors from Sentry and Azure App Insights using natural language queries.

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. `telemetry` delegates to the `reviewer` agent via a single `Task()` call. The agent reads `agents/reviewer.md` for its role definition and uses CLI tools (`sentry-cli`, `az monitor`) to query telemetry sources.

## Agent Used

| Agent | Role |
|-------|------|
| `reviewer` | Parse query, query telemetry sources, synthesize timeline, generate root cause hypothesis |

## Workflow Phases

1. **Parse natural language query** — extract environment, timeframe, and search terms
2. **Load config** — read `knowzcode/telemetry_config.md` for Sentry and App Insights mappings
3. **Detect tool installation** — check for `sentry-cli` and `az` + application-insights extension
4. **Verify authentication** — confirm each installed tool is authenticated before querying
5. **Investigate** — delegate to `reviewer` with full config, detected sources, and parsed query
6. **Present findings** — merged event timeline, root cause hypothesis, confidence level, recommendations
7. **Log** — append investigation entry to `knowzcode/knowzcode_log.md`

## Configuration Gate

If `knowzcode/telemetry_config.md` does not exist or sources are not configured, stop and direct user to `/knowzcode:telemetry-setup`. Do not attempt investigation without a valid config.

If tools are installed but not authenticated, stop and direct user to `/knowzcode:telemetry-setup`. Do not silently query unauthenticated sources.

## Constraints

- **Read-only** — never modifies source code; findings lead to `/knowzcode:fix` or `/knowzcode:work` as next steps
- Never trigger when user wants to **configure** telemetry sources (→ `/knowzcode:telemetry-setup`)
- Never trigger when user wants to **audit code quality** (→ `/knowzcode:audit`)
- Single `Task()` dispatch — no Agent Teams, no parallel subagents
- Supported sources: Sentry CLI, Azure Monitor (App Insights); both can be absent or only one configured

## Output Paths

- Log entry: `knowzcode/knowzcode_log.md`
- Findings: presented inline (no file written to project tree)
- Handoff to: `/knowzcode:fix` or `/knowzcode:work` per user choice
