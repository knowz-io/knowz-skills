# Shared Efficiency Discovery Handoff

**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`
**Scope:** Provider-neutral ContextEfficientOrchestration policy
**Status:** Complete — Phase 1A/1B discovery input
**Ownership:** Shared contract only; Claude and Codex adapters remain separate owned scopes

## Executive Decision

Implement a shared **context-affinity dispatcher** whose portable choices are
`local | resume | inherit | fresh | team`. Keep provider caching and opaque
session IDs behind adapters. Ship the dispatcher in `shadow` mode first, then
promote `adaptive` only after the evaluation gates below pass.

The product claim must be **lower billed cost, rediscovery, and latency without
lowering acceptance quality**. Cached/inherited tokens still occupy context and
must not be described as removed logical tokens.

The shared contract should separate:

1. An immutable, durable context capsule sufficient for a cold recovery.
2. Semantic lineage and invalidation, which decide whether continuity is safe.
3. An ephemeral provider lease, which estimates cache/session availability but
   is never durable project truth.
4. Logical, billed, and outcome telemetry, with unknown values represented as
   `null`, never inferred as zero.

## Evidence and Highest-Value Gaps

| Priority | Evidence | Consequence | Shared correction |
|---|---|---|---|
| P0 | Execution mode/team creation occurs at `work/SKILL.md:104-142`, while complexity classification does not occur until `:438-469`. | A team can be created before learning that work is Tier 1 or Tier 2. | Move deterministic intent/complexity/spec-reuse classification before runtime creation and discretionary external work. |
| P0 | Core context and vault work run at `work/SKILL.md:345-400`, before complexity classification and spec quick-path detection at `:505-515`. | Micro/light/existing-spec work can pay broad context and vault cost before routing. | Route first; load/query only the context demanded by the chosen path. |
| P0 | Tier 2 always starts a liaison and builder (`light-workflow.md:17-26`, `:63-69`), and can perform liaison plus direct completion capture (`:87-121`). | Fixed orchestration and duplicate vault overhead dominate small changes. | Tier 2 defaults to coordinator + builder; liaison is conditional; exactly one completion capture path. |
| P0 | Full Stage 0 starts 3-10 agents before scope is settled (`parallel-orchestration.md:34-71`). | Cache discounts cannot remove duplicated outputs, scans, and speculative work. | Start with deterministic indexing + one analyst; evidence-gate every extra worker. |
| P0 | Sequential/subagent gap loops respawn builder/reviewer (`quality-gates.md:208-214`) while parallel mode preserves them (`:172-187`). | The most valuable scope/evidence context is repeatedly reconstructed. | Resume a compatible builder for fixes and reviewer for re-audits; cold capsule fallback if invalid. |
| P0 | Verification can restart full test/static/build up to ten times (`knowzcode_loop.md:127-161`). | Repeated compute and raw tool output can consume more than the code reasoning. | Targeted TDD checks, artifact-backed failure deltas, one mandatory final full regression boundary. |
| P1 | Gate capture is mandatory at Gate 1, Gate 2, Phase 2A, Gate 3, and Phase 3 (`quality-gates.md:47-118`, `:216-225`, `:244-261`). | Up to five cold writer turns can repeatedly summarize unchanged material. | Append-only local delta journal; no writer for empty deltas; one resumable writer/batch with immediate high-risk flush rules. |
| P1 | Liaison is unconditional and can dispatch a reader per vault while rereading local context (`knowledge-liaison.md:23-70`). | Broad lead query + deep liaison query + duplicate local reads. | Liaison only for relevant vault/pending/history needs; deep queries require a named unresolved question. |
| P1 | `frontier` is the premium default (`profile-models.md:9-42`; `knowzcode_orchestration.md:51-93`). | Model savings would confound topology/cache experiments. | Keep optimization objective orthogonal to explicit provider profile; evaluate model routing separately. |
| P1 | There is no native usage ledger; relay intentionally excludes account/cost metadata (`relay_execution.md:250-291`, `:586-596`). | Savings cannot be proved or tuned. | Local, redacted telemetry with provider-native authoritative/estimated provenance. |
| P2 | Role prompts reread overlapping execution/methodology/project material (`context-token-efficiency/knowzcode-local.md:15-19`). | Stable instructions are paid repeatedly and dynamic text can disrupt cache prefixes. | Short versioned runtime contract plus progressive/on-demand references and bounded deltas. |

## Provider-Neutral Configuration

Add an `efficiency` block to `knowzcode_orchestration.md`. Explicit invocation
flags win over this block; this block wins over defaults. Existing `profile`,
`--subagent`, `--sequential`, relay, security, compliance, and owned-file rules
remain authoritative. `objective` must not silently override an explicit model
profile.

```yaml
efficiency:
  schema: 1
  dispatcher: shadow        # legacy | shadow | adaptive
  objective: balanced       # quality | balanced | cost | latency
  context_policy: auto      # off | auto | force-fresh
  resume_workers: true
  team_policy: explicit     # off | explicit | auto
  max_active_workers: 3
  max_inherited_workers: 2
  max_capsule_bytes: 12288
  max_result_bytes: 16384
  context_rollover_ratio: 0.65
  mcp_probe_ttl_seconds: 300
  telemetry: local          # off | local
```

Mode semantics:

| Objective | Active workers | Team behavior | Model behavior | Safety |
|---|---:|---|---|---|
| `quality` | max 4 | Evidence-gated; extra independent audit allowed | Honor explicit/current quality profile | Identical mandatory gates |
| `balanced` | max 3 | Explicit coordination need; candidate future default | Provider default/explicit profile | Identical mandatory gates |
| `cost` | max 2 | Never automatic | Prefer cheaper routine worker only when adapter/profile permits; escalation retained | Identical mandatory gates |
| `latency` | max 5 | Automatic only after latency/cost guard passes | Explicit profile wins | No overlapping writers; identical gates |

`shadow` records the decision the dispatcher would make but executes the legacy
path. `adaptive` executes the selected path. Until promotion gates pass, new
installs should use `shadow`; an explicit user flag may opt into `adaptive`.

## Capability Snapshot

Each adapter supplies, once per WorkGroup and again only after a capability
error, a snapshot with nullable values:

```json
{
  "schema": "knowzcode.capabilities/v1",
  "provider": "claude|codex|other",
  "adapter_version": "string",
  "supports_resume": true,
  "supports_inherit": true,
  "supports_peer_team": false,
  "supports_usage": true,
  "supports_cache_usage": false,
  "supports_context_occupancy": false,
  "max_active_workers": 4,
  "cache_ttl_seconds": null,
  "resume_retention_seconds": null
}
```

Do not treat a copied conversation as proof of a cache hit. Do not probe the
provider repeatedly when the cached snapshot remains valid; invalidate it on a
runtime capability error, provider/version change, auth change, or tool-surface
change.

## Deterministic Dispatch Policy

Every dispatch records one decision plus reason codes. Apply these rules in
order:

1. **Safety/isolation first.** Independent audit, sensitivity mismatch,
   narrower-permission need, model/tool-boundary change, or reviewer exposure to
   builder reasoning forbids `inherit`. Independent reviewers use `fresh` from
   the approved-spec capsule; the same clean reviewer lineage may later
   `resume` for re-audit.
2. **Local coordination.** Gate presentation, task routing, deterministic
   parsing/filtering, and small metadata updates remain `local` when delegation
   would not isolate material tool output or parallelize useful work. Local work
   never bypasses delegate-mode write restrictions.
3. **Resume compatible lineage.** Prefer `resume` for architect revisions,
   builder fixes/next microtasks in the same ownership domain, reviewer
   re-audits, and the same writer consuming another delta. `HOT` is a cost
   advantage; `COLD_VALID` is semantic continuity only and must be cost-compared
   with `fresh` when estimates exist.
4. **Team only for coordination.** Consider `team` before ordinary fan-out only
   when at least two disjoint workers require peer messages/shared task state,
   predicted elapsed time is at most 75% of sequential execution, incremental
   spend fits the remaining budget, and write ownership is disjoint. Otherwise
   use independent workers or sequential waves.
5. **Inherited context narrowly.** Select `inherit` only when the task depends
   on material active-conversation facts not represented in a valid capsule,
   sensitivity/tools are compatible, the parent occupancy is below 65% when
   observable, the inherited-worker cap is available, and either (a) estimated
   total cost is at least 20% below `fresh` with medium/high confidence or (b)
   no sufficient cold capsule can be constructed. Never inherit a late
   builder-influenced context into independent review.
6. **Fresh capsule default.** Use `fresh` for self-contained work, verbose
   searches/logs, cheaper/narrower model/tool needs, a new ownership domain, or
   any invalid lineage. If no provider feature is available, `fresh` is the
   universal fallback.
7. **No useful child.** If none of the above adds value, execute the phase
   sequentially and do not spawn merely to fill capacity.

Required decision reason codes:

`COORDINATOR_OWNED`, `COMPATIBLE_LINEAGE`, `COLD_VALID_REUSE`,
`CONVERSATION_ONLY_CONTEXT`, `CAPSULE_SUFFICIENT`, `INDEPENDENT_AUDIT`,
`SENSITIVITY_BOUNDARY`, `MODEL_OR_TOOL_BOUNDARY`, `PEER_COORDINATION`,
`LATENCY_THRESHOLD`, `BUDGET_LIMIT`, `CAPABILITY_FALLBACK`,
`LINEAGE_INVALID`, `NO_PARALLEL_VALUE`.

## Context Capsule Schema

The portable cold-start artifact is canonical JSON (or a Markdown rendering of
the same fields) and contains decisions/evidence, never hidden chain-of-thought.

```json
{
  "schema": "knowzcode.context-capsule/v1",
  "workgroup_id": "string",
  "objective": "string",
  "phase": "1A|1B|2A|2B|3",
  "scope_id": "string",
  "role": "string",
  "baseline": {
    "checkpoint_sha": "string|null",
    "spec_digests": [{"path": "string", "sha256": "hex"}],
    "criteria": [{"id": "string", "text": "string"}],
    "owned_paths": ["string"]
  },
  "decisions": [{"id": "string", "statement": "string", "rationale": "string", "source": "path-or-gate"}],
  "evidence": [{"kind": "file|test|log|vault|user", "path": "string", "sha256": "hex|null", "selector": "string|null"}],
  "changes": {"paths": ["string"], "summary": "string"},
  "verification": [{"command_id": "string", "status": "pass|fail|not-run", "exit_code": 0, "artifact": "string|null", "signature": "string|null"}],
  "open_questions": ["string"],
  "risks": ["string"],
  "next_action": "string",
  "sensitivity": "public|internal|restricted",
  "capsule_digest": "sha256:<hex>",
  "generated_at": "RFC3339"
}
```

Canonicalization rules:

- UTF-8 JSON, recursively sorted object keys, array order preserved where order
  is semantic, LF endings, no insignificant whitespace.
- `capsule_digest` and `generated_at` are excluded from the digest input so a
  timestamp cannot change semantic identity.
- Objective, exact criterion text, permissions/sensitivity, open blockers, and
  next action are never truncated.
- If the configured byte limit is exceeded, move verbose evidence and passing
  verification details to content-addressed artifact paths, then recalculate.
  Fail capsule construction rather than silently dropping mandatory fields.
- A dispatch delta contains only changed criteria/decisions/checkpoint/evidence
  since the referenced capsule digest.

## Lineage, Lease, and Invalidation

Maintain two records:

### Durable semantic lineage

```json
{
  "schema": "knowzcode.lineage/v1",
  "lineage_id": "opaque-local-id",
  "parent_lineage_hash": "sha256-or-null",
  "workgroup_id": "string",
  "role": "string",
  "scope_id": "string",
  "context_mode": "local|resume|inherit|fresh|team",
  "baseline_capsule_digest": "sha256:<hex>",
  "authority_fingerprint": "sha256:<hex>",
  "last_checkpoint_sha": "string|null",
  "last_task_id": "string|null",
  "state": "HOT|COLD_VALID|RECONCILE_REQUIRED|INVALID",
  "reuse_count": 0,
  "invalidations": [{"code": "string", "observed_at": "RFC3339"}]
}
```

`authority_fingerprint` hashes canonical role, scope, owned paths, permission
boundary, tool boundary, model, effort, sensitivity, adapter version, spec
digests, and criterion IDs/text. It does not include volatile timestamps.

### Ephemeral provider lease

Store raw provider session/agent/thread identifiers only in local runtime state,
not telemetry, specs, logs, or user-facing reports:

```json
{
  "schema": "knowzcode.provider-lease/v1",
  "lineage_id": "opaque-local-id",
  "provider_ref": "opaque-provider-id",
  "created_at": "RFC3339",
  "last_used_at": "RFC3339",
  "cache_hot_until": null,
  "resume_until": null,
  "context_occupancy_ratio": null,
  "turn_count": 0
}
```

State transitions:

- `HOT -> COLD_VALID` when cache TTL is exceeded/unknown. Time alone does not
  invalidate semantic continuity.
- `HOT|COLD_VALID -> RECONCILE_REQUIRED` when the checkpoint advances, an owned
  or dependency path changes, normative spec/criteria change, or provider cache
  compatibility changes. Resume only after changed-path/spec reconciliation and
  an acknowledgement of the new digest.
- `* -> INVALID` on role/scope reassignment, incompatible permissions,
  sensitivity or tool boundary, model/effort change that the provider cannot
  resume safely, non-ancestor checkpoint/history rewrite, unavailable provider
  transcript, adapter schema incompatibility, contamination of independent
  review with builder lineage, or two repeated correction failures indicating
  a poisoned context.
- If observable context occupancy reaches 65%, checkpoint a capsule and compare
  cold fresh execution; do not keep resuming only to preserve history.

## Budget Policy

Budgets are provider-neutral envelopes with optional dimensions:
`logical_input_tokens`, `billed_amount`, `wall_seconds`, `child_spawns`,
`active_workers`, `tool_output_bytes`, and `result_bytes`. Monetary fields must
include currency and source. No default hard dollar/token ceiling is invented
when the provider cannot report it.

Transitions for a configured WorkGroup/phase envelope:

- **70% SOFT:** stop speculative fan-out; prefer deterministic filtering and a
  compatible lease; postpone non-critical vault flush; do not alter safety.
- **90% CHECKPOINT:** admit no discretionary worker without an explicit reason;
  persist capsule/lineage and report remaining mandatory work.
- **100% HARD:** admit no new discretionary work. The current worker may finish
  an atomic safe step and persist evidence. Mandatory security/compliance,
  independent audit, and final full regression are never skipped; if they
  cannot fit, pause at a recoverable checkpoint instead of claiming success.

Hard worker defaults come from the selected objective. `max_result_bytes`
applies to the child result entering the parent, not raw artifacts on disk.

## Telemetry Contract

Store local JSONL events. Never send telemetry externally by default. Never
record prompts, source/log bodies, secrets, account/org identity, raw provider
session IDs, or raw environment/auth records.

```json
{
  "schema": "knowzcode.efficiency-event/v1",
  "event": "dispatch_decision|worker_usage|worker_completed|verification_run|vault_operation|budget_transition|gate_outcome|lineage_invalidated",
  "event_id": "opaque-local-id",
  "observed_at": "RFC3339",
  "workgroup_id": "string",
  "phase": "string",
  "scope_id": "string|null",
  "role": "string|null",
  "provider": "string",
  "adapter_version": "string",
  "context_mode": "local|resume|inherit|fresh|team|null",
  "reason_codes": ["string"],
  "lineage_hash": "sha256-or-null",
  "model": "string|null",
  "effort": "string|null",
  "logical": {
    "prompt_tokens": null,
    "context_tokens": null,
    "capsule_bytes": null,
    "tool_output_bytes": null,
    "result_bytes": null,
    "compactions": 0
  },
  "billed": {
    "uncached_input_tokens": null,
    "cache_write_tokens": null,
    "cache_read_tokens": null,
    "output_tokens": null,
    "reasoning_tokens": null,
    "amount": null,
    "currency": null,
    "source": "authoritative|provider-reported|estimated|unknown",
    "confidence": "high|medium|low|unknown"
  },
  "outcome": {
    "criteria_assigned": null,
    "criteria_passed": null,
    "audit_gaps": null,
    "highest_gap_severity": null,
    "fix_rounds": null,
    "accepted": null,
    "wall_seconds": null
  }
}
```

Unknown counters are `null`. Cross-provider reports show provider-native billed
amounts separately. Cache-read ratio is diagnostic, never a promotion metric by
itself. The primary production unit is billed consumption per accepted
WorkGroup stratified by fixed complexity; cost per criterion is used only when
the benchmark criteria were frozen before execution.

## No-Regret Consumption Reductions

These can precede adaptive routing because they preserve semantic behavior:

1. Classify tier/spec reuse before team creation, broad vault queries, or agent
   spawning.
2. Replace duplicate full-guide/role reads with one short runtime contract and
   task-specific progressive references.
3. Resume compatible builder/reviewer gap-loop roles before respawning.
4. Return bounded decisions/evidence/file lines/status; keep raw search, diff,
   and test output in artifacts.
5. Use targeted RED/GREEN tests; affected-scope checks on completion; exactly
   one consolidated full test + static + build gate before Gate 3, repeated only
   when production/integration changes occurred after the last full green run.
6. Start Stage 0 with deterministic `rg`/file/test mapping and one analyst.
   Spawn scanners only for named independent slices; delay speculative
   architecture until credible NodeIDs exist.
7. Run one relevant vault baseline, not one broad query per vault unconditionally.
   Deep query only a named unresolved question.
8. Append knowledge deltas durably; no writer for an empty/duplicate delta;
   exactly one Tier 2 completion capture.
9. Use one MCP health result for 300 seconds and retry on error; always
   revalidate immediately before privileged external writes/relay launch.
10. Keep stable instructions before volatile task IDs/timestamps/status and
    keep model/effort/tool surface stable within a phase where practical.
11. Preserve relay's concise path-referenced initial brief and same-session
    resume. Do not add Agent/fork permissions inside strict relay v1.

## Experiment and Canary Plan

### Corpus

Create a versioned manifest of at least 40 fixed scenarios, eight in each
stratum:

1. Tier 1/2 localized change: <=3 files, one NodeID.
2. Medium backend/refactor: 4-10 files, dependency wave and gap fix.
3. UI/integration: multiple layers plus smoke/runtime evidence.
4. Security/compliance: hidden HIGH/CRITICAL cases and mandatory pause behavior.
5. Recovery/invalidation: context clear, cache expiry, spec change, history
   rewrite, sensitivity mismatch, provider capability failure.

Every scenario declares repository snapshot, goal, fixed spec and exact
criteria, allowed/owned paths, hidden regression assertions, sensitivity,
expected risk, vault configured/unconfigured, repository-size class, and
expected permissible router choices. Use the same semantic scenarios for Claude
and Codex; provider adapters may choose different native mechanisms.

### Isolated experiments

1. **E0 Observe:** legacy execution + telemetry only; reconcile authoritative
   usage within 2% where counters exist.
2. **E1 Hygiene:** same models/topology; progressive prompts, bounded logs,
   deterministic filtering, resume compatible gap loops.
3. **E2 Topology:** same models; compare local/resume/inherit/fresh/team routing.
4. **E3 Models:** hold topology constant; evaluate model/effort ladder.
5. **E4 I/O:** hold prior winners constant; evaluate vault delta and targeted
   verification policy.

Do not bundle E1-E4 into one A/B; causal attribution is a release requirement.

### Promotion gates

Use paired offline runs plus live `10% -> 25% -> 50% -> 100%` canaries. Require
at least 20 accepted WorkGroups and seven days at each live step when live data
is available. Promote `adaptive` only when all hold:

- Median provider-native billed cost per accepted WorkGroup improves >=25%.
- P75 cost improves >=15%; P95 cost does not regress >10%.
- Median logical input consumption improves >=20%.
- Balanced-mode wall time is non-inferior within 5%; latency mode improves
  median wall time >=25% while staying inside its spend ceiling.
- Exact acceptance completion is non-inferior within 2 percentage points.
- Rework/gap-loop rate is non-inferior within 5% relative.
- Zero additional HIGH/CRITICAL security/compliance misses.
- Zero skipped mandatory full regression/audit gates, stale-resume corruptions,
  overlapping writer violations, or sensitive-context inheritance violations.
- The 95% bootstrap confidence interval supports the billed-cost improvement;
  if sample size is insufficient, remain in shadow/canary.

Immediate rollback triggers: any new critical/high miss, sensitive-context
boundary violation, hard-budget success claim without mandatory gates, lost
criterion during capsule overflow, or rolling P95 cost regression >20%.

## Formal Verification Criteria

These criteria should be copied verbatim into
`specs/ContextEfficientOrchestration.md` (IDs make fixtures stable):

- **VERIFY: CEO-001** — Given explicit flags, an `efficiency` config block, and defaults, resolution is deterministic with `flag > config > default`, and an explicit provider model/profile is never silently changed by `objective`.
- **VERIFY: CEO-002** — `legacy`, `shadow`, and `adaptive` dispatcher modes are accepted; `shadow` records the adaptive decision/reasons while executing the legacy route.
- **VERIFY: CEO-003** — The same normalized task/capability/lineage/budget fixture always produces the same `local|resume|inherit|fresh|team` decision and ordered reason codes.
- **VERIFY: CEO-004** — Independent review can never inherit a builder-influenced context; initial review is fresh from the approved-spec capsule, while a compatible clean reviewer may resume for re-audit.
- **VERIFY: CEO-005** — Inheritance is rejected for sensitivity, permission, model/tool boundary, occupancy, capability, inherited-worker-cap, or insufficient-savings violations and falls back to a valid fresh capsule.
- **VERIFY: CEO-006** — Team execution is selected only with >=2 disjoint peer-coordinating scopes, predicted elapsed time <=75% of sequential, sufficient budget, and non-overlapping writable files.
- **VERIFY: CEO-007** — A compatible architect, builder, reviewer, or writer lineage resumes before replacement; an incompatible lineage is rejected with a specific invalidation code.
- **VERIFY: CEO-008** — The context capsule validates as `knowzcode.context-capsule/v1`, canonicalizes reproducibly, and yields the same digest regardless of object key order or `generated_at`.
- **VERIFY: CEO-009** — Capsule overflow moves optional verbose evidence to content-addressed artifacts but never truncates objective, exact criteria, sensitivity/permissions, blockers, or next action; impossible overflow fails closed.
- **VERIFY: CEO-010** — A cold worker receiving only the capsule and referenced repository artifacts can identify its exact role, scope, criteria, owned paths, checkpoint, risks, and next action without provider session state.
- **VERIFY: CEO-011** — Lease evaluation implements `HOT`, `COLD_VALID`, `RECONCILE_REQUIRED`, and `INVALID`; TTL expiry alone yields `COLD_VALID`, not semantic invalidation.
- **VERIFY: CEO-012** — Checkpoint/spec/path changes require reconciliation, while scope/permission/sensitivity incompatibility, non-ancestor history, independent-review contamination, or poisoned repeated corrections invalidate the lineage.
- **VERIFY: CEO-013** — Raw provider session/agent/thread IDs occur only in local provider-lease state and never in telemetry, specs, logs, gate output, or saved knowledge.
- **VERIFY: CEO-014** — At 70%, 90%, and 100% budget states the documented soft/checkpoint/hard actions occur, and no state can skip security/compliance, independent audit, or the final full regression gate.
- **VERIFY: CEO-015** — Missing provider usage fields serialize as `null` with `source=unknown`; they are never recorded as zero or combined into an authoritative cross-provider dollar total.
- **VERIFY: CEO-016** — Telemetry distinguishes logical, billed, and outcome sections and rejects prompt/source/log bodies, secrets, identity metadata, and raw provider runtime identifiers.
- **VERIFY: CEO-017** — Complexity/spec-reuse classification occurs before team creation, discretionary agent spawn, and broad vault baseline queries.
- **VERIFY: CEO-018** — Default Stage 0 starts no speculative architect/scanner/liaison solely because capacity exists; every extra worker has an independent question, bounded deliverable, and activation reason.
- **VERIFY: CEO-019** — Tier 2 runs exactly one completion capture and does not spawn a liaison when no relevant vault, pending capture, history query, or explicit save requirement exists.
- **VERIFY: CEO-020** — TDD uses targeted RED/GREEN checks and artifact-backed bounded failures, while Gate 3 requires a consolidated full tests + static analysis + build result and repeats it after subsequent production/integration changes.
- **VERIFY: CEO-021** — A deep vault query requires a named unresolved question; an empty or content-hash-duplicate knowledge delta does not dispatch a writer; high-risk/interruption-sensitive deltas flush immediately.
- **VERIFY: CEO-022** — Spawn/follow-up results honor the configured byte limit and contain decisions, evidence references, changed paths, criteria status, verification status, risks, and remaining work rather than raw logs/transcripts.
- **VERIFY: CEO-023** — Stable runtime instructions are loaded once per worker lineage; task deltas do not require rereading a role definition already supplied by the runtime or a full universal execution guide.
- **VERIFY: CEO-024** — Strict relay v1 retains its current narrow tools/permissions and same-session resume but never enables nested Agent/fork behavior.
- **VERIFY: CEO-025** — E0-E4 run as isolated variable families; promotion cannot rely solely on cache-read ratio or a combined un-attributable A/B.
- **VERIFY: CEO-026** — The corpus contains >=40 fixed scenarios with >=8 per declared stratum and includes provider failure, stale lineage, sensitivity, vault, repo-size, and hidden regression cases.
- **VERIFY: CEO-027** — Adaptive promotion and rollback use the exact thresholds above, and insufficient evidence leaves the dispatcher in shadow/canary.
- **VERIFY: CEO-028** — User-facing documentation states that caching can lower billed processing/latency but does not remove logical context tokens.
- **VERIFY: CEO-029** — Generated/npm-installed and Codex-plugin shared policy/config/schema surfaces are semantically identical, while provider-native adapter mechanics may differ.
- **VERIFY: CEO-030** — Every provider feature has a capability-gated cold-capsule fallback; provider session/cache state is never required for durable WorkGroup recovery.

## File and Test Map

### Shared canonical implementation

| Priority | File | Responsibility |
|---|---|---|
| P0 | `knowzcode/knowzcode/specs/ContextEfficientOrchestration.md` | Normative rules, interfaces, CEO-001..030. |
| P0 | `knowzcode/knowzcode/context_efficiency_policy.md` (new) | Portable router, capsule, lineage, budget, telemetry, and evaluation reference; one authored source. |
| P0 | `knowzcode/knowzcode/contracts/{context-capsule,efficiency-event}.schema.json` (new) | Machine-checkable schema versions and privacy/nullability contract. |
| P0 | `knowzcode/knowzcode/knowzcode_orchestration.md` | `efficiency` config, precedence, initial shadow default, backward compatibility. |
| P0 | `knowzcode/skills/work/SKILL.md` | Reorder classification before side effects; resolve config/capabilities/router; provider-neutral flags. |
| P0 | `knowzcode/skills/work/references/parallel-orchestration.md` | Evidence-driven Stage 0, route decisions, leases, bounded results, no-overlap team gate. |
| P0 | `knowzcode/skills/work/references/quality-gates.md` | Resume-first gaps, telemetry outcomes, final full-verification invariant, budget checkpoint behavior. |
| P1 | `knowzcode/knowzcode/knowzcode_loop.md` | Provider-neutral TDD verification tiers, delta capture, durable-state invariant, shared terminology. |
| P1 | `knowzcode/skills/work/references/{light-workflow,spawn-prompts,profile-models}.md` | Conditional Tier 2 liaison/capture, progressive context/output contracts, objective/profile orthogonality. |
| P1 | `knowzcode/agents/knowledge-liaison.md` | Relevant-only activation, named deep query, resumable/delta writer, content-hash dedup. |
| P1 | `knowzcode/skills/{continue,regroup}/SKILL.md` | Restore capsule/lineage, reconcile or cold-fallback without assuming provider cache. |
| P2 | `knowzcode/knowzcode/platform_adapters.md` and generated/plugin mirrors | Package the canonical shared policy and map native adapter mechanisms without duplicate runtime loading. |

### Deterministic tests

Add `scripts/context-efficiency-contract.test.mjs` using `node:test` and fixtures
under `scripts/fixtures/context-efficiency/`:

| Fixture/test | Criteria |
|---|---|
| `router-cases.json` | CEO-001..007, 017..019, 024 |
| `capsule-valid.json`, `capsule-overflow.json`, digest golden files | CEO-008..010, 022, 030 |
| `lineage-transitions.json` | CEO-007, 011..013 |
| `budget-transitions.json` | CEO-014 |
| `telemetry-valid.json`, privacy-negative fixtures | CEO-015..016, 028 |
| `verification-cases.json` | CEO-020 |
| `vault-delta-cases.json` | CEO-019, 021 |
| `experiment-corpus/manifest.json` | CEO-025..027 |
| Contract/parity assertions in `validate-platform-surfaces.mjs` | CEO-023, 024, 028..030; source/plugin byte or semantic parity as appropriate |

Required commands after implementation:

```text
node --test scripts/context-efficiency-contract.test.mjs
node scripts/validate-platform-surfaces.mjs
node scripts/sync-codex-relay-surfaces.mjs --check   # add non-writing check mode
npm pack --dry-run                                  # from knowzcode/
```

Installer smoke tests must create temporary Claude/Codex installs and verify
the canonical policy/schemas are present once, referenced once, and semantically
equal to the plugin package. The existing validator already exercises a real
Codex adapter install (`validate-platform-surfaces.mjs:464-510`) and enforces
source/plugin core-file equality (`:444-460`); extend rather than duplicate it.

## Prioritized Ownership and Merge Order

1. **`/root` — Shared contract/spec/test harness (P0):** approve schema names,
   copy CEO criteria into the spec, create canonical policy/schemas, and land
   fixture tests first. Own `knowzcode_loop`, orchestration config, and final
   integration decisions.
2. **`/root/claude_runtime_expert` — Claude adapter (P0/P1):** map native
   resume/inherit/team/cache and permission semantics to the portable decisions;
   change Claude skills/agents only after CEO contracts are approved.
3. **`/root/codex_plugin_expert` — Codex adapter/package parity (P0/P1):** map
   warm follow-up and inherited/fresh spawn behavior, add canonical Codex source
   and npm/plugin install parity, without inventing Agent Teams.
4. **Shared workflow owner after adapter merge (P1):** reorder classification,
   Stage 0, verification, and vault flows. Avoid simultaneous edits to
   `work/SKILL.md`, `parallel-orchestration.md`, or validator scripts.
5. **Independent reviewer/security audit (P2):** validate CEO-004/005/012-016,
   relay exclusion, privacy, and all rollback triggers against consolidated
   diffs.
6. **Closer (P2):** generate mirrors once, run package/install tests, update
   architecture/tracker/log/changelog, and report measured claims conservatively.

## Non-Negotiable Risks

- Do not call inherited context cheaper without actual cache/billing evidence.
- Do not persist opaque provider runtime IDs into vaults or public telemetry.
- Do not resume across a non-ancestor history or incompatible authority boundary.
- Do not use a late parent fork for independent review.
- Do not trade worktree/write isolation for cache affinity.
- Do not batch away HIGH/CRITICAL security, corrections/deprecations, explicit
  user saves, or interruption-sensitive decisions.
- Do not reduce final full verification, independent audit, enterprise safety,
  or relay sandboxing to meet a budget.
- Do not combine topology and model changes in the first savings claim.

## Handoff Summary

The implementation should first make waste visible and remove deterministic
duplication, then add capability-adaptive routing behind shadow mode. The shared
value proposition is portable continuity and bounded context; Claude and Codex
earn cache/session benefits through their own adapters. The CEO-001..030 suite
provides a concrete definition of done and prevents cost optimization from
silently weakening correctness.
