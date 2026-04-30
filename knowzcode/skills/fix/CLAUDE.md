# fix — Operational Rules

Targeted micro-fix workflow for single-file changes under 50 lines. Delegates to `microfix-specialist`. Redirects to `/knowzcode:work` for anything larger.

## Dispatch Pattern

Agents are invoked as `general-purpose` subagents that read their agent `.md` file at runtime. `fix` uses `Task()` subagent delegation exclusively — Agent Teams overhead is not justified for micro-fixes. The `subagent_type` is `"microfix-specialist"`; the agent reads `agents/microfix-specialist.md` for its role definition.

## Agent Used

| Agent | Role |
|-------|------|
| `microfix-specialist` | Scope validation, implementation, verification loop, log entry, commit |

## Workflow Phases

1. **Scope guard** — verify: ≤1 file, <50 lines, no ripple effects, no new dependencies, existing tests cover the area
2. **Profile resolution** — parse `--profile` flag or read `knowzcode/knowzcode_orchestration.md`; detect advisor environment constraints
3. **Delegate to microfix-specialist** — single `Task()` call with target, summary, and resolved model/advisor-guidance
4. **Verification loop (inside agent)** — run tests, fix failures, re-run until all pass; then run linter
5. **Log and commit** — MicroFix entry in `knowzcode/knowzcode_log.md`; commit with `fix:` prefix

## Scope Redirect

If ANY scope criterion fails, stop immediately and suggest `/knowzcode:work`. Do not attempt the fix.

## Profile Resolution

| Source | Priority |
|--------|----------|
| `--profile=<value>` flag | Highest |
| `profile:` in `knowzcode/knowzcode_orchestration.md` | Config fallback |
| Default: `teams` | Lowest |

Advisor profile: routes `microfix-specialist` to Sonnet with advisor-tool guidance block. Advisor falls back to `teams` if `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` or `ANTHROPIC_BASE_URL` points outside `anthropic.com`.

## Constraints

- **Subagent delegation only** — no `TeamCreate`, no Agent Teams
- Never attempt multi-file or >50 LOC fixes — redirect to `/knowzcode:work`
- Do NOT trigger when user is asking how to fix something (question) rather than requesting a fix (action)
- `mode: "bypassPermissions"` is set on the `Task()` call
- Skip `model:` parameter entirely when `MODEL_FOR("microfix-specialist", PROFILE)` returns null

## Output Paths

- Log entry: `knowzcode/knowzcode_log.md`
- Commit: in the project's git history (`fix:` prefix)
- No WorkGroup file, no specs, no planning documents
