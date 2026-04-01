# Agent Teams as Default Execution Mode

## Problem

Agent teams mode isn't used unless the user explicitly starts `/knowzcode:work` and tells Claude to use agent teams. The knowledge-liaison — critical for persistent vault queries and captures across all workflow phases — only runs as a persistent teammate in agent teams mode. Without it, knowledge operations are significantly weaker: vault reads become one-shot queries, vault writes happen inconsistently, and the two-tier read model (baseline + deep research) collapses to baseline-only.

Despite the feature being enabled via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, the work skill treats all execution modes as equally valid. The CLAUDE.md template doesn't express a preference. The init skill asks neutrally whether to enable teams. The result: users who have the feature enabled still don't get agent teams unless they explicitly request it.

## Goals

1. Make agent teams the expected execution mode for all Tier 2+ work
2. Ensure the knowledge-liaison runs persistently for all non-trivial workflows
3. Make the installer auto-enable agent teams with opt-out confirmation
4. Add degradation warnings when agent teams are unavailable
5. Update CLAUDE.md template to set agent teams as the expected mode

## Non-Goals

- Changing Tier 1 (Micro) behavior — still redirects to `/knowzcode:fix`
- Changing Tier 3 parallel orchestration — already uses teams when available
- Modifying agent definitions
- Changing orchestration config defaults
- Changing quality gate logic

## Changes

### 1. Work Skill Step 2 Rewrite (`knowzcode/skills/work/SKILL.md`)

**Current**: Step 2 uses neutral "try-then-fallback" — attempts `TeamCreate()`, falls back to subagent delegation with a neutral announcement.

**New**: Step 2 treats agent teams as the expected mode. When `TeamCreate` fails:
- Announce with degradation warning:
  > "WARNING: Agent Teams not available — knowledge capture and parallel orchestration degraded. Enable: set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.local.json`"
- Continue with subagent delegation (no blocking)

The announcement for successful team creation stays the same. The fallback announcement changes from neutral to warning.

### 2. Tier 2 Lightweight Team (`knowzcode/skills/work/SKILL.md`)

**Current**: Tier 2 (Light) skips orchestration entirely — uses inline lead execution for Phase 1 & 3, single builder via `Task()` for Phase 2. No team created. No knowledge-liaison.

**New**: Tier 2 creates a lightweight team:
- Create team `kc-{wgid}` (same as Tier 3)
- Spawn knowledge-liaison as persistent teammate (vault reads at startup, captures at Tier 2 completion)
- Spawn single builder as teammate (instead of `Task()` dispatch)
- 2-phase flow preserved (Phase 1 inline by lead, Phase 2 by builder teammate, Phase 3 inline by lead)
- Knowledge-liaison DM'd for captures at Tier 2 completion gate (mandatory vault write)
- If `TeamCreate` fails: fall back to current Tier 2 behavior (inline + `Task()`) with degradation warning

### 3. Init Skill Step 9 Rewrite (`knowzcode/skills/init/SKILL.md`)

**Current**: Offers three neutral options — "Yes project-only", "Yes globally", "No (subagent fallback)".

**New**: Auto-enabled with confirmation:
1. Announce: "Agent Teams will be enabled for this project (recommended for full knowledge capture and parallel orchestration). Press enter to confirm, or type 'no' to use single-agent fallback."
2. If confirmed (enter or "yes"):
   - Write `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.claude/settings.local.json`
   - Follow-up: "Enable globally for all projects too? (y/n)"
   - If yes: also write to `~/.claude/settings.json`
3. If declined ("no"):
   - Skip env var write
   - Announce: "Agent Teams not enabled. Knowledge capture and parallel orchestration will be reduced."

### 4. CLAUDE.md Template Update (`knowzcode/knowzcode/platform_adapters.md`)

Add a new section to the Claude Code CLAUDE.md template:

```markdown
## Agent Teams (Required for Full Workflow)

Agent Teams is the expected execution mode for all KnowzCode workflows (Tier 2+).
Without it, knowledge capture is degraded and parallel orchestration is unavailable.

- Tier 1 (Micro): No team needed — redirected to `/knowzcode:fix`
- Tier 2 (Light): Lightweight team — knowledge-liaison + single builder
- Tier 3 (Full): Full parallel team — all agents, parallel orchestration

If Agent Teams is not available, KnowzCode falls back to subagent delegation
with reduced knowledge capture. Enable via:
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.local.json`

### Knowledge-Liaison
The knowledge-liaison is the primary knowledge capture mechanism.
It runs persistently across all phases, coordinating vault reads and writes.
Without it (subagent fallback), vault operations are one-shot and inconsistent.
Always prefer `/knowzcode:work` over `/knowzcode:fix` for anything beyond
single-file micro-fixes to ensure knowledge-liaison coverage.
```

## Files Modified

| File | Change |
|------|--------|
| `knowzcode/skills/work/SKILL.md` | Step 2 rewrite (opinionated teams preference, degradation warning), Tier 2 lightweight team support |
| `knowzcode/skills/init/SKILL.md` | Step 9 rewrite (auto-enable with opt-out confirmation) |
| `knowzcode/knowzcode/platform_adapters.md` | Add Agent Teams section to CLAUDE.md template |

## Testing

- Run `/knowzcode:init` on a fresh project — verify agent teams auto-enabled with confirmation prompt
- Run `/knowzcode:work` on a Tier 2 task with teams enabled — verify knowledge-liaison spawns as teammate
- Run `/knowzcode:work` on a Tier 2 task without teams — verify degradation warning appears
- Run `/knowzcode:work` on a Tier 3 task — verify no behavior change (already uses teams)
- Run `/knowzcode:fix` — verify no team created (Tier 1 unchanged)
