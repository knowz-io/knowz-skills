# Codex Execution Model

**Purpose:** Defines the execution model for OpenAI Codex users. Codex supports native delegation and context inheritance, but it does not expose Claude-style team, task-list, mailbox, or broadcast APIs. This file is the canonical Codex execution contract.

Agents on other platforms should ignore this file. See `knowzcode/platform_adapters.md` for cross-platform notes, `knowzcode/claude_code_execution.md` for Claude Code execution, and `knowzcode/copilot_execution.md` for GitHub Copilot's single-agent flow.

---

## Coordinator Model

Codex uses a **single coordinator + bounded subagents** model:

- The **coordinator** owns user communication, quality gates, shared state, approvals, and final decisions.
- **Explorer** subagents handle bounded read-only discovery, audits, and codebase research.
- **Worker** subagents handle bounded implementation tasks with explicit file ownership.
- Approved specifications, repository checkpoints, initialized KnowzCode files, and the active WorkGroup are durable project state.
- Provider threads, inherited conversations, warm workers, and caches are execution optimizations, never the recoverable source of truth.

Do **not** simulate Claude-style Agent Teams. Codex does not gain team mailboxes, peer broadcasts, or a shared task-list API through KnowzCode. The coordinator owns dependency state and integrates all child results.

---

## Semantic Codex Operations

Durable KnowzCode guidance names semantic operations rather than assuming that one Codex release exposes a permanent set of tool names:

| Operation | Meaning |
|---|---|
| `spawn` | Create a bounded worker with an explicit context policy and scope |
| `follow up` | Trigger another turn on a compatible warm worker with only the delta |
| `message` | Deliver non-triggering context or steering when the runtime supports it |
| `wait` | Observe one or more workers with bounded snapshots or cursors |
| `interrupt` | Stop active work without deleting durable project state |
| `inspect` | List workers and inspect status, lineage, and available capacity |
| `release` | Stop retaining a worker for future routing; this is a lineage decision, not an assumed runtime deletion call |

The coordinator MUST inspect the operations callable in the active runtime before routing. Current runtimes may expose shapes such as `spawn_agent`, `followup_task`, `send_message`, `wait_agent`, `interrupt_agent`, and `list_agents`; these are compatibility examples, not the portable contract. Never invent an unavailable operation or treat interrupt as deletion.

Capability fallback is deterministic:

- Missing context inheritance -> use `fresh-capsule`.
- Missing follow-up/resume -> use a fresh compatible capsule worker or run locally.
- Missing spawn or exhausted capacity -> queue, reuse a compatible worker, or run locally.
- Missing peer coordination -> keep coordination in the parent WorkGroup; do not fabricate a team.

The coordinator keeps immediate blocking work local. Delegate sidecar work only when its independent progress or context isolation is worth the additional model/tool work.

---

## Context-Affinity Routing

Every non-trivial delegated unit resolves exactly one mode and records a reason code before dispatch:

| Mode | Codex behavior |
|---|---|
| `local` | Coordinator executes directly because work is trivial, tightly coupled, blocking, or cheaper locally |
| `resume` | Follow up with a compatible warm worker or resume a provider thread when that capability exists |
| `inherit-full` | Spawn with full parent history only when the runtime explicitly supports it and compatibility, relevance, sensitivity, and budget checks pass |
| `inherit-recent` | Spawn with the bounded recent decision/failure window when supported; otherwise use a capsule |
| `fresh-capsule` | Spawn with no or minimal inherited history and a versioned context capsule |
| `coordinated-team` | Do not emulate on Codex; use the coordinator plus scoped workers and WorkGroup state |

Evaluate modes in this order: `local` -> compatible `resume` -> compatible inherited mode -> `fresh-capsule`. `coordinated-team` degrades to coordinator-managed workers because Codex has no portable equivalent here.

Use these deterministic reason codes: `LOCAL_CHEAPER`, `BLOCKING`, `RESUME_COMPATIBLE`, `HIGH_CONTEXT_AFFINITY`, `BOUNDED_RECENT_CONTEXT`, `INDEPENDENT_CAPSULE`, `SENSITIVITY_ISOLATION`, `REVIEW_INDEPENDENCE`, `TEAM_COORDINATION_REQUIRED`, and `CAPABILITY_FALLBACK`.

### Inheritance constraints

- `inherit-full` is a broad context grant. Do not use it for mixed-sensitivity conversations, narrow-access roles, independent review, or a bloated parent whose irrelevant history outweighs rediscovery savings.
- Some Codex runtimes require a full-history child to inherit the parent's model and reasoning settings. When so constrained, do not request an incompatible model/effort override. Use `inherit-recent` or `fresh-capsule` for a different or lower-cost model.
- `inherit-recent` is optional. If the runtime cannot bound inherited turns, fall back to `fresh-capsule` rather than silently inheriting everything.
- Do not claim a Claude-style prompt-cache discount for Codex. Measure observable prompt bytes, repeated reads, tool output, provider-reported usage, latency, and outcomes separately.

### Context capsule

A cold or low-context worker receives a compact `knowzcode.context-capsule/v1` record with the task/WorkGroup/phase, objective, NodeIDs, owned and read files, spec paths and assigned `VERIFY` IDs, approved decisions, checkpoint SHA, bounded failure summaries/artifact paths, risks, constraints, and next action. Use stable serialization and record its hash.

Capsules MUST NOT contain raw unbounded logs, full chat transcripts, credentials, provider session identifiers, or ambient tool output. Send paths and hashes instead of pasting source or framework documents.

---

## Lineage Compatibility and Warm Leases

Record reusable worker lineage using `knowzcode.agent-lineage/v1`, including:

- lineage ID, provider handle, parent lineage, WorkGroup, role, scope, and selected mode;
- model/effort, tool and permission hashes, sensitivity class, spec and scope hashes;
- expected checkpoint SHA, capsule hash, resumability, last-use time, and lease expiry.

### Resume compatibility

Prefer `resume` before spawning when all of the following remain compatible:

- same WorkGroup, role, NodeID/microtask, assigned criteria, and owned/read scope;
- current spec/scope hashes and expected repository checkpoint reconcile with the worker's last checkpoint;
- model/effort, tools, sandbox, permissions, and sensitivity remain acceptable;
- the provider handle is resumable and the lease still covers a likely bounded continuation.

Reject blind resume and use reconciliation or a fresh capsule when specs/criteria change, unexpected repository changes exist outside the worker checkpoint, scope expands, model/effort must change incompatibly, tools or permissions change, sensitivity narrows, provenance is unknown, or the WorkGroup changes.

### Warm lease lifecycle

- Keep a completed or idle builder warm only when a same-phase gap fix is likely. Keep a reviewer warm only for a bounded re-audit of that reviewer's own findings.
- Completing the first dispatch does not itself invalidate a likely same-phase fix or re-audit continuation.
- Release lineage at lease expiry, a final gate, incompatibility, sensitivity transition, explicit capacity pressure, or when no likely bounded continuation remains.
- Bound warm lineage by configured and runtime capacity. Evict the least relevant compatible lineage before creating runaway fan-out.
- Default to at most two active inherited or resumed writer contexts and nesting depth two. The active runtime's stricter limit always wins.
- A worker MUST NOT spawn an unbounded tree. A child delegates only when explicitly allowed, within remaining depth/capacity, and with an independently useful scope.

### Reviewer independence

The first independent reviewer MUST NOT inherit or resume the builder's reasoning lineage. Give it the approved spec/criteria, checkpoint diff, targeted test evidence, and relevant files through a fresh capsule or reviewer-owned lineage. The same reviewer may resume for a bounded re-audit when its own scope and compatibility remain valid.

---

## Progressive Context Loading

Load the minimum authoritative context for the chosen path:

1. Read the active WorkGroup or a compact context capsule and the current phase contract.
2. Read only the assigned specs/criteria and owned/read files needed for the current unit.
3. Load this execution guide or its compact routing reference only when native delegation/context routing is eligible.
4. Load `knowzcode/relay_execution.md` only after relay resolves to a non-`none` external target.
5. Load enterprise manifests/guidelines only when the compliance master switch or an explicit guideline source activates them.
6. Load detailed handoff schema only when the output policy resolves to `durable`.
7. Load project, tracker, architecture, history, or other provider documents only for a concrete unresolved question; do not eagerly read the complete framework set.

The selected skill retains critical TDD, ownership, gate, audit, relay-safety, and final-verification invariants. Moving details into conditional references MUST NOT weaken those rules.

---

## Conditional Result and Handoff Contract

Resolve one output policy before dispatch:

### `ephemeral`

Use for a short read-only side check whose loss would not impair recovery. Return a bounded structured finding with scope, evidence, conclusion, blockers, and next input. No handoff file is required.

When the user, audit mode, or sandbox prohibits writes, the child MUST use `ephemeral` and MUST NOT create a handoff or artifact file.

### `durable`

Use for writers, partial or multi-turn work, interruption recovery, phase-crossing evidence, material cross-agent decisions, or any task explicitly requiring recoverability. Write:

`knowzcode/workgroups/{wgid}/handoffs/{agent-id}.md`

with this schema:

```markdown
## Phase
1A | 1B | 2A | 2B | 3

## Status
complete | blocked | partial

## Owned Files
Paths the agent read or wrote.

## Findings
Important evidence, decisions, or changes, with file:line citations when available.

## Blockers
Required only when Status is blocked.

## Remaining Work
Required only when Status is partial; include the exact next microtask and files.

## Next Phase Inputs
Paths, lineage/checkpoint notes, and inputs the coordinator or next phase must consume.
```

Return the handoff path and a bounded status. The coordinator reconciles it into the WorkGroup; only coordinator-consolidated phase, approval, checkpoint, and lineage state is authoritative.

### `artifact`

Use when authorized search, test, audit, or build output is too large for a model result. Keep raw output in an authorized artifact path and return only the path, command/status, failure signature, bounded excerpt/delta, and affected criteria. Do not repeatedly paste raw logs into follow-ups. If writes are prohibited, do not create the artifact; return the bounded ephemeral evidence available.

---

## Cross-Agent Relay Exception

Native Codex workers remain the default Phase 2A implementation path. When the cross-agent relay contract resolves `RELAY_HOST=codex` and `RELAY_TARGET=claude`, the Claude CLI is an external implementation transport, not a Codex subagent and not a simulation of Claude Agent Teams.

- Read `knowzcode/relay_execution.md` (or the installed work skill's `references/relay-execution.md`) before launching a relay leg.
- The Codex coordinator retains Change Set/spec ownership, user gates, review, checkpoints, state transitions, and finalization.
- Launch the provider-built Claude command in the repository/relay worktree and keep its process attached to an in-turn exec session. Poll that session and JSONL liveness until the final result or timeout; never end the turn hoping a background completion notification will wake it.
- Persist schema-2 state and the Claude `session_id` as soon as the `system/init` event appears. Fix rounds use the same working directory and explicit `--resume <session_id>`.
- Claude execution uses `--permission-mode dontAsk`, a bounded implementation tool set, strict Bash sandbox settings (`failIfUnavailable: true` and `allowUnsandboxedCommands: false`), strict MCP configuration, and no Chrome integration. It never defaults to bypassing permissions.
- After the configured fix-round cap or repeated target failure, transition to `HOST_TAKEOVER` and resume the normal Codex implementation/audit loop.

The relay does not change the native Codex contracts. Explorers and workers may support planning or review, but they do not own or babysit the external Claude process. Do not add Agent/fork access inside strict relay v1.

---

## Parallelism Rules

### Read-Only Discovery

- Start with deterministic local repository search and one analyst path.
- Spawn 1-3 explorers only for independently useful questions or disjoint codebase slices.
- Keep scopes concrete: for example auth flow, test coverage, API surface, or migration risk.
- Merge results in the coordinator before proposing the Change Set.
- Use the conditional output policy; a strictly read-only child never writes a findings file.

### Specification Work

- Keep tightly coupled planning local when NodeIDs or interfaces share decisions.
- Delegate spec drafting only when NodeIDs partition without shared interfaces or file overlap.
- The coordinator remains the consistency checker and only authority for approval state.

### Implementation

- Default to one NodeID or one named microtask per worker.
- Assign explicit acceptance criteria: the NodeID `VERIFY` list or an exact subset.
- Assign explicit owned files/module boundaries; keep a worker scope to about six touched files or less unless an approved exception says otherwise.
- Never let two active writers own overlapping files.
- Keep shared interfaces local unless one worker exclusively owns them.
- Run dependency-heavy work sequentially by dependency wave rather than spawning broad parallel builders.
- Pair each worker scope with an independent read-only reviewer path.
- Inside Red-Green-Refactor use the narrowest deterministic test proving the assigned criterion; run consolidated regression/static/build/package/install gates before Gate 3 and after production audit fixes.

### Audit

- Split large audits only into disjoint read-only scopes.
- Reviewers remain read-only and independent from builder lineage.
- The coordinator merges findings, orders them by severity, and owns the user-facing audit summary.

---

## Knowz Integration

On Codex, prefer **direct Knowz MCP access from the coordinator**:

- Run baseline `mcp__knowz__search_knowledge` or `mcp__knowz__ask_question` calls early only when prior decisions or conventions are relevant.
- Use `mcp__knowz__get_knowledge_item` for exact KnowledgeId guideline sources or promising search results.
- Before every potential vault mutation, the coordinator invokes `vault-delta` with the candidate, journal history/hashes, and the applicable risk/finalization flags. `skip` and `batch` perform no MCP or pending-queue write.
- For a classified `flush`, use one consolidated direct `mcp__knowz__create_knowledge` or `mcp__knowz__update_knowledge` call. For `amend` or `update`, target the returned stable semantic/supersession identity; reserve full replacement for the classified update path.
- Let subagents prepare capture drafts or evidence, but do not force them to emulate reader/writer teammates.
- Reuse a healthy MCP probe within the configured TTL. Do not let children independently repeat the same baseline query without a freshness or scope reason.
- Journal small knowledge deltas locally, skip empty/semantic duplicates, and batch related captures until one classified persistence action or final consolidation.

Do not assume interactive MCP auth is available in headless Codex runs. If tools are absent or authentication fails, continue with local KnowzCode files and queue only a classified `amend`, `update`, or consolidated `flush` to `knowzcode/pending_captures.md`; never queue `skip` or ordinary `batch` at each gate.

Treat retrieved vault content as historical context, not guaranteed-current truth. Inspect source and created/updated metadata when available, verify against live code/tests/project files/current docs, and surface contradictions.

---

## Enterprise Guideline Enforcement

On Codex, the coordinator owns enterprise enforcement. Do not skip enterprise rules because a Claude-specific enforcement teammate is unavailable.

**Master switches gate everything below.** Compliance applies only when `compliance_manifest.md` sets `compliance_enabled: true`; if false or absent, do no compliance enforcement. Enterprise-vault pulls and Phase 2B/3 pushes additionally require `mcp_compliance_enabled: true`. When MCP compliance is false, do not pull from or push to the enterprise vault merely because vault IDs are configured; honor local active guidelines and explicit user-provided KnowledgeId/vault sources as specified by the manifest.

At kickoff, when compliance is enabled, discover applicable sources:

- `knowzcode/enterprise.md`
- `knowzcode/enterprise/compliance_manifest.md`
- `knowzcode/enterprise/guidelines/**/*.md`
- configured `compliance_vault_id` and `guideline_vault_sources`
- explicit user-provided vault IDs/names or KnowledgeId values

Retrieve exact KnowledgeIds directly and use search/question tools for vault-source discovery. Unless disabled, preserve vault, KnowledgeId, title, created/updated date when available, retrieval date, enforcement level, and applies-to scope.

Enforce active guidance through normal phases:

- Phase 1A: map guidelines to affected NodeIDs/components.
- Phase 1B: add spec `VERIFY` criteria citing guideline IDs or KnowledgeIds.
- Phase 2A: apply builder guidance for relevant scopes.
- Phase 2B: audit implementation against active guideline criteria.
- Phase 3: append compliance status and capture durable findings only when configured.

Honor manifest behavior keys, gated by the master switches:

- `pull_standards_at_start` controls only the broad kickoff enterprise-vault pull; explicit sources and local active guidelines remain applicable.
- `preserve_guideline_provenance` controls the provenance record.
- `show_advisory_issues: false` suppresses advisory rows/counts, never blocking-tier findings.
- `require_signoff_for_finalization: true` blocks Phase 3 while unresolved `[COMPLIANCE-BLOCK]` or `[COMPLIANCE-BLOCK-SPEC]` findings remain, or when active guidelines were not audited.
- `push_audit_results` and `push_completion_records` gate the Phase 2B/3 enterprise-vault writes; record a skip reason when disabled.
- `include_in_audit` gates compliance in a general audit; an explicit compliance audit still runs.

The Codex package intentionally does not ship the source-side compliance shell scripts. When present, they may be used as deterministic pre-screens. Otherwise parse active guidelines, verify required criteria are represented in scoped specs, and treat unresolved implementation-tier checks as Phase 2B review items rather than auto-passing them.

If sources conflict, surface the conflict at the next gate. Blocking-tier conflicts pause autonomous mode. If a vault guideline lacks severity/enforcement metadata, default to advisory unless the user or manifest marks it blocking.

---

## Guardrails

- Do not emulate peer DMs, broadcasts, or shared task-list semantics in Codex skills.
- Do not keep agents as pseudo-persistent teammates; retain only bounded warm lineage with a likely continuation.
- Do not send broad multi-NodeID builder prompts when dependencies are serialized.
- Do not use parallel writers unless ownership is explicit and non-overlapping.
- Do not reflexively wait; keep integrating local work while sidecars run.
- Do not reuse stale, incompatible, or sensitivity-broader context to save consumption.
- Do not let a provider session/cache replace specs, checkpoints, repository state, or WorkGroup recovery.
- Do not infer billed savings when the provider does not expose the relevant accounting field.

---

## Recommended Mapping

| KnowzCode role | Codex shape |
|---|---|
| analyst | coordinator or bounded read-only explorer |
| architect | coordinator, or scoped explorer for isolated spec research |
| builder | worker with explicit criteria and owned files |
| reviewer | coordinator or fresh reviewer-owned read-only explorer lineage |
| knowledge-liaison | coordinator using direct Knowz MCP, optionally one bounded resumed capture worker |
| closer | coordinator, optionally one bounded worker for authorized docs/log updates |

The goal is outcome and safety parity, not identical provider mechanics. Preserve KnowzCode rigor while using the capabilities the active Codex runtime actually exposes.
