---
name: continue
description: "Detect continuation intent and resume active WorkGroup workflow or latest KnowzCode handoff. Triggers when user says continue, keep going, resume, resume handoff, or similar continuation intent"
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
- "resume handoff"
- "continue from handoff"
- "pick this back up"

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

### Step 0: Check Local Handoffs

Check `knowzcode/handoffs/*.md` before choosing a resume target.

- If the user supplied a handoff path or slug, load that handoff.
- If no explicit path was supplied, find the newest handoff by filename timestamp.
- If the newest handoff points to an active WorkGroup, use it to supplement the WorkGroup context.
- If there are no handoffs, continue with active WorkGroup discovery.

Handoffs are local operational state. Do not search Knowz vaults for workflow handoffs.

### Step 1: Find Active WorkGroup

Search `knowzcode/knowzcode_tracker.md` for `[WIP]` entries.

- **One active WorkGroup**: Use it automatically
- **Multiple active**: Present options to user
- **None active**: Inform user and suggest `/knowzcode:work`
- **Handoff with WorkGroupID: none**: Present the handoff context and suggest `/knowzcode:work` if the user wants to convert it into a formal workflow

### Step 2: Load WorkGroup Context

Read `knowzcode/workgroups/{WorkGroupID}.md` to determine:
- Current phase
- Primary goal
- Change Set
- Outstanding todos
- **Autonomous Mode**: If the WorkGroup file contains `**Autonomous Mode**: Active`, restore `AUTONOMOUS_MODE = true` and announce: `> **Autonomous Mode: RESTORED** — continuing with auto-approved gates.`
- **Orchestration Config**: If `knowzcode/knowzcode_orchestration.md` exists, parse and restore `MAX_BUILDERS`, `BUILDER_NODE_LIMIT`, `MCP_AGENTS_ENABLED`, `DEFAULT_SPECIALISTS`, and all `relay*` values (same logic as work.md configuration parsing). Defaults apply if the file is absent. Relay state records the already-resolved host and target; configuration must not re-resolve or change them during continuation.

If a handoff was selected in Step 0, also parse:
- `## Goal`
- `## Current State`
- `## Next Step`
- `## References`
- `## Durable Learning Candidates`

Use the handoff as the freshest local state. Do not run `cmd:` references automatically; treat them as suggested commands only.

### Step 2.5: Relay Detection

If the WorkGroup file contains a `## Relay` section, read both:

- `knowzcode/workgroups/{wgid}-relay/state.md` — authoritative state
- `knowzcode/skills/work/references/relay-execution.md` — provider-neutral state machine and target adapters

Resume the recorded relay instead of entering native Phase 2A. Do not infer a new target from the current prompt or current project configuration: the state file's host/target pair is fixed for the WorkGroup.

#### Schema 2

Parse and validate these fields:

```text
Schema: 2
Host: claude|codex
Target: claude|codex
State: INIT|PLANNED|TARGET_IMPLEMENTING|TARGET_FAILED|TARGET_DONE|
       REVIEWING|FIX_ROUND|HOST_TAKEOVER|FINALIZING|DONE|ABORTED
Session ID: provider thread/session identifier
```

Also restore Round, Max Fix Rounds, target-specific model/effort/permission or sandbox settings, Branch, checkpoints, and artifact paths. Reject malformed schema-2 state, a same-host pair, or a host that does not match the active supported platform; report the mismatch and stop rather than silently reversing it. Gemini is native-only and must not resume a cross-agent relay.

#### Legacy schema-1 compatibility

When `Schema` is absent and `Mode: codex` is present, interpret the state in memory as `Host: claude`, `Target: codex`, map `Thread ID` to `Session ID`, and map states as follows:

| Legacy state | Schema-2 meaning |
|--------------|------------------|
| `INIT` | `INIT` |
| `PLANNED` | `PLANNED` |
| `CODEX_IMPLEMENTING` | `TARGET_IMPLEMENTING` |
| `CODEX_FAILED` | `TARGET_FAILED` |
| `CODEX_DONE` | `TARGET_DONE` |
| `REVIEWING` | `REVIEWING` |
| `FIX_ROUND` | `FIX_ROUND` |
| `CLAUDE_TAKEOVER` | `HOST_TAKEOVER` |
| `FINALIZING` | `FINALIZING` |
| `DONE` | `DONE` |
| `ABORTED` | `ABORTED` |

Continue recognizing legacy `codex-log-r{N}.jsonl`, `codex-last-r{N}.md`, and `codex-err-r{N}.log` artifacts. Do not rewrite a legacy state file merely because it was read. After the next successful state transition, persist it as schema 2 with `Host: claude`, `Target: codex`, role-based state, `Session ID`, and target-qualified artifact names; update the WorkGroup snapshot at the same time.

#### Dead-process reconciliation

After a context clear, a recorded `TARGET_IMPLEMENTING` subprocess is no longer assumed live. Dispatch evidence checks through the recorded target adapter:

- Codex target: require the round JSONL completion event and target final-message artifact described by the Codex adapter.
- Claude target: require a final stream-JSON `result` with `subtype: success` and the target final-message artifact described by the Claude adapter.

Complete evidence maps to `TARGET_DONE` and the host commits the missing checkpoint if necessary. Incomplete or unsuccessful evidence maps to `TARGET_FAILED`: attempt the one provider-specific resume allowed by the relay protocol using the persisted Session ID, then enter `HOST_TAKEOVER` if resume fails or the retry is exhausted. Never apply Codex JSONL selectors, `$CODEX_HOME` recovery, or `codex exec resume` to a Claude target. All non-running states resume exactly where schema 2 says.

Include a relay line in the Step 4 status block:

`**Relay**: {host} → {target} — {state}, round {n}, session {session_id|pending}{legacy marker}`

Use ` (legacy schema 1)` as the marker when the compatibility mapping is active.

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
