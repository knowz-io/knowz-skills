# Runtime hardening handoff

**WorkGroup:** kc-fix-context-orchestration-hardening-20260731-003258
**Role:** runtime-hardening writer
**Status:** complete; focused contract suite green

## Changes

- Bound combined dispatch to evaluated lineage and the router-selected rollout recommendation.
- Made inheritance/team safety and budgets affirmative, canonicalized writer ownership across aliases/containment/case/symlinks, and inferred writer roles when flags are omitted.
- Added repository-relative artifact validation, a post-insertion privacy scan, and strict RFC 3339 validation.
- Required authoritative/provider billing sources, normalized/rejected severity, and returned an unambiguous `KnowledgeId` for amend/update decisions.
- Made material/writer/durable outputs retain handoffs independently of raw artifacts.
- Bound promotion to a signed, corpus-digest measurement envelope; bounded metrics and enforced anonymous unique pair IDs.
- Integration review follow-up: ownership now rejects absolute, URI, traversal, and symlink-escape paths; active writer conflicts have no caller-spoofable same-lineage exemption; vault mutation targets must come from the sole matched prior record.

## Verification

- `node --check knowzcode/knowzcode/context_efficiency_runtime.mjs` — pass.
- `node --test scripts/context-efficiency-contract.test.mjs` — 26/26 pass.
- `git diff --check -- <assigned runtime/schema/test/fixture paths>` — pass.
- Canonical/plugin runtime and contract mirrors — byte-identical.

## Integration notes

- `evaluatePromotion` now accepts an optional third argument `{ measurement_envelope }`; self-asserted per-pair provenance cannot promote without a valid signed envelope.
- `evaluateVaultDelta` mutation decisions include exact `KnowledgeId`; missing or ambiguous targets fail closed.
- Executable canary/on rollouts require a recommendation. Combined dispatch ignores caller overrides and binds the recommendation to `routing.mode`.
- Trusted signer keys are supplied as a key-ID-to-public-PEM JSON map in `KNOWZCODE_TRUSTED_MEASUREMENT_KEYS`; the contract test generates an ephemeral keypair and never commits a private key.

## Remaining risk

- The release measurement signing private key and trusted-key environment configuration must remain outside the repository; missing or malformed trust configuration fails closed.
- Ownership realpath checks are read-only and depend on the supplied `workspace_root` (or current working directory when omitted).
