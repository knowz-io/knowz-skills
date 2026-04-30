---
name: start-work
description: "Detect plan implementation intent and redirect to /knowzcode:work with extracted context. Triggers when user expresses intent to implement a plan, findings, or spec"
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Start Work Skill

**Purpose**: Intercept implementation intent phrases and auto-invoke `/knowzcode:work` with appropriate context from plans, investigations, or user statements.

## Trigger Patterns

Activate when user message matches ANY of these patterns:
- "implement this plan"
- "implement the plan"
- "Implement the following plan"
- "implement the following"
- "let's implement"
- "start implementing"
- "execute the plan"
- "begin implementation"
- "proceed with implementation"
- "do option 1" / "do option 2" / "do option 3"
- "implement option 1" / "implement option 2" / "implement option 3"
- "implement findings"
- "build this"
- "start work"
- "let me implement"
- "go ahead"
- "make the changes"
- "do it"
- "proceed"
- "implement it"

## Context Requirements

- Must be in a KnowzCode-initialized project (knowzcode/ directory exists)
- Should NOT trigger during active /knowzcode:* command execution
- Should have some prior context to extract goal from (plan, investigation, or user statement)

## When NOT to Trigger

Do NOT trigger this skill if:
- User is asking a question about implementation (e.g., "should we implement X?", "how should we implement?")
- User is requesting changes to a previous implementation (e.g., "implement it differently")
- User says "implement" but in context of explaining something to someone else
- Already inside a /knowzcode:* command execution
- knowzcode/ directory doesn't exist (not a KnowzCode project)
- User's message is a continuation of giving new feature requirements (not referencing a prior plan)

## Detection Logic

```
IF user_message matches implementation_pattern AND
   knowzcode_directory exists AND
   NOT question_pattern (ends with ?, starts with "should/could/would/how") AND
   NOT currently_executing_kc_command THEN
   trigger_start_work_skill()
```

**Question Detection** (exclude these):
- Message ends with `?`
- Message starts with: should, could, would, how, why, can, is, does, what
- Message contains: "should we", "could we", "would you", "how to"

## Skill Behavior

When triggered:

### Step 1: Acknowledge Intent

```
Starting KnowzCode workflow to implement your request...
```

### Step 2: Look for Implementation Context

Search for context in this priority order:

#### Priority A: Recent Plan File (Claude Code plan mode)
1. Check for recent plan files (< 30 minutes old):
   - Location: `~/.claude/projects/*/` or `~/.claude/plans/`
   - Pattern: `*.md` files containing plan content
2. If found: Extract full plan content as context

#### Priority B: Recent Investigation
1. Check `knowzcode/planning/*.md` for files < 30 min old
2. If found: Extract top recommendation and key findings
3. Handle "option N" phrases by extracting that specific option

#### Priority C: Active WorkGroup
1. Check `knowzcode/knowzcode_tracker.md` for `[WIP]` entries
2. If found: Use existing primary goal from WorkGroup file

#### Priority D: User's Explicit Statement
1. If user message contains actionable content beyond trigger phrase
2. Parse verbs + objects to form goal

### Step 3: Handle Missing Context

```
IF no context found:
   PROMPT: "What would you like to implement? Please describe the feature or goal."
   WAIT for user response
   USE user_response as goal
```

### Step 4: Invoke Workflow

Pass full context to /knowzcode:work and let it extract the goal:

```
/knowzcode:work --context "{plan_or_investigation_content}"
```

The /knowzcode:work command will:
- Parse the context to extract the implementation goal
- Handle "option N" references from investigations
- Detect matching specs for optimization paths

### Handoff Payload Contract

When delegating to `/knowzcode:work`, structure the handoff so the workflow can skip rediscovery:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `goal` | string | yes | One-sentence imperative summary of what to build |
| `source_path` | string | no | Path to the plan or investigation the goal came from (e.g. `~/.claude/plans/foo.md`, `knowzcode/planning/investigation-*.md`) |
| `tier` | `"micro" \| "light" \| "full"` | no | Pre-classified scope hint; `/knowzcode:work` may override |
| `flags` | string | no | Pass-through orchestration flags such as `--autonomous`, `--tier full`, `--specialists=security` |
| `prior_findings_summary` | string | no | 2-3 sentences summarizing key constraints/decisions from the source so Phase 1A can build on them |

Always include `goal`. Include `source_path` whenever a plan/investigation was the trigger so the workflow can re-read the source rather than rely on chat memory.

## Example Interactions

### Example 1: After Plan Mode Exit
```
User: implement this plan
Skill: Starting KnowzCode workflow based on your plan...
       Loading plan context from recent session.
[Reads plan content, passes full context to /knowzcode:work]
[/knowzcode:work extracts goal: "Add user authentication with JWT tokens"]
```

### Example 2: After Investigation (Option Selection)
```
User: do option 2
Skill: Starting implementation of option 2 from investigation...
       Loading context from: knowzcode/planning/investigation-20250116-143022.md
[Extracts option 2 content, passes to /knowzcode:work]
[/knowzcode:work interprets: "Option 2: Refactor error handling with centralized middleware"]
```

### Example 3: After Investigation (Generic)
```
User: implement the findings
Skill: Starting implementation based on investigation findings...
       Loading context from: knowzcode/planning/investigation-20250116-143022.md
[Passes top recommendation to /knowzcode:work]
```

### Example 4: No Context Found
```
User: let's implement
Skill: I don't see a recent plan or investigation context.
       What would you like to implement? Please describe the feature or goal.
User: Add dark mode toggle to the settings page
[Passes goal to /knowzcode:work "Add dark mode toggle to the settings page"]
```

### Example 5: With In-Message Context
```
User: go ahead and build the payment integration
Skill: Starting KnowzCode workflow...
[Extracts "build the payment integration" as goal]
[Invokes /knowzcode:work "Build the payment integration"]
```

## Option Number Parsing

When user says "do option N" or "implement option N":

1. Read most recent investigation file
2. Search for pattern: `Option {N}:` or `**Option {N}**` or `{N})` or `{N}.`
3. Extract the description following that marker
4. Pass to /knowzcode:work with full option description

Example investigation content:
```markdown
## Recommendations

**Option 1**: Add validation middleware (Low effort, High impact)
**Option 2**: Refactor to use centralized error handling (Medium effort, High impact)
**Option 3**: Full error architecture overhaul (High effort, Very high impact)
```

User says: "do option 2"
Extracted: "Refactor to use centralized error handling"

## Integration with /knowzcode:work

This skill prepares context for /knowzcode:work, which will then:
1. Apply Step 4.5 spec detection to check for existing comprehensive specs
2. Offer optimization paths (Quick/Validation/Full workflow)
3. Load investigation context to pre-populate Phase 1A if applicable

## Logging

Log skill activation in `knowzcode/knowzcode_log.md`:

```markdown
---
**Type:** SkillActivation
**Timestamp:** [Generated Timestamp]
**Skill:** start-work
**Trigger:** User said "{user_message}"
**Context Source:** {plan|investigation|workgroup|user_input|none}
**Goal Extracted:** "{goal or context summary}"
**Action:** Invoked /knowzcode:work
**Logged By:** AI-Agent
---
```

## Related Skills

- `/knowzcode:work` — The workflow this skill invokes
- `/knowzcode:explore` — Research before implementing
- `/knowzcode:continue` — Resume an active WorkGroup instead

## Skill Configuration

**Priority**: High (should check before generic "okay, let's do it" responses)
**Auto-invoke**: Yes (when pattern matches and context requirements met)
**Requires confirmation**: No (redirects to command which has its own approval gates)
**Safe operation**: Yes (just extracts context and invokes structured command)

