# Pending Knowz Operations

Canonical project-root queue for failed Knowz mutations. Run `/knowz flush` when the Knowz MCP API key is valid. Blocks are replayed by `Operation` and deduplicated by `Idempotency Key`; amend/update never fall through to create.

---

### 2026-07-30 05:34:06 EDT -- Completion: Context-efficient orchestration for Claude and Codex
- **Operation**: create
- **Idempotency Key**: knowz:create:wg:kc-feat-context-efficient-orchestration-20260730-035714:phase3:completion
- **Queue Status**: superseded
- **Superseded By**: WorkGroup kc-fix-context-orchestration-hardening-20260731-003258
- **Supersession Reason**: The prior release-readiness conclusion was reopened by fresh adversarial review; do not publish this obsolete completion claim. A verified replacement completion/correction must use a new classified delta.
- **Intent**: Phase 3 consolidated flush (`vault-delta`: `EXPLICIT_SAVE`)
- **Category**: Completion
- **Target Vault**: ecosystem
- **Source**: lead / WorkGroup kc-feat-context-efficient-orchestration-20260730-035714
- **Semantic Key**: workgroup:kc-feat-context-efficient-orchestration-20260730-035714:completion
- **Payload**:

[GOAL]
Formalize and implement cross-platform context-efficient orchestration for the KnowzCode Claude and Codex skill/plugin surfaces, then independently audit and iterate to at least 95%.

[OUTCOME]
Shipped deterministic local/resume/inherit-full/inherit-recent/fresh-capsule/coordinated-team routing, versioned capsule/lineage/telemetry schemas, a no-write installed runtime, current Claude fork/subagent/optional-team semantics, canonical Codex install parity, progressive skill loading, bounded output/test policies, lead-owned vault-delta batching, and observe/shadow/canary economics without making false logical-token-removal claims.

[VERIFICATION]
41/41 formal criteria passed (shared 14/14, Claude 14/14, Codex 13/13). Contract tests 20/20; platform/install/upgrade validator, mirror synchronization, package dry-run (96 files), and diff checks passed. Adversarial tests reject fixture-only, relabeled, mixed, undersized, unbalanced, and caller-weakened promotion evidence. No unresolved critical/high/medium findings.

[ROLLOUT]
Default remains `off`. The 40 repository cases are fixture-only contract evidence and cannot authorize promotion. Real paired provider measurements with exact measured provenance and balanced strata are required before canary rollout.

[TAGS]
knowzcode, claude-code, codex, subagents, context-inheritance, prompt-cache, token-efficiency, context-capsule, lineage, progressive-skills, vault-delta, telemetry, rollout-safety, completion

---
