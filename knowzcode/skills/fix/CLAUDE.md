# fix — Operational Rules

Targeted micro-fix workflow for single-file changes under 50 lines. Delegates to `knowzcode:microfix-specialist`. Redirects to `/knowzcode:work` for anything larger.

## Dispatch Pattern

Agents are invoked with the current `Agent()` tool (`Task` is the older compatibility alias). `fix` uses one named subagent exclusively—Agent Teams overhead is not justified for micro-fixes. The `subagent_type` is `"knowzcode:microfix-specialist"`; the agent reads `${CLAUDE_PLUGIN_ROOT}/agents/microfix-specialist.md` for its role definition.

## Agent Used

| Agent | Role |
|-------|------|
| `knowzcode:microfix-specialist` | Scope validation, implementation, verification loop, log entry, commit |

## Workflow Phases

1. **Scope guard** — verify: ≤1 file, <50 lines, no ripple effects, no new dependencies, existing tests cover the area
2. **Profile resolution** — parse `--profile` flag or read `knowzcode/knowzcode_orchestration.md`; detect advisor environment constraints
3. **Delegate to knowzcode:microfix-specialist** — single `Agent()` call with target, summary, and resolved model/advisor-guidance
4. **Verification loop (inside agent)** — run tests, fix failures, re-run until all pass; then run linter
5. **Log and commit** — MicroFix entry in `knowzcode/knowzcode_log.md`; commit with `fix:` prefix

## Scope Redirect

If ANY scope criterion fails, stop immediately and suggest `/knowzcode:work`. Do not attempt the fix.

## Profile Resolution

| Source | Priority |
|--------|----------|
| `--profile=<value>` flag | Highest |
| `profile:` in `knowzcode/knowzcode_orchestration.md` | Config fallback |
| Default: `frontier` | Lowest |

Advisor profile: routes `microfix-specialist` to Sonnet with advisor-tool guidance block. Advisor falls back to `teams` if `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` or `ANTHROPIC_BASE_URL` points outside `anthropic.com`.

Frontier profile: keeps the micro-fix on Opus (execution work). `--fable-execution` runs it on Fable for a high-value job, with graceful downgrade to Opus if Fable is unavailable.

## Constraints

- **Subagent delegation only** — no `TeamCreate`, no Agent Teams
- Never attempt multi-file or >50 LOC fixes — redirect to `/knowzcode:work`
- Do NOT trigger when user is asking how to fix something (question) rather than requesting a fix (action)
- Dispatch uses the current `Agent()` tool (`Task` is an older compatibility alias), inherits the session permission policy, and never passes a permission `mode` or requests `bypassPermissions`
- Skip `model:` parameter entirely when `MODEL_FOR("microfix-specialist", PROFILE)` returns null

## Output Paths

- Log entry: `knowzcode/knowzcode_log.md`
- Commit: in the project's git history (`fix:` prefix)
- No WorkGroup file, no specs, no planning documents
