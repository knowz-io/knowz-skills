# work — Operational Rules

Full KnowzCode development workflow with TDD, quality gates, and multi-agent coordination. Supports Tier 2 (Light, 2-phase) and Tier 3 (Full, 5-phase) complexity paths.

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. The `subagent_type` field in `Task()` calls is set to the agent name; each agent reads `agents/<name>.md` for its role. Agent Teams mode (`TeamCreate` + teammate spawning) is the preferred path; `Task()` subagent delegation is the fallback.

## Agents Used

| Agent | Phase | Role |
|-------|-------|------|
| `knowledge-liaison` | Persistent (Stage 0+) | Context, vault research, knowledge capture |
| `analyst` | Phase 1A | Impact analysis, Change Set, dependency map |
| `architect` | Phase 1B | Spec drafting, VERIFY criteria |
| `builder` | Phase 2A | TDD implementation (1–5 per partition) |
| `reviewer` | Phase 2B | ARC audit, gap report |
| `smoke-tester` | Phase 2B (opt-in) | Runtime smoke testing |
| `closer` | Phase 3 | Finalization, tracker update, log entry, commit |
| `security-officer` | Phase 1 (opt-in) | Threat model, OWASP scan |
| `test-advisor` | Phase 1 (opt-in) | TDD enforcement, test quality |
| `project-advisor` | Phase 1 (opt-in) | Backlog curation |

## Workflow Phases (Tier 3)

1. **Pre-flight** — prerequisite check, WorkGroup ID generation, profile parse (Step 0–1.5)
2. **Execution mode selection** — `TeamCreate` → Parallel/Sequential/Lightweight Teams; fallback → Subagent Delegation (Step 2)
3. **Profile resolution** — advisor env detection, `MODEL_FOR()` per agent, Advisor Guidance block injection (Step 2.3)
4. **Orchestration config** — parse `knowzcode_orchestration.md` for `max_builders`, `default_specialists`, `mcp_agents_enabled`, etc. (Step 2.4)
5. **Autonomous mode + specialist detection** (Steps 2.5–2.6)
6. **Context load** — read loop, tracker, project, architecture files ONCE (Step 3)
7. **MCP probe + baseline vault query** (Step 3.6 — non-skippable when MCP available)
8. **Create WorkGroup file** — `knowzcode/workgroups/{wgid}.md` (Step 4)
9. **Classify complexity** — Tier 1 (→ `/knowzcode:fix`), Tier 2 (Light), Tier 3 (Full) (Steps 5–5.5)
10. **Execute phases** — per tier path (Tier 2: Light; Tier 3: Parallel/Sequential/Subagent)
11. **Quality gates** — Gate #1 (Change Set), Gate #2 (Specs), Gate #3 (Audit); auto-approved in Autonomous Mode except safety exceptions
12. **Cleanup** — shut down all teammates, delete team (Agent Teams); no cleanup needed for Subagent

## Parallelism

- **Parallel Teams (Tier 3 default)**: Stage 0 spawns knowledge-liaison + analyst + architect + scanners/specialists simultaneously; Stage 2 spawns one builder per independent NodeID partition plus paired reviewer
- **Sequential Teams**: one agent per phase, spawned and shut down sequentially
- **Lightweight Teams (Tier 2)**: knowledge-liaison (persistent) + builder; skips analyst, architect, reviewer, closer

## Constraints

- Lead NEVER writes code, specs, or project files in Agent Teams mode — all work done by teammates
- Every WorkGroup task item MUST start with `KnowzCode:` prefix
- `AUTONOMOUS_MODE` auto-approves gates but NEVER skips vault writes, WorkGroup updates, tracker updates, or log entries
- `--profile advisor` requires Parallel Teams; incompatible with `--sequential` or `--subagent`
- Gap loop cap: >3 failures on the same phase → pause and ask user (safety exception, applies even in Autonomous Mode)
- Announce execution mode, profile, autonomous mode, and active specialists before any phase work begins
- Tier 1 (micro, <50 LOC) → redirect immediately to `/knowzcode:fix`; do not proceed

## Output Paths

- WorkGroup file: `knowzcode/workgroups/{wgid}.md`
- Specs: `knowzcode/specs/*.md`
- Log entry: `knowzcode/knowzcode_log.md`
- Tracker: `knowzcode/knowzcode_tracker.md`
- Vault captures: via `knowz:writer` (ecosystem-type vault, on completion)
- Planning context (from `/knowzcode:explore`): `knowzcode/planning/{slug}.md` (read-only input)

## Key Reference Files

- `knowzcode/skills/work/references/parallel-orchestration.md` — Stage 0–3 orchestration details
- `knowzcode/skills/work/references/spawn-prompts.md` — all agent spawn/dispatch prompts
- `knowzcode/skills/work/references/quality-gates.md` — gate templates, gap loop mechanics
- `knowzcode/skills/work/references/profile-models.md` — profile → agent-model mappings, `MODEL_FOR()` rules
- `knowzcode/skills/work/references/light-workflow.md` — Tier 2 Light phase details
- `knowzcode/claude_code_execution.md` — Agent Teams conventions (read by all teammates on spawn)
