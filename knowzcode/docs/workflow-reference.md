# KnowzCode Workflow Reference

> **Note**: This document describes the KnowzCode orchestration workflow. The orchestration logic is embedded directly in commands (`/knowzcode:work`, `/knowzcode:explore`) rather than implemented as a spawnable agent. This file serves as **reference documentation** for the workflow phases and patterns.

---

## Orchestration Model

### Why Commands ARE the Orchestrator

Claude Code filters out agents that have the `Task` tool to prevent recursive agent spawning. Since effective orchestration requires spawning phase agents, the orchestration logic must live in the **main conversation context** (via commands) rather than in a spawnable agent.

**Architecture:**
```
Main Conversation (Command)    <- Persistent context, acts as orchestrator
├── Load context ONCE
├── SPAWN analyst               -> Impact analysis in isolated context
├── Receive results, update state
├── SPAWN architect              -> Spec drafting in isolated context
├── Receive results, update state
└── ... continue through phases
```

**Key Benefits:**
- Context loaded once, maintained throughout
- Phase agents work in focused, isolated contexts
- No redundant context loading between phases
- Quality gates enforced by persistent orchestrator

---

## Parallel Execution Philosophy

### MANDATORY DEFAULT: Spawn Agents in Parallel

**PARALLEL is the DEFAULT. SEQUENTIAL is the EXCEPTION.**

When spawning multiple agents or performing multiple independent operations, you MUST default to parallel execution. Sequential execution is ONLY permitted when there is an explicit data dependency between operations.

**Core Rules:**

1. **ALWAYS parallelize** when operations have no data dependencies
2. **NEVER serialize** independent agent spawns "for safety" or "simplicity"
3. **Question every sequential call** - if it could be parallel, make it parallel
4. **Issue ALL Task tool calls in a SINGLE response** when spawning multiple agents

### When to Parallelize (ALWAYS unless dependency exists)

| Scenario | Execution | Rationale |
|----------|-----------|-----------|
| Phase 1A discovery agents | **PARALLEL** | All read-only analysis, no conflicts |
| Multiple NodeIDs need spec drafting | **PARALLEL** | Each spec is independent |
| Multiple audit types | **PARALLEL** | Audits are read-only, no conflicts |
| Reading multiple context files | **PARALLEL** | File reads are independent |
| Post-implementation verification checks | **PARALLEL** | Independent read-only checks |

### When Sequential is REQUIRED (Dependency-Gated Only)

Sequential execution is permitted ONLY when:

1. **Output of A is input to B**: The result from agent A is required input for agent B
2. **User approval gate**: User must approve before next phase begins
3. **State mutation dependency**: Agent B reads state that agent A writes

**Examples of REQUIRED Sequential:**
- Phase 1A -> Phase 1B (specs need approved Change Set)
- Phase 1B -> Phase 2A (implementation needs approved specs)
- Phase 2A -> Phase 2B (audit needs completed implementation)

### Parallel Spawning Patterns

#### Pattern 1: Phase 1A - Parallel Discovery

When starting impact analysis, spawn discovery agents simultaneously:

```
# CORRECT - Parallel (DEFAULT behavior)
In a SINGLE response, issue multiple Task tool calls:
  Task #1: SPAWN analyst (impact analysis)
  Task #2: SPAWN reviewer (security assessment, if relevant)
Wait for ALL results
Merge findings into unified Change Set proposal
```

#### Pattern 2: Phase 1B - Multi-NodeID Specification

When drafting specs for a Change Set with multiple NodeIDs:

```
# CORRECT - Batch parallel
In a SINGLE response, issue multiple Task tool calls:
  Task #1: SPAWN architect for NodeID_A
  Task #2: SPAWN architect for NodeID_B
  Task #3: SPAWN architect for NodeID_C
Wait for ALL results
Present all specs for batch approval
```

#### Pattern 3: Phase 2B - Parallel Audit

After implementation, run comprehensive verification:

```
# CORRECT - Parallel verification
In a SINGLE response:
  Task #1: SPAWN reviewer (ARC criteria + security + integration check)
Wait for results
Present consolidated audit gate
```

#### Pattern 4: Comprehensive Audit Command

When running `/knowzcode:audit` without arguments:

```
# CORRECT - Spawn reviewer with comprehensive scope
SPAWN reviewer (spec quality + architecture + security + integration)
Wait for results
Present unified audit report
```

### Error Handling in Parallel Execution

If one parallel agent fails while others succeed:
1. Continue with results from successful agents
2. Report partial failure to user
3. Offer to re-spawn ONLY the failed agent
4. Do NOT restart all parallel agents

---

## The Complete Workflow Loop

```
START LOOP (for WorkGroupID)
  |-- Step 1: Initialize WorkGroup
  |-- Step 2: Phase 1A - Impact Analysis
  |    |-- Delegate to analyst
  |    |-- PAUSE for user approval
  |    \-- If rejected: restart Step 2
  |-- Step 3: Phase 1B - Specification
  |    |-- Delegate to architect
  |    |-- PAUSE for user approval
  |    |-- If rejected: return to Step 3
  |    \-- Optional: Run spec verification checkpoint for large Change Sets
  |-- Step 4: Pre-Implementation Commit
  |-- Step 5: Phase 2A - Implementation
  |    \-- Delegate to builder
  |-- Step 6A: Initial Verification (Inner Loop)
  |    |-- Build, test, verify
  |    |-- If FAILS: return to Step 5 (Implementation)
  |    |-- Repeat until tests pass
  |    \-- Report "implementation complete"
  |-- Step 6B: Completeness Audit
  |    |-- Delegate to reviewer (READ-ONLY audit)
  |    |-- Calculate completion percentage
  |    |-- PAUSE for user decision:
  |    |    |-- If <100%: return to Step 5
  |    |    |-- If acceptable: proceed to Step 7
  |    |    \-- Or modify specs/cancel
  |    \-- Quality gate enforced
  |-- Step 7-11: Atomic Finalization Loop
  |    |-- Delegate to closer
  |    |-- Finalize specs to "as-built"
  |    |-- Update architecture
  |    |-- Log ARC-Completion
  |    |-- Update tracker to [VERIFIED]
  |    |-- Schedule tech debt
  |    \-- Final commit
  \-- COMPLETE: Report and await next goal
```

---

## Phase Agent Delegation Patterns

### Phase 1A - Impact Analysis
```
Task(analyst):
  Perform Loop 1A impact analysis.

  Context:
  - WorkGroupID: {wgid}
  - Primary Goal: {goal}
  - Phase: 1A - Change Set Identification

  Instructions:
  1. Load knowzcode_loop.md for Step 1 requirements
  2. Identify complete Change Set (primary + all dependencies)
  3. Mark [NEEDS_SPEC] dependencies
  4. Create workgroup file with KnowzCode: prefixed discovery tasks
  5. Present Change Set for approval

  Return: Change Set proposal with NodeIDs and risk assessment
```

**PAUSE POINT**: Wait for user approval. If rejected, repeat Phase 1A with feedback.

### Phase 1B - Specification
```
Task(architect):
  Draft specifications for all Change Set nodes.

  Context:
  - WorkGroupID: {wgid}
  - Phase: 1B - Specification
  - Change Set: {list of NodeIDs}

  Instructions:
  1. Load knowzcode_loop.md Step 3 template
  2. For EACH NodeID in Change Set, draft spec with:
     - All required sections
     - ARC verification criteria
     - Technical debt notes (mirror in workgroup with KnowzCode: prefix)
  3. Present specs for approval

  Return: Complete spec set ready for review
```

**PAUSE POINT**: Wait for user approval. If rejected, revise specs with feedback.

### Phase 2A - Implementation (With Inner Verification Loop)
```
Task(builder):
  Implement the Change Set using strict TDD.

  Context:
  - WorkGroupID: {wgid}
  - Phase: 2A - Implementation with verification cycle
  - Approved Specs: All NodeIDs have approved specs

  Instructions:
  1. Load knowzcode_loop.md Steps 5-6A
  2. Implement ALL nodes in Change Set
  3. INNER LOOP: After implementation, verify:
     - Build passes
     - Tests pass
     - Static analysis clean
     - ARC criteria met
  4. If ANY verification fails:
     - Fix the issue
     - RESTART verification from beginning
     - Repeat until all checks pass
  5. Report "implementation complete" when verification cycle succeeds

  CRITICAL: Do NOT claim complete until Step 6A verification loop succeeds
  Return: Implementation status and verification results
```

### Phase 2B - Completeness Audit (READ-ONLY)
```
Task(reviewer):
  Perform independent completeness audit (READ-ONLY).

  Context:
  - WorkGroupID: {wgid}
  - Phase: 2B - Implementation Audit
  - Status: Implementation claimed complete from Phase 2A

  Instructions:
  1. Load knowzcode_loop.md Step 6B requirements
  2. READ-ONLY audit: Compare implementation vs specifications
  3. For EACH NodeID in Change Set:
     - Check if specified functionality exists
     - Identify gaps, orphan code, deviations
  4. Calculate objective completion percentage
  5. Assess risk of proceeding

  Return: Audit report with completion %, gaps, and recommendation
```

**PAUSE POINT**: Present audit results and wait for user decision.

### Phase 3 - Atomic Finalization
```
Task(closer):
  Execute atomic finalization for verified WorkGroup.

  Context:
  - WorkGroupID: {wgid}
  - Phase: 3 - Finalization (Steps 7-11)
  - Status: Implementation verified and approved

  Instructions:
  1. Load knowzcode_loop.md Steps 7-11
  2. Execute atomic finalization loop:
     Step 7: Finalize EACH spec to "as-built" state
     Step 8: Check and update architecture
     Step 9: Log comprehensive ARC-Completion entry
     Step 10: Update tracker to [VERIFIED], schedule tech debt
     Step 11: Create final commit
  3. Report completion with any REFACTOR_ tasks created

  Return: Finalization complete, WorkGroup closed
```

---

## Critical Rules

### 1. State Persistence
- ALWAYS read `knowzcode/workgroups/{WorkGroupID}.md` at workflow start
- Track current phase in workgroup file
- Record approval decisions
- Count iteration attempts

### 2. Quality Verification Cycles
- **Step 6A Inner Loop**: Repeat Step 5 -> Step 6A until tests pass
- **Step 6B Gate**: If audit fails, return to Step 5 with gap report
- **Never skip verification**: Quality gates are mandatory

### 3. User Approval Gates
**MUST PAUSE and wait for explicit approval at:**
- After Phase 1A (Change Set approval)
- After Phase 1B (Spec approval)
- After Phase 2B (Completeness audit decision)
- Any critical unresolvable issue

### 4. KnowzCode: Prefix Enforcement
**EVERY todo in workgroup file MUST start with `KnowzCode:`**
- Format: `- KnowzCode: Task description`
- Verify this in each sub-agent delegation
- Check when reading workgroup file

### 5. File Update Protocol
At EVERY phase transition:
1. Update `knowzcode/knowzcode_tracker.md` (status changes)
2. Update `knowzcode/knowzcode_log.md` (event logging)
3. Update `knowzcode/workgroups/{WorkGroupID}.md` (phase progress, todos)

Use Read -> Edit -> Verify pattern for all file updates.

---

## Summary

The KnowzCode workflow is orchestrated by **commands** (not a spawnable agent) that:
- Load context once at start
- SPAWN phase agents for heavy isolated work
- Receive results and update state
- Enforce quality gates with user approval
- Maintain persistent context throughout

**Agent Roster:**
| Agent | Phase | Role |
|-------|-------|------|
| `analyst` | 1A | Impact analysis, Change Set proposals |
| `architect` | 1B | Specification drafting, design review |
| `builder` | 2A | TDD implementation, verification loops |
| `reviewer` | 2B | Quality audit, security review |
| `closer` | 3 | Finalization, learning capture |
| `knowledge-liaison` | 0 | Context & vault coordination |
| `microfix-specialist` | utility | Quick targeted fixes |
| `knowledge-migrator` | utility | Knowledge import/migration |
| `update-coordinator` | utility | Coordinated updates |

---

## Agent Teams (Experimental)

When the environment variable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set, commands use **teammate spawning** instead of `Task()` subagent calls. This gives you:

- A **team lead** that coordinates workflow and delegates to specialized teammates
- **Shared task lists** with dependencies between phases
- **Mailbox messaging** for inter-agent coordination (e.g., reviewer sending gap details directly to builder)

The same phases, quality gates, and approval points apply regardless of execution model. Agent Teams is the richer experience; subagent delegation is the reliable fallback.

**Enabling Agent Teams:**
- `/knowzcode:init` offers to enable it during project setup
- `npx knowzcode install --agent-teams` enables it via the CLI installer
- Or manually set it in `.claude/settings.local.json`:
  ```json
  { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }
  ```

For full details on team conventions and communication patterns, see `knowzcode/claude_code_execution.md`.
