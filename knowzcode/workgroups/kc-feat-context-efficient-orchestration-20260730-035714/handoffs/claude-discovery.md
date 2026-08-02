# Claude Runtime Discovery Handoff

**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`
**Scope:** Phase 1A/1B read-only discovery for Claude conversation forks, resumable subagents, Agent Teams, prompt caching, plugin-agent permissions, and the strict Claude relay target
**Observed runtime:** `claude 2.1.220`
**Implementation status:** No implementation or specification files changed by this handoff

## Executive Finding

The hybrid `resume -> fork -> fresh -> team` direction is sound, but the Claude implementation must begin with compatibility repair. The current workflow still calls removed Agent Teams lifecycle APIs, promises plugin-agent permission behavior Claude does not provide, and uses a builder subagent `bypassPermissions` path. Those defects are release blockers independent of token savings.

The minimum safe release sequence is:

1. Remove the obsolete team lifecycle and false permission claims.
2. Add deterministic dispatch/lineage contracts and tests.
3. Implement resume-before-respawn and bounded fresh/fork routing.
4. Make Agent Teams an explicit coordination mode, not the Tier 2+ default.
5. Add measured cache/usage accounting and relay budgets without widening relay tools.

## Current Runtime Facts the Specs Must Preserve

These facts are established in the existing research under `knowzcode/explore/context-token-efficiency/` and current Anthropic documentation:

- Claude Code 2.1.212+ uses `/subtask` for an in-session conversation fork. A real fork inherits the parent system prompt, model, exact tool pool, and full message history; its first request can read the parent prompt cache. Skill frontmatter `context: fork` is a different isolated-subagent feature and does not inherit the active conversation.
- A normal named subagent starts fresh, has a separate cache, may use a cheaper model/narrower tools, and can be resumed by agent ID/name with its prior transcript. Explore and Plan are one-shot and not resumable.
- Current named subagents may spawn named subagents up to the configured depth; a fork cannot spawn another fork. Do not restate the older blanket “subagents cannot nest” rule.
- Agent Teams are experimental and disabled unless `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. Since Claude Code 2.1.178, the first teammate spawn forms a session-derived team. `TeamCreate`/`TeamDelete` no longer exist, caller-supplied `team_name` is ignored, and team configuration cleanup is automatic at session end.
- Teammates load project context and their spawn prompt, not the lead conversation. A referenced subagent definition contributes its body, tool allowlist, and model automatically. Teammates inherit lead permissions; per-teammate permission mode cannot be set at spawn. In-process teammates are not restored by `/resume` or `/rewind`.
- Plugin-provided agent frontmatter ignores `permissionMode`, `hooks`, and `mcpServers`. This differs from project/user agents. A security invariant therefore cannot depend on those fields when the same source is distributed as a plugin.
- Cache reads lower billed processing and latency but do not remove logical context tokens. Model and effort are cache keys. Subagents normally use the five-minute TTL even when a subscription main session gets one hour. Actual `cache_read_input_tokens` and `cache_creation_input_tokens` must be measured rather than inferred.
- Current Claude relay commands correctly exclude the Agent tool and ambient MCP/browser tools, use `dontAsk`, strict Bash sandboxing, and explicit same-cwd `--resume`. That boundary must not be weakened to obtain fork support.

Primary official references:

- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/slash-commands#run-skills-in-a-subagent
- https://code.claude.com/docs/en/plugins-reference

## Release-Blocking Compatibility Inventory

### Critical: removed Agent Teams lifecycle is still executable guidance

| Surface | Evidence | Required correction |
|---|---|---|
| Core Claude guide | `knowzcode/knowzcode/claude_code_execution.md:19`, `:96-119` instruct `TeamCreate`, caller-owned names, explicit creation, and deletion. | First teammate spawn forms the team; treat session-derived name as opaque; gracefully stop teammates; no delete step. |
| Work entry | `knowzcode/skills/work/SKILL.md:106-142` makes Teams expected and probes `TeamCreate(team_name=...)`; `:594` deletes the team. | Replace with adaptive/native subagents by default. Enter Teams only through explicit/evidence-backed coordination policy. A failed teammate spawn may fall back, but `TeamCreate` is never probed. |
| Audit entry | `knowzcode/skills/audit/SKILL.md:83-92` probes `TeamCreate`. | Use bounded parallel named agents by default; optional team only for peer challenge/coordination. |
| Explore entry | `knowzcode/skills/explore/SKILL.md:76-83`, `:276` probes `TeamCreate`. | Use named/forked research workers; optional team only when researchers must message/challenge peers. |
| Continue entry | `knowzcode/skills/continue/SKILL.md:150-177` recreates a named team. | Restore durable WorkGroup/capsule state; resume retained named agents when valid; reconstruct teammates only as fresh workers because in-process teammates do not resume. |
| Status entry | `knowzcode/skills/status/SKILL.md:56-68` says commands verify by attempting `TeamCreate`. | Report config/runtime capability without removed-tool probing. |
| Work references | `knowzcode/skills/work/references/light-workflow.md:19-20`, `:108`; `parallel-orchestration.md:34-36`, `:303`; `profile-models.md:71` refer to created/deleted teams or `TeamSpawn`. | Replace lifecycle verbs with current Agent teammate spawning and adaptive routing. |
| Skill sidecars | `skills/{work,audit,explore,continue}/CLAUDE.md` repeat `TeamCreate`, team deletion, and manual definition reads. | Align or remove stale sidecar instructions; named agent definitions are already applied. |
| Platform adapter template | `knowzcode/knowzcode/platform_adapters.md:60-80` declares Teams expected and fallback degraded. | Describe a shared adaptive policy and Claude-specific optional Team mode. |
| Installer | `knowzcode/bin/knowzcode.mjs:1082-1101`, `:1461-1476`, `:2379` enables Teams and recommends it during Claude install. | Preserve an explicit `--agent-teams` opt-in, but stop recommending/enabling it as the default cost-efficient path. Never enable fork mode globally. |
| Validator | `scripts/validate-platform-surfaces.mjs:538-567` requires “Agent Teams is the expected execution mode.” | Invert the assertion: adaptive/resume-first is required; Teams-default language is prohibited. |

Historical `CHANGELOG.md` entries may retain past terminology as historical records. Active instructions, generated templates, installers, and validators may not.

### Critical: unsafe and unsupported permission behavior

| Surface | Evidence | Required correction |
|---|---|---|
| Plugin agent frontmatter | Fifteen files under `knowzcode/agents/*.md` declare `permissionMode`; only `relay-runner.md` omits it. Claude ignores this field for plugin agents. | Remove unsupported plugin fields or explicitly generate separate plugin-safe and project-agent variants. No normative safety claim may depend on the field. |
| Core Claude guide | `knowzcode/knowzcode/claude_code_execution.md:407-414` says plugin/custom subagent `permissionMode` is enforced automatically. | State the delivery-scope distinction and derive effective permissions from lead/session policy plus tools. |
| Team plan approval | `claude_code_execution.md:57-74` implies agent frontmatter `permissionMode: plan` can drive teammate plan approval. | Use the supported teammate plan-approval spawn instruction; do not rely on plugin frontmatter or per-teammate spawn mode. |
| Builder dispatch | `knowzcode/skills/work/references/spawn-prompts.md:411` invokes the builder subagent with `mode="bypassPermissions"`. | Remove this path. Use inherited/session-approved permissions; `acceptEdits` may be a user-selected project-agent behavior but never an implicit plugin safety bypass. |
| Read-only roles | Analyst/reviewer/officer definitions omit `Edit`/`Write`, but several retain unrestricted `Bash`. | Describe read-only as a tools + permission + behavioral policy, not a hard sandbox. Never run the parent in bypass mode; constrain Bash through session policy where required. |

Agent frontmatter inventory:

- Supported and useful for plugin agents: `name`, `description`, `tools`/`disallowedTools`, `model`, `effort`, `maxTurns`, `background`, `memory`, `isolation` where applicable.
- Ignored for plugin agents: `permissionMode`, `hooks`, `mcpServers`.
- When a definition is used as an Agent Team teammate: its body, tools, and model apply; its `skills` and `mcpServers` fields do not. Team task/messaging tools are added by Claude.
- `Task` remains a compatibility alias for the renamed Agent tool, but new normative documentation should say Agent and mention the alias only for version compatibility.

### High: manual role/context reloads negate native loading

- `knowzcode/knowzcode/claude_code_execution.md:392-414` tells teammates to read their definition and the full execution guide, even though a referenced type already receives the definition body/tools/model.
- `skills/{work,audit,explore,continue}/CLAUDE.md` incorrectly says named agents are generic agents that must read `agents/<name>.md`.
- `knowzcode/DEV_GUIDE.md:72-79` repeats the manual definition read.
- `spawn-prompts.md:283-513` contains repeated conventions and broad context reads across roles.

Required correction: introduce a concise versioned Claude runtime contract containing only claim/report/message/shutdown/result rules. Spawn prompts carry only scope, spec/criteria, owned files, checkpoint/lineage, and delta context. Long execution examples remain on-demand references.

### High: sequential/subagent gap loops discard resumable workers

- `knowzcode/skills/work/references/quality-gates.md:212-214` launches a new builder then a new reviewer for every fix/re-audit.
- `parallel-orchestration.md:373-393` defines traditional one-agent-per-phase shutdown behavior.
- `work/SKILL.md:501` incorrectly summarizes subagents as having no persistent agents.

Required correction: persist agent IDs and resume the same builder/reviewer for a valid lineage. Respawn only after explicit invalidation or transcript loss.

### High: default cost posture contradicts the objective

- `work/SKILL.md:106` and `platform_adapters.md:60-80` make Agent Teams expected for Tier 2+.
- `parallel-orchestration.md:34-71` permits 3-10 Stage 0 sessions before scope stabilizes.
- `knowzcode/knowzcode/knowzcode_orchestration.md:51-93` and `profile-models.md:14-42` default to premium `frontier`; most agent frontmatter defaults to Opus.
- `knowzcode/bin/knowzcode.mjs:1470-1475` labels Teams recommended during install.

Required correction: add an adaptive balanced profile and evidence-driven fan-out. Do not silently redefine the existing explicit `frontier` profile; either change the project default through a migration/release decision or add `adaptive` and make it the default for new installs with backward-compatible existing config handling.

## Exact Implementation and File Map

### P0 — deterministic tests and formal contracts

| File | Change | Notes / dependency |
|---|---|---|
| `knowzcode/knowzcode/specs/ClaudeRuntimeCompatibility.md` | New Claude-specific normative spec using the VERIFY criteria below. | Depends on the shared `ContextEfficientOrchestration` schema names but can be drafted in parallel. |
| `scripts/validate-claude-runtime-contract.mjs` | New static/fixture validator. | Write failing assertions before documentation changes. |
| `scripts/fixtures/claude-context-dispatch-cases.json` | New deterministic routing/version/lineage cases. | Shared dispatcher schema must define normalized inputs/outputs first. |
| `scripts/validate-platform-surfaces.mjs` | Remove Teams-default assertion; add Claude lifecycle, plugin frontmatter, relay boundary, and mirror assertions. | Preserve existing Codex “no Claude team API” rules. |
| `knowzcode/package.json` or root CI invocation | Wire validators into a repeatable test command. | Current `knowzcode/package.json:16-18` has only `prepublishOnly`; tests are not discoverable through npm. |

### P0 — compatibility and safety repair

| Canonical surface | Required implementation |
|---|---|
| `knowzcode/knowzcode/claude_code_execution.md` | Replace removed team lifecycle, document true fork/fresh/resume/team semantics, supported plugin fields, permission inheritance, team non-resumption, nested-agent limits, and bounded result contract. |
| `knowzcode/skills/work/SKILL.md` | Replace `TeamCreate` selection with adaptive routing; make resume-first; remove degraded-fallback wording; update cleanup; persist lineage/capability/usage summaries. |
| `knowzcode/skills/work/references/{parallel-orchestration,light-workflow,spawn-prompts,quality-gates,profile-models}.md` | Current teammate spawn lifecycle, evidence-driven Stage 0, resume gap loops, no bypass permissions, bounded prompts/results, adaptive model route. |
| `knowzcode/skills/{audit,explore,continue,status}/SKILL.md` | Remove obsolete lifecycle independently from `/work`; apply fresh/fork/resume rules appropriate to each entry. |
| `knowzcode/skills/{work,audit,explore,continue}/CLAUDE.md` | Remove generic-agent/manual-definition claims and obsolete team lifecycle. |
| `knowzcode/agents/*.md` | Remove/segregate ignored `permissionMode`; add concise result/lineage contract only where role-specific; retain least-privilege tool lists. |
| `knowzcode/DEV_GUIDE.md`, `knowzcode/docs/{workflow-reference,execution-profiles}.md` | Explain current optional Teams lifecycle and adaptive/default profile accurately. |
| `knowzcode/bin/knowzcode.mjs` | Keep explicit `--agent-teams`, stop calling it recommended, do not set fork env, test plugin-vs-local-agent packaging behavior. |

### P1 — orchestration, lineage, cache, and telemetry

| File | Required implementation |
|---|---|
| `knowzcode/knowzcode/knowzcode_orchestration.md` | Add versioned configuration for `execution_mode`, `fork_context`, `resume_agents`, `agent_teams`, active/fan-out caps, budgets, and adaptive model profile. |
| Shared context spec/schema | Define capsule version, scope/spec/checkpoint/tool/sensitivity hashes, invalidation reasons, runtime mode enum, and telemetry source enum. Claude must consume, not redefine, these names. |
| WorkGroup schema instructions in `work/SKILL.md` and `continue/SKILL.md` | Persist non-sensitive capability, lineage, lease, and aggregate usage fields. Provider transcript/cache is an optimization, never source of truth. |
| `status/SKILL.md` | Report capability/config/lineage and observed usage without claiming a cache hit from version or mode alone. |
| `profile-models.md` and agent defaults | Haiku/low for deterministic extraction/log triage, Sonnet/medium for normal implementation/review, escalation to Opus/Fable only on evidence or explicit premium profile. Keep model/effort stable inside a lineage. |

### P1 — strict relay efficiency without agent widening

| File | Required implementation |
|---|---|
| `knowzcode/knowzcode/relay_execution.md` | Add Claude per-leg budget, aggregate usage parsing/redaction, delta resume prompt, separate cold recovery prompt, and effort-change cache-reset annotation. Preserve exact tool/MCP/sandbox boundary. |
| `knowzcode/skills/work/references/relay-execution.md` | Keep byte/semantic parity with canonical relay source. It is currently byte-equal but separately stored. |
| `knowzcode/skills/work/SKILL.md` | Replace one `fix-prompt` description with warm delta + cold fallback selection. |
| `knowzcode/knowzcode/knowzcode_orchestration.md` | Add `relay_claude_max_budget_usd` (or the shared agreed per-leg budget key) and document whether it is per leg or workflow. |
| `plugins/knowzcode/knowzcode/relay_execution.md` | Generated/coupled mirror; do not hand-author independently. |

Current relay safety evidence that must remain true:

- `relay_execution.md:207-217` requires same cwd, `dontAsk`, strict Bash sandboxing, empty strict MCP config, no Chrome, and success result validation.
- `relay_execution.md:549-633` allowlists only `Bash,Read,Edit,Write,Glob,Grep`, captures `session_id`, and resumes explicitly from the same cwd. Agent is absent.
- `relay_execution.md:148-164` bounds progress and treats target text as untrusted telemetry.
- Current commands do not yet pass the supported `--max-budget-usd` flag.

### P2 — packaging and generated parity

| File | Required implementation |
|---|---|
| `knowzcode/knowzcode/platform_adapters.md` | Replace the Claude template’s Teams-default block and embed only concise generated platform guidance. |
| `plugins/knowzcode/knowzcode/{claude_code_execution,platform_adapters,relay_execution,knowzcode_orchestration}.md` | Generated/validated mirrors where applicable. `validate-platform-surfaces.mjs:444-462` already byte-compares core framework copies. |
| `scripts/sync-codex-relay-surfaces.mjs` or a new broader generator | Expand single-source generation so Claude/relay runtime copies cannot drift. Existing script only synchronizes selected Codex relay surfaces into adapter blocks. |
| `knowzcode/bin/knowzcode.mjs:385-474`, `:1269-1306`, `:2086-2111` | Test both distribution paths: active marketplace plugin (plugin agents) and npx-copied `.claude/agents` project agents. Security behavior must not depend on which path won. |

Do not edit historical WorkGroups or the existing untracked exploration/planning files during implementation.

## Formal Claude Spec VERIFY Criteria

The architect should use these IDs verbatim or preserve a deterministic mapping to them.

### Capability and dispatch

- **VERIFY-CLAUDE-CAP-001:** The capability record contains Claude Code version, conversation-fork command support, orchestrator-fork availability (`true|false|unknown`), Teams configuration, and observation timestamp without account identifiers.
- **VERIFY-CLAUDE-CAP-002:** Version `<2.1.212` never routes to `/subtask`; `auto` selects a fresh capsule fallback and `force` returns a clear unsupported result without pretending inheritance occurred.
- **VERIFY-CLAUDE-CAP-003:** Version `>=2.1.212` establishes only user `/subtask` availability. Agent-initiated `fork` remains a separately observed/configured capability because rollout is experimental.
- **VERIFY-CLAUDE-DISPATCH-001:** Runtime output is exactly one of `local|resume|inherited|fresh|team`; Claude maps `inherited` to a real conversation fork, never to Skill `context: fork`.
- **VERIFY-CLAUDE-DISPATCH-002:** Routing order is resume, then eligible inherited fork, then fresh capsule, then coordinated team; `local` wins for a quick/tightly coupled task where delegation has no isolation benefit.
- **VERIFY-CLAUDE-DISPATCH-003:** `fresh` is mandatory when a cheaper model, narrower tool pool, independent judgment, or a different sensitivity class is required.
- **VERIFY-CLAUDE-DISPATCH-004:** No plugin install or workflow silently sets `CLAUDE_CODE_FORK_SUBAGENT=1`; explicit user/admin settings are honored and reported.

### Conversation forks

- **VERIFY-CLAUDE-FORK-001:** An inherited worker receives the parent system prompt, model, tools, permissions, and conversation at spawn; its task delta and final result are bounded and its internal tool transcript is not copied into the parent.
- **VERIFY-CLAUDE-FORK-002:** A fork eligibility check rejects mixed sensitivity, narrower-access roles, independent post-build reviewers, incompatible model/tool requirements, stale/unfocused parent context, and active-fork cap exhaustion.
- **VERIFY-CLAUDE-FORK-003:** Maximum active inherited workers defaults to two and is independently bounded from named-agent/team counts.
- **VERIFY-CLAUDE-FORK-004:** A fork is never allowed to spawn another fork. Named nested-agent delegation follows the separately configured depth/session limits.
- **VERIFY-CLAUDE-FORK-005:** `isolation: worktree` remains available when write isolation is required; the system does not reject it solely from the general different-worktree cache rule.
- **VERIFY-CLAUDE-FORK-006:** The system records observed cache counters when available and never reports “cache hit” merely because runtime mode is inherited.

### Resume and lineage

- **VERIFY-CLAUDE-RESUME-001:** A resumable-agent record contains parent session, agent ID/name, role, scope hash, spec/capsule hash, checkpoint SHA, effective model, effort, tool-policy hash, sensitivity class, last-use timestamp, and status.
- **VERIFY-CLAUDE-RESUME-002:** Matching role/scope/spec/checkpoint/model/effort/tools/sensitivity resumes the same custom/general-purpose agent by ID/name and sends only a bounded delta.
- **VERIFY-CLAUDE-RESUME-003:** Any incompatible field, missing transcript, retention expiry, cancelled agent, or one-shot Explore/Plan type emits a named invalidation reason and starts fresh from the durable capsule.
- **VERIFY-CLAUDE-RESUME-004:** Parent compaction does not discard known child transcript lineage. Process restart may resume the child only after the same parent session is resumed.
- **VERIFY-CLAUDE-RESUME-005:** Sequential builder/reviewer gap loops resume their existing workers; respawn is exceptional and recorded.
- **VERIFY-CLAUDE-RESUME-006:** In-process Agent Team teammates are never advertised as resumable after `/resume` or `/rewind`; continuation reconstructs fresh teammates from durable state if Team mode remains justified.

### Agent Teams lifecycle and economics

- **VERIFY-CLAUDE-TEAM-001:** Active instructions contain no `TeamCreate`, `TeamDelete`, caller-owned `team_name`, or `TeamSpawn` lifecycle calls. The first teammate spawn forms the session-derived team.
- **VERIFY-CLAUDE-TEAM-002:** Team mode is selected only when peer messaging/shared task coordination is required and at least two genuinely independent work slices exist; it is not the Tier 2+ default or a degraded/fuller quality distinction.
- **VERIFY-CLAUDE-TEAM-003:** Team startup states that teammates do not inherit lead history and therefore receive a concise task packet/capsule.
- **VERIFY-CLAUDE-TEAM-004:** A referenced teammate type automatically applies definition body/tools/model; spawn prompts do not require rereading that definition or the full Claude execution guide.
- **VERIFY-CLAUDE-TEAM-005:** Teammates inherit lead permissions; plan approval uses the supported spawn instruction; no claim is made that plugin `permissionMode` controls a teammate.
- **VERIFY-CLAUDE-TEAM-006:** Teams have a configured maximum, start at the smallest viable size, expose active teammate count/cost source, and gracefully stop each teammate when its deliverable is complete. No separate team delete is attempted.
- **VERIFY-CLAUDE-TEAM-007:** Team unavailability or spawn failure falls back to named agents without reducing TDD, quality gates, independent audit, or vault durability.

### Plugin agents and permissions

- **VERIFY-CLAUDE-AGENT-001:** The plugin distribution does not rely on `permissionMode`, `hooks`, or `mcpServers` agent frontmatter; validation identifies any unsupported field shipped as normative security behavior.
- **VERIFY-CLAUDE-AGENT-002:** Effective safety is the intersection of session/lead permission policy, built-in permission checks, and the agent tool allow/deny list. No workflow invokes a child with `bypassPermissions`.
- **VERIFY-CLAUDE-AGENT-003:** Read-only roles omit direct write tools and explicitly constrain Bash behavior; the docs do not call that a hard sandbox while unrestricted Bash remains available.
- **VERIFY-CLAUDE-AGENT-004:** Plugin and npx-copied project-agent installations produce equivalent safe outcomes even though Claude supports more frontmatter fields for project agents.
- **VERIFY-CLAUDE-AGENT-005:** Agent result contracts cap returned prose and require status, decisions/findings, evidence with file/line references, changed paths, test state, unresolved risk, and artifact paths; raw logs stay in artifacts/child context.

### Cache and measurement

- **VERIFY-CLAUDE-CACHE-001:** Telemetry distinguishes logical input, uncached input, five-minute/one-hour cache creation where available, cache reads, output/thinking, model, effort, elapsed time, estimated cost source, and outcome/rework measures.
- **VERIFY-CLAUDE-CACHE-002:** Model or effort change invalidates warm-lineage assumptions and is recorded; normal routing keeps them stable within a phase/agent lineage.
- **VERIFY-CLAUDE-CACHE-003:** Documentation says cache reads still occupy context and can be more expensive than a small fresh cheaper-model packet; cache-read ratio alone is not a promotion metric.
- **VERIFY-CLAUDE-CACHE-004:** The main/subagent TTL distinction is accurate and no universal one-hour TTL is enabled by KnowzCode. API/provider support is treated as observed configuration.
- **VERIFY-CLAUDE-CACHE-005:** A/B reporting separates subscription consumption, client-estimated API cost, and authoritative billing. Savings claims require outcome-equivalent representative WorkGroups.
- **VERIFY-CLAUDE-CACHE-006:** Cache, session, and agent transcript state are never durable truth; specs, WorkGroup state, capsule, checkpoint, and handoff recover every cold path.

### Strict Claude relay

- **VERIFY-CLAUDE-RELAY-001:** Both initial and resumed Claude relay commands retain `--tools "Bash,Read,Edit,Write,Glob,Grep"`; Agent is absent; strict empty MCP, no Chrome, same-cwd, `dontAsk`, and fail-closed Bash sandboxing remain mandatory.
- **VERIFY-CLAUDE-RELAY-002:** No relay command or relay settings file enables fork mode, Agent Teams, ambient agents, `bypassPermissions`, or `--dangerously-skip-permissions`.
- **VERIFY-CLAUDE-RELAY-003:** A configurable positive per-leg budget is passed through `--max-budget-usd`; budget exhaustion is classified separately from implementation/test failure and preserves artifacts/session ID.
- **VERIFY-CLAUDE-RELAY-004:** A valid resume uses a small delta prompt. A separate self-contained recovery brief is used only when resume is unavailable/invalid. Both reference approved specs and checkpoint evidence.
- **VERIFY-CLAUDE-RELAY-005:** Resume preserves cwd/model/effort by default. A deliberate effort/model escalation records expected cache invalidation before launch.
- **VERIFY-CLAUDE-RELAY-006:** Stream result parsing stores only aggregate usage/cache/model/cost-source fields; account, organization, prompt, raw source, and unrestricted target output remain outside user-facing state.
- **VERIFY-CLAUDE-RELAY-007:** Lost session, invalid result, budget exit, auth failure, and forced interruption all retain the existing one-resume/fresh-recovery/host-takeover bounds; no child fan-out is introduced.

### Packaging and parity

- **VERIFY-CLAUDE-PACK-001:** `claude_code_execution.md`, relay core/reference, adapter template, and packaged mirrors have a declared canonical source and deterministic equality/semantic checks.
- **VERIFY-CLAUDE-PACK-002:** Installing through the Claude marketplace plugin and installing via npx-copied `.claude/agents` both pass the runtime contract validator.
- **VERIFY-CLAUDE-PACK-003:** Generated/install smoke tests contain no active removed lifecycle instructions and do not enable Teams or fork mode unless the user passed the explicit opt-in.

## Red-First Test Recommendations

### Deterministic CI tests to add before implementation

1. **Removed lifecycle scan — should fail now.** Add `validate-claude-runtime-contract.mjs` that scans active Claude skills, references, sidecars, execution guide, adapter template, installer messages, and generated install output. Fail on procedural `TeamCreate`, `TeamDelete`, `TeamSpawn`, caller-owned `team_name`, “created team kc-”, or “Agent Teams is expected” language. Exclude historical `CHANGELOG.md`, WorkGroups, and research.
2. **Plugin frontmatter support — should fail now.** Parse every `knowzcode/agents/*.md`; flag normative `permissionMode`, `hooks`, or `mcpServers` in the plugin distribution. Permit a separate generated project-agent variant only if the generator and tests make that distinction explicit.
3. **Permission bypass scan — should fail now.** Fail on `bypassPermissions` or `dangerously-skip-permissions` in active workflow dispatches/relay commands except explicit prohibition text. This catches `spawn-prompts.md:411`.
4. **Current Team contract — should fail now.** Require the core guide and each entry skill to state first-teammate formation, session-derived/opaque team identity, automatic cleanup, lead permission inheritance, no lead-history inheritance, and teammate non-resumption.
5. **Automatic definition loading — should fail now.** Prohibit procedural “read your agent definition first” for named subagents/teammates and require body/tools/model automatic-loading language plus the teammate `skills`/`mcpServers` exception.
6. **Dispatch fixtures — new red test.** Table-drive at least these cases from `claude-context-dispatch-cases.json`:
   - `2.1.211 + fork auto -> fresh(version-unsupported)`
   - `2.1.212 + orchestrator fork unknown -> fresh(capability-unobserved)`
   - matching retained builder lineage -> `resume`
   - matching agent but changed spec hash -> `fresh(spec-changed)`
   - post-build independent reviewer -> `fresh(independence-required)`
   - mixed sensitivity -> `fresh(sensitivity-mismatch)`
   - same sensitivity/context-heavy/same model-tools -> `inherited`
   - peer messaging plus disjoint scopes plus Teams enabled -> `team`
   - no coordination value -> named fresh/parallel, not team
   - quick tightly coupled task -> `local`
7. **Lineage invalidation fixtures — new red test.** Change one field at a time across role, scope, spec, checkpoint, model, effort, tools, sensitivity, transcript state, and one-shot type; assert the exact invalidation reason and cold capsule fallback.
8. **Gap-loop static contract — should fail now.** Require `quality-gates.md` and sequential flow to say resume builder/reviewer before replacement and to carry agent ID plus hashes.
9. **Relay command builder — should fail now for budget/delta.** Assert both Claude command templates include the approved six tools and `--max-budget-usd`, exclude Agent/fork/team/bypass, preserve strict MCP/no-Chrome/sandbox/same-cwd, and select delta versus recovery prompt based on session validity.
10. **Cache telemetry schema — new red test.** Validate sanitized fixture records; reject account/email/org/prompt/raw-log fields, negative counters, inferred hit booleans without counters, unknown source enums, and aggregate totals that double-count streamed assistant fragments.
11. **Installer tests — should fail current recommendation semantics.** Exercise forced installs in temporary directories and assert no Teams/fork environment keys are written without an explicit flag. With `--agent-teams`, assert only the Teams key is added and existing settings are preserved. Test both active-plugin and local-copy branches.
12. **Mirror generation — extend existing test.** Alter a temporary canonical Claude runtime input, run the generator, and assert all declared mirrors update. A manually changed mirror must fail validation.

### Optional authenticated integration tests

Keep these out of mandatory CI because they consume provider usage and depend on staged features:

- Warm a parent session, run a real conversation fork, and assert first child request has positive `cache_read_input_tokens`; compare a fresh named agent, which should begin with its own cache. Do not require an exact percentage.
- Complete a custom subagent, resume by ID with a delta, verify prior transcript state, compact the parent, resume again, then restart/resume the same parent session and verify the child remains addressable.
- Verify Explore/Plan do not produce resumable IDs.
- Enable Agent Teams explicitly, spawn a referenced plugin teammate, verify body/tools/model apply and lead history does not, then end/resume the lead and verify the in-process teammate is not restored.
- Exercise relay budget exhaustion in a disposable repository and verify state/artifact preservation without Agent availability.

## Prioritized Patch Ownership Proposal

To avoid overlapping writers, use these disjoint ownership slices after spec approval:

### Owner A — Claude runtime and workflow adapter (highest priority)

Own:

- `knowzcode/knowzcode/claude_code_execution.md`
- `knowzcode/skills/{work,audit,explore,continue,status}/**`
- `knowzcode/skills/work/references/{parallel-orchestration,light-workflow,spawn-prompts,quality-gates,profile-models}.md`
- `knowzcode/agents/*.md`
- Claude sections of `DEV_GUIDE.md` and `docs/workflow-reference.md`

Deliver compatibility repair, adaptive routing prose, resume gap loops, automatic definition loading, and permission-safe dispatch. Do not edit relay commands or generated mirrors.

### Owner B — Claude relay boundary and budgeting

Own:

- `knowzcode/knowzcode/relay_execution.md`
- `knowzcode/skills/work/references/relay-execution.md`
- the relay-specific portion of `knowzcode/skills/work/SKILL.md` only by coordinated handoff with Owner A
- relay config keys in `knowzcode_orchestration.md` only by coordinated handoff with the shared-schema owner

Deliver per-leg budget, aggregate sanitized usage, delta/recovery prompt split, and cache-reset annotation. Preserve the strict Agent-exclusion boundary.

### Owner C — deterministic Claude contract tests and installer

Own:

- `scripts/validate-claude-runtime-contract.mjs`
- `scripts/fixtures/claude-context-dispatch-cases.json`
- Claude-specific extensions in `scripts/validate-platform-surfaces.mjs`
- `knowzcode/bin/knowzcode.mjs`
- npm/CI test wiring

Write the failing tests first. Coordinate field names with the shared-spec owner; do not invent a second capsule/lineage schema.

### Owner D — shared schema, adapters, and packaging consolidation

Own:

- provider-neutral context spec/schema
- `knowzcode/knowzcode/knowzcode_orchestration.md`
- `knowzcode/knowzcode/platform_adapters.md`
- generator/sync logic
- `plugins/knowzcode/knowzcode/**` generated mirrors
- docs/execution-profile migration and release notes

Integrate Owner A/B canonical outputs only after their tests pass. This owner resolves the unavoidable shared-file intersections rather than having multiple agents edit mirrors/config concurrently.

## Integration Gate

Claude work is ready to merge only when all of the following are true:

- No active Claude entry point invokes removed team lifecycle tools.
- Plugin distribution makes no false `permissionMode` guarantee and no child is dispatched with bypass permissions.
- All resume/fork/fresh/team fixture cases pass with explicit invalidation reasons.
- Agent Teams are optional and quality-equivalent fallback paths retain TDD, capture durability, and independent audit.
- Relay has a budget and warm-delta recovery without Agent/fork access.
- Marketplace plugin and npx local-copy installs pass the same safety/semantic tests.
- Byte/semantic mirrors are generated from canonical inputs.
- Authenticated cache tests, if run, are reported as environment-specific observations, never universal guarantees.

## Non-Goals / Do Not Build

- Do not map Skill `context: fork` to conversation inheritance.
- Do not enable `CLAUDE_CODE_FORK_SUBAGENT=1` during plugin installation.
- Do not preserve `TeamCreate` as a compatibility probe for modern Claude.
- Do not fork a late independent reviewer or a narrower-access/mixed-sensitivity role.
- Do not make provider cache/session/transcript state authoritative.
- Do not expose Agent/fork/Teams inside strict relay v1.
- Do not turn on one-hour caching universally.
- Do not build a provider SDK controller in this WorkGroup.
- Do not claim savings from cache-read ratio alone; promote only on cost-per-accepted-outcome with quality/security parity.
