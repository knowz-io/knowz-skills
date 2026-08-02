# work — Claude Operational Rules

Full TDD workflow with Tier 2 Light and Tier 3 Full paths. Claude automatically loads a referenced named-agent definition; task prompts must not ask agents to reread their definition or the complete Claude execution guide.

## Dispatch

Classify request, spec reuse, and tier before WorkGroup writes, broad vault queries, or agent side effects. Parse and apply the `context_efficiency` rollout/profile/caps/lease/TTL/result/telemetry/canary settings before final dispatch. When enabled, call the read-only `context_efficiency_runtime.mjs` stdin CLI for every non-trivial dispatch, direct capsule/privacy and lineage checks, and result-policy selection. Rollout controls only recommendation application and redacted telemetry; safety validation is fail-closed and cannot degrade through `CAPABILITY_FALLBACK`. For each unit select one mode in order: local, compatible named-agent resume, compatible real conversation fork, fresh capsule, then coordinated team only when peers require a shared task list or direct messaging. Skill `context: fork` is isolated execution, not inherited conversation history.

Parallel independent work uses named agents. Agent Teams is optional, experimental, explicitly opt-in, and coordination-only; no model profile or tier enables it. The first teammate spawn forms the session-derived team. Teammates do not inherit lead history, inherit lead permissions, and are not restored by lead resume/rewind. Runtime cleanup is automatic after graceful teammate release.

## Critical Workflow

1. Read-only classification, targeted spec reuse, tier selection, profile/relay parse.
2. Announce Adaptive Delegation, Sequential Delegation, or Coordinated Team.
3. Load only the references required by the selected path.
4. Reuse the MCP baseline; target deeper vault queries and skip duplicates.
5. Tier 2: lightweight spec gate, one builder lineage, optional fresh smoke test, finalization/capture.
6. Tier 3: Change Set Gate #1, spec Gate #2, TDD implementation, fresh independent review Gate #3, finalization.
7. Resume compatible architect/builder/reviewer/liaison lineages with bounded deltas. Record invalidation and cold-start from a capsule when spec, scope, checkpoint, model/effort, tools, permissions, sensitivity, or transcript availability changes.

## Constraints

- An independent reviewer never forks or resumes builder lineage.
- Default active inherited/resumed writers: two; no overlapping file ownership; nesting depth two.
- Named plugin agents rely on session permissions plus supported tool allowlists; never bypass permission checks.
- Agent results are bounded summaries with file/line or test evidence and artifact paths. Raw logs stay in artifacts.
- TDD, gates, security/compliance blockers, vault capture, tracker/log updates, and consolidated pre-Gate-3 verification survive every capability fallback.
- Strict relay remains exec/MCP transport as documented in `references/relay-execution.md`; do not add Agent, fork, Team, ambient MCP, browser, or wider permissions.

## References

- `references/parallel-orchestration.md` — adaptive parallel stages and lineage use
- `references/spawn-prompts.md` — bounded task packets
- `references/quality-gates.md` — gates and resume-first gap loop
- `references/profile-models.md` — model selection, orthogonal to execution mode
- `references/light-workflow.md` — Tier 2
- `references/relay-execution.md` — strict external relay
- `knowzcode/claude_code_execution.md` — Claude capability mapping
