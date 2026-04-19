---
name: regroup-trigger
description: "Detect pause, wrap-up, handoff, or clear-context intent and offer a KnowzCode regroup handoff. Triggers when the user says they need to stop, step away, clear context, start fresh, hand off, or resume later."
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Regroup Trigger Skill

**Purpose**: Catch obvious context-clearing moments and offer `/knowzcode:regroup` before the user loses workflow state.

This is a lightweight router. It never writes handoffs directly.

## Trigger Patterns

Activate when the user message matches any of these patterns:

- "wrap up"
- "pause here"
- "stop here"
- "I need to stop"
- "I need to step away"
- "take a break"
- "clear context"
- "new context"
- "fresh session"
- "start a new chat"
- "handoff"
- "resume later"
- "continue later"
- "pick this back up"
- "context is getting long"
- "summarize so we can continue later"

## Context Requirements

- Must be in a KnowzCode-initialized project (`knowzcode/` directory exists).
- Should NOT trigger during active `/knowzcode:*` command execution.
- Should NOT trigger during explicit `/knowz` command execution.
- Should only trigger for pause/handoff intent, not ordinary implementation requests.

## When NOT to Trigger

Do NOT trigger if:

- The user is asking a normal question.
- The user is asking to build, fix, test, audit, or refactor something now.
- The user is already invoking `/knowzcode:regroup`.
- The user is already invoking `/knowzcode:continue`.
- There is no KnowzCode project.
- The message only asks for a normal summary, with no signal that context will be cleared or work should resume later.

## Skill Behavior

When triggered:

1. Check for an active WorkGroup by reading `knowzcode/knowzcode_tracker.md` when present.
2. Extract a concise next-step hint from the user's message when one is present.
3. Offer exactly once:
   ```text
   This looks like a good checkpoint. Want me to run /knowzcode:regroup with the current goal and next step so you can resume cleanly after clearing context?
   ```
4. If the user agrees, invoke the same workflow as `/knowzcode:regroup`, passing the next-step hint if available.
5. If the user declines or ignores the offer, do nothing else.

## Key Constraints

- **Never auto-regroup.** Always ask first.
- **Never write the handoff directly.** Delegate to `/knowzcode:regroup` so the handoff schema stays canonical.
- **Never save workflow state to Knowz.** Knowz only receives durable learnings extracted from work.
- **Never block the main task.** If tracker lookup fails, still offer regroup on explicit clear-context/handoff wording.
- **Offer once per checkpoint.** Do not repeatedly nag in the same pause/handoff moment.

## Related Skills

- `/knowzcode:regroup` - Creates the local handoff
- `/knowzcode:continue` - Loads the latest handoff or active WorkGroup
