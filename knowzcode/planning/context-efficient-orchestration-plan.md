# Context-Efficient Orchestration — Delivery Plan

**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`
**Status:** Complete — As-Built
**Owners:** KnowzCode shared contract, Claude adapter, Codex adapter/package
**Target:** Claude plugin and local install; Codex plugin and `npx knowzcode` install

## Outcome

KnowzCode will choose the cheapest safe context path for each unit of work—local, compatible resume, real inherited context, a fresh bounded capsule, or a genuine coordinated team—without weakening TDD, quality gates, review independence, security/compliance, relay isolation, or cold recovery.

The product claim is lower billed consumption, rediscovery, and latency per accepted WorkGroup. Cached/inherited tokens still occupy logical context, so the system reports logical, billed, and outcome measures separately and makes no blanket token-removal claim.

## Formal Contracts

- `knowzcode/knowzcode/specs/ContextEfficientOrchestration.md`
- `knowzcode/knowzcode/specs/ClaudeRuntimeCompatibility.md`
- `knowzcode/knowzcode/specs/CodexRuntimeParity.md`
- `knowzcode/knowzcode/context_efficiency.md`
- `knowzcode/knowzcode/contracts/context-capsule.schema.json`
- `knowzcode/knowzcode/contracts/agent-lineage.schema.json`
- `knowzcode/knowzcode/contracts/efficiency-event.schema.json`

## Change Inventory

| Area | Required change | Proof |
|---|---|---|
| Shared routing | Deterministic mode/reason selection, classify before side effects, bounded fan-out | Fixture-driven contract tests |
| Durable recovery | Versioned capsule and lineage/lease schemas; provider state remains ephemeral | Schema, digest, invalidation, cold-start tests |
| Claude | Current resume/fork/fresh/team semantics; optional teams; supported plugin fields; no bypass | Active-surface and frontmatter validators |
| Codex | Canonical execution guide; semantic operations; warm follow-up; conditional output | Source/plugin/install/upgrade parity tests |
| Skills | Progressive reference loading and bounded results/log artifacts | Static activation and output-policy checks |
| Verification | Targeted loop checks; mandatory consolidated Gate 3 and post-fix rerun | Loop contract validator |
| Knowz/MCP | Probe TTL, relevant queries, delta/deduplicated/batched captures | Config/fixture/static checks |
| Relay | Per-leg Claude budget, warm delta, cold recovery, aggregate redacted usage | Strict command-boundary checks |
| Packaging | Canonical files and schemas in npm/plugin installs and upgrades | Temp-install and temp-upgrade smoke tests |
| Economics | Observe/shadow/canary rollout and fixed representative corpus | 40+ scenario manifest and promotion gates |
| Audit remediation | Fail-closed capsule/telemetry privacy, full lineage identity, global writer ownership, strict zero-write audit | Negative contract probes and independent re-audit |

## Dependency Waves

1. **P0 contract and red tests** — approve mode/schema names; add failing lifecycle/parity/config assertions.
2. **Adapter repair in parallel** — Claude compatibility; Codex canonical guide; shared schemas/fixtures.
3. **Workflow integration** — route before external work; resume gap loops; Stage 0, tests, vault delta, relay budget.
4. **Distribution integration** — generated adapters, installer/upgrade, plugin mirrors, documentation.
5. **Independent audits** — Claude semantics/security, Codex/package parity, shared criteria/privacy/economics.
6. **Bounded fix/re-audit** — maximum three loops; final score must be at least 95% with no unresolved high/critical issue.
7. **Finalization** — as-built specs, tracker, architecture, operational log, changelog, full package/install verification.

Parallel writers always have disjoint owned files. The first independent reviewer never inherits builder reasoning; the same clean reviewer may resume its own bounded re-audit.

## Rollout

1. `observe`: record actual decisions and reconcile provider usage.
2. `shadow`: calculate and record the adaptive recommendation without changing execution.
3. Isolate interventions: prompt/I/O hygiene, topology, model ladder, then vault/test policy.
4. Paired corpus: at least 40 fixed scenarios, at least eight each for small/Tier-2, backend, UI/integration, security/compliance, and recovery/invalidation.
5. Live canary: 10% -> 25% -> 50% -> 100%, with immediate rollback for sensitive-context violations, new high/critical misses, skipped mandatory gates, lost mandatory capsule fields, or severe p95 cost regression.

Promotion requires median billed cost at least 25% lower (30% target), p75 at least 15% lower, p95 no more than 10% worse, accepted quality within two percentage points, rework within 5% relative, no new high/critical miss, and provider counter reconciliation within 2% where authoritative counters exist. Insufficient evidence leaves routing in observe/shadow/canary.

The rollout selector and promotion evaluator are executable, and the versioned corpus supplies self-contained routing/recovery inputs plus paired baseline/candidate outcome records. A manifest without runnable cases or a security promotion gate is not sufficient evidence.

## Non-Goals

- No fake cross-platform conversation fork or Codex Agent Teams.
- No default Agent Teams merely because Claude supports them.
- No `context: fork` claim that a skill inherited the active chat.
- No Agent/fork support inside strict relay v1.
- No provider SDK controller, in-house parser/indexer, universal cache TTL, or hidden global fork environment setting.
- No independent reviewer forked from builder-influenced history.
- No consumption target that can skip security/compliance, independent review, or final full verification.

## Delivery Evidence

- Formal verification: 41/41 criteria passed (shared 14/14, Claude 14/14, Codex 13/13), exceeding the 95% target with a final 100% score and no unresolved high/critical finding.
- Automated verification: 20/20 dependency-free contract tests, platform/install/upgrade surface validator, mirror synchronization, `git diff --check`, and 96-file npm package dry-run passed.
- Independent audit iterations closed stale runtime execution through symlink-normalized install paths, malformed-settings mutation, Claude fork-version language, embedded privacy labels, global writer overlap, fixture-only and relabeled promotion, undersized/unbalanced evaluation, caller-weakened thresholds, and unconditional per-gate vault writes.
- Rollout remains `off` by default. The 40 repository scenarios are contract fixtures, not measured savings evidence; observe/shadow and real paired provider accounting are required before canary promotion.
