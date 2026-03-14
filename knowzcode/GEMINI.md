# KnowzCode Development Methodology

This project uses KnowzCode for structured TDD development.

## Required Reading
Read these files before starting any feature work (use @import syntax for direct inclusion):
- `knowzcode/knowzcode_loop.md` — Complete workflow methodology
- `knowzcode/knowzcode_project.md` — Project context and tech stack
- `knowzcode/knowzcode_architecture.md` — Architecture documentation
- `knowzcode/knowzcode_tracker.md` — Active WorkGroups

## Phase Walkthrough

### Phase 1A: Impact Analysis
- Identify components affected by the goal
- Create NodeIDs for new capabilities (PascalCase domain concepts)
- Check existing specs for domain overlap before creating new ones
- Present Change Set for user approval — STOP until approved

### Phase 1B: Specification
- Draft specs using 4-section format (Rules, Interfaces, Verification Criteria, Debt)
- Each spec needs 2+ VERIFY statements
- Present for approval — STOP until approved
- Commit specs as a pre-implementation checkpoint

### Phase 2A: Implementation (TDD Required)
- Follow Red-Green-Refactor for every feature
- Write failing test FIRST, then minimal code to pass, then refactor
- Run full test suite + linter + build when all features done
- STOP and report results

### Phase 2B: Completeness Audit
- READ-ONLY comparison of implementation vs specs
- Calculate completion percentage
- Report gaps and security concerns
- STOP for user decision

### Phase 3: Finalization
- Update specs to As-Built, update tracker, write log entry
- Check architecture doc for drift
- Final commit

## Rules
- Follow quality gates strictly — STOP at each gate for user approval
- TDD is mandatory for all feature work
- Propose Change Sets before implementing
- Update specs and tracker after implementation
- Log completions in `knowzcode/knowzcode_log.md`
- Target <20 specs — consolidate when domains overlap >50%

## Knowledge Capture (CRITICAL — DO NOT SKIP)
Every piece of durable knowledge — decisions, patterns, gotchas, workarounds — **must** be captured.
When MCP is connected, write to vaults per `knowzcode/knowzcode_vaults.md` — always pass `vaultId` with `create_knowledge`.
When MCP is unavailable, capture locally in specs, log entries, or docs. Never let insights die in the conversation.
Use `/knowz save "insight"` for automatic routing.
Vault entries are retrieved via semantic search — write detailed, self-contained content. See `knowzcode/knowzcode_vaults.md` Content Detail Principle.

### Vault Targeting (MCP Writes)
**Always pass `vaultId`** when calling `create_knowledge` or `update_knowledge`.
Vault IDs and routing rules: `knowzcode/knowzcode_vaults.md`

## MCP Server Configuration (Gemini CLI)
MCP servers are configured in `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user).
To connect: `/knowz setup` or `/knowz register`.
To verify: `gemini mcp list` or `/mcp` in session.
Manual config: add a `mcpServers.knowz` entry with `httpUrl` and `headers` (Streamable HTTP) — see `/knowz setup` skill for format.

## Micro-Fix (for small changes)
Single file, <50 lines, no ripple effects:
1. Implement fix → 2. Run tests → 3. Log MicroFix → 4. Commit with `fix:`