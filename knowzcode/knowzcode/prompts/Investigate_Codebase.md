# KnowzCode: Investigate Codebase

> **Automation Path:** On Claude Code, run `/knowzcode:plan "your question"` to orchestrate this automatically.

## Your Mission

You are performing a focused investigation of the codebase to answer a specific question. You will conduct 1-3 research passes (based on question relevance) to gather evidence, then synthesize findings into actionable recommendations.

**Investigation Question**: $ARGUMENTS

---

## Phase 1: Context Loading (Do Once)

Read these files ONCE at the start:
- `knowzcode/knowzcode_project.md` - project context
- `knowzcode/knowzcode_architecture.md` - architecture overview
- `knowzcode/knowzcode_tracker.md` - existing NodeIDs

---

## Phase 2: Selective Investigation Passes

Conduct ONLY investigation passes that are relevant to the question.

### Step 1: Determine Which Passes Are Needed

Analyze the question and select investigation passes based on relevance:

| Pass | When to Include | Skip When |
|------|-----------------|-----------|
| **Code Exploration** | ALWAYS (provides code evidence) | Never skip - always needed |
| **Architecture & Patterns** | Question involves patterns, design, structure, consistency, layers | Simple lookup questions, bug hunts, "where is X?" |
| **Security & Performance** | Question involves auth, security, performance, data handling, risk | Code organization questions, refactoring questions |

**Question Type -> Pass Selection Guide:**

| Question Type | Example | Passes |
|---------------|---------|--------|
| Code location | "Where is user auth handled?" | Code Exploration only |
| Implementation check | "How is error handling done?" | Code Exploration + Architecture |
| Security concern | "Is the API properly secured?" | Code Exploration + Security |
| Full assessment | "Is the auth system well designed and secure?" | All 3 passes |
| Pattern consistency | "Are we consistent in how we handle dates?" | Code Exploration + Architecture |

### Step 2: Execute Investigation Passes

On platforms with agent orchestration, run these in parallel. Otherwise, execute sequentially.

**Pass 1: Code Exploration (ALWAYS INCLUDE)**
- Find code evidence to answer the question
- Constraints: Max 10 tool calls. Focus on 5 most relevant files
- Output: Code evidence with file paths and line numbers

**Pass 2: Architecture & Pattern Analysis (IF RELEVANT)**
- Evaluate patterns and design for this question
- Constraints: Max 8 tool calls. Focus on pattern consistency
- Output: Pattern observations with examples

**Pass 3: Security & Performance (IF RELEVANT)**
- Check security/performance aspects for this question
- Constraints: Max 8 tool calls. Only check relevant OWASP categories
- Output: Risk observations with severity levels

---

## Phase 3: Synthesize Findings

**When ALL spawned agents return:**

1. Merge results into unified investigation report
2. Cross-reference findings from agents consulted
3. Identify agreements and conflicts (if multiple agents)
4. Formulate direct answer to the original question
5. Generate actionable recommendations

### Save Investigation Report

Save findings to `knowzcode/planning/investigation-{timestamp}.md`:

```markdown
# Investigation: {question summary}

**Question**: {$ARGUMENTS}
**Timestamp**: {timestamp}
**Agents Consulted**: {list agents actually spawned}

## Executive Summary

{Direct 2-3 sentence answer to the question}

## Detailed Findings

### Code Exploration (analyst)
{findings}

### Pattern Analysis (architect)
{findings}

### Security/Performance Assessment (reviewer)
{findings}

## Synthesis

**Key Findings**:
{consolidated bullet points}

**Cross-Agent Agreements**:
{where agents agree}

**Areas of Concern**:
{issues identified}

## Recommendations

| # | Action | Priority | Effort |
|---|--------|----------|--------|
| 1 | {action} | HIGH/MED/LOW | S/M/L |
| 2 | {action} | HIGH/MED/LOW | S/M/L |
| 3 | {action} | HIGH/MED/LOW | S/M/L |
```

---

## Phase 4: Present Findings

Present investigation results to user:

```markdown
## KnowzCode Investigation Complete

**Question**: {$ARGUMENTS}
**Agents Consulted**: {N} (in parallel)

### Summary

{Direct answer to the question}

### Key Findings

{3-5 bullet points summarizing discoveries}

### Recommendations

{numbered list of actionable improvements}

---

**Implementation Options:**

1. {First recommendation action}
2. {Second recommendation action}
3. {Third recommendation action}

Say "implement", "do it", or select an option (e.g., "option 1") to proceed with implementation.
Or say "that's all" if you just needed the information.
```

---

## Phase 5: Action Listening Mode

**After presenting findings, enter Action Listening Mode.**

Monitor subsequent user messages for implementation triggers:

### Implementation Triggers (Transition to Phase 1A)

Detect these patterns in user's next message:

| Pattern | Example | Action |
|---------|---------|--------|
| Imperative verbs | "implement", "fix", "build", "add", "create" | Extract goal, proceed to Phase 1A |
| Confirmation words | "do it", "go ahead", "proceed", "yes", "let's do it" | Use top recommendation |
| Option selection | "option 1", "the first one", "#2", "do number 2" | Use selected recommendation |
| "Fix it" / "Make it work" | "fix it", "make it work", "just do it" | Use top recommendation |

### When Trigger Detected:

1. Extract implementation goal from:
   - User's specific request (if provided)
   - Selected option (if option number given)
   - Top recommendation (if generic "do it")

2. Log investigation context for handoff:
   ```
   Investigation findings available at: knowzcode/planning/investigation-{timestamp}.md
   ```

3. Transition to Phase 1A:
   ```markdown
   **Transitioning to implementation...**

   Goal extracted: "{extracted goal}"
   Investigation context: Pre-loaded from investigation findings

   Proceeding to Phase 1A (Impact Analysis)...
   ```

4. Pass investigation findings to Phase 1A:
   - NodeIDs already identified -> pre-populate Change Set
   - Security concerns -> carry forward as annotations
   - Architecture observations -> carry forward as annotations
   - Skip redundant discovery -> focus Phase 1A on validation

### Non-Trigger Responses

If user message does NOT contain implementation trigger:
- "ok thanks" -> End gracefully: "Investigation complete. Start Phase 1A when ready to implement."
- "tell me more about X" -> Provide additional detail from findings
- "what about Y?" -> Follow-up investigation (run additional passes)

---

## Logging

After investigation, log to `knowzcode/knowzcode_log.md`:

```markdown
---
**Type:** Investigation
**Timestamp:** {timestamp}
**Question:** {$ARGUMENTS}
**Finding:** {one-line summary}
**Status:** {Complete | Handoff to Phase 1A}
---
```
