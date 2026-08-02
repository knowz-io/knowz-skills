# Shared Contract Implementation Handoff

**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`
**Wave:** Phase 2A S1
**Status:** Complete within assigned scope
**Implementation owner:** `/root/product_economics_expert`

## Implemented

- `scripts/lib/context-efficiency.mjs`
  - Portable deterministic modes: `local`, `resume`, `inherit-full`,
    `inherit-recent`, `fresh-capsule`, `coordinated-team`.
  - Stable ordered reason-code vocabulary from the approved specification.
  - Reviewer isolation, capability fallback, nesting-depth, active inherited
    writer, latency, budget, and overlapping-file team guards.
  - Canonical JSON serialization and SHA-256 capsule hashing.
  - Optional-evidence externalization with fail-closed mandatory-field overflow.
  - Minimal dependency-free JSON Schema validator used by the contract tests.
  - Lineage compatibility/invalidation and `HOT`, `COLD_VALID`,
    `RECONCILE_REQUIRED`, `INVALID` lease states.
  - 70% soft, 90% checkpoint, and 100% hard budget transitions that preserve
    mandatory safety/verification gates.
  - Efficiency-event normalization with logical/billed/outcome separation,
    nullable unknown billing, and prompt/secret/provider-ID rejection.
  - Targeted, affected-surface, Gate 3 consolidated, and post-audit-fix
    verification plans.
  - Vault delta empty/semantic-duplicate skipping, normal batching, immediate
    high-risk/explicit/interruption/correction flushing, and named deep-query
    validation.

- Contract schemas, with byte-identical Codex plugin mirrors:
  - `knowzcode/knowzcode/contracts/context-capsule.schema.json`
  - `knowzcode/knowzcode/contracts/agent-lineage.schema.json`
  - `knowzcode/knowzcode/contracts/efficiency-event.schema.json`
  - `plugins/knowzcode/knowzcode/contracts/*` exact mirrors

- `scripts/context-efficiency-contract.test.mjs`
  - Thirteen dependency-free `node:test` contract tests.

- `scripts/fixtures/context-efficiency/**`
  - Fifteen core routing cases plus nesting/writer-cap cases.
  - Capsule canonicalization and overflow fixtures.
  - Lineage, budget, telemetry privacy, verification, and vault-delta cases.
  - Forty fixed evaluation scenarios: exactly eight each for small/Tier 2,
    backend/refactor, UI/integration, security/compliance, and
    recovery/invalidation work.
  - Recovery coverage includes provider-capability failure, stale lineage,
    history rewrite, cache expiry, isolated sensitivity, hidden critical
    findings, vault on/off, and small/medium/large repositories.
  - Canary sequence and approved promotion thresholds are machine asserted.

## Design Boundaries

- Raw provider session/agent/thread handles are allowed only in the local
  lineage schema's `platform_handle`. The public efficiency-event schema has no
  provider-ID field, and normalization rejects such keys recursively.
- Cache/lease expiry yields `COLD_VALID`, not evidence of a cache hit. The
  caller must choose a cold capsule unless the adapter separately establishes a
  safe resumable path.
- Any incompatible spec, scope, checkpoint, model/effort, tools, permissions,
  sensitivity, unknown provenance, completed scope, or independent-review
  contamination yields `INVALID`.
- A coordinated team requires two or more peers, real provider support,
  disjoint owned files, sufficient budget, and predicted latency no greater
  than 75% of sequential execution.
- Capsule hashing excludes only `capsule_hash`; object keys are sorted and array
  order remains semantic. Mandatory requirements are never silently truncated.
- The harness does not claim provider billing/cache savings. Missing billed
  counters remain `null` with `accounting_source: unknown`.

## Verification Evidence

### RED

The first test run failed as expected because the implementation module did not
yet exist:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
scripts/lib/context-efficiency.mjs
```

### GREEN

Command:

```text
node --test scripts/context-efficiency-contract.test.mjs
```

Result:

```text
tests 13
pass 13
fail 0
duration_ms 51.487834
```

The passing suite covers all six routes, ordered reason codes, reviewer
isolation, capsule stability and overflow safety, four lineage states, budget
thresholds, telemetry privacy/nullability, verification tiers, vault deltas,
the forty-scenario corpus, canary/promotion values, and exact schema mirrors.

Additional passing checks:

```text
diff -ru knowzcode/knowzcode/contracts plugins/knowzcode/knowzcode/contracts
node --check scripts/lib/context-efficiency.mjs
node --check scripts/context-efficiency-contract.test.mjs
git diff --check -- <all assigned implementation paths>
```

All commands exited `0`. All assigned JSON fixtures and schemas were also
parsed successfully with `JSON.parse`.

## Out-of-Scope Global Validation Blocker

`node scripts/validate-platform-surfaces.mjs` was run read-only and currently
fails on concurrent Claude-runtime work outside this wave's writable scope:

- source/plugin `claude_code_execution.md` drift;
- removed team lifecycle APIs still detected in Claude audit/explore/status and
  `CLAUDE.md` workflow surfaces;
- a Claude spawn prompt still permits bypass permissions.

No S1 contract/schema/fixture failure was reported by the global validator.
These failures must be cleared by the Claude runtime owner before consolidated
Gate 3, then the global validator should be rerun.

## Files Intentionally Not Modified

No specs, orchestration configuration, workflow skills, platform guides,
validators, package metadata, or other shared implementation files were edited
by this wave.
