---
name: continue
description: "Detect continuation intent and resume active WorkGroup workflow. Triggers when user says continue, keep going, resume, or similar continuation intent"
user-invocable: false
allowed-tools: Read, Glob, Grep, Task
---

# Continue Skill

**Purpose**: Detect when user wants to continue work and resume the active WorkGroup with proper context restoration.

## Trigger Patterns

Activate when user message matches ANY of these patterns:
- "continue"
- "keep going"
- "resume"
- "carry on"
- "next"
- "continue with this"
- "let's continue"
- "keep working"

**Context Requirements**:
- Must be in a KnowzCode-initialized project (knowzcode/ directory exists)
- Should NOT trigger if user is clearly giving new instructions
- Should NOT trigger during explicit command execution

## When NOT to Trigger

- User is giving specific new instructions
- User is asking a question
- Already executing a /knowzcode:* command
- knowzcode/ directory doesn't exist

## Skill Behavior

When triggered:

### Step 1: Find Active WorkGroup

Search `knowzcode/knowzcode_tracker.md` for `[WIP]` entries.

- **One active WorkGroup**: Use it automatically
- **Multiple active**: Present options to user
- **None active**: Inform user and suggest `/knowzcode:work`

### Step 2: Load WorkGroup Context

Read `knowzcode/workgroups/{WorkGroupID}.md` to determine:
- Current phase
- Primary goal
- Change Set
- Outstanding todos
- **Autonomous Mode**: If the WorkGroup file contains `**Autonomous Mode**: Active`, restore `AUTONOMOUS_MODE = true` and announce: `> **Autonomous Mode: RESTORED** — continuing with auto-approved gates.`
- **Orchestration Config**: If `knowzcode/knowzcode_orchestration.md` exists, parse and restore `MAX_BUILDERS`, `MCP_AGENTS_ENABLED`, `DEFAULT_SPECIALISTS` (same logic as work.md Step 2.4). Defaults apply if file is absent.

### Step 3: Resume at Current Phase

Read `knowzcode/knowzcode_loop.md` and resume the workflow at the detected phase.

#### Parallel Mode Detection

If the WorkGroup file contains a `## Current Stage` section (instead of `Current Phase`):
- This is a **parallel-mode WorkGroup**
- Read the per-NodeID phase table to determine what's in progress
- Resume by recreating the team and spawning agents appropriate for the current stage:
  - **Stage 0/1**: Spawn analyst + architect. If context is stale, spawn knowledge-liaison to refresh local + vault context.
  - **Stage 2**: Spawn builder(s) per the dependency map + reviewer if any NodeIDs are past implementation
  - **Stage 3**: Spawn closer
- Builders and reviewer persist through gap loops (don't respawn per iteration)
- Announce: `**Resuming Parallel Teams** — Stage {N}: {description}`

If resuming mid-Stage-2 (e.g., builder was implementing, reviewer had started auditing):
- Read the per-NodeID status table to determine which NodeIDs need builders and which need reviewer
- Carry forward existing context by reading the WorkGroup file

#### Sequential Mode Detection

If the WorkGroup file contains `Current Phase:` (standard format):
- This is a **sequential-mode WorkGroup**
- Create tasks only for the **remaining** phases (not completed ones):

| Detected Phase | Remaining Work |
|----------------|----------------|
| 1A | All phases (1A → 1B → 2A → 2B → 3) |
| 1B | Specs + implementation + audit + finalization |
| 2A | Implementation + audit + finalization |
| 2B | Audit + finalization |
| 3 | Finalization only |

**Set up execution mode** — check `~/.claude/settings.json` and `.claude/settings.json` for `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"` in the `env` block. If found, Agent Teams is available — create a team named `kc-{wgid}` and activate delegate mode (you coordinate only, never write code directly). Read `knowzcode/claude_code_execution.md` for team conventions. For each remaining phase, spawn one teammate with the spawn prompt from the corresponding phase section of `/knowzcode:work`, create a task, wait for completion, present quality gate, shut down teammate. Shut down all teammates when done or on cancel.

If Agent Teams is not available, announce `**Execution Mode: Subagent Delegation** — Agent Teams not available (add "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" to the env block in settings.json, then restart Claude Code)` and use `Task()` calls to delegate each remaining phase to the named agent.

Follow the same phase delegation patterns (spawn prompts, quality gates, gap loop) as `/knowzcode:work`.

### Step 4: Present Status

```markdown
## Resuming WorkGroup: {wgid}

**Goal**: {primary goal}
**Phase**: {current phase}
**NodeIDs**: {list}

**Outstanding Todos**:
{list from WorkGroup file}

Continuing from where we left off...
```

Then proceed with the appropriate phase using the same agents as `/knowzcode:work`.

## Related Skills

- `/knowzcode:work` — Start a new WorkGroup (if nothing to continue)
- `/knowzcode:status` — Check current project state

## Logging

```markdown
---
**Type:** SkillActivation
**Timestamp:** [timestamp]
**Skill:** continue
**Trigger:** User said "{user_message}"
**WorkGroup:** {wgid}
**Phase:** {current phase}
**Logged By:** AI-Agent
---
```
