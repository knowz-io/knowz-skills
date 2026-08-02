# KnowzCode Context-Efficiency Contract

**Purpose:** Portable routing, context capsule, lineage, output, verification, and measurement rules for KnowzCode adapters. Load this file only when a workflow is eligible for delegation, resume, context inheritance, or efficiency telemetry.

## 1. Route by context affinity

Resolve one mode for each non-trivial unit, in this order:

| Mode | Decision |
|---|---|
| `local` | Coordinator work is cheaper, blocking, or tightly coupled. |
| `resume` | A compatible lineage already owns the role and scope. |
| `inherit-full` | A new worker needs most parent reasoning and real provider inheritance is callable. |
| `inherit-recent` | Only the recent decision/failure window is useful and bounded inheritance is callable. |
| `fresh-capsule` | Work is independent, noisy, security-narrow, cheaper to brief, or inheritance is incompatible. |
| `coordinated-team` | Multiple active peers genuinely need a shared task list or peer communication. |

Unsupported modes fall back to `fresh-capsule`; never simulate a provider feature. Record a reason: `LOCAL_CHEAPER`, `BLOCKING`, `RESUME_COMPATIBLE`, `HIGH_CONTEXT_AFFINITY`, `BOUNDED_RECENT_CONTEXT`, `INDEPENDENT_CAPSULE`, `SENSITIVITY_ISOLATION`, `REVIEW_INDEPENDENCE`, `TEAM_COORDINATION_REQUIRED`, `WRITER_OWNERSHIP_CONFLICT`, `NESTING_LIMIT`, or `CAPABILITY_FALLBACK`. An ownership conflict or exhausted nesting depth selects `local` serialized execution and creates no new worker.

Before delegation, record task/NodeID, phase, role, owned files, dependency readiness, coupling, sensitivity, reviewer-independence requirement, expected context reuse, compatible lineage, mode, and reason.

Every declared or inferred writer must provide at least one repository-relative owned path before routing; missing scope fails with `WRITER_SCOPE_REQUIRED`. Team routing additionally requires affirmative `safe`, `sensitivity_approved`, and `within_budget` facts, a closed `normal` sensitivity classification, non-overlapping scopes, and provider support.

## 2. Context capsule

Use a canonical serialization and hash it as `capsule_hash`:

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

Capsules contain bounded summaries and artifact paths. Do not include a raw/full/verbatim chat, prompt, transcript, log, tool output, credentials, secrets, provider/session/thread/agent/run identifiers, or ambient tool output. The shipped pipeline validates length and schema, rejects private markers and values before sealing, preserves mandatory fields on overflow, and hashes canonical JSON. Evidence externalization requires both `artifact_path` and an explicit `artifact_roots` authorization rooted beneath the runtime-owned `knowzcode/artifacts` boundary; a request cannot self-authorize arbitrary repository paths.

## 3. Agent lineage and leases

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
runtime_prefix_hash: sha256
baseline_hash: sha256|null
tools_hash: string
permissions_hash: string
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

Reject blind resume or inheritance when WorkGroup, role, phase/fix loop, scope, spec, checkpoint, model/runtime-prefix/cache requirements, baseline, tools, permissions, or sensitivity differ. A capsule hash change within an otherwise compatible stable lineage requires reconciliation rather than automatic invalidation. Reconcile unexpected repository changes before reuse. An independent reviewer MUST start fresh from approved specs and diff evidence; it must not inherit the builder's reasoning. The same reviewer may resume its own bounded re-audit.

Defaults: at most two active inherited writers, nesting depth at most two, and zero overlapping writer ownership. A completed first dispatch may remain warm for a likely same-phase fix/re-audit. A null lease is valid cold provenance but never authorizes a hot resume. Evict at lease expiry, final gate, incompatibility, sensitivity transition, capacity pressure, or when no likely continuation remains.

## 4. Output policy

Choose one result mode:

- `ephemeral`: bounded structured result for a small read-only side check. No file write. Mandatory when the user/audit scope prohibits writes.
- `durable`: WorkGroup handoff for writers, partial or multi-turn work, interruption recovery, phase evidence, or explicit durable-state requests.
- `artifact`: authorized file for large logs/evidence; return only digest, failure delta, and path.

Only coordinator-consolidated WorkGroup state advances phases or approvals. Ephemeral results are evidence, not durable gate state.

`resolveResultPolicy` in `knowzcode/context_efficiency_runtime.mjs` is authoritative for adapters. `write_prohibited: true` always resolves to `ephemeral` with handoff, artifact, vault, settings, and WorkGroup writes all false, even if the caller requests or authorizes another mode.

## 5. Progressive context loading

The selected skill body keeps phase ordering, autonomy/approval gates, TDD, ownership, security/compliance master switches, relay safety, independent audit, and final verification. Load other material conditionally:

- active WorkGroup or capsule and current phase contract first;
- project/architecture only for relevant decisions;
- execution guide only if delegation is eligible;
- relay reference only after a relay target resolves;
- compliance material only when compliance is enabled or the user supplies an explicit source;
- handoff schema only for `durable` output;
- raw logs only from an artifact when the summary cannot resolve the failure.

Avoid repeating normative blocks across prompts. A canonical file owns the rule; adapters link or generate consumers.

## 6. Fan-out, tests, MCP, and vaults

- Start Stage 0 with a deterministic repository inventory and one analyst. Add scanners only for independent slices or material unknowns; add an architect after the Change Set unless ambiguity blocks it; add specialists only for relevant risk.
- Run the narrowest deterministic test inside a Red-Green-Refactor loop and affected-package checks at microtask completion.
- Run the consolidated full suite, static analysis, build, packaging, and install smoke checks before Gate 3 and again after production changes in an audit/fix round.
- Cache MCP health for `mcp_health_ttl_minutes`. Retry at a phase boundary after failure; do not repeat identical baseline calls from every worker.
- Maintain a local knowledge delta. Skip empty or exact semantic-content duplicates. A stable `semantic_key` with changed content resolves to amend; changed content for the same supersession target resolves to update. Never discard changed knowledge as a duplicate. Batch unrelated normal phase writes through one resumed writer or gate/finalization call.

## 7. Telemetry and rollout

Efficiency event schema: `knowzcode.efficiency-event/v1`.

- `logical`: context occupancy estimate, compactions, repeated reads, prompt bytes, tool-output bytes, capsule bytes.
- `billed`: uncached input, cache creation input, cache-read input, output, provider-reported dollars/subscription units.
- `outcome`: accepted WorkGroup, VERIFY passed/total, audit score, rework, escaped high/critical findings, elapsed time.

Record finite allowlisted provider/runtime/model/profile/mode/reason labels or an `anon-model-<digest>` model pseudonym, an explicit accounting source, and an anonymous fixed-corpus or `anon-<digest>` ID. Do not record prompt bodies, credentials, paths, URLs, emails/account identifiers, provider/session IDs, repository-like labels, or repository-identifying content. Unknown billed fields are `null`; logical reduction is not billed savings.

Roll out as `off -> observe -> shadow -> 10% -> 25% -> 50% -> on`. Use the executable selector and promotion evaluator in `knowzcode/context_efficiency_runtime.mjs`. A configured stage is not active unless the adapter calls the selector and records the required redacted event. Use a paired corpus of at least 40 tasks with at least eight each for small/Tier-2, backend, UI/integration, security-sensitive, and recovery/invalidation work. The repository corpus and paired records are explicitly fixture-only contract tests: they are not empirical savings evidence and cannot authorize promotion. Production promotion requires measured paired records from the target environment. Change one intervention family at a time.

Promotion requires at least 40 paired records, at least eight explicitly labeled records in each required stratum, and exact measured provenance (`kind: measured`, `empirical: true`, `promotion_authorized: true`) on every pair. A trusted signed v2 measurement envelope must match the expected candidate version, corpus version, runtime digest, and exact pair digest, be no older than 30 days or more than five minutes in the future, and have a run ID absent from the coordinator's consumed-run ledger. Every pair must include provider-reported and event-accounted totals, reconciled within 2%. Sample-size, stratum-balance, provenance, freshness/replay, and reconciliation gates are independent, so undersized, unbalanced, synthetic, stale, replayed, incompletely accounted, relabeled-fixture, or mixed evidence cannot promote even when its metrics pass. Numeric thresholds are median billed cost -25% (target -30%), p75 -15%, p95 no more than +10%, median wall time -15%, quality no worse than two percentage points, rework no worse than 5% relative, and no new high/critical security escape. Evaluator callers may request stricter gates but cannot weaken any published floor, ceiling, mandatory stratum, or sample minimum.

Report lower billed cost, rediscovery, and latency. Cached input may cost less while still occupying logical context; never claim blanket token removal.

## 8. Shipped no-write runtime adapter

Installed skills can invoke the production runtime without writing files:

```text
node knowzcode/context_efficiency_runtime.mjs <operation>
```

Send exactly one JSON object, capped while reading at one MiB, on stdin. Operations are `route`, `lineage`, `capsule`, `telemetry`, `rollout`, `result-policy`, `vault-delta`, and `dispatch`. The capsule operation accepts `{capsule,max_bytes?,artifact_path?,artifact_roots?}`. `vault-delta` accepts `{input:{delta,previous_deltas?,previous_hashes?,explicit_save?,interruption_sensitive?,severity?}}` and returns `skip`, `amend`, `update`, `batch`, or `flush`; the coordinator performs any authorized persistence after that no-write decision. Success emits one `{ "ok": true, "operation": ..., "result": ... }` object. Validation or privacy failure exits nonzero and emits one redacted `{ "ok": false, "code": ..., "message": ... }` object. The adapter reads stdin and writes stdout only; it never persists state.
