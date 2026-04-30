# explore — Operational Rules

Research and planning workflow. Use before implementing to understand a codebase area, evaluate options, or produce a structured implementation plan.

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. The `subagent_type` field in `Task()` calls is set to the agent name (e.g. `"analyst"`, `"architect"`, `"reviewer"`, `"knowledge-liaison"`); each agent reads `agents/<name>.md` for its full role definition. Agent Teams mode uses `TeamCreate` + teammate spawning instead of `Task()`.

## Agents Used

| Agent | Role |
|-------|------|
| `analyst` | Code exploration or impact analysis |
| `architect` | Architecture assessment or design proposal |
| `reviewer` | Security and quality risks |
| `knowledge-liaison` | Local context + vault research, Context Briefing |

All four agents run in parallel (Agent Teams or `Task()`).

## Workflow Phases

1. **Auto-detect depth** — classify as Exploration Mode (questions, investigation) or Planning Mode (action-oriented, feature design)
2. **Check initialization** — `knowzcode/` must exist; else suggest `/knowzcode:init`
3. **Set execution mode** — attempt `TeamCreate("kc-explore-{slug}")`; fall back to `Task()` on failure
4. **MCP probe + baseline vault query** — lead queries vaults directly before spawning any agents
5. **Launch parallel investigation** — spawn all four agents with mode-appropriate prompts
6. **Synthesize findings** — Exploration: inline report; Planning: save to `knowzcode/planning/{slug}.md`
7. **Vault capture prompt** — offer to save findings (if vaults configured)
8. **Listen for implementation intent** — "implement", "go ahead", "do option N" → invoke `/knowzcode:work`

## Exploration vs Planning Mode

| Mode | Tool call limit | Output | Triggers |
|------|----------------|--------|----------|
| Exploration | 10 per agent | Inline report | Questions, "how does X work", investigative phrasing |
| Planning | None | `knowzcode/planning/{slug}.md` | "plan X", "design X", action verbs + feature nouns |

## Constraints

- Lead MUST perform baseline vault queries directly before spawning agents (non-skippable when MCP is available)
- Announce execution mode and detected depth before investigation begins
- Do NOT trigger when user wants to build immediately (→ `/knowzcode:work`) or fix a specific bug (→ `/knowzcode:fix`)
- After cleanup, remain responsive to vault-write intent in follow-up messages
- Team cleanup (shut down all teammates + delete team) is required after Agent Teams mode completes or is cancelled

## Output Paths

- Exploration mode: no files written
- Planning mode: `knowzcode/planning/{slug}.md`
- Vault captures: ecosystem-type vault (user-approved, via `knowz:writer`)
