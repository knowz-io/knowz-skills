# WorkGroup: kc-feat-context-efficiency-release-20260802-120546

**Primary Goal**: Publish the verified context-efficient orchestration and lifecycle hardening as KnowzCode v0.21.0 and the paired Knowz ownership/runtime changes as knowz-mcp v0.9.0 across npm, Claude plugin, Codex plugin, marketplace, and Git tags.
**Created**: 2026-08-02T12:05:46-04:00
**Status**: Closed - release preparation verified; external publication follows the recorded runbook
**Current Phase**: 3 - Release preparation finalized
**Autonomous Mode**: Active; all normal quality gates auto-approved by explicit user instruction
**Enterprise Compliance**: Disabled (`compliance_enabled: false`)
**Baseline Commit**: `9cb3fb70421ad68f5e63f21746bc7e2eb4261178`

## Change Set

| Product / NodeID | Release objective | Version |
|---|---|---|
| ContextEfficientOrchestration | Release portable context-affinity routing, capsules, lineage, measurement, and durable result contracts. | KnowzCode 0.21.0 |
| ClaudeRuntimeCompatibility | Release Claude fork/resume/team compatibility and exact plugin/local rendering. | KnowzCode 0.21.0 |
| CodexRuntimeParity | Release canonical Codex skills, runtime parity, and ownership-safe install lifecycle. | KnowzCode 0.21.0 |
| Knowz shared lifecycle | Release paired Knowz ownership, queue, and shared Gemini custody hardening. | knowz-mcp 0.9.0 |

## Scope and Safety Boundaries

- Update only current package, plugin, marketplace, generated-version, changelog, and release-record surfaces.
- Preserve the user-owned untracked paths `knowzcode/explore/` and `knowzcode/planning/enterprise-code-review-agent-guidance.md` without modification or staging.
- Use the repository's established release sequence: release commit on `develop`, ready PR to `main`, merge commit, product tags on that merge, then public npm publication.
- Never expose npm or GitHub credentials. If npm requires an OTP, pause only for that one-time credential.
- Do not publish unless the full contract/platform/mirror/package verification passes and the release diff is explicitly reviewed.

## Acceptance Criteria

1. All active package, plugin, marketplace, installed-framework marker, and packaged Codex generated-version surfaces agree on KnowzCode `0.21.0` and Knowz/knowz-mcp `0.9.0`; historical changelog entries and immutable legacy Gemini generation-provenance comments remain unchanged.
2. The current KnowzCode changelog material is assigned to `0.21.0`, and a product-scoped Knowz changelog records `0.9.0`, both with release date `2026-08-02`.
3. Context contracts, platform validation, mirror synchronization, syntax/JSON checks, package manifests, tarball dry runs, and `git diff --check` pass.
4. A release commit is pushed to `develop`; a ready `develop` to `main` PR is reviewed and merged without deleting `develop`.
5. Tags `knowzcode/v0.21.0` and `knowz/v0.9.0` point to the exact `main` merge commit and are pushed.
6. `knowzcode@0.21.0` and `knowz-mcp@0.9.0` are published publicly with `latest` tags and registry metadata is independently verified.
7. Final self-review remains at least 95%, with no unresolved release-blocking finding.

## Existing Verification Evidence

- Formal criteria: 66/66 across the three KnowzCode NodeIDs.
- Runtime contracts: 32/32.
- Independent workflow/resource audit: 98/100, no findings.
- Independent runtime/security/package audit: 100/100, no findings; 209/209 packed lifecycle matrix plus stale-peer adversarial cases.

## Phase History

### Phase 1A / 1B - 2026-08-02

- Reused the verified as-built specifications and the closed hardening WorkGroup rather than reopening implementation scope.
- Confirmed the release is semver-minor for both products because it publishes substantial new orchestration/runtime capability and paired lifecycle behavior.
- Confirmed prior release mechanics, GitHub/npm authentication, current registry versions, tag placement, and manifest surfaces.
- `[AUTO-APPROVED]` Release scope and specification gates under the user's autonomous end-to-end instruction.

### Phase 2A - 2026-08-02

- Bumped all active package, Claude plugin, Codex plugin, marketplace, installed-framework marker, and packaged Codex generated-version surfaces.
- Assigned the complete unreleased KnowzCode notes to v0.21.0 and added a product-scoped Knowz v0.9.0 changelog to the npm payload.
- Normalized both npm `bin` paths so publication no longer rewrites either package manifest.
- Added validation requiring every packaged Knowz Codex skill to carry a generated-version comment equal to `knowz/package.json`.
- Preserved the unchanged `.gemini` skill comments as historical generator provenance; they are not packaged current-release version surfaces.

### Phase 2B - 2026-08-02

- Full gate passed after the release fixes: 32/32 context contracts, platform-surface validation, 13 Codex skill mirrors plus one reference, seven framework mirrors, three schema mirrors, syntax, JSON parsing, and `git diff --check`.
- Publish dry runs executed both `prepublishOnly` flows without manifest warnings. KnowzCode contains 104 files; Knowz contains 21 files including its changelog.
- Registry collision check confirmed `latest` remains KnowzCode 0.20.1 and knowz-mcp 0.8.1; both new remote tags are absent.
- Independent workflow re-audit found no remaining issue and scored the prepared release **99/100**. Independent package review scored **96/100**, with only the intentional standalone Knowz repository metadata advisory; commit `35d5d99` documents that choice and `knowz-io/knowz` exists.
- `[AUTO-APPROVED] Gate #3` because all implementation/package checks passed, no critical/high/medium release finding remains, and the prepared-release score exceeds 95%.

### Phase 3 - 2026-08-02

- Release execution is intentionally external to this repository checkpoint: commit and push the exact allowlist, merge `develop` into `main` by ready PR, rerun the complete gate and actual-tarball credential scan on the merge SHA, tag that exact SHA, publish both packages from it, and verify registry/tag/plugin state.
- The user-owned untracked exploration and planning paths remain outside the release allowlist.
- Final release-preparation self-review: **99/100**. The remaining point is reserved until the external PR, tag, npm, and post-publication checks complete; those systems are the authoritative completion record and are not back-written into this closed preparation WorkGroup.
