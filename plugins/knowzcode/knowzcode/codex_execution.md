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

Use `worker` agents only for disjoint write scopes:

- Assign each worker an explicit owned file set or module boundary
- Never let two Codex workers edit the same file
- Keep shared interfaces local unless they are isolated behind one worker's ownership
- Pair each worker with a read-only reviewer path, either local or via an `explorer`

### Audit

Large audits can be split by file area or subsystem:

- Reviewers stay read-only
- The coordinator merges findings, orders them by severity, and owns the user-facing audit summary

---

## Communication Contract

Codex subagents should communicate through **structured handoffs**, not free-form chat between peers.

Every delegated task should return a compact handoff with these fields:

```markdown
## Handoff
- Status: complete | blocked
- Scope: what this agent owned
- Files: explicit files reviewed or edited
- Findings: important evidence, decisions, or changes
- Open Questions: anything still ambiguous
- Next Action: the best follow-up step
- Artifact Paths: optional local files created for the coordinator
```

If the workflow benefits from persistent artifacts, the coordinator may keep handoff notes in:

`knowzcode/workgroups/{wgid}/handoffs/{agent-name}.md`

Use that directory only as a coordination aid. The WorkGroup file remains the source of truth for phase state and approvals.

---

## Knowz Integration

On Codex, prefer **direct Knowz MCP access from the coordinator**:

- Run baseline `search_knowledge` or `ask_question` calls early for prior decisions and conventions
- Use direct `create_knowledge` or `update_knowledge` from the coordinator at quality gates or finalization
- Let subagents prepare capture drafts or evidence, but do not force them to emulate `knowz:reader` / `knowz:writer`

This keeps Knowz usage reliable and avoids a fake inter-agent transport layer.

---

## Guardrails

- Do not emulate `DM`, `broadcast`, or shared task-list semantics in Codex skills
- Do not keep idle agents around as pseudo-persistent teammates without active work
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
