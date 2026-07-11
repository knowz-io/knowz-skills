# Codex Execution Model

**Purpose:** Defines the execution model for OpenAI Codex users. Codex supports native delegation, but it does not expose Claude-style team, task-list, mailbox, or broadcast APIs. This file describes the Codex-native replacement.

Agents on other platforms should ignore this file. See `knowzcode/platform_adapters.md` for cross-platform notes, `knowzcode/claude_code_execution.md` for Claude Code Agent Teams, and `knowzcode/copilot_execution.md` for GitHub Copilot's single-agent flow.

---

## Coordinator Model

Codex should use a **single coordinator + bounded subagents** model:

- The **coordinator** owns user communication, quality gates, shared state, and final decisions.
- **Explorer** subagents handle read-only discovery, audits, and codebase research.
- **Worker** subagents handle bounded implementation tasks with explicit file ownership.
- Shared project state lives in the initialized KnowzCode files plus the active WorkGroup file.

Do **not** simulate Claude-style Agent Teams. There is no supported Codex equivalent of `TeamCreate`, `TaskCreate`, mailbox DMs, or teammate broadcasts.

---

## Native Codex Primitives

When delegation is useful, use the Codex runtime's native tools:

- `spawn_agent` to start an `explorer` or `worker`
- `send_input` to reuse a warm agent for follow-up work
- `wait_agent` only when the coordinator is truly blocked on the result
- `close_agent` as soon as the delegated scope is complete

The coordinator should keep the immediate blocking task local. Delegate sidecar work that can run in parallel without stalling the next coordinator step.

---

## Cross-Agent Relay Exception

Native Codex workers remain the default Phase 2A implementation path. When the
cross-agent relay contract resolves `RELAY_HOST=codex` and
`RELAY_TARGET=claude`, the Claude CLI is an external implementation transport,
not a Codex subagent and not a simulation of Claude Agent Teams.

- Read `knowzcode/relay_execution.md` (or the installed work skill's
  `references/relay-execution.md`) before launching a relay leg.
- The Codex coordinator retains Change Set/spec ownership, user gates, review,
  checkpoints, state transitions, and finalization.
- Launch the provider-built Claude command in the repository/relay worktree and
  keep its process attached to an in-turn exec session. Poll that session and
  JSONL liveness until the final result or timeout; never end the turn hoping a
  background completion notification will wake it.
- Persist schema-2 state and the Claude `session_id` as soon as the
  `system/init` event appears. Fix rounds use the same working directory and
  explicit `--resume <session_id>`.
- Claude execution uses `--permission-mode dontAsk`, a bounded implementation
  tool set, strict Bash sandbox settings (`failIfUnavailable: true` and
  `allowUnsandboxedCommands: false`), strict MCP configuration, and no Chrome
  integration. It never defaults to bypassing permissions.
- After the configured fix-round cap or repeated target failure, transition to
  `HOST_TAKEOVER` and resume the normal Codex implementation/audit loop.

The relay does not change the Codex subagent contracts below. Explorers and
workers may still support planning or review, but they do not own or babysit
the external Claude process.

---

## Parallelism Rules

### Read-Only Discovery

Parallelize broad research first:

- Spawn 1-3 `explorer` agents for independent questions or codebase slices
- Keep scopes disjoint and concrete: auth flow, test coverage, API surface, migration risk
- Merge results in the coordinator before proposing the Change Set

This is the safest place to parallelize aggressively on Codex.

### Specification Work

Keep tightly coupled planning local unless the Change Set cleanly partitions:

- Draft specs locally when NodeIDs or interfaces are tightly linked
- Only delegate spec drafting when NodeIDs can be partitioned without shared interfaces or file overlap
- The coordinator remains the consistency checker

### Implementation

Use `worker` agents only for small, disjoint write scopes:

- Default to one NodeID or one named microtask per worker
- Assign each worker an explicit owned file set or module boundary
- Assign each worker explicit acceptance criteria: either the whole NodeID `VERIFY:` list or the exact subset/micro-criteria for that microtask
- Keep each worker scope to about 6 touched files or less; split larger work before dispatch
- Never let two Codex workers edit the same file
- Keep shared interfaces local unless they are isolated behind one worker's ownership
- Pair each worker with a read-only reviewer path, either local or via an `explorer`
- For dependency-heavy work, run workers sequentially by dependency wave instead of spawning broad parallel builders

### Audit

Large audits can be split by file area or subsystem:

- Reviewers stay read-only
- The coordinator merges findings, orders them by severity, and owns the user-facing audit summary

---

## Communication Contract

Codex subagents should communicate through **structured disk handoffs**, not free-form chat between peers.

Every delegated task in `/knowzcode:work` should write a phase report to:

`knowzcode/workgroups/{wgid}/handoffs/{agent-id}.md`

Use the same schema as the packaged work skill:

```markdown
## Phase
1A | 1B | 2A | 2B | 3

## Status
complete | blocked | partial

## Owned Files
Paths the agent touched. Use read paths for explorers/auditors and written paths for workers.

## Findings
Important evidence, decisions, or changes, with file:line citations when available.

## Blockers
Open questions or external dependencies. Omit when Status is complete.

## Remaining Work
Only when Status is partial; include the exact next microtask and files needed.

## Next Phase Inputs
Paths and notes the coordinator or next phase must consume.
```

Return only the handoff file path so the coordinator can read it from disk. The coordinator merges handoff files into the WorkGroup file; the WorkGroup file remains the source of truth for phase state and approvals.

---

## Knowz Integration

On Codex, prefer **direct Knowz MCP access from the coordinator**:

- Run baseline `mcp__knowz__search_knowledge` or `mcp__knowz__ask_question` calls early for prior decisions and conventions
- Use `mcp__knowz__get_knowledge_item` for exact KnowledgeId guideline sources or to inspect promising search results
- Use direct `mcp__knowz__create_knowledge` or `mcp__knowz__update_knowledge` from the coordinator at quality gates or finalization
- Use `mcp__knowz__amend_knowledge` for targeted item edits when that tool is available; reserve `mcp__knowz__update_knowledge` for full replacements
- Let subagents prepare capture drafts or evidence, but do not force them to emulate `knowz:reader` / `knowz:writer`

This keeps Knowz usage reliable and avoids a fake inter-agent transport layer.

Do not assume interactive MCP auth is available in headless Codex runs. First check whether the `mcp__knowz__*` tools are present; if they are absent or a call fails authentication, continue with local KnowzCode files and queue captures to `knowzcode/pending_captures.md` instead of blocking the workflow.

Treat retrieved vault content as historical context, not guaranteed-current truth. The coordinator must inspect created/updated/source metadata when available, verify retrieved guidance against live code, current tests, project files, platform observations, and current external docs when relevant, and surface contradictions instead of silently following stale guidance.

## Enterprise Guideline Enforcement

On Codex, the coordinator owns enterprise enforcement. Do not skip enterprise rules because Claude-style `enterprise-enforcer` is unavailable.

**Master switches gate everything below — check them first.** Compliance work applies only when `compliance_manifest.md` sets `compliance_enabled: true`; if it is false (the default) or the manifest is absent, do no compliance enforcement at all. The MCP vault flow — the kickoff standards pull and the Phase 2B/3 enterprise-vault pushes — additionally requires `mcp_compliance_enabled: true`; when it is false, do **not** pull from or push to the enterprise vault even if `compliance_vault_id` / `guideline_vault_sources` are set. In that case honor only local active guidelines and explicit user-provided `KnowledgeId`/vault sources. This matches Claude's behavior exactly.

At kickoff (only when `compliance_enabled: true`), discover enterprise guideline sources:

- `knowzcode/enterprise.md`
- `knowzcode/enterprise/compliance_manifest.md`
- `knowzcode/enterprise/guidelines/**/*.md`
- configured `compliance_vault_id`
- configured `guideline_vault_sources` or user-provided guideline vault IDs/names
- explicit user-provided Knowz `KnowledgeId` values

When a guideline is provided from a vault or KnowledgeId, retrieve it directly with Knowz MCP (`mcp__knowz__get_knowledge_item` for exact IDs; `mcp__knowz__search_knowledge` or `mcp__knowz__ask_question` for vault sources). Preserve provenance in the WorkGroup or compliance report: vault, KnowledgeId, title, created/updated date when available, retrieval date, enforcement level, and applies-to scope.

Enforce active enterprise guidance through the normal phases:

- Phase 1A: map guidelines to affected NodeIDs/components
- Phase 1B: add spec `VERIFY:` criteria citing guideline IDs or KnowledgeIds
- Phase 2A: apply builder guidance for relevant scopes
- Phase 2B: audit implementation against active guideline criteria
- Phase 3: append compliance status and capture durable compliance findings when vaults are configured

Honor the `compliance_manifest.md` config keys (defaults in parentheses), gated by the master switches above — they behave the same on Codex as on Claude:

- `pull_standards_at_start` (true): when false, skip only the broad kickoff enterprise-vault standards pull; still honor explicit KnowledgeIds, explicit vault IDs, and local active guidelines.
- `preserve_guideline_provenance` (true): when false, skip the provenance capture above.
- `show_advisory_issues` (true): when false, report blocking-tier violations only in gate/audit output; never suppress blocking-tier findings.
- `require_signoff_for_finalization` (false): when true, block Phase 3 finalization if unresolved `[COMPLIANCE-BLOCK]` / `[COMPLIANCE-BLOCK-SPEC]` findings remain, or if active guidelines existed but no compliance audit ran.
- `push_audit_results` / `push_completion_records` (true): gate the Phase 2B / Phase 3 enterprise-vault pushes; when false, record the skip reason in the WorkGroup/compliance status.
- `include_in_audit` (true): in `/knowzcode:audit`, gates compliance in a general audit; an explicit compliance audit always runs.

The Codex package intentionally does not ship `scripts/compliance-check.sh` or `scripts/compliance-check.ps1`. If those source-side scripts are present in a repository, a coordinator may run them as a fast deterministic pre-screen; otherwise perform the same floor directly: parse active guidelines, verify each required ARC/spec criterion is represented in the scoped specs, and treat unresolved implementation-tier checks as review items for Phase 2B rather than auto-passing them.

If guideline sources conflict, surface the conflict at the next gate. Blocking-tier conflicts pause autonomous mode until the user or lead resolves which source applies. If a vault guideline lacks severity/enforcement metadata, default to advisory unless the user or manifest marks it blocking.

---

## Guardrails

- Do not emulate `DM`, `broadcast`, or shared task-list semantics in Codex skills
- Do not keep idle agents around as pseudo-persistent teammates without active work
- Do not send broad multi-NodeID builder prompts when dependencies are serialized; split to microtasks with assigned acceptance criteria and persist checkpoints
- Do not use parallel writers unless ownership is explicit and non-overlapping
- Do not reflexively call `wait_agent`; keep integrating local work while sidecar agents run
- Close agents when their scope is complete so stale context does not accumulate

---

## Recommended Mapping

| KnowzCode role | Codex shape |
|----------------|-------------|
| analyst | coordinator or read-only `explorer` |
| architect | coordinator, or scoped `explorer` for isolated spec research |
| builder | `worker` with explicit owned files |
| reviewer | coordinator or read-only `explorer` |
| knowledge-liaison | coordinator using direct Knowz MCP |
| closer | coordinator, optionally with one bounded worker for docs/log updates |

The goal is not to recreate Agent Teams exactly. The goal is to preserve KnowzCode's rigor while using the primitives Codex actually provides well.
