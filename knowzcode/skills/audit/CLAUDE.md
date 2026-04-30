# audit — Operational Rules

Read-only quality audit workflow for spec completeness, architecture health, OWASP security scanning, and integration consistency.

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. The `subagent_type` field in `Task()` calls is set to the agent name (e.g. `"reviewer"`, `"security-officer"`, `"test-advisor"`); the agent reads `agents/<name>.md` for its full role definition. Agent Teams mode uses `TeamCreate` + teammate spawning instead of `Task()`.

## Agents Used

| Agent | Role | When |
|-------|------|------|
| `reviewer` | Spec, architecture, security, integration audit | Every audit invocation |
| `security-officer` | Deep OWASP/threat scan | `--specialists` or `--specialists=security` |
| `test-advisor` | Test coverage and TDD compliance | `--specialists` or `--specialists=test` |
| `knowledge-liaison` | Local context + vault knowledge (subagent mode) | Subagent delegation path only |

## Workflow Phases

1. **Load context** — read `knowzcode_tracker.md`, `knowzcode_architecture.md`, `knowzcode_project.md`, `knowzcode_orchestration.md`
2. **Set execution mode** — attempt `TeamCreate`; fall back to `Task()` subagent delegation on failure; `--profile classic` forces subagent delegation
3. **MCP probe** — check vault availability via `knowz-vaults.md` or `list_vaults()`
4. **Execute audit** — specific type (single reviewer) or full audit (parallel reviewers, optional specialists)
5. **Present results** — health scores, critical issues, recommendations
6. **Vault capture prompt** — offer to save findings to Knowz (if vaults configured)
7. **Log** — append to `knowzcode/knowzcode_log.md`

## Parallelism

- Full audit (no argument): up to 3 reviewers run in parallel (spec+arch, security+integration, compliance)
- Specialists (`security-officer`, `test-advisor`) run in parallel with reviewers when enabled
- Knowledge-liaison runs in parallel with reviewers in subagent mode

## Constraints

- **Read-only** — audit never modifies source code or specs; only writes to `knowzcode_log.md` and vault (on user approval)
- Never trigger when user wants to **build** (→ `/knowzcode:work`) or **fix** (→ `/knowzcode:fix`)
- Announce execution mode before any audit work begins
- `--no-specialists` overrides `default_specialists` from `knowzcode_orchestration.md`
- Profile `advisor` routes `reviewer` through Sonnet with advisor-tool guidance; strategic agents stay on Opus

## Output Paths

- Log entry: `knowzcode/knowzcode_log.md`
- Vault capture: ecosystem-type vault (user-approved, via `knowz:writer`)
- No files written to source tree or `knowzcode/specs/`
