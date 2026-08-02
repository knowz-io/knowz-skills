# Codex Execution Contract Implementation Handoff

## Phase

2A

## Status

complete

## Owned Files

- Added: `knowzcode/knowzcode/codex_execution.md`
- Updated: `plugins/knowzcode/knowzcode/codex_execution.md`
- Added: this handoff

No validators, skills, platform adapters, orchestration, specifications, or other implementation files were modified by this slice.

## Findings

### Implemented contract

- Made `knowzcode/knowzcode/codex_execution.md` the canonical Codex execution guide and made the plugin guide byte-identical.
- Replaced runtime-name-dependent lifecycle instructions with semantic `spawn`, `follow up`, `message`, `wait`, `interrupt`, `inspect`, and `release` operations plus capability detection and deterministic fallback (`codex_execution.md:23-46`).
- Added portable `local`, `resume`, `inherit-full`, `inherit-recent`, and `fresh-capsule` routing; Codex explicitly degrades the unsupported coordinated-team shape to coordinator-managed workers (`:50-65`).
- Added inheritance safety/model constraints and prohibited unverified Claude-style cache-discount claims on Codex (`:67-78`).
- Added hashed lineage compatibility, resume-before-respawn rules, bounded warm leases, capacity/depth limits, and explicit invalidation (`:82-108`). Initial dispatch completion alone does not expire a likely same-phase fix/re-audit lease.
- Made the first reviewer independent from builder reasoning lineage while allowing a compatible reviewer-owned re-audit resume (`:110-112`).
- Added progressive reference decisions so the active WorkGroup/capsule, current phase, assigned specs, and only activated policy branches load (`:116-128`).
- Replaced mandatory disk output with explicit `ephemeral`, `durable`, and `artifact` modes. Strict read-only/no-write tasks create no handoff or artifact; material/resumable work retains the existing handoff schema and coordinator authority (`:132-177`).
- Preserved strict Claude relay ownership, polling, session resume, safe permission mode, strict Bash sandbox, host takeover, and the no-Agent/fork-in-relay-v1 boundary (`:181-192`).
- Preserved and tightened read/write ownership, dependency waves, TDD, independent audit, consolidated verification, direct Knowz MCP, TTL/delta capture, enterprise master switches, provenance, signoff, vault-write gates, and conflict behavior (`:196-297`).

### Scoped verification

Commands and outcomes:

```text
cmp -s knowzcode/knowzcode/codex_execution.md plugins/knowzcode/knowzcode/codex_execution.md
-> mirror: identical

rg -n "\b(send_input|close_agent)\b" <both execution guides>
-> no matches

rg semantic/context/lease/handoff/relay/compliance markers in canonical guide
-> all required sections and safety markers found

git diff --check -- plugins/knowzcode/knowzcode/codex_execution.md
-> clean
```

No repository-wide validation was run because validator/installer/skill surfaces are assigned to later dependency waves and currently still encode the pre-contract behavior.

### Acceptance coverage

- `CRP-01`: source and plugin files exist and are byte-identical — satisfied for this slice.
- `CRP-05` through `CRP-11`: normative execution contract implemented.
- `CEO-01` through `CEO-09`, `CEO-11`, and `CEO-14`: Codex adapter guidance implemented where owned by this guide.
- `CRP-02` through `CRP-04` and `CRP-12`: intentionally deferred to installer/validator wave.
- Progressive changes to actual Codex skills and generated references: intentionally deferred to skill-surface wave.

## Wave C2 Skill-Surface Update

### Files

- Updated `plugins/knowzcode/skills/work/SKILL.md`.
- Updated `plugins/knowzcode/skills/explore/SKILL.md`.
- No platform adapters, sync scripts, validators, references, other skills, core guides, specs, or package files were edited in this wave.

### Implemented behavior

- Work startup now verifies initialization without eagerly reading all framework files, then begins with the active WorkGroup/context capsule and current phase. Project, tracker, architecture, execution, relay, and compliance sources load only for the selected path and a concrete need (`work/SKILL.md:15-26`).
- Native Phase 2A uses semantic capability operations with current examples, capability fallback, context-mode selection, and compatible warm-agent follow-up before spawn while preserving strict TDD, microtask criteria, dependency waves, and disjoint ownership (`work/SKILL.md:47-49`).
- Phase 2B starts the first independent reviewer on fresh reviewer-owned lineage, routes gaps to compatible original builders, resumes the same compatible reviewer for bounded re-audit, and preserves the three-iteration audit/fix cap and relay host-takeover behavior (`work/SKILL.md:50-53`).
- The Spawned-Agent Contract now resolves context mode and lineage, keeps reviewer independence, and chooses `ephemeral`, `durable`, or `artifact`. Strict no-write requests create no handoff/artifact; authoritative approval/checkpoint state remains coordinator-consolidated in the WorkGroup (`work/SKILL.md:111-132`).
- Explore startup now searches first, reads only concrete project/spec/history sections, and loads the execution guide only when parallel native routing is eligible (`explore/SKILL.md:11-18`).
- Parallel explorers use semantic capability detection, resume compatible warm explorers, stay bounded/read-only, and return ephemeral findings by default. Durable findings/artifacts are conditional on authorization and recovery value; zero-write scopes create no findings, handoff, summary, or artifact file (`explore/SKILL.md:20-35`).
- The final exploration deliverable always returns in chat and writes `summary.md` only when durable output is selected and writes are authorized (`explore/SKILL.md:37-64`).

### Wave C2 scoped verification

```text
rg obsolete/eager/absolute-disk patterns in work + explore
-> no matches

rg TDD/ownership/audit-cap/compliance/relay/finalization/context/result markers
-> required invariants and new contracts found

git diff --check -- plugins/knowzcode/skills/work/SKILL.md plugins/knowzcode/skills/explore/SKILL.md
-> clean
```

`CRP-05` through `CRP-11`, including `CRP-09A`, are now represented in the canonical guide and the two owned Codex skill entrypoints. Generated platform-adapter copies remain for the sync/validation owner.

## Blockers

None.

## Remaining Work

- Installer/validator owner must add canonical/plugin/install/upgrade parity tests and reject stale operation names across generated skills/adapters.
- Skill-surface owner must make `work`/`explore` startup conditional, render new references, and remove mandatory-disk wording from generated adapter surfaces.
- Independent reviewer must audit this guide fresh from approved specs rather than inherit this builder lineage.

## Next Phase Inputs

- Canonical guide: `knowzcode/knowzcode/codex_execution.md`
- Exact plugin mirror: `plugins/knowzcode/knowzcode/codex_execution.md`
- Specs: `knowzcode/knowzcode/specs/{ContextEfficientOrchestration,CodexRuntimeParity}.md`
- Verification baseline: source/plugin `cmp` succeeds; stale-operation grep is empty.
