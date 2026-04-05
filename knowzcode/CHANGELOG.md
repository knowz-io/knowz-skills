# Changelog

All notable changes to KnowzCode will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.4] - 2026-04-05

### Added
- Task list guidance for planning and progress tracking in explore and work skills

## [0.11.3] - 2026-04-03

### Changed
- **Breaking:** Deleted `knowzcode/knowzcode_vaults.md` — vault configuration now reads exclusively from `knowz-vaults.md` (project root, managed by `/knowz setup`)
- Agents describe captures in natural language; the knowz layer (knowz:writer + knowz-vaults.md) handles vault routing and formatting
- Moved Content Detail Principle, capture timing, and supplementary guidance into `knowzcode_loop.md` Section 7
- Simplified MCP Probe in work/explore/audit skills — removed Vault Creation Prompt; vault creation deferred to `/knowz setup`
- Removed KC vault file interop from knowz plugin (no more dual-file ID sync)

## [0.11.2] - 2026-04-01

### Changed
- Made Agent Teams the expected execution mode for all Tier 2+ workflows with degradation warnings on fallback
- Added Lightweight Teams mode for Tier 2 — persistent knowledge-liaison + builder teammate
- Changed init Step 9 from neutral three-option prompt to auto-enable with opt-out confirmation
- Replaced "Agents" section in CLAUDE.md template with "Agent Teams (Expected Execution Mode)" including tier table and impact explanation

### Fixed
- Added explicit platform guards for non-Claude platforms in init Step 9 and work skill degradation warning
- Updated specialist mode constraint to reference Lightweight Teams alongside Sequential Teams

## [0.11.1] - 2026-03-31

### Changed
- Enforced mandatory vault writes at all quality gates and Tier 2 completion — passive capture instructions replaced with MUST + pending_captures.md queue fallback
- Added missing Gate #2 (Specs) progress capture block
- Added explicit "autonomous ≠ skip vault writes" rule and Tier 2 artifact reminder
- Rewrote README as concise product overview

## [0.11.0] - 2026-03-29

### Changed
- Restructured plugin to lightweight skill stubs backed by framework internals
- Moved agents, CLAUDE.md, GEMINI.md, and enterprise config out of plugin surface into framework directory
- Simplified all skill definitions to reduce plugin size

### Added
- Framework internal files (prompts, specs, orchestration, enterprise templates) in plugin's knowzcode/ directory
- Platform validation script

## [0.9.2] - 2026-03-29

### Added
- Optional `**KnowledgeId:**` field on specs and workgroups for automatic cloud sync — vault captures update existing items instead of creating duplicates
- KnowledgeId writeback in knowledge-liaison — parses writer output signals and edits source files
- Update mode in knowz:writer — supports `update_knowledge` when knowledgeId is provided, with graceful handling of deleted cloud items

### Changed
- Quality gate progress captures now pass KnowledgeId values to knowledge-liaison for update mode
- Architect and closer agents preserve KnowledgeId fields when modifying specs

## [0.9.1] - 2026-03-29

### Added
- Vault write continuation in explore skill — remains responsive to vault-save requests in follow-up messages after Step 5.5 resolves

## [0.9.0] - 2026-03-28

### Added
- Enterprise white-label configuration via optional `enterprise.json` — self-hosted deployments can customize MCP endpoints, API endpoints, and brand name
- Enterprise config support in CLI installer with automatic environment selection bypass

## [0.8.6] - 2026-03-28

### Added
- Mandatory lead-direct baseline vault queries in explore and work skills — lead calls `search_knowledge` per configured vault after MCP probe, before agent spawning
- Solo Mode fallback in explore skill for when Agent Teams and Subagent Delegation are both unavailable
- Two-tier vault read model documentation in vault configuration template
- `--no-mcp` skip guard in explore skill's MCP probe
- MCP probe and vault creation prompt in work skill's main flow (Step 3.6) covering all tiers

### Changed
- Knowledge-liaison accepts lead's baseline and performs deeper targeted research instead of repeating broad queries
- Tier 2 Light Phase 1 references pre-loaded vault baseline instead of optional inline MCP query
- Consolidated duplicate MCP probes in parallel-orchestration into single Step 3.6 reference

## [0.8.5] - 2026-03-28

### Added
- Structured capture requirements, mid-work discovery signals, and architecture documentation depth guidance in vault configuration
- Ready-to-use single vault entry template for simplified onboarding
- MCP context check step in Light Mode workflow

### Changed
- Improved progress capture in Light Mode with duplicate detection via `search_by_title_pattern`

## [0.8.4] - 2026-03-20

### Changed
- Knowledge-liaison reads local context directly using Read/Glob/Grep tools instead of dispatching scout subagents, and dispatches vault readers in parallel (one per vault)

## [0.8.3] - 2026-03-19

### Removed
- `context-scout` agent — duties fully absorbed by `knowledge-liaison` (dispatches local context scouts as subagents)

### Changed
- Streamlined agent spawn prompts, audit skill, explore skill, and orchestration docs

## [0.8.2] - 2026-03-18

### Added
- Mandatory vault research callout in explore and audit skills — `knowz:reader` dispatch cannot be skipped when MCP is connected and vaults are configured
- Vault capture prompt (Step 5.5) in explore skill — offers to save findings to Knowz vaults after synthesis
- Vault capture prompt (Step 4.5) in audit skill — offers to save audit results to Knowz vaults after presentation

## [0.8.1] - 2026-03-17

### Fixed
- Removed explicit `skills` and `agents` arrays from `plugin.json` — lets Claude Code auto-discover from directory structure (was causing manifest mismatch)

## [0.8.0] - 2026-03-16

### Added
- `knowledge-liaison` agent — persistent vault coordinator that routes all vault I/O by dispatching `knowz:writer` and `knowz:reader`
- `/knowzcode:explore` skill — investigate topics, research codebases, produce structured implementation plans (replaces `/knowzcode:plan`)
- Gemini CLI `explore` command and skill
- `reader` and `writer` generic agents in knowz plugin — stateless vault I/O agents reusable by any plugin

### Changed
- Vault agent architecture: persistent `knowz-scout`/`knowz-scribe` pair replaced with `knowledge-liaison` → `knowz:reader`/`knowz:writer` dispatch model
- `/knowzcode:plan` renamed to `/knowzcode:explore` for clearer intent signaling
- Repository renamed from `knowz-marketplace` to `knowz-skills`
- All orchestration, quality gate, and spawn prompt docs updated for new agent model

### Removed
- `knowz-scout` and `knowz-scribe` agents (replaced by knowledge-liaison + knowz:reader/writer)
- `/knowzcode:plan` skill (renamed to `/knowzcode:explore`)
- Gemini scout/scribe agent definitions and plan command/skill

## [0.7.3] - 2026-03-14

### Added
- `--flush` command in `/knowz save` skill — reads `pending_captures.md`, writes each queued capture to MCP vault, removes successful entries, reports results
- Pending captures flush on knowz-scribe startup — automatically flushes queued captures from previous sessions when MCP is verified
- Pre-finalization pending captures check in closer agent — flushes or warns before Phase 3 capture begins
- Pending captures discovery in `/knowzcode:work` Stage 0 Group B — delegates flush to scribe or prompts user
- MCP re-verification in knowz-scribe — checks connectivity before writes if last successful call was >10 minutes ago
- MCP re-verification in knowz-scout — checks connectivity before queries if last successful call was >10 minutes ago
- Loud-fail on vault write errors in closer agent — explicit `WARNING` printed to user instead of silent degradation
- `pending_captures.md` added to update-coordinator's project data preservation list

### Fixed
- Pending captures from completed WorkGroups no longer get stuck indefinitely — multiple flush paths ensure eventual delivery to MCP vault

## [0.7.2] - 2026-03-10

### Fixed
- Plugin skills loading without `kc:` namespace prefix — removed 14 stray legacy JSON files from `skills/` that interfered with Claude Code's skill scanner
- Plugin marketplace configuration using wrong key name — aligned `extraKnownMarketplaces` key with `plugin.json` `name` field
- Explicit `skills` and `agents` arrays removed from `marketplace.json` — lets Claude Code auto-discover from directory structure (was causing manifest mismatch)

## [0.7.1] - 2026-03-10

### Fixed
- Plugin marketplace SSH authentication failure — switched `extraKnownMarketplaces` source from `github` (SSH) to `url` (HTTPS) so users without SSH keys can connect

## [0.6.1] - 2026-03-09

### Added
- Full Gemini adapter committed to source tree — 14 subagent definitions, 12 TOML commands, 12 skill files, and `settings.json` with MCP config (`.gemini/` directory)
- `GEMINI.md` instruction file for Gemini CLI users (equivalent to CLAUDE.md)
- Template `.gitignore` for `knowzcode/` directory (excludes environment_context.md, workgroups/, *.local.md, .scratch/)
- Version marker file (`knowzcode/.knowzcode-version`)

### Changed
- Installer (`bin/knowzcode.mjs`) updated with Gemini adapter generation and platform detection improvements
- MCP connection commands (`connect-mcp`, `register`) updated with Gemini-specific configuration paths
- Template files cleaned up: tracker, log, MCP config, platform adapters, and workgroups README

### Fixed
- OAuth-first flow restored for Gemini MCP configuration — OAuth is now the default (no longer experimental) after server-side 401 challenge support was enabled

## [0.6.0] - 2026-03-07

### Added
- Installation scanner that detects existing specs, tracker entries, log entries, architecture customizations, project config, preferences, orchestration, workgroups, and installed platforms
- Installation summary display showing user data and platform status (installed/detected/not installed) before any destructive action
- `add-platforms` command for adding or changing platform adapters without touching core framework files
- `--clean` flag as escape hatch for full reset on reinstall (disables data preservation)
- Guided interactive menu when running `install` on existing installation — offers add platforms, reinstall, or cancel instead of hard exit
- Upgrade command now offers to generate adapters for detected-but-uninstalled platforms

### Changed
- `install --force` on existing installation now preserves user data (tracker, log, architecture, project config, environment, preferences, orchestration) by default
- Interactive mode (`npx knowzcode`) shows full installation summary and data inventory before presenting options
- Interactive mode menu redesigned: version mismatch offers upgrade/add-platforms/reinstall/uninstall/exit; same version offers add-platforms/reinstall/uninstall/exit
- Adapter generation logic extracted into shared `generateAdapters()` helper used by install, add-platforms, and upgrade
- Help text updated with `add-platforms` command documentation and `--clean` flag

## [0.5.2] - 2026-03-07

### Added
- Gemini-specific MCP configuration in connect-mcp and register skills — uses `gemini mcp add --transport sse` as primary method with `.gemini/settings.json` manual fallback
- MCP Server Configuration section in GEMINI.md template — documents config location, connection commands, and manual setup
- MCP configuration offer during Gemini init (`/knowzcode:init` Step 7c-gemini-mcp) — optional API key setup writes `.gemini/settings.json`
- Gemini MCP config generation in CLI installer (`cmdInstall`) — interactive API key prompt for Gemini platform
- Gemini MCP config cleanup in CLI uninstaller (`cmdUninstall`) — removes `mcpServers.knowz` from `.gemini/settings.json` while preserving other settings
- Gemini MCP config preservation in CLI upgrader (`cmdUpgrade`) — user's API key and MCP config survive upgrades
- Universal Smart Config Discovery algorithm — all `connect-mcp`, `register`, and `status` commands check `KNOWZ_API_KEY` env var, `mcp_config.md`, `knowzcode_vaults.md`, and cross-platform config files before prompting
- `KNOWZ_API_KEY` environment variable support for automatic MCP authentication on any platform
- `API Key (last 4)` field in `mcp_config.md` Connection Status for cross-platform key identity confirmation
- Cross-Platform Config Discovery step in `/knowzcode:status` — reports MCP config presence across all 6 platforms
- MCP Configuration sections in Cursor and Windsurf adapter templates with env var and config file guidance
- MCP Smart Config notes in Copilot adapter (Section D) for VS Code integration

### Changed
- All 12 Gemini TOML commands enriched with skill file references (`Read .gemini/skills/knowzcode-{name}/SKILL.md`) and key procedural steps
- `connect-mcp.toml` and `register.toml` replaced with Gemini-specific MCP commands (was: generic/Claude Code-centric)
- `kc-connect-mcp` Gemini skill rewritten with 7-step Gemini-specific procedure (CLI primary, settings.json fallback, verification, error handling)
- `kc-register` Gemini skill rewritten with Gemini MCP setup steps (was: generic `.mcp.json` reference)
- `kc-status` Gemini skill updated with Gemini-specific MCP checks (`.gemini/settings.json`, `gemini mcp list`, `/mcp`)
- `/knowzcode:status` command now platform-aware — detects Claude Code, Gemini CLI, Copilot, and Codex for MCP config checks (was: hardcoded `claude mcp get knowz`)
- "Restart Claude Code" references in status command generalized to "restart your AI coding assistant"
- `/knowz setup` command now checks env var and cross-platform configs before prompting for API key (Step 1.5)
- `/knowz register` command now detects existing API keys and offers reuse before registration (Step 0)
- `/knowzcode:init` Step 7c-gemini-mcp now runs Smart Discovery before prompting for API key
- `knowzcode_loop.md` Section 6 updated with cross-platform config documentation
- Gemini and Codex `connect-mcp`, `register`, and `status` skills enriched with Smart Config Discovery steps
- Gemini `connect-mcp` skill vault step now checks for existing vault config before re-prompting

## [0.5.1] - 2026-03-07

### Added
- 12 Gemini skill templates (`.gemini/skills/knowzcode-*/SKILL.md`) enabling implicit invocation via Gemini's skill discovery
- 14 Gemini subagent definitions (`.gemini/agents/knowzcode-*.md`, experimental) — full agent roster ported to Gemini CLI
- 5 new Gemini TOML commands: init, connect-mcp, register, telemetry, telemetry-setup (12 total, up from 7) — full command parity with Claude Code
- Global Gemini skill install support — `--global` flag routes skills to `~/.gemini/skills/` for cross-project availability
- Gemini skill and subagent cleanup in uninstall and upgrade commands (stale file detection + removal)
- Gemini subagent opt-in prompt in `/knowzcode:init` (requires `experimental.enableAgents: true`)

### Changed
- Gemini CLI support upgraded from 7 TOML commands to 12 commands + 12 skills + 14 subagents
- CLI `--global` help text updated to include Gemini skills alongside Claude Code and Codex
- README Gemini section expanded with skill installation, global install, and subagent setup instructions
- Gemini template parser extended to extract skill files and subagent definitions from `platform_adapters.md`

## [0.4.1] - 2026-03-07

### Added
- 6 new Codex skill templates: init, status, connect-mcp, register, telemetry, telemetry-setup (12 total, up from 6) — full command parity with Claude Code
- YAML frontmatter (`name`, `description`) in all Codex skill files enabling implicit invocation (Codex auto-triggers skills based on task matching)
- Legacy `.codex/skills/kc/` cleanup during install, uninstall, and upgrade

### Changed
- Codex skill structure migrated from `.codex/skills/kc/*.md` to `.agents/skills/knowzcode-*/SKILL.md` — aligns with Codex 2026 SDK conventions for skill discovery and namespacing
- Codex platform detection expanded to recognize `.agents/` directory alongside `.codex/`
- `--global` flag routes Codex skills to `~/.agents/skills/` (was `~/.codex/skills/`)

## [0.4.0] - 2026-03-06

### Added
- Global Codex skill install support — `--global` flag routes `.codex/skills/kc/` to `~/.codex/` for cross-project availability
- Global Codex skill detection in `uninstall` and `upgrade` commands (stale cleanup + regeneration)
- Codex skill file templates in `platform_adapters.md` (6 skills: work, plan, fix, audit, learn, continue)
- Global install tip in `/knowzcode:init` Codex success message

### Changed
- Shell installers (`install.sh`, `install.ps1`) replaced with thin Node.js bootstraps — all logic consolidated into `bin/knowzcode.mjs` (~1,600 lines removed)
- `--global` flag description updated to cover both Claude Code (`~/.claude/`) and Codex (`~/.codex/`)
- README "Manual (No Node.js)" section renamed to "Manual (Repo Clone)" with Node.js 18+ requirement note
- README Codex section expanded with `--global` usage example

## [0.3.8] - 2026-02-21

### Added
- "Lead Responsibilities (All Execution Modes)" section in execution model — universal 3-point responsibility list covering progress documentation, MCP status handoff, and capture completeness verification

### Changed
- Lead/orchestrator explicitly named as responsible for scribe-based progress capture across all execution modes (Parallel Teams, Sequential Teams, Subagent Delegation)
- "MCP Learning Capture (Optional)" sections renamed to "Lead Responsibility: Progress Capture" with strengthened lead-as-actor language at all 3 quality gates
- Sequential/Subagent closer spawn prompt includes MCP status handoff (`MCP_ACTIVE`, `VAULTS_CONFIGURED`, vault config path)
- Tier 2 Light Phase 3 includes optional progress capture step for MCP-configured projects
- Auto-Capture Triggers opening in core methodology strengthened to name the lead/outer orchestrator as responsible for triggering capture

## [0.3.7] - 2026-02-20

### Changed
- Closer agent MCP verification simplified to self-reliant 3-step protocol — reads vaults, checks for configured entries, verifies MCP independently (no longer depends on lead-passed flags)
- Sequential/Subagent MCP probe reduced to informational-only — closer self-verifies at Phase 3 regardless of lead probe result
- Closer spawn prompt (Sequential/Subagent) simplified — removed inline MCP flags and redundant Direct Write Fallback instructions in favor of agent definition reference
- Closer content filter templates replaced with concise reference to `knowzcode_vaults.md` — eliminates 30-line duplication, matches knowz-scribe pattern
- Convention, Integration, and Scope signal types added to core methodology signal detection table

### Fixed
- Parallel Teams MCP soft-fail path now correctly sets `VAULTS_CONFIGURED = true` when configured vaults exist — previously Group B agents never spawned when `list_vaults()` failed
- Parallel Teams MCP soft-fail now requires configured vaults (non-empty ID) instead of accepting empty-ID entries that have no server target

### Removed
- `MCP_DEFERRED` variable eliminated from all files — closer self-verifies MCP instead of receiving state from the lead agent

## [0.3.6] - 2026-02-15

### Added
- Content Detail Principle in vault configuration — explicit guidance that vault entries must be self-contained, detailed, and keyword-rich for semantic search retrieval
- Anti-pattern vs good-pattern examples in vault config showing terse vs detailed entries
- `[SUMMARY]` field added to finalizations content filter for key learnings capture
- Vault content detail notes in all 6 platform adapter Knowledge Capture sections

### Changed
- Content filter placeholder descriptions expanded across all 3 vault types (code, ecosystem, finalizations) with detailed guidance on what each field should contain
- Knowz-scribe Step 3 (Format Content) includes Content Detail Principle directive and expanded title/content/tag guidance
- Knowz-scribe phase extraction guidance (1A, 2A, 2B, 3) expanded with bold field names and specific detail expectations per extraction type
- Single-agent `create_knowledge` examples in core methodology replaced with proper `[CONTEXT]/[INSIGHT]/[RATIONALE]/[TAGS]` content filter format
- `/knowz save` content template expanded with `Situation:` field in CONTEXT and `Detail:` field in INSIGHT for richer vault entries
- `/knowz save` title format updated to include technology names for search discoverability
- Closer direct-write fallback references Content Detail Principle for non-scribe vault writes
- Project-advisor scribe DM format expanded with detailed example and guidance against terse one-liners

## [0.3.5] - 2026-02-15

### Added
- Ad-hoc knowledge capture modes in core methodology — any agent can send `"Log:"` (explicit) or `"Consider:"` (soft) messages to knowz-scribe outside phase boundaries
- Knowz-scribe delegation guidance in Claude Code adapter with Log:/Consider: protocol and `pending_captures.md` fallback reference
- Local fallback queue (`pending_captures.md`) in knowz-scribe — when MCP is unavailable, captures are queued locally instead of dropped

### Changed
- "Vault Targeting" sections across all 6 platform adapters replaced with emphatic "Knowledge Capture (CRITICAL)" guidance covering both MCP vaults and local files
- Knowz-scribe capture request format expanded from single phase format to three modes: Phase (task-tracked), Explicit (`"Log:"`), and Soft (`"Consider:"`)
- Project-advisor scribe integration uses `"Log:"` prefix instead of `"Capture idea:"`

## [0.3.4] - 2026-02-15

### Changed
- MCP server name renamed from `knowzcode` to `knowz` across all commands and platform adapters — aligns with `knowz.io` domain branding
- All `claude mcp` subcommands prefixed with `CLAUDECODE=` to fix nested session errors when running inside Claude Code
- VS Code MCP config template input variables renamed to `knowz_mcp_url`/`knowz_api_key`

## [0.3.3] - 2026-02-15

### Added
- Vault targeting guidance in `/knowz setup` (Step 6f) — injects `### Vault Targeting` section into project CLAUDE.md during MCP setup
- Vault targeting instructions in all 6 platform adapter templates (Claude Code, Codex, Gemini, Cursor, Copilot, Windsurf) ensuring agents always pass `vaultId` on MCP writes

## [0.3.2] - 2026-02-14

### Added
- Codebase scanner agents at Stage 0 — parallel source code and test discovery to accelerate impact analysis
- Analyst-to-architect `[PRELIMINARY]` NodeID streaming during Stage 0 with speculative research protocol
- Parallel spec drafting for 3+ NodeID Change Sets via temporary spec-drafter agents
- `codebase_scanner_enabled` and `parallel_spec_threshold` orchestration config parameters

## [0.3.1] - 2026-02-13

### Added
- Combined scout spawn prompt for `SCOUT_MODE = "minimal"` in `/knowzcode:work` Phase Prompt Reference
- Orchestration config loading in `/knowzcode:plan` (Step 3.5) — respects `scout_mode` and `mcp_agents_enabled`
- `SCOUT_MODE` parsing in `/knowzcode:audit` Step 1.1 with `--no-scouts` flag override
- Orchestration config restore in `continue` skill for resumed workflows
- Embedded `knowzcode_orchestration.md` template in `/knowzcode:init` for new project generation
- Combined scan mode note in `context-scout` agent definition

### Changed
- Orchestration config parsing moved from Step 3.1 to Step 2.4 in `/knowzcode:work` — fixes forward reference where Step 2.6 used `DEFAULT_SPECIALISTS` before it was defined
- `SCOUT_MODE = "none"` description updated: analyst and architect scan independently (was: lead reads context inline)
- Context-scout dispatch block expanded with per-SCOUT_MODE guidance for Parallel Teams, Sequential, and Subagent modes
- Subagent scout spawning in `/knowzcode:plan` and `/knowzcode:audit` branched by SCOUT_MODE (full: 3 scouts, minimal: 1 combined, none: skip)
- Knowz-scout gated on `MCP_AGENTS_ENABLED` in `/knowzcode:plan` and `/knowzcode:audit` (was: only checked `VAULTS_CONFIGURED`)
- Clarifying notes added to Tier 2 and Sequential Teams sections about orchestration config applicability

## [0.3.0] - 2026-02-13

### Added
- 3 opt-in specialist agents activated via `--specialists` flag or natural language detection in `/knowzcode:work` and `/knowzcode:audit`:
  - `security-officer`: Officer authority — CRITICAL/HIGH findings block gates via `[SECURITY-BLOCK]` tag
  - `test-advisor`: Advisory — TDD enforcement, test quality review, coverage assessment
  - `project-advisor`: Advisory — backlog curation, future work identification (shuts down mid-Stage 2)
- Specialist orchestration: Group C spawn at Stage 0, gate-specific review tasks, Specialist Reports in gate templates
- Direct DM protocol for specialist-to-builder communication (max 2 DMs per builder per specialist, max 2 inter-specialist DMs)
- Enterprise compliance awareness in all 3 specialist agents (conditional on `compliance_enabled: true`): security-officer cross-references findings with enterprise guideline IDs, test-advisor checks ARC criteria test coverage, project-advisor reports compliance config gaps
- Specialist rows added to `compliance_manifest.md` Agent-to-Enterprise-Vault Operations table
- Structured Architecture Health Reports at Gates #1, #2, #3 in `agents/architect.md` (impact scope, spec alignment, drift detection)
- GitHub Copilot full adapter: `/knowzcode:init` generates `.github/copilot-instructions.md` + 9 prompt files in `.github/prompts/` + optional `.vscode/mcp.json` skeleton
- `knowzcode/copilot_execution.md` — complete single-agent sequential execution model for Copilot users
- `argument-hint` frontmatter for kc-work, kc-fix, and kc-plan Copilot prompt files

### Changed
- Agent count: 11 → 14 (added 3 opt-in specialists)
- GitHub Copilot support upgraded from adapter template to full adapter with 9 phase-specific prompt files (`#prompt:knowzcode-*` invocation in VS Code)
- `/knowzcode:init` detects `.github/` directory for Copilot adapter generation
- Quality gate templates include Specialist Reports section when specialists are active
- `knowzcode/platform_adapters.md` expanded with Copilot template suite
- `knowzcode/claude_code_execution.md` updated with specialist lifecycle, communication discipline, and DM protocol tables
- Sequential Execution Protocol in `knowzcode_loop.md` references Copilot prompt files
- Copilot MCP server type corrected from `sse` to `http` (auto-fallback to SSE)
- Copilot prompt frontmatter corrected from `mode: "agent"` to `agent: "agent"`
- CLI `@file:` syntax softened to defensive "check current docs" guidance
- Tracker update timing in kc-work moved from pre-STOP to post-approval per methodology

### Fixed
- kc-specify resilience for interrupted sessions — falls back to scanning `knowzcode/workgroups/` when no `[WIP]` tracker entries found

## [0.2.1] - 2026-02-13

### Added
- Autonomous mode for unattended workflow execution — users convey intent via natural language, `--autonomous` flag, or contextual interpretation; quality gates auto-approved with safety exceptions for critical findings

### Changed
- Scout agent restricted to read-only MCP vault access — scribe is now the sole vault writer
- Scout write-access claims removed from methodology docs, execution docs, vault config, and `mcp_config.md`

### Fixed
- Missing Phase 2A MCP learning capture trigger in `/knowzcode:work`
- Stale `domain` alias in scribe agent routing (now `ecosystem`)
- Vault detection order in `/knowz save` — `knowzcode_vaults.md` now primary, `mcp_config.md` fallback
- Missing `Scope` learning category in ecosystem vault content filter and write conditions
- Scout and scribe agents missing backwards-compatibility alias note and null-ID defensive check
- Missing same-type disambiguation rule (first-listed vault wins) in scribe routing

## [0.2.0] - 2026-02-12

### Added
- Task ID threading protocol — all agent spawn prompts include `**Your Task**: #{task-id}`, all orchestration points use `TaskCreate→TaskUpdate(owner)` before spawning
- Task Assignment Protocol section in `claude_code_execution.md` — defines the lead's create→assign→spawn pattern
- Multi-reviewer partitioning — one reviewer per builder partition in Parallel Teams mode (was: single shared reviewer)
- Architect consultative persistence through Stage 2 — responds to builder DMs about spec intent (new section in `agents/architect.md`)
- Architect "Proactive Availability" — sends intro message to builders when they spawn
- Exit Expectations split in `agents/architect.md` — Gate #2 (specification) and Gate #3 (implementation support)
- `Owner` column in Task Dependency Graph table
- Structured complexity signals in `/knowzcode:plan` → `/knowzcode:work` handoff (file list, NodeIDs, risks, recommended tier)

### Changed
- Task Lifecycle in `claude_code_execution.md` — agents now claim task IDs immediately instead of receiving generic descriptions
- Teammate Initialization Protocol — task claiming is now step 2 (before reading context files)
- Gap Communication Flow — all 3 locations (execution.md, work.md Stage 2, work.md Phase 2B) now show explicit `TaskCreate→TaskUpdate` with DM templates containing task IDs
- Spawn prompt `**Conventions**` line simplified — task lifecycle instructions moved to `**Your Task**` line
- Inter-agent communication table refined — directional messaging (architect→builder, builder→architect) instead of bidirectional
- Agent Lifecycle table — architect persists until Gate #3 (was: mid Stage 2), reviewer(s) plural with partition note
- `/knowzcode:plan` Agent Teams Mode — reordered to create-then-spawn (was: spawn-then-create)
- `/knowzcode:audit` specific and full audit — TaskCreate before spawning with task IDs in prompts
- `agents/reviewer.md` Incremental Audit section — partition-based model (audit only your paired builder's NodeIDs)
- Build + Audit Loop in `claude_code_execution.md` — describes per-partition pairing (builder-1 ↔ reviewer-1)

### Removed
- GitHub Actions review workflows (`claude-code-review.yml`, `claude.yml`) — not needed for this repo

## [0.1.4] - 2026-02-12

### Fixed
- `MCP_ACTIVE` semantic conflict in vault agent spawn logic — MCP Probe Option C (skip vault creation) set `MCP_ACTIVE = true` but zero vaults had IDs, causing Group B agents to spawn incorrectly
- Added `VAULTS_CONFIGURED` flag to `/knowzcode:work`, `/knowzcode:plan`, `/knowzcode:audit` — vault agent spawn decisions now check `VAULTS_CONFIGURED` instead of `MCP_ACTIVE`
- CLAUDE.md agent tree: count corrected from 10 to 11, added missing `knowz-scribe.md`, fixed `knowz-scout.md` alignment
- CHANGELOG v0.1.3 entry completed with missing items (vault creation prompt, agent rename, access upgrade, MCP Probe changes, context-scout split)
- CHANGELOG v0.1.2 entry populated (was empty placeholder)

## [0.1.3] - 2026-02-12

### Added
- `knowz-scribe` agent for dedicated MCP vault writes (persistent Haiku, Stage 0 through Phase 3)
- Null GUID detection in `/knowz register` and `/knowz setup` — prompts to create uncreated default vaults
- Default vault entries with empty IDs in `knowzcode_vaults.md` (3 pre-defined entries ship out of the box)
- Uncreated Vault Detection section in vault configuration docs
- Vault creation prompt (A/B/C options) in `/knowzcode:work`, `/knowzcode:plan`, `/knowzcode:audit` MCP Probe
- `create_vault` tool documented in `mcp_config.md`
- Startup Verification sections in `knowz-scout` and `knowz-scribe` agent definitions
- Roster confirmation step in `/knowzcode:work` Stage 0 (verifies vault agents spawned correctly)
- `context-scout` split into 3 parallel instances (specs, workgroups, backlog)
- Dynamic vault discovery in `knowz-scout` (reads `knowzcode_vaults.md` to resolve vault IDs at runtime)

### Changed
- Vault taxonomy refined: 5 types → 3 defaults (`code`, `ecosystem`, `finalizations`)
- `vault-scout` renamed to `knowz-scout`, `vault-scribe` renamed to `knowz-scribe`
- `knowz-scout` and `knowz-scribe` upgraded from restricted (read-only / write-only) to full read/write access
- `knowz-scout` lifetime extended from Gate #2 to Phase 3 (persistent through entire workflow)
- MCP Probe now always calls `list_vaults()` even when vault IDs are empty in config
- `domain` + `platform` merged into `ecosystem` vault type
- `sessions` renamed to `finalizations` vault type
- `enterprise` removed as default (user-addable for compliance teams)
- Types are now user-configurable labels, not framework constants
- Learning category routing updated: Integration → ecosystem, Completion → finalizations
- Updated all 16 files: agents, commands, and knowzcode docs for new taxonomy
- Added `knowz-scribe.md` to marketplace manifest

### Fixed
- Stale `research` vault refs in `closer.md`, `knowzcode_loop.md`, `connect-mcp.md`, `register.md`, `status.md`
- Stale `{research_vault}` template variables in `knowzcode_loop.md` section 7

## [0.1.2] - 2026-02-12

### Changed
- Removed marketing language from documentation
- Trimmed `CLAUDE.md` for conciseness

### Fixed
- Agent Teams detection now uses settings file check instead of AI self-introspection

## [0.1.1] - 2026-02-11

### Added
- Parallel Teams execution mode as default for `/knowzcode:work` Tier 3 features
- `context-scout` and `knowz-scout` agents for Stage 0 discovery
- `/knowzcode:status` command for MCP and vault status checks
- Agent Teams docs link and setup hint in README

### Changed
- Updated agent count from 8 to 10 across all docs
- Added scout and utility agents to workflow-reference roster
- Updated `analyst`, `builder`, `reviewer` agents for parallel orchestration
- Updated `/knowzcode:plan` and `/knowzcode:audit` to use scouts and parallel reviewers
- Updated `continue` skill to detect parallel vs sequential WorkGroup format
- Added governance sections and sequential protocol to `knowzcode_loop.md`

### Fixed
- Corrected agent count references (was "24 → 8", now "24 → 10")
- Added missing scout/utility agents to marketplace manifest

### Removed
- Deleted internal `docs/agent-teams-assessment.md`

## [0.1.0] - 2026-02-07

### Added
- Platform-agnostic core methodology (`knowzcode/` directory)
- 5 phase agents: analyst, architect, builder, reviewer, closer
- 3 utility agents: microfix-specialist, knowledge-migrator, update-coordinator
- 11 slash commands: work, plan, audit, fix, init, telemetry, telemetry-setup, connect-mcp, learn, register, status
- 10 core prompt templates for TDD workflow phases
- Platform adapter templates for Claude Code, Codex, Gemini CLI, Cursor, GitHub Copilot, Windsurf
- MCP integration with dual-vault architecture (code vault + research vault)
- Shell installer (`install.sh`) and PowerShell installer (`install.ps1`)
- npm package with `npx knowzcode` CLI installer
- Agent Teams support (experimental) with fallback to Task() subagents
- Enterprise compliance manifest and governance sections
- Continue skill for resuming active WorkGroups

### Changed
- Consolidated agents from 24 to 10 (same functionality, less overhead)
- Simplified commands from 16 to 11
- Reduced prompt templates from 26 to 10
- Made `knowzcode_loop.md` fully platform-neutral (no Task tool or subagent references)
- Extracted Agent Teams execution details to `knowzcode/claude_code_execution.md`

### Removed
- 16 specialized agents replaced by 10 focused agents
- 5 commands: step, continue (command), resolve-conflicts, compliance, migrate-knowledge
- `.claude/` mirror directory (was stale cache)
- Platform-specific syntax from agents and prompts
