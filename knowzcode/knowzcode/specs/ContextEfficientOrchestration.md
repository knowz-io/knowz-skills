# ContextEfficientOrchestration: Portable Context-Affinity Routing

**Updated:** 2026-07-31
**Status:** As-Built — verified
**WorkGroup:** `kc-fix-context-orchestration-hardening-20260731-003258`

## Context

KnowzCode currently treats multi-agent execution mainly as a phase-orchestration problem. It does not describe when reusing an existing context is cheaper or safer than starting a worker, how much context a worker should inherit, when a coordinated team is justified, or how to prove a reduction in consumption without weakening quality. Some paths also reload broad framework files, repeat vault probes, require disk handoffs for tiny tasks, and run broad test commands during every fix loop.

This contract defines portable semantics shared by Claude Code and Codex. Provider sessions and prompt caches are execution optimizations, not durable project state. The WorkGroup, approved specifications, checkpoints, and repository remain the recoverable source of truth.

## Rules & Decisions

### Dispatch modes and precedence

Every delegated unit MUST resolve exactly one semantic mode:

| Mode | Use when | Context source |
|---|---|---|
| `local` | Work is trivial, tightly coupled, blocking, or cheaper for the coordinator to perform | Current coordinator context |
| `resume` | A compatible prior worker owns the same lineage and its context is still valid | Provider-native named worker/session resume |
| `inherit-full` | A new worker needs the current reasoning path and the inherited context is relevant, safe, and within budget | Provider-native conversation fork or closest supported equivalent |
| `inherit-recent` | Only the latest decision/failure window is useful and the provider supports bounded inheritance | Provider-native bounded inheritance; otherwise `fresh-capsule` |
| `fresh-capsule` | Work is independent, noisy, security-narrow, cheap to brief, or inheritance is incompatible | Versioned context capsule plus assigned files/spec criteria |
| `coordinated-team` | Two or more active peers truly need a shared task list or direct peer coordination | Provider-native team runtime; teammates receive scoped briefs |

The router evaluates modes in this order: `local` -> compatible `resume` -> compatible inherited mode -> `fresh-capsule` -> `coordinated-team`. A team is not the default merely because the runtime supports one. Unsupported modes degrade to `fresh-capsule`; adapters MUST NOT fabricate provider features.

### Routing evidence

The coordinator records these inputs before non-trivial delegation:

- task ID, NodeID or named microtask, phase, role, and explicit owned files;
- dependency readiness and whether the work blocks the coordinator;
- coupling (`tight|moderate|independent`) and expected context reuse (`high|medium|low`);
- sensitivity (`normal|restricted|isolated`) and reviewer independence requirement;
- estimated capsule size, inherited-context size when observable, expected output size, and latency priority;
- compatible lineage candidate, invalidation result, selected mode, and a short reason code.

Deterministic reason codes are `LOCAL_CHEAPER`, `BLOCKING`, `NESTING_LIMIT`, `WRITER_OWNERSHIP_CONFLICT`, `RESUME_COMPATIBLE`, `HIGH_CONTEXT_AFFINITY`, `BOUNDED_RECENT_CONTEXT`, `INDEPENDENT_CAPSULE`, `SENSITIVITY_ISOLATION`, `REVIEW_INDEPENDENCE`, `TEAM_COORDINATION_REQUIRED`, and `CAPABILITY_FALLBACK`. An ownership conflict resolves to serialized local execution after the active owner yields; it never creates another writer for the same path. At or above the nesting limit, work resolves locally and no additional capsule worker or team may be created.

### Context capsule schema

Capsules are short, deterministic, and sufficient for cold recovery. They MUST contain:

```yaml
schema: knowzcode.context-capsule/v1
task_id: string
workgroup_id: string
phase: 1A|1B|2A|2B|3
objective: string
node_ids: [string]
owned_files: [path]
read_files: [path]
specs:
  - path: path
    verify_ids: [string]
approved_decisions: [string]
checkpoint_sha: string|null
failures:
  - command: string
    summary: string
    artifact: path|null
risks: [string]
constraints: [string]
next_action: string
```

Capsules contain summaries and artifact pointers, not raw unbounded logs, full chat transcripts, credentials, or ambient tool output. A stable canonical serialization is hashed as `capsule_hash`.

### Agent lineage and compatibility

Each reusable worker/session has a lineage record:

```yaml
schema: knowzcode.agent-lineage/v1
lineage_id: string
workgroup_id: string
platform: claude|codex|other
platform_handle: string|null
parent_lineage_id: string|null
role: string
scope: string
phase: 1A|1B|2A|2B|3
fix_loop_id: string|null
mode: local|resume|inherit-full|inherit-recent|fresh-capsule|coordinated-team
model: string|null
effort: string|null
tools_hash: string
permissions_hash: string
runtime_prefix_hash: string
spec_hash: string
scope_hash: string
checkpoint_sha: string|null
capsule_hash: string|null
sensitivity: normal|restricted|isolated
created_at: RFC3339
last_used_at: RFC3339
resumable: boolean
lease_expires_at: RFC3339|null
```

Resume or inheritance is rejected when the WorkGroup, phase/fix loop, spec, scope, checkpoint, model/cache-key/runtime-prefix requirements, tools, permissions, or sensitivity are incompatible. A changed capsule on an otherwise compatible lineage requires reconciliation before reuse rather than silently becoming hot. A worker with unknown provenance is cold-started. An independent reviewer MUST NOT inherit or resume the builder's reasoning lineage. Default nesting depth is at most two. Before local, resumed, inherited, or team write execution begins, the coordinator checks all active writer ownership; no two active writers may own overlapping files.

### Leases, fan-out, and budgets

- At most two active inherited or resumed writer contexts exist by default. Additional read-only discovery requires independently useful scopes.
- Warm contexts live only for the current phase or bounded audit/fix loop. They are released when their lease expires, their scope completes, or any compatibility hash changes.
- Stage 0 begins with deterministic local repository indexing and one analyst. Add scanners only for independent slices or material uncertainty. Add an architect after the Change Set unless architecture ambiguity prevents it. Add knowledge, security, test, design, or compliance specialists only when the scope and active controls require them.
- `quality`, `balanced`, `economy`, and `latency` profiles tune fan-out, inheritance thresholds, and model choices. Profile changes MUST be recorded separately from routing experiments so cost changes are attributable.
- Provider-specific cost controls MAY cap money, input, output, duration, or turns. Hitting a safety/authentication boundary pauses; hitting a soft efficiency budget checkpoints and falls back to a smaller mode.

### Progressive loading and bounded output

- Skill frontmatter advertises routing triggers; the skill body contains the critical path; detailed platform, role, quality, relay, and schema guidance lives in references loaded only when the chosen path needs it.
- Repeated normative blocks have one canonical owner and generated or linked consumers. Prompt bodies MUST NOT duplicate entire framework documents.
- Search, test, and audit results return a bounded summary plus an artifact path for raw output. Raw logs do not enter every follow-up prompt.
- Disk handoffs are required when work crosses agents/phases, may be resumed after compaction, or produces material evidence. Tiny read-only side checks may return a bounded structured result directly.
- A strict read-only or write-prohibited task returns an ephemeral bounded result. It MUST NOT create an audit log, handoff, artifact, WorkGroup mutation, settings change, or vault capture unless the user separately authorizes persistence.
- MCP health probes have a configurable time-to-live. A healthy result is reused within the TTL; a failure may be retried at a later phase boundary. Agents do not independently repeat the same baseline query without a documented freshness or scope reason.
- Knowledge writes use a local delta journal. Empty and exact semantic-content duplicates are skipped. Reusing a stable semantic/supersession identity with changed content resolves to amend/update, never skip. Related phase changes are batched through one resumed writer or one gate/finalization write.

### Verification strategy

- During a Red-Green-Refactor loop, run the narrowest deterministic test that proves the assigned criterion.
- At microtask completion, run the affected package or surface checks.
- Before Gate 3, and after production changes made during an audit/fix round, run the consolidated full test suite, static analysis, build, packaging, and install smoke checks that exist for the repository.
- Full-suite failure logs are stored as artifacts; follow-up workers receive failure summaries and paths rather than the entire output.

### Measurement and rollout

Telemetry has three separate namespaces:

| Namespace | Required measures |
|---|---|
| Logical consumption | estimated context occupancy, compaction count, repeated file reads, prompt bytes, tool-output bytes, capsule bytes |
| Billed consumption | uncached input, cache creation input, cache-read input, output, provider-reported dollars or subscription units |
| Outcomes | accepted WorkGroup, VERIFY criteria passed/total, audit score, rework rounds, escaped high/critical findings, elapsed time |

Records use schema `knowzcode.efficiency-event/v1`, contain no prompt bodies, credentials, provider/session identifiers, filesystem paths, repository names/URLs, emails, account identifiers, or other unbounded high-cardinality labels, and identify provider/runtime/model/profile/mode/reason code plus a bounded anonymous task-corpus ID. Labels use explicit allowlists or bounded pseudonymous values. If a provider does not expose a billed field, record `null` and the accounting source; never infer billed savings from logical occupancy alone.

Evaluation uses a fixed, executable corpus of at least 40 distinct tasks: at least eight each for small/Tier-2, backend, UI/integration, security-sensitive, and recovery/invalidation work. Each case has a unique self-contained input, an expected routing/recovery oracle, and a case-specific paired baseline/candidate outcome record or a runnable adapter for producing it. Synthetic fixtures validate the evaluator but are explicitly non-empirical and cannot promote a live rollout. Run real paired baselines, then observe-only routing, shadow recommendations, and 10%/25%/50% canaries. Change one intervention family at a time. The rollout selector and promotion evaluator are executable package/runtime behavior, not documentation-only configuration.

Promotion targets are:

- median billed cost reduction >=25% with a 30% target;
- p75 billed cost reduction >=15%;
- p95 billed cost no more than 10% worse;
- median wall time reduction >=15%;
- accepted quality no worse than two percentage points;
- rework no worse than 5% relative;
- no new high/critical security escape;
- telemetry counters reconcile with provider totals within 2% where totals exist.

Marketing and status output describe lower billed cost, rediscovery, and latency. They MUST NOT claim cached input removes logical context tokens.

## Interfaces

Shared orchestration configuration adds:

```yaml
context_efficiency:
  enabled: true
  rollout: off            # off|observe|shadow|canary|on; opt into measurement stages deliberately
  profile: balanced       # quality|balanced|economy|latency
  max_active_inherited: 2
  max_nesting_depth: 2
  warm_lease_minutes: 20
  mcp_health_ttl_minutes: 15
  disk_handoff_threshold: material
  telemetry: local        # off|local|provider
  canary_percent: 10
```

Portable adapter operations are semantic, not hard-coded tool names:

- `spawn(scope, capsule, inheritancePreference)`
- `resume(lineage, deltaCapsule)`
- `sendFollowup(lineage, deltaCapsule)`
- `wait(lineages, cursor, timeout)`
- `interrupt(lineage)`
- `release(lineage)`
- `formTeam(scopes)` only when a provider exposes real team coordination

Adapters detect the currently callable primitive and map it to these operations. Durable guidance names concrete APIs only in a version-qualified compatibility section.

The shipped `knowzcode/context_efficiency_runtime.mjs` also exposes a bounded stdin/stdout adapter for route, lineage, capsule, telemetry, rollout, result-policy, vault-delta, and combined dispatch decisions. Installed skills call that adapter when context efficiency is enabled. Optimizer capability fallback may degrade routing, but capsule privacy, lineage compatibility, reviewer isolation, write-prohibition, and promotion-provenance checks fail closed.

## Verification Criteria

- VERIFY CEO-01: every non-trivial delegated microtask resolves one documented dispatch mode and reason code, or records `CAPABILITY_FALLBACK`.
- VERIFY CEO-02: classification and spec reuse resolve before team creation, discretionary spawn, or broad vault queries; the router then prefers local work and compatible resume before a new inherited or capsule worker.
- VERIFY CEO-03: one fail-closed capsule pipeline validates against `knowzcode.context-capsule/v1`, rejects raw transcripts/prompts/logs, provider/session identifiers, and secret-like fields or values before sealing, preserves mandatory content during overflow, and produces a stable hash.
- VERIFY CEO-04: lineage invalidates resume/inheritance on incompatible WorkGroup, phase/fix loop, spec, scope, checkpoint, tools, permissions, model/runtime-prefix/cache requirements, or sensitivity; a changed compatible capsule requires reconciliation.
- VERIFY CEO-05: an independent reviewer never reuses the builder lineage.
- VERIFY CEO-06: defaults enforce at most two active inherited writers, nesting depth two with no delegation at/above the limit, phase/fix-loop leases, and a global pre-dispatch zero-overlap check across local, resumed, inherited, and team writers.
- VERIFY CEO-07: unsupported provider modes degrade to a capsule without fabricating teams, mailboxes, conversation forks, or peer messaging.
- VERIFY CEO-08: skill startup uses progressive references and does not require every platform/relay/role document on an unused path.
- VERIFY CEO-09: raw logs are artifact-backed and follow-up prompts receive bounded summaries; material cross-agent work still has a recoverable handoff, while strict write-prohibited work creates no log, handoff, artifact, settings mutation, or vault write.
- VERIFY CEO-10: targeted checks run inside fix loops and consolidated tests/static/build/package/install checks run before Gate 3 and after production audit fixes.
- VERIFY CEO-11: MCP probes respect a TTL and vault captures use a delta journal with stable semantic/supersession identities that skips empty or exact-content duplicate writes, amends changed content under the same identity, and batches related entries.
- VERIFY CEO-12: efficiency events keep logical, billed, and outcome measures separate and reject prompt bodies, credentials, provider/session IDs, paths, repository-identifying content, account identifiers, and unapproved high-cardinality labels.
- VERIFY CEO-13: the executable 40+ task paired evaluation includes distinct self-contained recovery/invalidation cases and unique paired records, synthetic fixtures cannot authorize promotion, rollout selection is deterministic, and promotion gates enforce the specified cost, latency, quality, rework, security, and reconciliation thresholds.
- VERIFY CEO-14: documentation makes no blanket token-removal claim and describes cache reads as billing/context-reuse behavior.

### Hardening addendum

- VERIFY CEO-15: combined dispatch derives executable rollout selection only from the router result, evaluates lineage before permitting resume, and rejects missing recommendations for executing rollout stages.
- VERIFY CEO-16: inheritance and team fan-out require explicit safety, closed sensitivity, and budget approval; every declared/inferred writer and team writer scope provides at least one canonical repository-relative owned path, and alias/containment overlap is serialized.
- VERIFY CEO-17: capsule artifact references stay beneath the runtime-owned artifact boundary, evidence externalization additionally requires an explicit authorized root, and the complete transformed capsule is privacy-checked immediately before sealing; all time inputs use strict RFC3339 validation.
- VERIFY CEO-18: material or writer work cannot request away its recoverable handoff, while large raw output independently requires authorized artifact persistence.
- VERIFY CEO-19: billed telemetry requires an authoritative accounting source, and promotion accepts only bounded, uniquely identified pairs with complete provider accounting bound to a fresh, replay-checked signed v2 envelope matching the expected candidate version, corpus version, runtime digest, and exact corpus digest.
- VERIFY CEO-20: severity is normalized against a closed vocabulary, and amend/update fails closed unless exactly one prior record has a stable mutation identifier—including a directly superseded `KnowledgeId`—that is returned to the caller.
- VERIFY CEO-21: every capsule file/spec/artifact reference is a portable repository-relative path, resolved writer paths count toward inheritance caps, and combined dispatch rejects conflicting role/sensitivity facts instead of weakening isolation.

## Debt & Gaps

- Provider billing fields and cache TTLs vary; adapters report capability and accounting source rather than forcing false parity.
- A deterministic repository index may initially be an inventory/hash artifact rather than an AST index. Building an in-house parser is out of scope.
- `inherit-recent` is an optional semantic mode. Providers without bounded inheritance use `fresh-capsule`.
- The first release supplies the contract, config, routing guidance, validators, and evaluation protocol. A production analytics backend is not required; local redacted events are sufficient for observe/shadow validation.

## As-Built Verification

- Shipped the canonical no-write runtime, three versioned schemas, exact plugin mirrors, and executable route, lineage, capsule, telemetry, rollout, result-policy, vault-delta, and combined-dispatch operations.
- Routing and inheritance fail closed on ambiguous ownership, missing safety/budget facts, incompatible lineage, private capsule content, invalid timestamps, unauthorized artifacts, and conflicting isolation facts. Material/writer results cannot discard their recoverable handoff.
- Promotion is fail closed: exact measured provenance, at least 40 unique pairs with eight in every mandatory stratum, complete provider accounting, a version/digest-bound signed envelope, replay protection, fixed freshness bounds, and non-weakenable cost, latency, quality, rework, security, and reconciliation gates.
- All 21 criteria are covered by the 32-test executable contract suite and integrated platform validator; canonical/plugin runtime and schema mirrors are byte-identical after synchronization.
