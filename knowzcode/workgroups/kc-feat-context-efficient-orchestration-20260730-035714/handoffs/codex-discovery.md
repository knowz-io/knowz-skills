# Codex Discovery Handoff

## Phase

1A | 1B

## Status

complete

## Owned Files

- Read: `knowzcode/package.json`
- Read: `knowzcode/bin/knowzcode.mjs`
- Read: `knowzcode/knowzcode/platform_adapters.md`
- Read: `plugins/knowzcode/.codex-plugin/plugin.json`
- Read: `plugins/knowzcode/knowzcode/codex_execution.md`
- Read: `plugins/knowzcode/knowzcode/platform_adapters.md`
- Read: `plugins/knowzcode/skills/{work,explore,setup}/SKILL.md`
- Read: `scripts/{sync-codex-relay-surfaces,validate-platform-surfaces}.mjs`
- Written: this handoff only

## Findings

### Priority findings

#### P0 — npm and Codex-plugin installs do not share a canonical execution contract

The npm package has no `knowzcode/knowzcode/codex_execution.md`, while the Codex plugin has a plugin-only copy at `plugins/knowzcode/knowzcode/codex_execution.md`. This creates two materially different installation paths:

1. The npm package includes the whole source `knowzcode/` directory (`knowzcode/package.json:9-15`).
2. Fresh npm install copies every top-level source Markdown file from that directory (`knowzcode/bin/knowzcode.mjs:1568-1596`), and upgrade likewise replaces non-preserved source files (`knowzcode/bin/knowzcode.mjs:2044-2067`). Because the canonical source file does not exist, neither path can install it.
3. Codex adapter generation parses embedded `#### <path>` templates from `platform_adapters.md` and writes them to `.agents/skills/` (`knowzcode/bin/knowzcode.mjs:679-687`, `1269-1334`). No `codex_execution.md` template header exists, so generation does not compensate for the missing core file.
4. The Codex plugin physically bundles `plugins/knowzcode/knowzcode/codex_execution.md`, and its setup skill explicitly copies that file (`plugins/knowzcode/skills/setup/SKILL.md:14-17`). Plugin users therefore receive a contract npm users do not.
5. Current validation requires the plugin-only file and validates its handoff schema (`scripts/validate-platform-surfaces.mjs:513-536`), but the canonical/plugin byte-parity list excludes `codex_execution.md` (`scripts/validate-platform-surfaces.mjs:444-461`). The npm generation smoke test checks relay skill/reference/core and `AGENTS.md`, not `codex_execution.md` (`scripts/validate-platform-surfaces.mjs:464-510`).

Required correction: author `knowzcode/knowzcode/codex_execution.md` as the canonical file, generate or copy the plugin mirror from it, let the existing npm fresh-install/upgrade loops distribute it, and make validator equality/install assertions mandatory.

#### P1 — shipped Codex operation names are stale and contradict warm reuse

The current callable Codex runtime exposes semantic operations for spawn, full/recent/no-context inheritance, warm follow-up, message/steer, wait, interrupt, and agent listing. The durable package instead names `send_input` and `close_agent`, neither of which is callable in the current runtime:

- `plugins/knowzcode/knowzcode/codex_execution.md:22-31`
- `plugins/knowzcode/skills/work/SKILL.md:43,108`
- `plugins/knowzcode/skills/explore/SKILL.md:13`
- Both adapter mirrors at `knowzcode/knowzcode/platform_adapters.md:266,331` and `plugins/knowzcode/knowzcode/platform_adapters.md:266,331`

The guide also says to close an agent as soon as its delegated scope completes (`plugins/knowzcode/knowzcode/codex_execution.md:29,203-208`). That defeats resume-first gap fixes and re-audits. Codex guidance must specify semantic capabilities and a compatibility fallback rather than treating one tool-name set as permanent. A runtime adapter may map current capabilities to `spawn`, `resume/follow-up`, `steer`, `wait`, `interrupt`, and `inspect`; absence of an explicit close operation must not be mapped to interrupt.

#### P1 — unconditional context hydration defeats progressive skill loading

The selected Codex work skill is 124 lines, then unconditionally tells the host to read the loop, project, tracker, architecture, and optional execution guide (`plugins/knowzcode/skills/work/SKILL.md:15-20`). In the plugin bundle those files total another 982 lines (669 + 48 + 23 + 19 + 223) before application specs/code. The explore skill similarly requires broad framework reads (`plugins/knowzcode/skills/explore/SKILL.md:11-14`).

Codex already progressively loads a selected `SKILL.md`; KnowzCode should preserve that advantage. Keep safety invariants and the dispatch decision table in the small selected skill, then load only branch-specific references:

- current phase contract, not the complete 669-line loop;
- execution/context reference only when delegation is eligible;
- relay reference only when relay resolves non-`none`;
- compliance reference only when compliance is enabled;
- durable handoff schema only when durable output is selected.

Do not set an arbitrary line-count gate as the primary correctness test. Test the reference-selection graph and unconditional-read behavior, then measure loaded bytes/tokens as telemetry.

#### P1 — mandatory disk handoffs violate read-only scopes and add a reread cycle

The execution guide says every delegated task writes a phase report, returns only the path, and the coordinator never trusts in-memory results (`plugins/knowzcode/knowzcode/codex_execution.md:108-141`). The work skill repeats the absolute rule (`plugins/knowzcode/skills/work/SKILL.md:106-124`), and explore requires read-only agents to write findings (`plugins/knowzcode/skills/explore/SKILL.md:20-29`). This is incompatible with a strictly read-only audit and forces a result-write/coordinator-reread cycle for small findings.

Use an output policy:

- `ephemeral`: bounded structured return for a short read-only sidecar; no filesystem write;
- `durable`: disk handoff for writers, partial/multi-turn work, interruption recovery, or explicit durable-state requests;
- `artifact`: raw logs/large evidence remain in an authorized artifact path and only a digest/path returns.

The coordinator remains the sole WorkGroup state owner. In-memory evidence may inform the coordinator, but approvals, checkpoint/spec hashes, and phase state become authoritative only after coordinator consolidation.

#### P2 — current validators can pass while the runtime contract is unusable

`scripts/validate-platform-surfaces.mjs` validates path/version/frontmatter shape (`:105-233`), explicitly forbids a Codex plugin `agents/` directory (`:316-318`), and rejects Claude-only team APIs in Codex skills (`:709-727`). These are good invariants. It does not reject obsolete Codex names, verify semantic lifecycle behavior, validate warm-lease decisions, validate conditional output selection, or prove that npm and plugin installs carry identical execution contracts.

`scripts/sync-codex-relay-surfaces.mjs:8-19` copies seven Codex skill/relay surfaces into both platform-adapter mirrors. It does not own the plugin-only execution guide. Keep this generator for adapter-embedded skills, but add canonical execution-file synchronization/parity separately rather than embedding a second authored guide in the 3,424-line adapter document.

### Exact Codex surface map

| Concern | Canonical/current source | Distribution/render path | Validation gap/action |
|---|---|---|---|
| Codex execution guide | **Missing canonical**; plugin-only `plugins/knowzcode/knowzcode/codex_execution.md` | Plugin setup copies bundled guide; npm core-copy cannot | Add canonical file; byte-compare plugin mirror; assert fresh install and upgrade |
| npm package contents | `knowzcode/package.json:9-15` | `knowzcode/` included wholesale | Existing include is sufficient once canonical file exists |
| npm fresh install | `knowzcode/bin/knowzcode.mjs:1568-1596` | Copies top-level core `.md` files | Assert installed guide equals canonical bytes/hash |
| npm upgrade | `knowzcode/bin/knowzcode.mjs:2035-2067` | Replaces non-preserved core files | Assert stale installed guide is refreshed; it must not enter preserve set |
| Codex adapter/skills | `knowzcode/knowzcode/platform_adapters.md:126-347` | Parser at `knowzcode/bin/knowzcode.mjs:679-722`; writer at `:1269-1334` | Keep generated `.agents/skills`; remove stale operations and unconditional handoff wording through source sync |
| Codex plugin | `plugins/knowzcode/.codex-plugin/plugin.json:1-44` and bundle root | Manifest exposes `./skills/`; support files remain bundled for setup | Keep `plugins/knowzcode/agents/` absent; validate support-file parity |
| Plugin setup | `plugins/knowzcode/skills/setup/SKILL.md:14-25` | Copies plugin `knowzcode/` into project | Assert canonical hash/version in copied support contract where testable |
| Codex skill source | `plugins/knowzcode/skills/{work,explore}/SKILL.md` | Installed plugin directly; also rendered into adapter by sync script | Thin main skill; branch-specific references; semantic capability wording |
| Adapter mirroring | `scripts/sync-codex-relay-surfaces.mjs:8-60` | Plugin skill -> source adapter -> plugin adapter | Extend surface list for new Codex skill references; avoid second guide authoring source |
| Platform validation | `scripts/validate-platform-surfaces.mjs` | Static checks plus temporary npm install | Add canonical/plugin/install/upgrade and semantic fixture assertions |

## Formal Verification Criteria

These criteria belong under `CodexRuntimeParity` and should retain the identifiers below so tests and audit output can refer to them directly.

### Canonical distribution and install parity

- `VERIFY:codex_execution_canonical_source` — `knowzcode/knowzcode/codex_execution.md` exists and is the only authored Codex execution contract. The plugin copy is generated or synchronized and is byte-identical after version normalization, preferably exactly byte-identical.
- `VERIFY:codex_execution_npm_fresh_install` — a fresh `knowzcode install --platforms codex --force` produces `knowzcode/codex_execution.md` equal to the canonical source and produces Codex skill files that reference it.
- `VERIFY:codex_execution_npm_upgrade` — upgrade/reinstall replaces a stale installed `codex_execution.md` with the current canonical contract while continuing to preserve user-owned tracker/log/project/architecture/preferences/orchestration files.
- `VERIFY:codex_execution_plugin_bundle` — the Codex plugin contains the same execution contract and setup names it as a required copied support file.
- `VERIFY:codex_execution_contract_identity` — source, plugin bundle, and generated npm install report the same KnowzCode version and execution-contract hash/schema version.
- `VERIFY:codex_plugin_agent_boundary` — `plugins/knowzcode/agents/` remains absent; optional Codex custom agents, if later desired, are explicit setup-generated `.codex/agents/*.toml`, never Claude agent files copied into the plugin.

### Semantic native capabilities

- `VERIFY:codex_semantic_capability_contract` — normative guidance uses semantic operations (`spawn`, `resume/follow-up`, `steer/message`, `wait`, `interrupt`, `inspect`) and contains no normative dependency on `send_input` or `close_agent`.
- `VERIFY:codex_capability_detection` — orchestration chooses only operations callable in the active runtime. Missing spawn/inheritance/follow-up support falls back to local execution or a fresh context capsule without claiming the unavailable behavior.
- `VERIFY:codex_context_inheritance_modes` — the adapter distinguishes full-history, recent-turn, and no-history spawning when exposed. Full-history inheritance does not request a model/reasoning override in runtimes where that combination is invalid; lower-cost/different-model work uses recent/no-history plus a capsule.
- `VERIFY:codex_no_cache_savings_claim` — Codex reporting measures observed usage/repeated reads/outcomes and does not claim a Claude-style prompt-cache discount without provider evidence.
- `VERIFY:codex_bounded_fanout` — dispatcher respects the active runtime concurrency limit, defaults to recursion depth one, and queues/reuses/runs locally rather than spawning beyond capacity.

### Warm-agent lease semantics

- `VERIFY:codex_resume_before_respawn` — an existing completed/idle agent is resumed before a new agent is spawned when WorkGroup, role, scope/owned files, spec hash, expected checkpoint, model/effort, sandbox/permissions, and sensitivity class remain compatible.
- `VERIFY:codex_lease_invalidation` — resume is rejected or first reconciled when specs/criteria change, unexpected repository changes exist beyond the agent checkpoint, owned scope expands, permission/sensitivity narrows, model/effort must change incompatibly, the WorkGroup changes, or the phase is finalized.
- `VERIFY:codex_warm_lease_bound` — only agents with a plausible same-phase gap-fix/re-audit continuation remain registered as warm; the warm set is bounded by configured/runtime capacity and evicts least-relevant lineage under pressure. Lack of a close primitive is not represented as an interrupt.
- `VERIFY:codex_reviewer_independence` — the first independent reviewer does not inherit builder conversation history. The same reviewer may be resumed for a bounded re-audit of its own findings when lineage remains compatible.

### Conditional results and disk handoffs

- `VERIFY:codex_read_only_ephemeral_result` — a short read-only explorer/auditor can return a bounded structured result without any filesystem write.
- `VERIFY:codex_durable_handoff_selection` — writers, partial/multi-turn tasks, interruption recovery, and explicitly durable requests use the existing phase-report schema and include checkpoint/spec lineage.
- `VERIFY:codex_artifact_result_selection` — raw test/log output remains in an authorized artifact; the parent receives a digest, bounded failure delta, and path.
- `VERIFY:codex_workgroup_authority` — only coordinator-consolidated WorkGroup state is authoritative for phase, approval, and lineage; ephemeral child output alone never advances a gate.
- `VERIFY:codex_read_only_no_write` — when the user or audit mode forbids writes, neither handoff nor exploration files are created by the child.

### Progressive skill loading

- `VERIFY:codex_progressive_reference_graph` — the selected skill contains the core safety/phase invariants and a deterministic reference decision table, while relay, compliance, handoff, and detailed orchestration references load only when their conditions activate.
- `VERIFY:codex_no_unconditional_full_framework_read` — normal `work`/`explore` flow does not unconditionally read the complete loop, execution guide, project, tracker, and architecture set. It reads the active WorkGroup/context capsule and only the current phase and relevant policy branches.
- `VERIFY:codex_progressive_safety_equivalence` — prompt slimming does not remove TDD, disjoint write ownership, approval/autonomy gates, independent audit, enterprise master switches, relay safety, or final regression/static/build obligations.
- `VERIFY:codex_reference_generation_parity` — every new Codex skill reference is present in the plugin and npm-generated `.agents/skills` tree with equal normalized content; the adapter sync script and validator enumerate it.
- `VERIFY:codex_context_load_telemetry` — A/B telemetry records selected references and loaded bytes/tokens where observable; optimization is judged on measured reduction and unchanged acceptance/security outcomes, not a fixed Markdown line limit.

## Intentionally Failing Tests to Add First

### 1. Canonical and plugin parity assertions

Add to `scripts/validate-platform-surfaces.mjs` before implementation:

```js
const canonicalCodexExecution = join(ROOT, 'knowzcode', 'knowzcode', 'codex_execution.md');
const pluginCodexExecution = join(ROOT, 'plugins', 'knowzcode', 'knowzcode', 'codex_execution.md');
expect(existsSync(canonicalCodexExecution), `Missing canonical Codex execution guide: ${canonicalCodexExecution}`);
expect(
  existsSync(canonicalCodexExecution) &&
    readFileSync(canonicalCodexExecution, 'utf8') === readFileSync(pluginCodexExecution, 'utf8'),
  'Codex plugin execution guide drifted from canonical source'
);
```

Current failure: canonical file is absent.

Also add `codex_execution.md` to the byte-coupled framework-file list at validator lines 444-451. Current failure: source side is absent.

### 2. Fresh npm install parity

Extend the existing temporary Codex install smoke test at validator lines 464-510:

```js
const generatedCodexExecution = join(generatedCodexTarget, 'knowzcode', 'codex_execution.md');
expect(existsSync(generatedCodexExecution), `Codex npm install dropped execution guide: ${generatedCodexExecution}`);
expect(
  existsSync(generatedCodexExecution) &&
    readFileSync(generatedCodexExecution, 'utf8') === readFileSync(canonicalCodexExecution, 'utf8'),
  'Codex npm-installed execution guide differs from canonical source'
);
```

Current failure: generated file is absent.

### 3. Upgrade parity

Add a second temp-fixture test: fresh-install an older/stale sentinel body at `knowzcode/codex_execution.md`, run the supported forced upgrade/reinstall path, then assert canonical equality and assert preserved user-owned files retain sentinels. Current failure: there is no canonical source file to refresh from, so the stale guide survives or is never created.

### 4. Obsolete-operation rejection

Apply `expectFileNotContains` with `/\b(send_input|close_agent)\b/` to:

- canonical and plugin `codex_execution.md`;
- plugin `work` and `explore` skills;
- both platform-adapter mirrors.

Current failure: every listed surface contains one or both names.

Do not replace this only with regex-required current tool names. Add semantic capability fixtures so future renames do not cause another hard dependency.

### 5. Semantic routing fixture cases

Extend the shared orchestration fixture runner with Codex cases:

| Fixture | Inputs | Expected |
|---|---|---|
| `codex-resume-compatible` | same WG/role/scope/spec/checkpoint/security; warm handle | `resume` |
| `codex-resume-spec-changed` | same handle; changed spec hash | `fresh-capsule` or `reconcile`, never blind resume |
| `codex-full-inherit-model-change` | high affinity; full fork available; cheaper model required | not full inherit; `inherit-recent`/`fresh-capsule` |
| `codex-reviewer-independent` | builder completed; first reviewer | fresh reviewer from approved spec/diff |
| `codex-capacity-exhausted` | all runtime slots active | reuse/queue/local, no spawn |
| `codex-followup-unavailable` | compatible lineage; no follow-up capability | fresh capsule/local fallback |
| `codex-readonly-short` | audit, no writes, small result | ephemeral return, zero files |
| `codex-writer-partial` | implementation partial | durable handoff with lineage |
| `codex-log-heavy` | large failing output | artifact path + bounded delta |

These fail until the shared dispatch contract and Codex adapter semantics exist.

### 6. Conditional-handoff static and scenario checks

Reject absolute phrases equivalent to “every delegated task writes a phase report,” “persist its work to disk, not chat,” and “never trusts in-memory return values” in the new canonical guide and Codex skills. Add scenario assertions that `codex-readonly-short` produces no handoff path and `codex-writer-partial` does. Current static failure occurs at plugin execution lines 110-141 and work-skill lines 108-124.

### 7. Progressive-reference activation tests

Add a small manifest/fixture check for a normal no-relay, compliance-disabled Tier-2 workflow and for relay/compliance/delegation branches:

- baseline must not select relay, compliance, durable-handoff, or full execution-guide references;
- relay selects relay reference only after target resolution;
- compliance-disabled never selects compliance reference;
- delegation selects the compact Codex orchestration reference;
- durable result selects handoff schema;
- all branches retain shared safety invariants.

Also reject the unconditional read wording currently at `plugins/knowzcode/skills/work/SKILL.md:15-20` and `plugins/knowzcode/skills/explore/SKILL.md:11-14`. Current tests fail on those phrases.

### 8. Generated-reference parity

When new Codex references are added, extend `scripts/sync-codex-relay-surfaces.mjs` `surfaces` and assert:

1. plugin reference exists;
2. npm adapter generation creates the corresponding `.agents/skills/knowzcode-*/references/...` file;
3. normalized generated content equals plugin content;
4. no reference is silently dropped by Markdown fence parsing.

The existing relay-reference smoke test is the pattern (`scripts/validate-platform-surfaces.mjs:480-505`).

## Prioritized Patch Ownership

Use dependency waves to avoid shared-file conflicts.

### Wave C1 — canonical contract (highest priority)

Owner: one Codex execution-contract builder.

- `knowzcode/knowzcode/codex_execution.md` (new canonical)
- `plugins/knowzcode/knowzcode/codex_execution.md` (generated/synchronized mirror)

Responsibilities: semantic capabilities, inheritance constraints, warm leases, conditional result modes, independent reviewer rule, and progressive-reference decision points. Do not touch skills/generator/validator in this wave.

### Wave C2 — npm/plugin distribution and red-green tests

Owner: one installer/validation builder after C1.

- `knowzcode/bin/knowzcode.mjs`
- `knowzcode/package.json` only if packaging needs an explicit addition; current `knowzcode/` include should already suffice
- `scripts/validate-platform-surfaces.mjs`
- new shared/Codex fixtures used by the agreed orchestration contract test runner

Responsibilities: canonical/plugin equality, fresh install, upgrade, preservation, contract identity, obsolete-name rejection, conditional-result scenarios, and installed-reference parity.

### Wave C3 — thin Codex skills and generated adapter references

Owner: one Codex skill-surface builder after C1 and after the shared reference taxonomy is fixed.

- `plugins/knowzcode/skills/work/SKILL.md`
- `plugins/knowzcode/skills/explore/SKILL.md`
- relevant new `plugins/knowzcode/skills/*/references/*.md`
- `scripts/sync-codex-relay-surfaces.mjs`
- `knowzcode/knowzcode/platform_adapters.md`
- `plugins/knowzcode/knowzcode/platform_adapters.md`

Responsibilities: remove stale names and unconditional framework/handoff loading; render branch-specific references into npm adapter templates. Avoid manual edits to generated mirrors after synchronization.

### Wave C4 — consolidated Codex audit

Owner: fresh read-only reviewer.

Audit canonical/plugin/npm install/upgrade equality, no Claude-agent leakage, no stale operation names, fixture routing, read-only no-write behavior, progressive reference selection, and preservation of safety gates. The first reviewer must not inherit builder conversation history; a compatible same reviewer may be resumed for bounded re-audit.

## Blockers

None for specification. Implementation should wait for the provider-neutral dispatch/context-capsule schema names to be fixed so the Codex guide does not invent competing fields.

### Concurrent spec reconciliation required

`knowzcode/knowzcode/specs/CodexRuntimeParity.md` appeared while this discovery was running. It covers most of the required surface, but two clauses should be corrected before builders treat it as final:

1. Its progressive-loading rule at line 60 still requires startup to read “the four project source-of-truth files.” If this means the loop, project, tracker, and architecture files, it preserves most of the current 759-line unconditional hydration. Replace this with active WorkGroup/context capsule plus the current phase and conditionally relevant references; enumerate any small files that truly remain mandatory.
2. Its warm-lease rule at line 54 and `CRP-08` say to release on “scope completion.” Every successful builder/reviewer dispatch completes a scope before a likely gap-fix/re-audit, so this wording can recreate the current close-immediately behavior. Release on lease expiry, final gate, incompatibility, sensitivity transition, explicit pressure/eviction, or when no likely bounded continuation remains—not merely because the first dispatch completed.

Also make the read-only guarantee explicit: when writes are prohibited, a child MUST use an ephemeral bounded result and MUST NOT create a handoff/artifact file.

## Remaining Work

None in this discovery slice.

## Next Phase Inputs

- Treat the `CodexRuntimeParity` VERIFY identifiers above as the Codex 1B acceptance contract.
- Make canonical distribution and failing install tests the first implementation wave; otherwise every later Codex behavior can drift between npm and plugin users.
- Preserve the existing no-`plugins/knowzcode/agents/` invariant.
- Reuse the shared dispatcher fixtures for behavioral validation; do not build a Codex-only controller solely to make documentation testable.
