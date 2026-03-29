# KnowzCode - Development Methodology & Operational Protocol

**Target Audience:** Any AI coding assistant (Claude Code, Codex, Gemini, Cursor, Copilot, etc.)
**Purpose:** This is your primary operational guide for structured, test-driven development using KnowzCode. Follow these phases precisely when working on any feature or change.

## 1. Core Principles

* **Change Set-Driven Development**: Work is performed on a "Change Set" — a group of NodeIDs (new capabilities) and affected files. This ensures system-wide consistency.
* **Spec-Driven Development**: `knowzcode/specs/[NodeID].md` files define what to build. They are drafted, approved, implemented against, then finalized to "as-built" state.
* **Mandatory TDD**: Every feature must follow Red-Green-Refactor. No production code without a failing test first.
* **Quality Gates**: You MUST pause at defined checkpoints for user approval. Never skip phases.
* **Integrated Version Control**: Strategic commits mark phase transitions.
* **Proactive Debt Management**: Technical debt is formally tracked, not ignored.

## 2. Core Files Reference

* **`knowzcode/knowzcode_project.md`**: Read-only project context.
* **`knowzcode/knowzcode_architecture.md`**: Architecture docs. Update for simple consistency changes.
* **`knowzcode/knowzcode_tracker.md`**: Track NodeID statuses and WorkGroup assignments.
* **`knowzcode/knowzcode_log.md`**: Prepend log entries. Read reference quality criteria.
* **`knowzcode/specs/[NodeID].md`**: Create, read, and finalize specifications.
* **`knowzcode/workgroups/<WorkGroupID>.md`**: Session todo list. Every entry must begin with `KnowzCode:`.
* **This document (`knowzcode/knowzcode_loop.md`)**: Your primary workflow reference.

## 3. The Main Operational Loop

### 3.1 Phase 1A: Impact Analysis

Receive the goal from the user. Identify the **Change Set** — all components affected by this change.

**NodeID Granularity**: Create NodeIDs only for NEW capabilities being built, not for every file touched. Files that integrate a new capability are "affected files" — they don't need separate NodeIDs or specs.

**Change Set Format:**
```markdown
## Change Set for WorkGroup [ID]

### New Capabilities (NodeIDs)
| NodeID | Description |
|--------|-------------|
| LIB_DateTimeFormat | Timezone formatting utility |

### Affected Files (no NodeIDs needed)
- JobsPage.tsx - integrate formatDateTime
- IntakeJobsPage.tsx - integrate formatDateTime

**Specs Required**: 1
```

**NodeID Naming Convention:**
NodeIDs must be **domain concepts**, not tasks.

1. **Domain-Area NodeIDs** (default): PascalCase covering cohesive areas
   - Examples: `Authentication`, `FileManagement`, `Checkout`, `UserProfile`
   - Covers multiple components: `Authentication` = login form + auth endpoint + token service
   - Sub-areas when a domain grows large: `Authentication_OAuth`, `Payments_Stripe`

2. **Utility NodeIDs** (exception): For genuinely isolated utilities
   - `LIB_` prefix: `LIB_DateFormat`, `LIB_Validation`
   - `CONFIG_` prefix: `CONFIG_FeatureFlags`

3. **Use Case NodeIDs** (optional): `UC_` for cross-domain workflows
   - Only when genuinely spanning multiple unrelated domains

**Never use task-oriented names**: `FIX-001`, `TASK-X`, `FEATURE-Y`. Tasks belong in WorkGroup files.

**Consolidation Rule:** Before creating a new NodeID, check existing specs. If >50% domain overlap exists with an existing spec, UPDATE that spec instead. Target <20 specs per project.

**Historical Context:** Before proposing the Change Set, scan `knowzcode/workgroups/` for completed WorkGroups that touched similar components. Reference relevant context in your proposal.

#### Quality Gate: Change Set Approval
Present the proposed Change Set to the user. **PAUSE and await user approval.** Do NOT proceed to Phase 1B until the user explicitly approves. In autonomous mode, auto-approve and proceed immediately (see Section 5).

Upon approval, generate a unique WorkGroupID and update `knowzcode_tracker.md` for all nodes to `[WIP]`.

**WorkGroupID Format**: `kc-{type}-{slug}-YYYYMMDD-HHMMSS`
- Valid types: `feat`, `fix`, `refactor`, `issue`
- Slug: 2-4 word kebab-case descriptor from the goal
- Example: `kc-feat-user-auth-jwt-20250115-143022`

---

### 3.2 Phase 1B: Specification

Draft or refine `knowzcode/specs/[NodeID].md` for all nodes in the Change Set.

**Spec Template (4-section format):**
```markdown
# [NodeID]: [Human-Readable Name]

**Updated:** [timestamp]
**Status:** Draft | Approved | As-Built
**KnowledgeId:** [optional — set automatically when synced to vault]

## Rules & Decisions
Key architectural decisions, business rules, constraints, and purpose.
- Decision: chose X over Y because Z
- Rule: must always validate before persisting

## Interfaces
Public contracts: inputs, outputs, API signatures, dependencies, events.
- POST /api/users -> { id, email }
- Depends on: AuthService for token validation

## Verification Criteria
Testable assertions for implementation and auditing.
- VERIFY: when valid credentials, returns JWT token
- VERIFY: when email exists, returns 409

## Debt & Gaps
Known limitations and future work.
- TODO: add rate limiting
```

**Minimum valid spec:** 1+ Rules item, 1+ Interface item, 2+ `VERIFY:` statements.

> **KnowledgeId** is optional and managed automatically by vault sync. Do not set manually. When present, vault captures update the existing cloud item instead of creating duplicates. If the cloud item is deleted, the field is automatically removed.

**Backward compatibility:** Old numbered-section specs remain valid until naturally touched. When finalizing, rewrite in the new format.

#### Quality Gate: Spec Approval
Present drafted specs to the user. **PAUSE and await user approval.** Log "SpecApproved" events. In autonomous mode, auto-approve and proceed immediately (see Section 5).

**Pre-Implementation Commit:** After specs are approved, commit `knowzcode/` to create a checkpoint before implementation begins.

---

### 3.3 Phase 2A: Implementation (TDD MANDATORY)

For each NodeID in the approved Change Set:

```
FOR each feature/criterion in the spec:

    # RED Phase
    1. Write a failing test that defines expected behavior
    2. Run test → Confirm it FAILS
       - If test passes without code, the test is wrong — fix it

    # GREEN Phase
    3. Write MINIMAL code to make the test pass
    4. Run test → Confirm it PASSES
       - If fails, fix code (not test)

    # REFACTOR Phase
    5. Review code for improvements
    6. If refactoring: make change, run ALL tests, revert if any fail
```

**Verification Loop (must pass before claiming complete):**
```
WHILE verification not complete:
    1. Run all tests → If FAIL: fix and restart
    2. Run static analysis → If issues: fix and restart
    3. Run build → If FAIL: fix and restart
    4. Verify all VERIFY: criteria from specs → If unmet: implement and restart
    5. All checks pass → Report complete
```

**Maximum iterations**: 10. If exceeded, pause and report blocker.

#### Quality Gate: Implementation Complete
Report implementation results including test counts, verification iterations, and criteria status. **PAUSE — the user or an auditor will verify completeness.**

---

### 3.4 Phase 2B: Completeness Audit

An independent, READ-ONLY audit verifying what percentage of specifications were actually implemented.

**Process:**
- Compare implementation against specifications for all NodeIDs
- Calculate objective completion percentage
- Report gaps, orphan code, and risk assessment
- Do NOT modify any code during this phase

**Outcomes** (user decides):
- Return to Phase 2A to complete missing requirements
- Accept current implementation and proceed to finalization
- Modify specs to match implementation
- Cancel the WorkGroup

#### Quality Gate: Audit Approval
Present audit results to the user. **PAUSE for decision.** Only proceed to Phase 3 when the user approves. In autonomous mode, auto-approve and proceed immediately unless safety exceptions apply (see Section 5).

---

### 3.5 Phase 3: Atomic Finalization

Once implementation is verified and approved, execute finalization:

**Step 7: Finalize Specifications**
Update each `knowzcode/specs/[NodeID].md` to match the verified "as-built" implementation. Always use the 4-section format.

**Step 8: Architecture Check**
Review `knowzcode/knowzcode_architecture.md` against the Change Set.
- Simple discrepancies: fix directly and note in log
- Complex discrepancies: document for user review

**Step 9: Log Entry**
Prepend a comprehensive `ARC-Completion` entry to `knowzcode/knowzcode_log.md`:
```markdown
---
**Type:** ARC-Completion
**Timestamp:** [timestamp]
**WorkGroupID:** [ID]
**NodeID(s):** [list all]
**Logged By:** AI-Agent
**Details:**
Successfully implemented and verified the Change Set for [goal].
- **Verification Summary:** [key checks]
- **Architectural Learnings:** [discoveries]
- **Unforeseen Ripple Effects:** [affected nodes outside this WorkGroup, or None]
- **Specification Finalization:** All specs updated to "as-built" state.
- **Architecture Check Outcome:** [outcome]
---
```

**Step 10: Update Tracker & Schedule Debt**
- Change each NodeID status from `[WIP]` to `[VERIFIED]`, clear WorkGroupID
- If significant tech debt documented, create `REFACTOR_[NodeID]` tasks
- Check if changes impact `knowzcode_project.md` (new features, stack changes)

**Step 11: Final Commit**
Stage and commit all changes (source code + knowzcode files).

**Step 12: Report & Close**
Report completion, mention any `REFACTOR_` tasks created. WorkGroup is closed.

---

## 4. Micro-Fix Protocol

For single-file, no-ripple-effect changes (results in a single `fix:` commit):

1. Implement the small change
2. Quick focused verification
3. Log a `MicroFix` entry:
```markdown
---
**Type:** MicroFix
**Timestamp:** [timestamp]
**NodeID(s)/File:** [target]
**Logged By:** AI-Agent
**Details:**
- **User Request:** [description]
- **Action Taken:** [change made]
- **Verification:** [method/outcome]
---
```
4. Commit with `fix: [description]`

---

## 5. When to Pause (Quality Gates)

You **MUST** pause and await explicit user approval at:
* After proposing a Change Set (Phase 1A)
* After presenting specs for approval (Phase 1B)
* After reporting implementation complete (Phase 2A) — awaiting audit
* After audit results — awaiting decision on gaps (Phase 2B)
* If you encounter a critical, unresolvable issue
* If an architecture discrepancy is too complex to fix autonomously

### Autonomous Mode Override

When the user conveys intent for autonomous operation — through natural language (e.g., "approve all", "preapprove", "autonomous mode", "just run through", "I trust your judgement") or the `--autonomous` flag — quality gates above are still **presented** for transparency but **auto-approved** without waiting for user input. The workflow runs from start to finalization uninterrupted.

The lead should interpret the **spirit** of the user's instruction, not just exact keyword matches. If the user clearly wants the workflow to proceed without stopping, that constitutes autonomous mode activation.

**Safety exceptions** — ALWAYS pause even in autonomous mode:
* Critical, unresolvable blockers (Section 11)
* Security vulnerabilities rated HIGH or CRITICAL
* >3 failures on the same phase
* Architecture discrepancies too complex to fix autonomously
* >3 gap-fix iterations per partition without resolution

Autonomous mode is per-WorkGroup and does not carry over.

---

## 6. MCP Integration (Optional but Recommended)

If KnowzCode MCP server is configured (`knowzcode/mcp_config.md` or `knowzcode/knowzcode_vaults.md`), agents can leverage vault queries to enhance every phase.

**Cross-platform config**: MCP configuration is stored in `knowzcode/mcp_config.md` and
`knowzcode/knowzcode_vaults.md` — both platform-agnostic. If MCP was configured on one
platform, other platforms detect and reuse the existing config. Set `KNOWZ_API_KEY` as an
environment variable to enable automatic MCP authentication on any platform.

**Before using MCP, read `knowzcode/knowzcode_vaults.md` to resolve vault IDs by type.** Use the vault's description to confirm the query is appropriate for that vault. If a single vault covers all types, use it for everything. Never hardcode vault names — always resolve from config.

### Vault Types

| Type | Purpose | Example Queries |
|------|---------|-----------------|
| **code** | Reference implementations, code snippets, API patterns | `"authentication middleware pattern"`, `"error handling in {framework}"` |
| **ecosystem** | Business rules, conventions, decisions, integrations, platform knowledge | `"checkout flow rules"`, `"pricing constraints"`, `"Stripe webhook setup"` |
| **finalizations** | WorkGroup completion summaries, outcome records | `"past decisions about {component}"`, `"similar WorkGroups"` |

A project may configure one vault covering all types (common for small teams) or multiple specialized vaults. `knowz:writer` (or direct MCP calls) writes to vaults; `knowz:reader` has read-only access. The writer is dispatched at quality gates to route writes to the correct vault based on content type.

### Phase-Specific Usage

| Phase | MCP Tool | Purpose |
|-------|----------|---------|
| **1A (Analysis)** | `search_knowledge({vault matching "ecosystem" type}, "past decisions about {domain}")` | Find prior decisions affecting components |
| **1B (Spec)** | `ask_question({vault matching "ecosystem" type}, "conventions for {component_type}?")` | Check team conventions before drafting |
| **2A (Build)** | `search_knowledge({vault matching "code" type}, "{similar_feature} implementation")` | Find reference implementations |
| **2B (Audit)** | `ask_question({vault matching "ecosystem" type}, "standards for {domain}", researchMode=true)` | Comprehensive standards check |
| **3 (Close)** | Dispatch `knowz:writer` (or `create_knowledge` directly if no writer) | Capture patterns, decisions, workarounds |

### Knowz Vault Agents (Multi-Agent Platforms)

On platforms with multi-agent orchestration (e.g., Claude Code Agent Teams), **`knowz:reader`** has read-only access to MCP vaults, and **`knowz:writer`** has full read/write access to MCP vaults. Both have read/write access to local knowzcode files:

- **`knowz:reader`** is dispatched at Stage 0 — queries vaults for business context, conventions, and past decisions. Broadcasts findings to inform analyst and architect work.
- **`knowz:writer`** is dispatched at each quality gate — receives a self-contained prompt with the phase identifier and WorkGroup ID, reads the WorkGroup file, extracts learnings, and writes to the appropriate vault. Handles deduplication, formatting, and routing to the correct vault by type.
- Writers are short-lived (dispatched per gate, not persistent); readers are dispatched at Stage 0 for upfront context gathering.

On platforms without multi-agent orchestration, the closer handles vault writes directly (see Section 7).

### Enterprise: Team Standards

At workflow start, if an enterprise-type vault is configured (read `knowzcode/knowzcode_vaults.md` to find vault matching type "enterprise", then check `knowzcode/enterprise/compliance_manifest.md` for `mcp_compliance_enabled: true`):
- Pull team-wide standards and merge into quality gate criteria
- Push audit results to the resolved enterprise vault after Phase 2B
- Push completion records to the resolved enterprise vault after Phase 3

### Graceful Degradation

All phases work without MCP. MCP enhances analysis depth and organizational learning but never blocks workflow progression. When MCP is unavailable, agents use standard file search tools (grep, glob) as fallback.

---

## 7. Learning Capture (Optional)

> **Vault content must be detailed and self-contained.** Vault entries are retrieved via semantic search — not read directly like local files. Include full reasoning, specific technology names, code examples, and file paths. See `knowzcode/knowzcode_vaults.md` Content Detail Principle.

During finalization, scan the WorkGroup for insight-worthy patterns:

| Signal Type | Examples |
|-------------|----------|
| Pattern | "created utility for", "reusable", "abstracted" |
| Decision | "chose X over Y", "opted for", "trade-off" |
| Workaround | "workaround", "limitation", "can't do X so" |
| Performance | "optimized", "reduced from X to Y", "cache" |
| Security | "vulnerability", "sanitize", "authentication fix" |
| Convention | "established convention", "team standard", "naming pattern", "agreed to always" |
| Integration | "API integration", "upstream API changed", "service dependency", "webhook" |
| Scope | "included because", "excluded because", "out of scope", "deferred to" |

### Auto-Capture Triggers

Learning candidates are detected at each quality gate. **The lead/outer orchestrator is responsible for triggering capture** — dispatching `knowz:writer` on multi-agent platforms, or ensuring the closer handles it via Direct Write Fallback on single-agent/sequential platforms.

**Multi-agent platforms (knowledge-liaison dispatches):**

The lead DMs the knowledge-liaison at each quality gate. The knowledge-liaison dispatches `knowz:writer` with a self-contained prompt:
- After Phase 1A approval: DM knowledge-liaison: `"Capture Phase 1A: {wgid}. Your task: #{task-id}"`
- After Phase 2A completion: DM knowledge-liaison: `"Capture Phase 2A: {wgid}. Your task: #{task-id}"`
- After Phase 2B audit: DM knowledge-liaison: `"Capture Phase 2B: {wgid}. Your task: #{task-id}"`
- After Phase 3 finalization: Closer DMs knowledge-liaison: `"Capture Phase 3: {wgid}. Your task: #{task-id}"`

The knowledge-liaison owns extraction, vault routing, and writer dispatch. No other agent dispatches `knowz:writer` or calls `create_knowledge` directly.

**Ad-hoc captures (any agent, any time):**

Any agent can DM the knowledge-liaison directly:
- `"Log: {description}"` — explicit capture, knowledge-liaison dispatches writer (writer must write it)
- `"Consider: {description}"` — soft capture, knowledge-liaison dispatches writer (writer evaluates whether to log)

The knowledge-liaison handles routing and dispatch. If MCP is unavailable, captures are queued to `knowzcode/pending_captures.md` for later sync.

**Single-agent / no writer (direct MCP writes):**

If MCP is available but no `knowz:writer`, resolve vault IDs from `knowzcode/knowzcode_vaults.md` before writing:

- After Phase 1A: `create_knowledge({ecosystem_vault}, title="Scope: {descriptive goal summary}", content="[CONTEXT] {problem description, what prompted this work, constraints}\n[INSIGHT] {scope decisions — what's included/excluded and why}\n[RATIONALE] {risk assessment with full reasoning, affected files, mitigation}\n[TAGS] scope, {domain}", tags=["scope", "{domain}"])`
- After Phase 2A: Capture implementation patterns and workarounds discovered during TDD cycles — include specific file paths, code examples, and the problem each pattern solves
- After Phase 2B: `create_knowledge({ecosystem_vault}, title="Audit: {wgid} - {score}% — {key finding summary}", content="[CONTEXT] {what was audited, scope of the review}\n[INSIGHT] {specific gaps with file paths and line references, security findings with severity reasoning}\n[RATIONALE] {gap resolution decisions — what was deferred vs fixed and why}\n[TAGS] audit, {domain}", tags=["audit", "{domain}"])`
- After Phase 2B (enterprise): If enterprise vault configured and compliance enabled, push audit results to enterprise vault
- After Phase 3: Capture architectural learnings and consolidation decisions (handled by closer agent)

### Capture Protocol

**When knowz:writer is available (multi-agent platforms):**
1. Dispatch `knowz:writer` with self-contained prompt including phase identifier and WorkGroup ID
2. The writer handles: vault ID resolution, duplicate checking, user approval prompting, and writing
3. No other agent should call `create_knowledge` directly

**When no knowz:writer (single-agent / sequential):**
1. Read `knowzcode/knowzcode_vaults.md` to resolve vault IDs by type
2. Detect learning candidates from WorkGroup file content
3. Check for duplicates via `search_knowledge` — skip if substantially similar exists
4. Prompt user for approval before saving
5. Only write if the targeted vault is configured — skip gracefully if not
6. Create learning via `create_knowledge` with appropriate title prefix

### Audit Trail (Enterprise)

After Phase 3:
1. Read `knowzcode/knowzcode_vaults.md` to find vault matching type "enterprise"
2. Only push if an enterprise vault is configured
- Push WorkGroup completion record with goal, NodeIDs, audit score, and decisions
- Push architecture drift findings if any detected during finalization

If MCP is not available, skip learning capture and audit trail — all other phases work normally.

---

## 8. Multi-Agent Execution (Platform-Specific)

Phases can be executed by a single AI sequentially or by specialized agents coordinated by a lead. Quality gates and phase sequence remain the same regardless of execution model.

### Agent-to-Phase Mapping

| Phase | Specialist Agent | Expertise |
|-------|-----------------|-----------|
| 1A | analyst | Impact analysis, Change Set proposals |
| 1B | architect | Specification drafting, architecture review |
| 2A | builder | TDD implementation, verification loops |
| 2B | reviewer | Quality audit, security review |
| 3 | closer | Finalization, learning capture |

### Execution Rules

When using multi-agent execution:
- Each phase maps to a specialist agent
- Phase dependencies enforce quality gates (1A must complete before 1B, etc.)
- User approves transitions between phases at quality gates
- Agents can communicate about gaps and blockers
- The lead agent coordinates but does not modify code directly
- Agents read context files independently — do not duplicate context across agents

### Single-Agent Execution

When a single AI handles all phases sequentially:
- Follow the same phase sequence and quality gates
- Pause at each gate for user approval
- All quality standards apply identically

### Parallel Execution (Multi-Agent Platforms)

On platforms supporting concurrent agents (Claude Code Agent Teams, future multi-agent runtimes):

#### Parallelism Boundaries
- **Between phases**: Phase 1A must produce Change Set before 1B drafts specs (scope must be approved first)
- **Within phases**: Independent NodeIDs can be implemented/audited in parallel
- **Across phases**: Incremental review can start on completed components while other components are still being implemented
- **Agent persistence**: Agents can stay alive across sub-phases to avoid cold-start overhead (e.g., builder persists through audit gap loop)

#### Dependency Map
The analyst produces a dependency map alongside the Change Set, identifying:
- Which NodeIDs share affected files (must be implemented sequentially or by same agent)
- Which NodeIDs are independent (can be implemented in parallel)
- Sequential dependencies (NodeID-B requires NodeID-A's output)

#### Incremental Review
The reviewer can audit completed NodeIDs before all implementation finishes. Gap findings are routed back to the implementer for targeted fixes, then re-audited. Agents persist through this gap loop — no respawning.

#### Context Gathering
Dedicated context-gathering runs in parallel with core analysis:
- Knowledge liaison: reads local project history, specs, workgroups directly
- Knowz readers: query knowledge management vaults for business context (one per vault, dispatched by liaison)
Both broadcast findings to inform analyst and architect work.

### Sequential Execution Protocol (for platforms without orchestration)

For platforms like Cursor, Copilot, or Windsurf where there is no agent orchestration.

**Copilot users:** Instead of manually reading phase prompts, use `#prompt:knowzcode-*` prompt files in VS Code Copilot Chat (e.g., `#prompt:knowzcode-work`, `#prompt:knowzcode-specify`). These prompt files encode the sequential protocol below with `#file:` references for context. See `knowzcode/copilot_execution.md` for the full Copilot execution guide.

```
FOR each phase in [1A, 1B, 2A, 2B, 3]:

    1. Read the phase prompt: knowzcode/prompts/[LOOP_{phase}]__*.md
    2. Read the WorkGroup file: knowzcode/workgroups/{WorkGroupID}.md
    3. Execute the phase instructions
    4. Write output to the WorkGroup file (prefix entries with "KnowzCode:")
    5. STOP at quality gate — present results to user
    6. Wait for user approval before reading the next phase prompt
```

**Key differences from orchestrated execution:**
- The user manually triggers each phase transition
- Context is carried via WorkGroup files, not inter-agent messaging
- All phase prompts are self-contained — they read context from knowzcode/ files
- Quality gates work identically (user approval required at each gate)

**Minimal viable execution** (no platform adapter needed):
1. Copy `knowzcode/` directory to your project
2. Give your AI the Phase 1A prompt with your goal
3. When the AI pauses, review output and give the next phase prompt
4. Repeat until Phase 3 completes

See your platform's adapter file for agent configuration details.

---

## 9. Context Handoff Protocol

When phases transition (whether via agents or sequentially), the following data MUST be communicated to the next phase:

### 1A → 1B Handoff
- WorkGroupID
- Approved Change Set (NodeIDs + affected files)
- Risk assessment and classification
- Historical context from prior WorkGroups
- User-approved scope boundaries

### 1B → 2A Handoff
- WorkGroupID
- Approved specifications (file paths)
- Tracker state (all NodeIDs marked `[WIP]`)
- Compliance constraints (if enterprise enabled)
- Pre-implementation commit hash

### 2A → 2B Handoff
- WorkGroupID
- Implementation artifacts (changed files list)
- Test results (pass counts, coverage)
- Verification iteration count
- Any `[SPEC_ISSUE]` tags (see below)

### 2B → 3 Handoff
- WorkGroupID
- Audit report with completion percentage
- Gap list with severity assessment
- User decision (proceed / return to 2A / modify specs)
- Security findings summary

On platforms with multi-agent orchestration, the lead agent manages this context. On platforms without orchestration, the user carries context by referencing WorkGroup files between phases.

---

## 10. Spec Issues During Implementation

If the builder discovers a spec is incorrect or incomplete during Phase 2A:

1. **Tag the issue**: Add `[SPEC_ISSUE]` comment in the WorkGroup file with details
2. **Continue implementing**: Use best judgment for the affected criterion
3. **Report in completion**: Include spec issues in the Phase 2A completion report
4. **Phase 2B catches it**: The auditor flags spec-vs-implementation divergences
5. **User decides**: At the 2B quality gate, the user can update specs or accept the deviation

Builders MUST NOT silently deviate from specs. Every deviation must be tagged and reported.

---

## 11. Blocker Escalation Protocol

When the verification loop reaches the maximum iteration count (10 for implementation, 5 for micro-fix):

### Blocker Report Format

```markdown
## Blocker Report: {WorkGroupID}

**Phase:** 2A Implementation
**Iteration Count:** 10 (maximum reached)
**NodeID(s) Affected:** [list]

### Root Cause Analysis
- **Failing Check:** [test name / build error / lint issue]
- **Error Message:** [exact message]
- **Attempts Made:** [summary of fix attempts]

### Recommended Recovery Options
1. **Modify spec**: Relax or adjust the criterion that cannot be met
2. **Change approach**: Use a different implementation strategy
3. **Split WorkGroup**: Extract the blocked NodeID into a separate WorkGroup
4. **Accept partial**: Proceed with documented gap (debt item)
5. **Cancel**: Abandon this WorkGroup

### Files Involved
- [list of files with the issue]
```

The user MUST select a recovery option before work continues.

---

## 12. Workflow Abandonment Protocol

If a WorkGroup needs to be abandoned mid-workflow:

1. **Revert uncommitted changes**: If implementation was in progress, revert source code changes (keep knowzcode files)
2. **Update tracker**: Set all affected NodeIDs back to their pre-WorkGroup status
3. **Log abandonment**: Create a log entry with type `WorkGroup-Abandoned` including the reason
4. **Close WorkGroup file**: Mark the WorkGroup file as abandoned with reason
5. **Preserve learnings**: If any useful patterns were discovered, capture them before closing

```markdown
---
**Type:** WorkGroup-Abandoned
**Timestamp:** [timestamp]
**WorkGroupID:** [ID]
**Phase At Abandonment:** [1A/1B/2A/2B/3]
**Reason:** [user decision / blocker / scope change]
**NodeID(s) Affected:** [list with their reverted statuses]
**Learnings Preserved:** [any useful insights, or None]
---
```
