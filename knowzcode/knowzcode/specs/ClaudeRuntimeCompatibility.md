# ClaudeRuntimeCompatibility: Current Claude Context and Team Semantics

**Updated:** 2026-07-30
**Status:** As-Built
**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`

## Context

The current Claude plugin guidance attempts to create and delete teams through removed `TeamCreate`/`TeamDelete` lifecycle APIs, treats Agent Teams as the default for all meaningful work, implies that a skill declared with `context: fork` inherits the current conversation, and declares plugin-agent `permissionMode` fields that Claude Code does not honor. These errors raise cost, make instructions impossible to follow on current runtimes, and can create false confidence about isolation or permissions.

This adapter implements the portable modes in `ContextEfficientOrchestration.md` using current Claude Code capabilities while keeping strict cross-provider relay separate.

## Rules & Decisions

### Native subagents and conversation forks

- A normal named Agent subagent starts with its agent definition and task prompt. It does not automatically receive the complete parent conversation.
- A resumable named subagent keeps its own transcript and provider agent ID; use resume for a compatible follow-up instead of respawning it.
- Claude Code conversation forks (`/subtask` or the current Agent `fork` facility when available) copy the parent conversation state and preserve the parent model, tools, permissions, and history. The first request can benefit from parent prompt-cache reuse, but inherited tokens still occupy context.
- A skill with `context: fork` runs the skill body in isolated subagent context; it MUST NOT be documented as copying the invoking chat history.
- A forked conversation cannot recursively create another fork. Named subagents may nest only when the runtime permits; KnowzCode caps portable nesting at two.
- A reviewer requiring independence uses a fresh capsule, never a builder fork or builder resume.

### Agent Teams lifecycle

- Current Claude Code forms an Agent Team when the lead spawns the first teammate through the runtime's current teammate capability. KnowzCode MUST NOT call or instruct `TeamCreate` or `TeamDelete`.
- Teammate cleanup is runtime-managed. The lead requests shutdown/release through the current capability when useful but does not invoke a deleted team-delete API.
- Teams are selected only for actual peer coordination. They are not a prerequisite for parallel work, knowledge capture, or a quality workflow.
- Agent Teams are explicit opt-in installation/runtime behavior. No model profile, advisor profile, setup default, or complexity tier enables or forces them implicitly.
- Teammates receive scoped spawn prompts and do not inherit the lead's full conversation. Task-list and mailbox coordination are team-only features and MUST NOT be attributed to ordinary subagents.
- Team cost is materially higher because every teammate is a separate model context. Efficiency routing selects subagents/capsules for independent work and keeps a team to the smallest active set.

### Plugin-agent contract and permissions

Plugin agent frontmatter may use supported fields such as `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, `background`, and `isolation`. KnowzCode agent files MUST NOT declare unsupported `permissionMode`, `hooks`, or `mcpServers` fields.

Permission behavior is established by the lead/runtime invocation and the user's Claude Code policy. Agent prose may constrain behavior, and `tools`/`disallowedTools` may narrow callable tools, but documentation MUST NOT claim an unsupported plugin frontmatter field is enforced.

Teammate definitions use the fields the current team runtime applies. Skill or MCP frontmatter that the teammate-spawn path does not apply MUST be passed through an explicit scoped prompt or omitted; the adapter cannot assume it was inherited.

### Cache and model behavior

- Cache reads may be billed below uncached input while the cached tokens still count toward context occupancy.
- Cache identity depends on the provider/runtime prefix and may change with model, effort, tool, permission, or system-prompt changes. Lineage compatibility therefore hashes those inputs.
- Named subagent cache/session warmth is best-effort and short-lived; durable recovery always has a context capsule.
- KnowzCode makes no global cache-TTL promise and does not hold idle workers solely to preserve a possible cache hit.

### Strict external relay

The existing Codex-hosted or Claude-hosted strict relay remains a headless CLI/session protocol. It does not use conversation-fork Agent calls in v1. A Claude relay leg:

- uses authenticated `claude -p --verbose --output-format stream-json` from the exact recorded working directory;
- uses bounded tools, `dontAsk`, strict sandbox and MCP settings, and no Chrome;
- captures the session ID and uses explicit `--resume` for compatible fix deltas;
- supports an optional `--max-budget-usd` configured limit;
- sends a short delta prompt on a warm resume and retains a self-contained cold-recovery prompt if resume fails.

## Interfaces

Claude mode mapping:

| Portable mode | Claude adapter |
|---|---|
| `local` | Lead executes directly |
| `resume` | Resume compatible named Agent or provider session by recorded handle |
| `inherit-full` | Current conversation fork when callable and policy-compatible |
| `inherit-recent` | Bounded native fork if exposed; otherwise `fresh-capsule` |
| `fresh-capsule` | Named Agent/subagent with scoped capsule and agent definition |
| `coordinated-team` | Spawn first teammate with current team capability, then minimal peers |

Claude-specific configuration adds optional `relay_claude_max_budget_usd` and otherwise consumes the shared `context_efficiency` block.

The runtime compatibility section names capabilities first. Concrete API names may be shown only with a minimum/runtime-version note and MUST have a capsule fallback.

## Verification Criteria

- VERIFY CRC-01: no Claude skill, agent, framework, generated adapter, or validator instructs `TeamCreate` or `TeamDelete` for current team lifecycle.
- VERIFY CRC-02: forming a team is described as spawning the first teammate through the current team capability; cleanup is automatic/runtime-managed.
- VERIFY CRC-03: teams are conditional on peer coordination and are not described as the expected/default Tier-2+ mode.
- VERIFY CRC-04: named subagents, conversation forks, skill `context: fork`, and team teammates have distinct documented inheritance semantics.
- VERIFY CRC-05: conversation inheritance uses a real current fork only when callable; unsupported versions fall back to a fresh capsule.
- VERIFY CRC-06: no `knowzcode/agents/*.md` frontmatter contains `permissionMode`, `hooks`, or `mcpServers`, and documentation does not say those unsupported fields are enforced.
- VERIFY CRC-07: plugin-agent supported fields and lead/runtime permission ownership are documented accurately.
- VERIFY CRC-08: an independent Claude reviewer receives a fresh capsule and cannot reuse the builder fork/resume lineage.
- VERIFY CRC-09: cache guidance separates billed cache reads from logical context occupancy and invalidates lineage on cache-relevant runtime changes.
- VERIFY CRC-10: Agent Teams guidance warns about separate teammate contexts/cost and limits the team to actual coordination needs.
- VERIFY CRC-11: strict relay continues to exclude Agent/fork transport, records exact cwd/session ID, uses explicit resume, and retains a cold-recovery prompt.
- VERIFY CRC-12: relay supports a bounded dollar budget without enabling bypass permissions or ambient MCP/browser integrations.
- VERIFY CRC-13: strict Claude audit mode pre-approves no write-capable tool, forms no Team/task state, runs no write-capable test command, and creates no log, artifact, WorkGroup/settings mutation, or vault capture without separate runtime-write and persistence authorization.
- VERIFY CRC-14: Agent Teams remain disabled in ordinary setup/install paths, malformed existing Claude settings fail closed without overwrite, and only explicit opt-in may enable the experimental setting.

## Debt & Gaps

- Claude Code APIs evolve rapidly. Capability detection and official documentation are authoritative over durable concrete tool names.
- Conversation fork availability is version/runtime dependent and may not be exposed to plugin-authored flows in every host. Capsule fallback is the required baseline.
- Agent Teams field propagation differs from normal plugin agents; this version documents the limitation instead of inventing per-teammate permission or MCP controls.
- Strict relay Agent/fork transport remains deferred until its tool schema, permission behavior, session return, and recovery behavior are verified end to end.

## As-Built Verification

- Active Claude guides, skills, references, and plugin-agent definitions use current named-agent, real conversation-fork, optional Agent Team, permission, cache, and strict-relay semantics.
- Agent Teams are explicit opt-in; ordinary and malformed-settings install paths fail closed without unintended mutation.
- Lead-owned vault classification preserves the liaison/closer tool boundary; normal deltas batch locally and only classified persistence actions reach a writer or pending queue.
- Independent Claude audit: 14/14 criteria passed. Fresh-install runtime parity, generated work-skill integration, and package validation passed.
