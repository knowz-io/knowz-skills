# WorkGroup: kc-fix-context-orchestration-hardening-20260731-003258

**Primary Goal**: Correct every release-blocking defect found by the fresh deep review of context-efficient orchestration, prove the fixes with adversarial and install-lifecycle tests, and iterate through independent review until release readiness is at least 95%.
**Created**: 2026-07-31T00:32:58Z
**Status**: Closed — verified
**Current Phase**: 3 - Finalization complete
**Autonomous Mode**: Active
**Relay Host**: codex
**Relay Target**: none
**Enterprise Compliance**: Disabled (`compliance_enabled: false`)

## Change Set

### Reopened NodeIDs

| NodeID | Remediation objective |
|---|---|
| ContextEfficientOrchestration | Make routing, lineage, capsule privacy, writer ownership, result durability, telemetry accounting, vault mutation identity, and promotion authorization fail closed. |
| ClaudeRuntimeCompatibility | Make named-agent/team authority explicit, await security review, establish one idempotent pending queue, and restrict checkpoint staging to approved paths. |
| CodexRuntimeParity | Make install/upgrade ownership safe and atomic, isolate validators, repair generated references/setup, and prevent cross-platform settings mutation. |

### Scope and Safety Boundaries

- Preserve the user-owned untracked paths `knowzcode/explore/` and `knowzcode/planning/enterprise-code-review-agent-guidance.md` without modification or staging.
- Parallel writers receive disjoint explicit file ownership and do not commit.
- No release claim may rely only on the existing happy-path suite; each reproduced defect requires a regression test.
- Promotion evidence must be bound to a trusted measurement envelope and provider-authoritative billed accounting.
- Install and upgrade must not mutate unmanaged project adapters, global skills, or unselected platform settings.
- All checkpoint/final staging must enumerate approved files after reviewing status and diff.

## Acceptance Criteria

### Shared runtime and security

1. Combined dispatch binds executable rollout mode to the safety-approved router result and reconciles routing with evaluated lineage.
2. Context inheritance, team budget, writer identity/ownership, artifact references, and time inputs fail closed when facts are missing, malformed, ambiguous, or unsafe.
3. Material writer results always preserve a recoverable handoff, independently of raw-output artifact persistence.
4. Telemetry rejects billed values without an authoritative accounting source; promotion requires a trusted, corpus-bound measurement envelope and bounded metrics.
5. Vault severity is normalized/validated and amend/update returns one unambiguous stable mutation target.

### Claude workflow and knowledge durability

6. One canonical pending queue and schema is used and drained; post-dispatch write failure is queued exactly once with an idempotency key.
7. Named subagents return bounded results to the lead; only actual teammates use shared task state or peer messaging. Plugin calls use exact scoped agent names, local-copy calls use exact local names, and MCP agents can discover their exact deferred tools.
8. Gate 3 awaits the selected security reviewer; the closer returns a delta/file list while the lead performs writes and commits.
9. Workflow checkpoints stage only the active WorkGroup, tracker, approved specs, and explicitly approved implementation files.

### Installer, Codex, and packaging

10. Local upgrade never mutates global skills; global cleanup removes only marker/manifest-owned KnowzCode entries.
11. Installer/upgrader preserves unmanaged `AGENTS.md` files and fails before target mutation when platform preflight fails.
12. Generated Codex relay references resolve, global setup can bootstrap a new repository, Codex-only Agent Teams flags do not mutate Claude settings, and Claude plugin/local rendering emits only exact resolvable role and command names for the installed ownership matrix.
13. Shared Gemini MCP custody requires matching per-product digests plus live product-specific regular-file evidence with no symlinked path component; both install orders, co-owned update immutability, both uninstall orders, arbitrary unowned entries, and missing/replaced/leaf-symlinked/ancestor-symlinked interrupted-peer evidence leave no orphan entry or credential.
14. Package/platform validation uses an isolated home and asserts target/settings/global-sentinel preservation for failure and local-upgrade paths.

### Final quality gate

15. Contract, platform, sync, package, diff, and focused adversarial tests pass; fresh independent reviewers report no unresolved critical/high finding and the weighted self-review score is at least 95%.

## Release-Readiness Scoring

The final score is evidence-based, not a count of edited files:

| Dimension | Weight | Full-credit evidence |
|---|---:|---|
| Runtime and security correctness | 35 | Every reproduced runtime bypass has a passing regression test; no open critical/high security finding. |
| Installer and state preservation | 25 | Atomicity, ownership markers, isolated home, unmanaged sentinel, platform scoping, install, upgrade, and package smokes pass. |
| Workflow and vault durability | 20 | Authority modes are executable, security blocks gates, canonical queue replay is idempotent, and explicit staging is enforced. |
| Verification depth | 15 | Focused, full, sync, package, diff, and fresh independent adversarial review all pass. |
| Specification and operational accuracy | 5 | Specs, tracker, architecture, WorkGroup, changelog, and operational log match the verified as-built behavior without stale current claims. |

Any unresolved critical/high finding caps the score below 95. Any failed required suite or destructive-state regression caps it below 90. Run no more than three independent audit-to-fix cycles; if the target remains unmet, record the concrete blocker instead of inflating the score.

## Parallel Ownership

| Track | Writable scope |
|---|---|
| Runtime hardening | shared runtime, context-efficiency schemas/fixtures, and runtime contract tests |
| Claude workflow hardening | Claude agents/workflow references and Knowz queue/writer/flush guidance |
| Installer/Codex hardening | CLI installer, generated Codex adapter templates/synchronizer, and platform validator |
| Coordinator | this WorkGroup, the three reopened specs, tracker, architecture/log/changelog, final integration |

## Phase History

### Phase 1A / 1B — 2026-07-31

- Reconciled three fresh independent reviews into 24 concrete defects and grouped them by non-overlapping implementation ownership.
- Reopened all three affected specifications and added fail-closed remediation acceptance criteria.
- `[AUTO-APPROVED] Gate #1` and `[AUTO-APPROVED] Gate #2` under the user's explicit autonomous execution instruction.

### Phase 2A — 2026-07-31

- Hardened the shared runtime, capsule/lineage/privacy rules, writer ownership, result durability, telemetry accounting, signed promotion provenance, and vault mutation identity.
- Reworked Claude named-agent/team authority, exact plugin/local namespaces, security gating, pending-queue ownership, explicit staging, and package-relative resource resolution.
- Rebuilt KnowzCode and Knowz install/upgrade/uninstall ownership around exact per-product manifests, structural shared-settings merges, full preflight atomicity, and project/HOME isolation.

### Phase 2B — 2026-07-31

- Ran repeated independent workflow, runtime, security, installer, and actual-tarball audits. Every reported finding was reproduced before remediation and retained as a regression.
- Closed cross-product Gemini custody gaps through independent digest claims, active peer evidence, immutable co-owned updates, truthful endpoint UX, last-owner cleanup, and symmetric interrupted-uninstall recovery.
- The final stale-peer matrix covers missing, content-replaced, leaf-symlinked, and ancestor-directory-symlinked evidence for both Knowz and KnowzCode. Arbitrary unowned entries remain unclaimed and unchanged.
- `[AUTO-APPROVED] Gate #3` after the selected security/runtime audit completed with no critical/high/medium/low finding and all consolidated checks passed.

### Phase 3 — 2026-07-31

- Verified 66/66 formal criteria: CEO 21/21, CRC 25/25, and CRP 20/20.
- Final integrated evidence: 32/32 runtime contracts; platform-surface validation; 13 Codex skill mirrors plus one generated reference, seven framework mirrors, and three contracts; Node syntax and JSON parsing; `git diff --check`; KnowzCode 104-file and Knowz 20-file dry-run packages.
- Independent final scores: workflow/resource/traceability audit 98/100; runtime/security/actual-packed audit 100/100 with a 209/209 primary matrix plus stale-peer adversarial cases. No unresolved critical, high, medium, or low finding remains.
- Weighted release-readiness self-review: **98/100**, exceeding the required 95% threshold.

## Final Release-Readiness Score

| Dimension | Weight | Earned | Evidence |
|---|---:|---:|---|
| Runtime and security correctness | 35 | 34 | 32/32 contracts, fail-closed runtime/provenance controls, independent security audit 100/100 |
| Installer and state preservation | 25 | 25 | Actual-packed lifecycle matrix, exact ownership, atomic preflight, shared-custody and symlink/crash regressions |
| Workflow and vault durability | 20 | 20 | Exact authority modes, blocking security gate, canonical idempotent queue, lead-only final writes/staging |
| Verification depth | 15 | 14 | Full source/package/install/upgrade/uninstall, mirror, syntax, JSON, diff, and two independent final audits |
| Specification and operational accuracy | 5 | 5 | 66 criteria as-built, tracker/architecture/changelog/log/WorkGroup reconciled |
| **Total** | **100** | **98** | **Release-ready; target exceeded** |

## Residual Non-Blocking Debt

- The 40-case repository corpus proves evaluator and routing behavior but is synthetic. Default rollout remains `off`; real provider-billed paired measurements and a trusted signed measurement envelope are still required before any live canary or savings claim.
- Provider-native fork/cache/team capabilities remain capability-detected and version-sensitive; unsupported modes continue to fall back to a fresh capsule.
