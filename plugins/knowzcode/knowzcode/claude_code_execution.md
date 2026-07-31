# Claude Code Execution Model

**Purpose:** Map KnowzCode's portable context-affinity modes to current Claude Code capabilities. This file supplements the platform-neutral agent definitions in `agents/`; load it only when a Claude-specific dispatch decision needs it.

Agent definitions provide role behavior. Spawn prompts provide only the assigned scope, approved specifications and VERIFY IDs, owned files, checkpoint/lineage data, and a bounded result contract.

---

## Capability-First Routing

Before a discretionary spawn, broad vault query, or team side effect:

1. Classify the request and reuse any approved specification.
2. Record the role, phase, scope, owned files, coupling, sensitivity, reviewer-independence requirement, and compatible lineage candidate.
3. Select exactly one portable mode and reason code.
4. Verify that the required Claude capability is callable. If it is not, use a fresh context capsule and record `CAPABILITY_FALLBACK`.

Use this precedence:

| Mode | Claude behavior | Typical reason |
|---|---|---|
| `local` | Lead handles a trivial, tightly coupled, or blocking unit | `LOCAL_CHEAPER`, `BLOCKING` |
| `resume` | Resume a compatible named custom/general-purpose agent by its recorded handle | `RESUME_COMPATIBLE` |
| `inherit-full` | Use a real conversation fork when callable and policy-compatible | `HIGH_CONTEXT_AFFINITY` |
| `inherit-recent` | Use bounded native inheritance when exposed; otherwise a fresh capsule | `BOUNDED_RECENT_CONTEXT` |
| `fresh-capsule` | Start a named agent with a concise, versioned task packet | `INDEPENDENT_CAPSULE`, `SENSITIVITY_ISOLATION`, `REVIEW_INDEPENDENCE` |
| `coordinated-team` | Spawn the smallest set of teammates that must share tasks or message peers | `TEAM_COORDINATION_REQUIRED` |

Parallel work does not require a team. Independent slices normally use bounded named agents. Team mode is justified only when at least two active peers need direct messaging or a shared task graph.

Defaults:

- At most two active inherited or resumed writers.
- Portable nesting depth is at most two; a conversation fork never creates another fork.
- No overlapping file ownership among active writers.
- An independent reviewer always receives a fresh capsule and never resumes or forks the builder lineage.

---

## Claude Context Semantics

### Named subagent

A named Agent subagent receives its agent definition and task prompt, not the complete lead conversation. Claude automatically loads the referenced definition as the agent's system instructions. Do not ask it to reread its own definition or this entire guide.

Every named packet states `Coordination Mode: named-agent`. Named agents do not own shared task state and do not call `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `SendMessage`, DM, mailbox, broadcast, or peer-message operations. They return one bounded result, checkpoint, or unresolved question to the lead, and the lead routes all dependencies and peer inputs. A role definition's later Team-oriented prose is conditional on `Coordination Mode: coordinated-team`, never an implicit capability grant.

On Claude Code v2.1.198+, named subagents default to background execution. Background permission requests surface in the main session on current releases, but background agents have a narrower built-in tool pool. Preflight required tools. When the current Agent schema exposes the switch, foreground subagent execution uses per-call `Agent(..., run_in_background: false)`; if `CLAUDE_CODE_FORK_SUBAGENT=1` has forced all subagents into the legacy background fork path, that parameter is removed, so use lead-owned execution or a runtime configured for foreground work (for example, background tasks disabled) instead. Do not assume the older auto-deny behavior, silently omit a required operation, or treat omitted/false agent frontmatter as a foreground override.

Claude Code v2.1.219+ permits nested ordinary subagents up to the runtime-configured depth (three by default in v2.1.220; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1` disables nesting). A nested dispatch still requires the `Agent` tool, but current type lists such as `Agent(type-a,type-b)` are not enforced inside a subagent definition. KnowzCode therefore keeps privileged reader/writer dispatch lead-owned instead of claiming a child allowlist; other nested work requires explicit runtime policy, stays within the portable depth-two cap, and falls back to lead-owned chaining. Nested agents do not gain Team task/mailbox capabilities.

Persist its provider handle and lineage when the runtime exposes one. On current Claude Code, a completed custom/general-purpose Agent returns an ID; the lead sends a bounded delta with `SendMessage` to that ID/name, which auto-resumes it in the background without forming an Agent Team. Do not use the removed Agent `resume` input. Start fresh when the transcript/ID is unavailable or any compatibility input changes: role, scope, approved spec, checkpoint, model/effort, tools, permissions, sensitivity, or reviewer independence.

Explore and Plan built-in agents are one-shot. Do not advertise them as resumable.

### Conversation fork

A real Claude conversation fork copies the parent conversation state and preserves the parent model, tools, permissions, and history. On Claude Code v2.1.212+, the user-facing `/subtask` starts that forked subagent when Agent view is enabled; `/fork` creates a background session in normal Agent view. When Agent view is disabled, `/subtask` is unavailable and `/fork` starts the forked subagent instead. For Claude-initiated routing on a supported rollout, call `Agent(subagent_type="fork", description="<short task>", prompt="<bounded objective>")`; gate it on current capability/version and `CLAUDE_CODE_FORK_SUBAGENT` (`0` disables it, while `1` forces the legacy all-background fork mode and removes `run_in_background`), and otherwise use a fresh capsule. Before v2.1.212, user-facing `/fork` was the forked-subagent command and availability depended on the runtime version/rollout. An Agent-spawned fork counts against session/concurrency caps, while a user-created `/fork` background session is outside the subagent cap. A fork may reuse the parent prompt cache on its first request, but inherited tokens still occupy context.

Fork only when the current reasoning path is relevant, safe, and cheaper than a capsule. Do not fork:

- independent reviewers;
- narrower-access or mixed-sensitivity roles;
- work requiring a different model, effort, or tool policy;
- stale or unfocused parent context;
- when the active inherited-worker cap is reached.

A skill declared with `context: fork` is different: Claude runs that skill body in an isolated subagent context. It does **not** copy the invoking conversation history and must not be used as the implementation of `inherit-full`. On Claude Code v2.1.218+, these skills run in the background by default unless the skill sets `background: false`; apply the same background-tool preflight. Their edits are outside the main session's checkpoint rewind, so a writing forked skill needs explicit ownership and normal git verification.

### Cache behavior

Cache reads can reduce billed processing and latency, but cached tokens still count toward logical context occupancy. Model, effort, tool, permission, or system-prefix changes may reset reuse. Record provider cache counters when present; never infer a hit from mode or version alone. Provider session/cache state is an optimization, not durable truth.

---

## Context Capsule and Lineage

Every material fresh dispatch receives a compact `knowzcode.context-capsule/v1` packet containing:

- task and WorkGroup ID, phase, objective, NodeIDs, and explicit owned/read files;
- approved spec paths and assigned VERIFY IDs;
- approved decisions, checkpoint SHA, concise failure summaries with artifact paths, risks, constraints, and next action.

Do not inline full transcripts, framework manuals, credentials, or unbounded logs. Give raw evidence an artifact path and include only the decision-relevant summary.

For reusable workers, record `knowzcode.agent-lineage/v1`: platform handle, role/scope, dispatch mode, model/effort, tools and permissions hashes, spec/scope/capsule hashes, checkpoint, sensitivity, resumability, and lease. A resume prompt is a bounded delta: changed VERIFY IDs, new failure summary/artifact, checkpoint change, and requested next action.

Retain a warm worker through a likely same-phase fix/re-audit continuation. Release it at the final applicable gate, lease expiry, lineage incompatibility or sensitivity change, capacity pressure, or when no likely continuation remains. Durable WorkGroup state and capsules must support a cold recovery.

---

## Agent Teams

Agent Teams is experimental and requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Configuration establishes availability, but the current teammate capability must still be callable. Before the first teammate spawn in a run, the user must have explicitly requested teammates/Team mode for the current task or confirm the proposed teammates; persisted environment configuration alone is not approval.

### Current lifecycle

- The first teammate spawn forms the session-derived team. Treat its runtime identity as opaque.
- Teammates load project context plus their scoped prompt; they do not inherit the lead conversation.
- A referenced agent type contributes its definition body, tool allowlist, and model automatically.
- The lead requests graceful teammate shutdown/release when useful. Runtime-managed cleanup removes the team configuration when the session ends; task-list history is retained for resume/retention and ages under Claude's `cleanupPeriodDays`. There is no separate team-delete step and cleanup must not be described as erasing task history immediately.
- In-process teammates are not restored by lead `/resume` or `/rewind`. A continuation reconstructs them as fresh workers from durable capsules only if team coordination is still justified.
- A teammate cannot spawn another teammate or nested Team. It may spawn an ordinary subagent only synchronously (`run_in_background: false`); a background child from an in-process teammate is denied. KnowzCode's shipped Team roles omit the `Agent` tool and keep child dispatch lead-owned, so this restriction is enforced structurally.

Team mode is materially more expensive because each teammate has a separate model context. Start with the smallest viable roster, shut down peers after their deliverable, and do not keep agents idle merely for a possible cache hit.

### Team-only coordination

The shared task list and mailbox belong only to Team mode. Ordinary named subagents do not receive those capabilities.

Every teammate packet states `Coordination Mode: coordinated-team`. The lead verifies the task/message capability is callable before rendering task IDs or peer-message clauses. If it is not callable, fall back to named-agent packets and coordinator-owned dependency state rather than leaving Team instructions in the child prompt.

Team tasks follow `pending -> in_progress -> completed` and may declare dependencies. The lead creates and assigns a task before dispatch, includes its task ID in the scoped prompt, and owns workflow progress. A teammate claims its assigned ID, reports a bounded result, and does not create a duplicate task.

Use direct messages only for decision-relevant peer coordination:

- knowledge liaison -> analyst/architect: concise context briefing;
- analyst -> architect: up to three preliminary NodeID findings;
- architect -> builder: spec intent clarification;
- builder <-> builder: shared-interface changes only;
- reviewer -> lead -> builder: structured gaps and fix delta;
- officers/advisors -> assigned peer: consolidated security, test, design, or compliance guidance, normally at most two messages per peer.

### Plans and permissions

If plan review is useful, instruct the teammate at spawn to present a plan before edits and use the runtime's supported plan-approval handshake. In autonomous mode, auto-approval may proceed except for established safety exceptions such as scope expansion or disabling controls.

Teammates inherit the lead's effective permission policy. Do not claim a per-teammate plugin frontmatter field changes it. Plugin-distributed agents may use supported fields such as `name`, `description`, `tools`/`disallowedTools`, `model`, `effort`, `maxTurns`, `background`, `memory`, and `isolation`. Claude ignores `permissionMode`, `hooks`, and `mcpServers` on plugin-shipped agent definitions, even though current local/user/CLI custom-agent definitions support those fields. The teammate path also does not apply an agent definition's `skills` or `mcpServers`; safety must not depend on either distinction being overlooked.

Effective access is the intersection of the lead/session permission policy, Claude's permission checks, and the agent tool allow/deny list. Read-only roles omit direct write tools and constrain Bash behavior, but unrestricted Bash is not a hard sandbox. KnowzCode never dispatches a child by bypassing permission checks.

---

## Orchestration Patterns

### Independent parallel delegation

Use named agents for independent scopes. Stage 0 starts with deterministic local indexing and one analyst. Add an architect only when architecture ambiguity or an approved Change Set warrants it. Add scanners and security, test, project, design, or enterprise specialists only when a distinct evidence need exists. Do not launch a fixed large roster merely because parallelism is available.

At Stage 2, partition by dependency wave and explicit file ownership. Pair a fresh independent reviewer with each material builder scope. Resume each builder and its reviewer for compatible fix/re-audit deltas; replace one only after a recorded lineage invalidation.

### Coordinated team

When peers truly need mailbox/task-list coordination, the lead remains the sole WorkGroup writer and manages the minimal task graph. Builders and reviewers may remain active through their bounded gap loop. The architect may remain as a read-only consultative peer. Officers retain their existing blocking/advisory authority:

- security CRITICAL/HIGH findings block;
- blocking-tier enterprise violations block Gate #3;
- frontend findings are advisory unless explicitly elevated;
- test and project advisors remain informational.

The quality workflow is identical outside Team mode: TDD, approved specifications, gates, independent review, security/compliance exceptions, durable captures, and final verification are never reduced by a capability fallback.

### Sequential flow

Sequential execution normally uses resumable named agents rather than a one-peer-at-a-time team. Persist builder/reviewer handles and send bounded gap deltas. Do not respawn both agents for every iteration.

---

## Bounded Result Contract

Each worker returns only:

```text
status: completed | blocked | failed
scope: assigned NodeIDs/microtask
decisions_or_findings: bounded list
evidence: file:line, test command/result, or artifact path
changed_paths: explicit list
verify: passed/failed/not-run by assigned ID
risks: unresolved items
next_action: one sentence
lineage: provider handle/status when available; never expose it to telemetry
```

Store verbose searches, logs, and audit output in artifacts. Follow-up workers receive summaries and paths, not raw output. Run the narrowest deterministic check during a fix loop and the consolidated test/static/build/package/install checks before Gate #3 and after production audit fixes.

---

## Strict External Relay Boundary

The strict Claude/Codex relay remains a separate headless CLI/session protocol. It does not expose Agent, conversation forks, Agent Teams, ambient MCP, or browser tools.

For Claude relay legs, preserve authenticated `claude -p --verbose --output-format stream-json`, the exact recorded cwd, explicit `--resume`, `dontAsk`, the bounded implementation tool allowlist, strict Bash sandboxing, strict empty MCP settings, and no Chrome. A compatible resume receives a short delta; a failed/invalid resume uses the self-contained cold-recovery brief. Never widen this boundary to obtain native orchestration savings.

---

## Verification and Troubleshooting

`/knowzcode:status` reports separately:

- available agent definitions;
- whether Agent Teams is configured, unconfigured, or unknown until runtime;
- conversation-fork/runtime capability and capsule fallback;
- active resumable lineage without printing provider handles;
- observed cache/usage counters only when available.

Common recovery:

| Symptom | Response |
|---|---|
| Team capability unavailable | Continue with named agents and fresh capsules; quality and capture remain unchanged |
| Named agent transcript unavailable | Record invalidation and cold-start from the durable capsule |
| Inheritance incompatible | Use `fresh-capsule`; do not fabricate a fork |
| Generic agent behavior | Verify the named agent definition is installed and referenced by type |
| Large repeated output | Save raw evidence to an artifact and send a bounded delta |
| Cache counters absent | Report accounting source as unavailable; make no savings claim |

The WorkGroup phase history, approved specs, checkpoint, tracker, and artifacts remain authoritative after any runtime restart.
