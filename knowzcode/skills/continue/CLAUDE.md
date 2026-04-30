# continue — Operational Rules

Trigger skill that detects continuation intent and resumes the active WorkGroup at the correct phase. Not user-invocable directly; fires on phrases like "continue", "resume", "keep going", "pick this back up".

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. The skill itself does not spawn agents directly — it restores context and then delegates remaining phases using the same spawn/dispatch patterns as `/knowzcode:work`. Agent Teams mode uses `TeamCreate` + teammate spawning; subagent delegation uses `Task()`.

## Workflow Phases

1. **Check local handoffs** — scan `knowzcode/handoffs/*.md`; use newest or user-specified handoff
2. **Find active WorkGroup** — search `knowzcode_tracker.md` for `[WIP]` entries
3. **Load WorkGroup context** — read the WorkGroup file, restore Autonomous Mode and orchestration config
4. **Resume at current phase** — detect parallel-mode (Stage-based) vs sequential-mode (Phase-based) WorkGroup; spawn agents for remaining work
5. **Present status** — announce goal, phase, NodeIDs, and outstanding todos before proceeding

## Execution Mode Detection

- Check `~/.claude/settings.json` and `.claude/settings.json` for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in the `env` block
- If found: create team `kc-{wgid}`, use Agent Teams (delegate mode — never write code directly)
- If not found: use `Task()` subagent delegation; announce degradation warning

## Parallel vs Sequential Resume

- **Parallel-mode WorkGroup** (`## Current Stage` section in file): recreate team, spawn agents for the current stage; do not respawn already-completed agents
- **Sequential-mode WorkGroup** (`Current Phase:` in file): create tasks only for remaining phases; follow the same spawn prompts as `/knowzcode:work`

## Constraints

- Do NOT trigger when user gives new instructions, asks a question, or is already executing a `/knowzcode:*` command
- Do NOT trigger when `knowzcode/` directory does not exist
- Handoff files are local operational state — never search Knowz vaults for workflow handoffs
- Restores `AUTONOMOUS_MODE = true` if WorkGroup file contains `**Autonomous Mode**: Active`
- Do not re-run `cmd:` references from handoffs automatically; treat them as suggestions only

## Output Paths

- No new files written — resumes existing WorkGroup file in `knowzcode/workgroups/`
- Log entry appended to `knowzcode/knowzcode_log.md` on completion (via delegated closer agent)
