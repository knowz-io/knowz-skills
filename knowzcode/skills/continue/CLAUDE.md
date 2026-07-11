# continue — Operational Rules

Trigger skill that detects continuation intent and resumes the active WorkGroup at the correct phase. Not user-invocable directly; fires on phrases like "continue", "resume", "keep going", "pick this back up".

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. The skill itself does not spawn agents directly — it restores context and then delegates remaining phases using the same spawn/dispatch patterns as `/knowzcode:work`. Agent Teams mode uses `TeamCreate` + teammate spawning; subagent delegation uses `Task()`.

## Workflow Phases

1. **Check local handoffs** — scan `knowzcode/handoffs/*.md`; use newest or user-specified handoff
2. **Find active WorkGroup** — search `knowzcode_tracker.md` for `[WIP]` entries
3. **Load WorkGroup context** — read the WorkGroup file, restore Autonomous Mode and orchestration config
4. **Relay detection** — WorkGroup has a `## Relay` section → read `{wgid}-relay/state.md`, preserve its recorded host/target, reconcile any dead target process through that provider's adapter, and resume per `skills/work/references/relay-execution.md`
5. **Resume at current phase** — detect parallel-mode (Stage-based) vs sequential-mode (Phase-based) WorkGroup; spawn agents for remaining work
6. **Present status** — announce goal, phase, NodeIDs, outstanding todos (and relay state when active) before proceeding

## Execution Mode Detection

- Check `~/.claude/settings.json` and `.claude/settings.json` for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in the `env` block
- If found: create team `kc-{wgid}`, use Agent Teams (delegate mode — never write code directly)
- If not found: use `Task()` subagent delegation; announce degradation warning

## Parallel vs Sequential Resume

- **Parallel-mode WorkGroup** (`## Current Stage` section in file): recreate team, spawn agents for the current stage; do not respawn already-completed agents
- **Sequential-mode WorkGroup** (`Current Phase:` in file): create tasks only for remaining phases; follow the same spawn prompts as `/knowzcode:work`

## Relay Resume Contract

- Schema 2 is authoritative: `Host`, `Target`, role-based `State`, and `Session ID` determine continuation. Never re-resolve target from a new prompt or changed config.
- A schema-2 same-host pair, host/platform mismatch, or relay on Gemini is invalid and stops for correction.
- Legacy state with no `Schema` and `Mode: codex` maps to `Host: claude`, `Target: codex`; `CODEX_IMPLEMENTING`, `CODEX_FAILED`, `CODEX_DONE`, and `CLAUDE_TAKEOVER` map to `TARGET_IMPLEMENTING`, `TARGET_FAILED`, `TARGET_DONE`, and `HOST_TAKEOVER`. Other shared state names map unchanged.
- Read legacy state without rewriting it. Migrate to schema 2 only after a successful transition, preserving checkpoints, round, and session/thread identity.
- Reconcile `TARGET_IMPLEMENTING` with the recorded target adapter's completion selector and target-qualified artifacts. A Claude target uses stream-JSON `result`; a Codex target uses Codex completion evidence. Never cross-apply provider commands or selectors.
- Restore target-specific configuration before a resume. One failed provider resume leads to the protocol's host-takeover path; authentication failures always pause, including autonomous mode.

## Constraints

- Do NOT trigger when user gives new instructions, asks a question, or is already executing a `/knowzcode:*` command
- Do NOT trigger when `knowzcode/` directory does not exist
- Handoff files are local operational state — never search Knowz vaults for workflow handoffs
- Restores `AUTONOMOUS_MODE = true` if WorkGroup file contains `**Autonomous Mode**: Active`
- Do not re-run `cmd:` references from handoffs automatically; treat them as suggestions only

## Output Paths

- No new workflow is created — continuation may update the existing WorkGroup snapshot and `{wgid}-relay/state.md` after successful relay transitions
- Log entry appended to `knowzcode/knowzcode_log.md` on completion (via delegated closer agent)
