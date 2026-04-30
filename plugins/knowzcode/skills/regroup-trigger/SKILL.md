---
name: regroup-trigger
description: "Detect pause, wrap-up, handoff, or clear-context intent and offer a KnowzCode regroup handoff. Triggers when the user says they need to stop, step away, clear context, start fresh, hand off, or resume later."
---
<!-- Packaged Codex mirror of knowzcode/skills/regroup-trigger/SKILL.md. Keep behavior in sync with the source skill and platform adapters. -->

# KnowzCode Regroup Trigger - Intent Router

Use this as a lightweight router into `/knowzcode:regroup`. It never writes handoffs directly.

## Instructions

1. Trigger only when the user's message clearly signals pause, wrap-up, handoff, or context clearing:
   - "wrap up", "pause here", "stop here"
   - "I need to step away", "take a break"
   - "clear context", "new context", "fresh session", "start a new chat"
   - "handoff", "resume later", "continue later", "pick this back up"
   - "context is getting long", "summarize so we can continue later"
2. Do not trigger for normal questions or active implementation requests.
3. Do not trigger during explicit `/knowzcode:*` or `/knowz` command execution.
4. Check that `knowzcode/` exists. If not, do nothing.
5. Read `knowzcode/knowzcode_tracker.md` when available to detect active WorkGroups, but do not block if the read fails and the user's handoff intent is explicit.
6. Offer exactly once:
   ```text
   This looks like a good checkpoint. Want me to run `/knowzcode:regroup` with the current goal and next step so you can resume cleanly after clearing context?
   ```
7. If the user agrees, hand off to the same workflow as `/knowzcode:regroup`, passing any explicit next-step hint.
8. If the user declines or ignores the offer, do nothing.
9. Never auto-regroup, never save workflow state to Knowz, and never write the handoff directly from this trigger.
