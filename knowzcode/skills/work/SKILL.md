---
name: work
description: "Execute a full KnowzCode development workflow — TDD, quality gates, agent coordination, and structured implementation phases. Use when the user wants to BUILD, IMPLEMENT, or CREATE code, not just research or audit."
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
# Note: Vault access is CLI-first then MCP — see references/vault-access.md
argument-hint: "[feature_description]"
---

# Work on New Feature

Start a new KnowzCode development workflow session.

## Vault access

Before any vault search/save/ask, read [references/vault-access.md](references/vault-access.md). Prefer the **knowz CLI** (`/knowz-cli`) when `knowz` is on PATH; otherwise use Knowz MCP tools. Do not skip the workflow if only one of the two backends is available.

**Usage**: `/knowzcode:work "feature description"`
**Example**: `/knowzcode:work "Build user authentication with JWT"`

**Primary Goal**: $ARGUMENTS

## When NOT to Trigger

- User wants to **research or explore** without implementing → use `/knowzcode:explore`
- User wants a **single-file micro-fix** (<50 lines, no ripple effects) → use `/knowzcode:fix`
- User wants to **audit or scan** existing code quality → use `/knowzcode:audit`
- User is **asking a question** (starts with how/why/what/should, contains `?`)
- User wants to **save a learning** → use `/knowz save`

## Common Invocation Patterns

These phrases indicate `/knowzcode:work` intent:
- "build X", "implement X", "create X", "develop X"
- "add feature for X", "make X work", "set up X"
- "refactor X to Y", "migrate X to Y"

---

## Step 0: Prerequisite Check

Verify KnowzCode is initialized:
1. Check if `knowzcode/` directory exists
2. Check required files exist: `knowzcode_loop.md`, `knowzcode_tracker.md`, `knowzcode_project.md`, `knowzcode_architecture.md`

If missing: inform user to run `/knowzcode:setup` first. STOP.

## Step 1: Generate WorkGroup ID

**Format**: `kc-{type}-{slug}-YYYYMMDD-HHMMSS`

- `{type}`: feat, fix, refactor, or issue
- `{slug}`: 2-4 word kebab-case from goal (remove common words: build, add, create, implement, the, a, with, for)
- Truncate slug to max 25 characters

## Step 1.4: Classify and Reuse Before Side Effects

This is a read-only preflight. Complete it before any WorkGroup write, discretionary spawn, broad vault query, or team formation.

1. Classify the request:
   - Question/research intent -> redirect to `/knowzcode:explore`.
   - Single-file micro-fix under 50 lines with no ripple effects -> redirect to `/knowzcode:fix`.
   - Otherwise continue as implementation.
2. Search `knowzcode/specs/*.md` by goal terms. If a comprehensive approved spec exists, offer Quick, Validation (recommended), or Full discovery before launching agents. Record the selected reuse path.
3. Run the complexity rules from Step 5.5 now and set `TIER = 2|3`. Tier 1 has already redirected. Announce the tier; honor `--tier light|full`.
4. For each known non-trivial unit, prepare routing evidence in memory: role, phase, NodeIDs/microtask, owned files, dependencies, coupling, expected context reuse, sensitivity, reviewer-independence need, and any compatible lineage candidate. Do not spawn yet.

Steps 5, 5.5, and 6 later consume this preflight result; they do not repeat broad searches.

## Step 1.5: Pre-flight Profile Parse

Runs BEFORE Step 2 so profile-related flag conflicts halt without side effects (no orphan teams).

1. Parse `--profile=<value>` from `$ARGUMENTS`:
   - Present and value is `advisor`, `teams`, `classic`, or `frontier` → `PROFILE_PREFLIGHT = <value>`
   - Present but value is none of the four → halt with: `**Error:** --profile value "{value}" is invalid. Use advisor, teams, classic, or frontier.`
   - Absent → continue to config fallback
2. If flag absent, read `knowzcode/knowzcode_orchestration.md` with a targeted grep for `^profile:\s*(\S+)`:
   - Value is `advisor`, `teams`, `classic`, or `frontier` → `PROFILE_PREFLIGHT = <value>` (a persisted choice — never re-ask)
   - Invalid value → log warning, `PROFILE_PREFLIGHT = "frontier"`
   - File absent or line absent → **one-time profile choice** (ask once, persist forever):
     - If autonomous intent is present (the `--autonomous`/`--auto` flags or the natural-language signals from Step 2.5, checked against `$ARGUMENTS` and the user's preceding message): do NOT prompt. `PROFILE_PREFLIGHT = "frontier"`, log `[AUTO-DEFAULT] profile: frontier — set profile: in knowzcode_orchestration.md to change`, and do not write the config (the user hasn't chosen).
     - Otherwise, ask once via AskUserQuestion: **"Execution profile for this project?"** — **Frontier (Recommended)**: Fable plans/specs/reviews, Opus executes; most capable planning, premium cost, auto-falls back to Opus if Fable is unavailable. **Teams**: all agents on standard models (mostly Opus); standard cost, no Fable dependency.
     - Set `PROFILE_PREFLIGHT` to the answer and **persist it** so no future run asks: update the `profile:` line in `knowzcode/knowzcode_orchestration.md` (or append an `## Execution Profile` block with the line if the file exists without one; create the file with a minimal header + the line if absent).
     - This prompt is `/knowzcode:work`-only — `/knowzcode:audit`, `/knowzcode:explore`, and `/knowzcode:fix` never ask; they read the persisted value or use the `frontier` default silently.
3. Profile selection controls model/advisor behavior, not coordination mode. `--sequential` and `--subagent` remain valid with every profile; a profile never forces Agent Teams.
4. Parse `EXECUTE_ON_FABLE` (affects only `frontier`): `true` if `$ARGUMENTS` contains `--fable-execution`; else read `knowzcode/knowzcode_orchestration.md` with a targeted grep for `^execute_on_fable:\s*(\S+)` (`true`/`false`, default `false`). Pure metadata like the profile parse above — resolving it here (not in Step 2.4) makes it available to the Step 2.3 announcement and downstream-use directive, both of which run before the Step 2.4 config load.

This step is a pure-metadata parse (no spawns or writes). The full orchestration-config load happens later in Step 2.4 and supersedes `PROFILE_PREFLIGHT` by setting `PROFILE` through the same logic. Step 2.3 then runs advisor-specific env detection and final announcement. See `${CLAUDE_PLUGIN_ROOT}/skills/work/references/profile-models.md` for profile semantics.

## Step 1.6: Cross-Agent Relay Pre-flight Parse

This is metadata-only. Set `RELAY_HOST = claude`; resolve selectors `none | auto | other | claude | codex` from explicit flag, unambiguous natural-language implementation delegation, then config, with `none` winning. Reject explicit same-host targets and never reverse them. A stale same-host config falls back to native Phase 2A. Run only `command -v` here; live version/auth detection waits until Tier 3 and Gate #2.

When relay intent exists, load [references/relay-execution.md](references/relay-execution.md) and use its complete precedence, provider settings, timeout, strict permission/MCP/browser boundary, exact-cwd/session state, budget, resume, and takeover rules. Claude relay accepts only exec/stream-json and `dontAsk`; reject `bypassPermissions` and forced Claude MCP. Relay requires Tier 3, replaces only Phase 2A/fix rounds, and never enables native Agent/fork/Team transport. Announce the resolved host, target, model, and effort.

## Step 2: Select Execution Mode

Use the Step 1.4 classification and the portable router in `knowzcode/claude_code_execution.md` to prepare a route. Finalize it after Step 2.4 applies rollout/profile/caps/lease settings and before any dispatch. Every non-trivial delegated unit resolves exactly one of `local`, `resume`, `inherit-full`, `inherit-recent`, `fresh-capsule`, or `coordinated-team`, plus a reason code.

Routing precedence is `local -> compatible resume -> compatible inheritance -> fresh capsule -> coordinated team`:

1. `local` for trivial, tightly coupled, or blocking work where delegation costs more.
2. `resume` when role, scope, spec, checkpoint, model/effort, tools, permissions, sensitivity, and transcript lineage remain compatible. Send only a bounded delta.
3. `inherit-full` only through a real callable Claude conversation fork when the worker needs the current reasoning path and must keep the same model/tools/permissions. On supported Claude rollouts, invoke `Agent(subagent_type="fork", description="<short task>", prompt="<bounded objective>")` only after the capability is present and `CLAUDE_CODE_FORK_SUBAGENT` has not disabled it; otherwise record `CAPABILITY_FALLBACK` and use `fresh-capsule`. `context: fork` on a skill is isolated execution and is not conversation inheritance.
4. `inherit-recent` only when the runtime exposes bounded inheritance; otherwise record `CAPABILITY_FALLBACK` and use `fresh-capsule`.
5. `fresh-capsule` for independent/noisy work, narrower access, changed runtime keys, or any independent reviewer.
6. `coordinated-team` only when at least two active peers need a shared task graph or direct peer messaging. Parallel independent work remains named-agent delegation.

User preferences:

- `--subagent` disables Team mode and conversation inheritance; use local/resume/fresh named agents.
- `--sequential` disables Team mode and parallel fan-out; retain compatible named agents through fix loops.
- `PROFILE_PREFLIGHT == "classic"` disables Team mode and conversation inheritance but may still resume a compatible named worker.

Team eligibility additionally requires explicit Agent Teams opt-in, the current teammate capability, and peer coordination that named agents cannot provide. Before the first teammate spawn in a run, require that the user explicitly requested teammates/Team mode in the current task or obtain the documented user confirmation; persisted environment availability alone is not approval. A profile, tier, parallel work, or knowledge capture never supplies opt-in. Do not probe availability by invoking a removed lifecycle API. When eligible, the first teammate spawn forms a session-derived team; treat its identity as opaque. If that spawn is unavailable, record `CAPABILITY_FALLBACK` and dispatch equivalent named agents with no reduction in TDD, gates, vault capture, security, or compliance.

Announce one workflow mode before phase work:

- `**Execution Mode: Adaptive Delegation** — local/resume/fork/capsule routing per task`
- `**Execution Mode: Sequential Delegation** — bounded named agents, resume-first gap loops`
- `**Execution Mode: Coordinated Team** — peer messaging/task graph required; smallest viable roster`

In Team mode the lead coordinates and remains the sole WorkGroup writer. Request graceful teammate shutdown after deliverables; runtime cleanup is automatic at session end. In named-agent modes, use the dispatch parameters in the phase references. All paths preserve the same phases, quality gates, captures, and safety exceptions.

## Step 2.3: Resolve Execution Profile

Load [references/profile-models.md](references/profile-models.md) only before the first profiled spawn or when a fallback must be resolved. Apply its advisor/Fable availability checks, announce `**Execution Profile: {PROFILE}**` plus any exact fallback reason, and degrade unsupported Fable spawns to Opus without restarting.

Every spawn/resume resolves `MODEL_FOR(agent_name, PROFILE, EXECUTE_ON_FABLE)`, keeps model/effort stable within a lineage, and resolves the advisor/spec-depth prompt placeholders from [references/spawn-prompts.md](references/spawn-prompts.md). Profiles select model/tool policy only: no profile enables or requires Agent Teams.

## Step 2.4: Load Orchestration Config (Optional)

Read only the YAML keys needed by the selected tier/path. Resolve flags over config over these defaults:

- orchestration: `MAX_BUILDERS=2` (clamp 1-3, or 1-5 only with `--broad-builders`), `BUILDER_NODE_LIMIT=1` (1-2), `DEFAULT_SPECIALISTS=[]`, `MCP_AGENTS_ENABLED=true`, `CODEBASE_SCANNER_ENABLED=true`, `PARALLEL_SPEC_THRESHOLD=3` (2-10), and frontend/enterprise settings documented in [parallel-orchestration.md](references/parallel-orchestration.md);
- model: `PROFILE=frontier`, `EXECUTE_ON_FABLE=false`; Step 1.5 flags win;
- overrides: honor `--max-builders`, `--builder-node-limit`, `--broad-builders`, `--no-mcp`, `--no-scanners`, `--no-parallel-specs`, frontend flags, and enterprise-enforcer flags.

Parse the complete `context_efficiency` block and consume it:

- `enabled` -> `CE_ENABLED=true`; `rollout` -> `CE_ROLLOUT=off` (`off|observe|shadow|canary|on`); `profile` -> `CE_PROFILE=balanced` (`quality|balanced|economy|latency`). This efficiency profile changes context/fan-out thresholds only, never the model profile or Team eligibility.
- `max_active_inherited` -> `CE_MAX_ACTIVE_INHERITED=2`; `max_nesting_depth` -> `CE_MAX_NESTING_DEPTH=2`, both positive integers. Enforce them before every resume/inheritance dispatch; a fork cannot fork again.
- `warm_lease_minutes` -> `CE_WARM_LEASE_MINUTES=20`; set lineage lease expiry from last use and release at expiry, final gate, incompatibility, sensitivity change, capacity pressure, or no likely same-phase continuation.
- `mcp_health_ttl_minutes` -> `MCP_HEALTH_TTL_MINUTES=15`; reuse both healthy and failed probes inside the TTL unless connectivity/vault config changes.
- `disk_handoff_threshold` -> `CE_RESULT_POLICY=material`: tiny read-only checks are ephemeral; material cross-agent/phase work is durable; large authorized raw output is artifact-backed. Never create an artifact when writes are prohibited.
- `telemetry` -> `CE_TELEMETRY=local` (`off|local|provider`); `canary_percent` -> `CE_CANARY_PERCENT=10` (clamp 0-100). Telemetry records only redacted logical, billed, and outcome namespaces—never prompt bodies, repository paths, or provider handles.

Rollout behavior: disabled implies `off`; `off` uses safe local/resume/fresh routing without conversation inheritance and emits no efficiency event; `observe` records the actual safe route; `shadow` executes that route and records the adaptive recommendation; `canary` applies adaptive routing only to a stable anonymous WorkGroup bucket below `CE_CANARY_PERCENT`; `on` applies it to all eligible units. Every mode still permits a smallest viable coordinated team only for real peer coordination and preserves all gates/safety controls. `quality` favors fuller safe context, `economy` favors local/resume/capsules and minimum fan-out, `latency` permits bounded parallelism, and `balanced` uses defaults.

### Executable Context Runtime Boundary

When `CE_ENABLED = true`, the installed read-only runtime is mandatory for every non-trivial dispatch. Invoke:

`node knowzcode/context_efficiency_runtime.mjs dispatch`

Send exactly one JSON object on stdin with `{routing, rollout, lineage?, result_policy?}` and require exactly one `{ok:true,operation:"dispatch",result}` object on stdout. The operation writes no files. Use its selected safe mode/reason and rollout result; do not substitute prose-only routing.

Direct safety calls are also mandatory at the point of use:

- Before sealing or sending a fresh capsule, call operation `capsule` with `{capsule,max_bytes?,artifact_path?,artifact_roots?}`. Any evidence externalization MUST pass `artifact_roots:["knowzcode/artifacts"]`; use only the validated canonical capsule/hash returned by the runtime.
- Before any resume or inheritance, call `lineage` with `{lineage,current,now?}`. Resume/inherit only a returned compatible state; `RECONCILE_REQUIRED` must reconcile before reuse.
- Before selecting ephemeral/durable/artifact output, call `result-policy` with `{input}` and enforce both its result and the current write authorization.
- Before each gate or final vault capture, call `vault-delta` with `{input:{delta,previous_deltas?,previous_hashes?,explicit_save?,interruption_sensitive?,severity?}}`. Honor `skip`, target the existing identity for `amend`/`update`, retain normal `batch` deltas in the coordinator-owned journal, and persist only on `flush` or final consolidation.
- Call `rollout` with `{input}` only when a separate rollout decision is needed and `telemetry` with `{event}` only when the selected rollout permits redacted recording.

Rollout controls adaptive recommendation application and telemetry only. `off` still performs dispatch, capsule/privacy, lineage, ownership, reviewer-independence, and result-policy safety validation. Any capsule privacy/schema rejection or incompatible/unknown lineage fails closed: do not dispatch that capsule and do not resume/inherit that lineage. Rebuild/reconcile and validate again, or keep the unit local. Never convert a safety rejection into `CAPABILITY_FALLBACK`.

Use `CAPABILITY_FALLBACK` only when a non-safety recommendation or telemetry function is unavailable while direct safety checks still succeed; execute the validated local/fresh baseline. If the runtime or a required safety operation is unavailable while enabled, keep the unit local, make no inheritance/cache-savings claim, and report `CONTEXT_RUNTIME_UNAVAILABLE` rather than bypassing validation.

## Step 2.5: Autonomous Mode Detection

Set `AUTONOMOUS_MODE = true` if ANY of these match:

a. **Flags**: `$ARGUMENTS` contains `--autonomous` or `--auto`

b. **Natural language** (case-insensitive match in `$ARGUMENTS` OR the user's preceding conversation message):
   - Approval intent: "approve all", "pre-approve", "preapprove", "auto-approve"
   - Mode intent: "autonomous mode", "autonomous", "unattended", "hands off", "hands-off"
   - Proceed intent: "don't stop to ask", "don't ask me", "no approval needed", "just run through", "run it all", "run straight through", "proceed without asking", "skip the gates", "go all the way through"
   - Delegation intent: "I trust your judgement", "use your best judgement", "defer to your judgement", "you decide"

c. **Contextual** — if the user's message conveys clear intent for the lead to operate without stopping (even if none of the exact phrases above match), interpret that as autonomous mode. The spirit of the instruction matters more than exact phrasing.

Default: `AUTONOMOUS_MODE = false`

If `AUTONOMOUS_MODE = true`, announce after the execution mode announcement:
> **Autonomous Mode: ACTIVE** — Gates presented for transparency but auto-approved.
> Safety exceptions still pause: critical blockers, HIGH/CRITICAL security findings, >3 same-phase failures, complex architecture discrepancies, >3 gap-fix iterations per builder scope.

**Autonomous + Vault Write Rule**: Autonomous mode auto-approves quality gates — it does NOT skip mandatory `vault-delta` classification, WorkGroup files, tracker updates, or log entries. `skip` and `batch` intentionally perform no gate-time persistence; only `amend`, `update`, or `flush` may write. Final consolidation and completion artifacts remain mandatory. "Autonomous" means "no user approval needed for gates" — it does not mean "skip the workflow structure."

## Step 2.6: Specialist Detection

Load the “Conditional Roles and Standards” section of [references/parallel-orchestration.md](references/parallel-orchestration.md) only if specialist, UI, or compliance evidence may be relevant. Resolve the minimum evidence roles after tier classification; Tier 2 never launches a default panel. Named agents are the default and Team mode remains independently coordination-gated.

## Step 2.6.1: Frontend Designer Auto-Detection

Apply the referenced first-match flag/config/request/UI-surface rule. Keep `FRONTEND_DESIGNER_ENABLED=false` unless it resolves true, and announce the reason only when active or explicitly disabled.

## Step 2.6.2: Enterprise Enforcer Auto-Detection

Apply the referenced explicit opt-out/opt-in/active-source rule. Load the manifest/config only when present or explicitly requested, carry its load-bearing keys, and default to per-agent compliance checks. Team mode is not required.

The conditional enterprise contract covers local `enterprise.md`, `guideline_knowledge_ids`, `guideline_vault_sources`, and `compliance_vault_id`; preserve source/KnowledgeId provenance with created/updated metadata. Carry and enforce `include_in_audit`, `require_signoff_for_finalization`, `show_advisory_issues`, `pull_standards_at_start`, `push_audit_results`, `push_completion_records`, and `preserve_guideline_provenance` as detailed in the reference.

## Step 3: Load Current-Phase Context

Load only the current phase contract, selected approved spec/VERIFY criteria, relevant tracker rows, and directly implicated project/architecture sections. Do not preload the full loop, completed phase history, or unrelated project/architecture material. Load spawn, gate, relay, and role references immediately before the chosen path needs them; a named agent automatically receives its definition.

## Step 3.5: Pull Team Standards (MCP — Optional)

Run only when compliance is active, `pull_standards_at_start` permits it, MCP compliance is enabled, and a concrete vault/KnowledgeId source is configured. Follow the standards/provenance/conflict rules in [references/parallel-orchestration.md](references/parallel-orchestration.md). Otherwise skip without probing MCP.

## Step 3.6: MCP Health + Baseline Vault Reuse

If `MCP_AGENTS_ENABLED = false` (from Step 2.4, e.g. `--no-mcp`), skip this entire step. Set `MCP_ACTIVE = false`, `VAULTS_CONFIGURED = false`, `VAULT_BASELINE = null`.

Otherwise reuse a timestamped probe/baseline younger than `MCP_HEALTH_TTL_MINUTES`; provider reconnect, changed vault config, or expiry invalidates it. Probe only when the workflow has a named prior-decision/policy question or a required capture path. Parse `knowz-vaults.md` first and call `list_vaults` only if discovery is needed. Preserve configured vault IDs when a probe fails so captures can queue, and share the result with children inside the TTL.

Query only vaults relevant by routing description to the named question—never every vault for generic coverage. Store a bounded `VAULT_BASELINE` with item refs/dates/conflicts, treat it as historical context, and verify it against live code/tests/docs. Children reuse it and make only documented targeted follow-ups. If no question/capture currently needs MCP, leave the baseline null and defer the probe.

## Step 4: Create WorkGroup File

Create `knowzcode/workgroups/{WorkGroupID}.md`:
```markdown
# WorkGroup: {WorkGroupID}

**Primary Goal**: {$ARGUMENTS}
**Created**: {timestamp}
**Status**: Active
**Current Phase**: 1A - Impact Analysis
**Autonomous Mode**: Active/Inactive
**KnowledgeId:**

## Change Set
(Populated after Phase 1A)

## Todos
- KnowzCode: Initialize WorkGroup
- KnowzCode: Complete Phase 1A impact analysis

## Phase History
| Phase | Status | Timestamp |
|-------|--------|-----------|
| 1A | In Progress | {timestamp} |
```

Use task lists to plan and track work throughout. Add new tasks as discoveries or needs emerge during each phase.

## Step 5: Confirm Input Classification

**Question indicators** (suggest `/knowzcode:explore` instead): starts with is/does/how/why/what/should, contains `?`, phrased as inquiry.

**Implementation indicators** (proceed): starts with build/add/create/implement/fix/refactor, action-oriented verbs.

Use the result from Step 1.4. If later evidence changes the classification, stop before spawning and re-route explicitly.

## Step 5.5: Confirm Complexity Classification

Confirm the `TIER` selected during the read-only Step 1.4 preflight. Do not repeat broad repository or vault discovery here.

### Tier 1: Micro → redirect to `/knowzcode:fix`
- Single file, <50 lines, no ripple effects

### Tier 2: Light (2-phase workflow)

> **Note:** Light mode ignores parallel fan-out/specialist settings, but still consumes context-efficiency rollout, lease, TTL, result, telemetry, and safety settings. It remains one builder with no default scouts or specialists.

ALL must be true:
- ≤3 files touched
- Single NodeID (1 new capability)
- No architectural changes
- No security-sensitive components (auth, payments, PII)
- No external API integrations
- Estimated <200 lines of change

### Tier 3: Full (5-phase workflow)
ANY triggers full:
- >3 files or >1 NodeID
- Architectural impact
- Security-sensitive scope
- External integrations
- User explicitly requests: `--tier full`

**Announce the detected tier to the user.** User can override:
- "use full" or `--tier full` → Tier 3
- "use light" or `--tier light` → Tier 2

If `$ARGUMENTS` contains `--tier light`, force Tier 2. If `--tier full`, force Tier 3.

---

## Tier 2: Light Workflow (2-phase fast path)

When Tier 2 is selected, execute this streamlined workflow instead of the 5-phase Tier 3 below.

> **Tier 2 still requires**: WorkGroup file (Step 4), tracker updates, log entry, and vault capture attempt. "Light" means fewer agents and phases — not fewer artifacts or vault writes.

> **Relay**: not supported in Tier 2. If `RELAY_ACTIVE`, announce `> **Relay: SKIPPED** — Tier 2 Light uses the native builder flow.` and proceed normally.

Read [references/light-workflow.md](references/light-workflow.md) for complete phase details (dispatch, Light Phase 1 through Light Phase 3, vault write checklist).

**Phase summary**:
- **Dispatch**: Resume a compatible knowledge-liaison or dispatch one bounded named agent only when the baseline needs deeper research. Team mode is not required.
- **Light Phase 1** (inline): Impact scan → draft lightweight spec → present combined Change Set + Spec gate → on approval, update tracker and pre-implementation commit.
- **Light Phase 2A**: Resume a compatible builder or dispatch `Agent(subagent_type="knowzcode:builder", description="Light Phase 2A implementation", prompt=<compact capsule>)`. Builder self-verifies against VERIFY criteria — no separate audit.
- **Light Phase 2B** (opt-in): Spawn smoke-tester if user requested `--smoke-test`. 3-iteration cap. Skip if not requested.
- **Light Phase 3** (inline): Update spec to As-Built, update tracker `[WIP]` → `[VERIFIED]`, write log entry, dispatch one classified writer persistence, verify explicit staged paths, and create the final commit.

**DONE** — Lightweight workflow: bounded knowledge context + one builder lineage. Skipped: analyst, architect, reviewer, closer.

---

## Tier 3: Full Workflow (5-phase)

The standard 5-phase workflow. Used when complexity warrants full analysis, specification, audit, and finalization.

Tier 3 uses the per-task routing selected in Step 2:
- **Adaptive Delegation** (default) — local/resume/inheritance/fresh named-agent routing with bounded parallelism
- **Sequential Delegation** (`--sequential`) — one ready scope at a time, with resume-first phase and gap loops
- **Coordinated Team** — optional only when active peers need mailbox/task-list coordination

**Smoke testing**: Tier 3 recommends smoke testing at Phase 2B. At Gate #2, note to the user that smoke testing will run alongside the reviewer. The user can decline. If not declined, the smoke-tester is spawned at Stage 2 alongside reviewers (see [parallel-orchestration.md](references/parallel-orchestration.md)).

## Step 6: Apply Spec-Reuse Decision

Use the targeted spec search completed in Step 1.4. If comprehensive matching specs were found, apply the selected path:
   - **A) Quick Path** — skip discovery, use existing specs
   - **B) Validation Path** (recommended) — quick check specs match codebase
   - **C) Full Workflow** — complete Phase 1A discovery

If no match was found, proceed to Phase 1A. Do not repeat the same broad spec search in each child.

### Refactor Task Check

Scan `knowzcode/knowzcode_tracker.md` for outstanding `REFACTOR_` tasks that overlap with the current goal's scope. If found, mention them to the user during Phase 1A so the analyst can factor them into the Change Set.

---

## Parallel Orchestration (Tier 3 Default)

**Parallel Orchestration**: Read [references/parallel-orchestration.md](references/parallel-orchestration.md) for Stages 0-3 orchestration details, WorkGroup file format, and task dependency graph.

> **MCP Health Note:** Reuse the lead's timestamped health/baseline inside the configured TTL. Child agents do not repeat the probe; retry only after expiry or a material connectivity/configuration change.

- **Stage 0**: Use deterministic local indexing and the MCP/vault baseline, start one analyst, then add architect/scanner/specialist agents only for independently useful scopes
- **Stage 1**: Analyst completes Change Set → Gate #1 → Architect drafts specs → Gate #2
- **Stage 2**: Dependency-wave builders (default 1 NodeID/microtask per builder) + paired reviewers + gap loop
- **Stage 3**: Closer returns the finalization delta; the lead classifies it, dispatches the bounded writer, applies explicit file updates, and shuts down workers

---

## Relay Execution (Tier 3, when `RELAY_ACTIVE`)

When `RELAY_ACTIVE = true` (Step 1.6), Phase 2A and the builder gap loop are replaced by the cross-agent relay — read [references/relay-execution.md](references/relay-execution.md) and follow it exactly. `RELAY_HOST` retains planning, specifications, gates, review, checkpoints, and finalization; `RELAY_TARGET` implements and performs bounded fix rounds. Phases 1A/1B (Gates #1/#2), Phase 2B (Gate #3), and Phase 3 otherwise run unchanged.

Summary (authoritative detail lives in the reference):
1. **Live preflight + branch**: run the full target-specific `RELAY_DETECT` now (Step 1.6 only checked executable existence). Refuse the default branch — create/reuse `kc-relay/{wgid}`; require a clean tree; record checkpoint C0. Create `knowzcode/workgroups/{wgid}-relay/` with schema-2 `state.md` (`Host`, `Target`, role-based state, `Session ID`) and add the `## Relay` snapshot to the WorkGroup file.
2. **Brief**: after Gate #2 approval, write `brief-r0.md` from the Change Set + spec *path* references — the target reads every spec in-repo; do not inline spec bodies unless a spec file is missing.
3. **Target leg**: the lead runs the in-turn polling protocol directly in adaptive, sequential, and named-agent modes. Delegate one leg to **relay-runner** only as a teammate when coordinated Team mode was already independently justified, explicitly approved, and its live messaging capability is callable; never dispatch relay-runner as an ordinary named `Agent()` because it cannot exchange session-ID/progress/time decisions mid-turn. Codex supports synchronous MCP or `codex exec`; Claude supports exec/stream-json only. Every exec path uses an exit marker and **in-turn polling — never end a turn to await a background notification**. Persist the target session ID immediately (`thread.started.thread_id`, MCP `structuredContent.threadId`, or Claude `system/init.session_id`). Artifacts are target-qualified (`{target}-log-rN.jsonl`, `{target}-last-rN.md`, `{target}-err-rN.log`). No builders spawn; `max_builders` does not apply.
4. **Checkpoint + review**: on a successful target result, the lead commits `KnowzCode relay: {Target} round {N} for {wgid}`; Phase 2B reviews exactly that checkpoint diff; Gate #3 runs normally.
5. **Fix rounds**: gaps → `feedback-r{N}.md` plus a bounded `delta-prompt-r{N}.md` for a valid warm resume and a self-contained `fix-prompt-r{N}.md` cold-recovery brief. Resume the persisted Session ID at `RELAY_FIX_EFFORT`, up to `RELAY_MAX_FIX_ROUNDS`. Codex uses `codex-reply`/`codex exec resume`; Claude starts from the same cwd with `claude -p --resume {session_id}`, stream JSON, and the configured per-leg budget. Use the cold brief only when resume is invalid/unavailable.
6. **Host takeover**: cap reached, a gap repeats two rounds, or the target fails twice → `HOST_TAKEOVER`; remaining gaps enter the native builder gap loop (existing 3-iteration cap and pauses apply). This is the designed final leg, not an error.
7. **Finalize**: Phase 3 closer unchanged. Failures and fallbacks follow the reference's matrix; autonomous mode auto-proceeds rounds but keeps all Gate #3 safety exceptions and pauses on auth failures.

---

## Phase Prompt Reference

**Spawn Prompts**: Immediately before a selected dispatch, read only that role/phase section of [references/spawn-prompts.md](references/spawn-prompts.md). Do not load unrelated role prompts or ask a named agent to reread its definition.

**Quality Gates**: At a checkpoint, read only the current gate or gap-loop section of [references/quality-gates.md](references/quality-gates.md). Gate #1, #2, #3, blockers, captures, and consolidated verification remain mandatory on their applicable paths.

### Phase Summary

| Phase | Agent | Gate | Key Output |
|-------|-------|------|------------|
| 1A | analyst | #1: Change Set | NodeIDs, dependency map, risk assessment |
| 1B | architect | #2: Specifications | Specs with VERIFY criteria |
| 2A | builder(s) — or, when `RELAY_ACTIVE`, the resolved external target polled by the lead (relay-runner teammate only in an already-justified approved Team) | — | Implementation + tests |
| 2B | reviewer(s) | #3: Audit Results | ARC completion, gap reports |
| 2B | smoke-tester | #3: Audit Results | Runtime verification, smoke pass/fail |
| 0–3 | frontend-designer | All gates | Design Questions Bundle, Design Impact Report, Design Audit Report (conditional, UI projects) |
| 0–3 | enterprise-enforcer | All gates | Compliance posture, ARC coverage, [COMPLIANCE-BLOCK] tagging (conditional, compliance_enabled) |
| 3 | closer | — | Delegated finalization edits plus `FinalCaptureDelta`, explicit changed paths, verification summary, and suggested commit message for the lead |

When `frontend-designer` is active alongside `smoke-tester`: smoke-tester owns app boot and basic happy path; frontend-designer waits for app readiness and performs spec-driven E2E. Smoke-tester does not tear down the app until frontend-designer reports complete.

---

## Cleanup

### After Phase 3 Completes

**Coordinated Team Mode**: Request graceful shutdown from active teammates and wait for deliverable/checkpoint confirmation. Team cleanup is runtime-managed at session end; do not invoke a separate delete operation.

**Named-agent modes**: Release completed lineages. Retain a handle only for a compatible bounded phase/fix-loop lease; durable capsules remain the recovery path.

### If User Cancels Mid-Workflow

Follow the abandonment protocol from `knowzcode_loop.md` Section 12:

1. **Preserve user state and unwind only proven workflow-owned changes** — inspect the pre-WorkGroup checkpoint, `git status --short`, and explicit owned paths. Never run a blanket revert, reset, checkout, clean, or stash. Restore a path only when the workflow created its current delta, the preexisting state is known, and doing so cannot overwrite unrelated user work; otherwise preserve the delta, record it in the abandonment report, and ask the user how to handle it.
2. **Update tracker** — set all affected NodeIDs back to their pre-WorkGroup status
3. **Log abandonment** — create a log entry with type `WorkGroup-Abandoned` including the reason and phase at abandonment
4. **Close WorkGroup file** — mark the WorkGroup as `Abandoned` with timestamp and reason
5. **Preserve learnings** — if any useful patterns were discovered, capture them before closing
6. **Worker teardown** — gracefully release active teammates or named workers after checkpoint/capture; runtime-managed team cleanup requires no delete step
7. **Parallel mode**: If cancelled mid-Stage-2, stop writers, preserve their explicit path/checkpoint evidence, unwind only safely attributable workflow-owned changes under step 1, and mark the WorkGroup abandoned

The WorkGroup file remains in `knowzcode/workgroups/` for reference. It can be resumed later with `/knowzcode:work` referencing the same goal.

---

## Handling Failures

- Phase 1A rejected: re-run analyst with feedback
- Phase 1B rejected: resume the architect with a bounded delta when lineage remains compatible; otherwise start fresh and record the invalidation
- Phase 2A blocker encountered: present Blocker Report (per loop.md Section 11) to user with 5 recovery options: (1) modify spec, (2) change approach, (3) split WorkGroup, (4) accept partial with documented gap, (5) cancel WorkGroup
- Phase 2B audit shows gaps: return to 2A with gap list (see Gap Loop in [references/quality-gates.md](references/quality-gates.md))
- If >3 failures on same phase: PAUSE and ask user for direction (applies even when `AUTONOMOUS_MODE = true` — this is a safety exception)

## Orchestration Flags

These flags override corresponding config defaults in `knowzcode/knowzcode_orchestration.md`:

| Flag | Effect |
|------|--------|
| `--max-builders=N` | Cap concurrent independent builders (1-3 by default; up to 5 only with `--broad-builders`) |
| `--builder-node-limit=N` | Cap NodeIDs per builder dispatch (default 1, max 2) |
| `--broad-builders` | Explicitly allow wider builder fan-out for tiny, independent NodeIDs |
| `--specialists[=csv]` | Enable specialist agents (security, test, project) |
| `--no-specialists` | Disable specialists even if configured |
| `--no-mcp` | Skip MCP vault agents |
| `--no-scanners` | Skip codebase scanners at Stage 0 |
| `--no-parallel-specs` | Force Path A spec drafting regardless of NodeID count |
| `--sequential` | Force one ready scope at a time; preserve compatible named-agent lineage |
| `--subagent` | Disable Team mode and conversation inheritance; use local/resume/fresh named agents |
| `--profile={advisor\|teams\|classic\|frontier}` | Select execution profile — see `references/profile-models.md` |
| `--fable-execution` | (frontier only) Also route execution agents to Fable for high-value jobs |
| `--relay=none\|auto\|other\|claude\|codex` | Disable relay, select the opposite provider, or name the implementation target explicitly. Flag > unambiguous natural language > config; Tier 3 only; incompatible with `advisor` |
| `--relay-model=` | Model override for the resolved relay target (target-specific config/default otherwise) |
| `--relay-effort=` | Reasoning-effort override for the resolved relay target |
| `--relay-max-fix-rounds=N` | Target fix rounds before the host takes over (default 2, range 1-3) |
| `--autonomous` / `--auto` | Autonomous mode — gates auto-approved |
| `--tier {light\|full}` | Override complexity tier |
| `--smoke-test` | Request smoke testing in Tier 2 |
| `--frontend-designer` | Force-enable frontend-designer even without UI detection |
| `--no-frontend-designer` | Force-skip frontend-designer even if UI detected |
| `--frontend-designer-blocking` | Elevate frontend-designer to officer mode (HIGH = [DESIGN-CONCERN-BLOCK]) |
| `--enterprise-enforcer` | Force-enable enterprise-enforcer (skeleton mode if no manifest) |
| `--no-enterprise-enforcer` | Force-skip enterprise-enforcer (use per-agent compliance fallback) |

The `advisor` profile controls model/advisor behavior and requires Claude Code v2.1.100+ with direct Anthropic API access; it does not force Team mode. The `frontier` profile routes planning/analysis/spec/review to Fable and execution to Opus (add `--fable-execution` to also execute on Fable for high-value jobs); it needs the direct Anthropic API (or Claude Platform on AWS) and gracefully falls back to Opus if Fable is unavailable. See `references/profile-models.md` for the full profile -> agent-model mapping.

## Related Skills

- `/knowzcode:explore` — Research and explore before implementing
- `/knowzcode:fix` — Single-file micro-fix (<50 lines)
- `/knowzcode:audit` — Read-only quality and security scan
- `/knowz save` — Capture learnings to vault
- `/knowzcode:continue` — Resume an active WorkGroup

## KnowzCode: Prefix Enforcement

Every task item in workgroup files MUST start with `KnowzCode:`. Pass this to all agents.
