# Implementation Plan: Tree-Sitter / Code-Graph Fit for knowz vs knowzcode

**Date**: 2026-04-19
**Mode**: Planning (deep research)
**Team**: kc-explore-tree-sitter-knowz

## Goal

Decide whether and how to integrate a tree-sitter / code-graph capability into knowz (knowledge management) or knowzcode (TDD/spec code workflow). Original user framing: *"tree-sitter... monitors your codebase for changes and reduces the amount of inspection of the whole codebase needed by Claude, reducing token count."*

## Premise Check (important)

The user's phrasing conflates three distinct layers:

1. **tree-sitter** — a parser-generator library producing incremental concrete syntax trees. It does NOT "monitor" and does NOT "reduce tokens." It is infrastructure.
2. **Code-graph / repo-map tools** (e.g., Aider's repo-map, RepoMapper) — layer on top of tree-sitter: extract defs/refs, rank via PageRank, fit the ranked list into a token budget. *This* is what reduces tokens.
3. **LSP-based symbol-aware MCPs** (e.g., Serena) — skip tree-sitter entirely and wrap language servers. Expose `find_symbol`, `find_referencing_symbols`, etc. as MCP tools. Different approach, same outcome (cheaper navigation than whole-file reads).

Net effect on tokens: **20-40% savings on Stage 0 discovery for repos >200 files**, not blanket savings. Index queries still cost tokens; they beat whole-file reads but lose to targeted grep+read on small scopes.

## Prior Knowledge (from vaults)

- **Baseline** (lead-direct): N/A — MCP authentication failed (401) this session; vault queries disabled.
- **Deep research** (knowledge-liaison): local only. No prior mentions of tree-sitter, AST, code-graph, symbol-index, or similar in specs, tracker, log, or CHANGELOG. Greenfield.

## Impact Analysis

### Current state (baseline)
- Zero indexing/parsing today. All code inspection in knowzcode agents uses `Glob`, `Grep`, `Read`, `Bash` — 86 occurrences across 13 agents.
- `knowz` plugin does no code inspection at all; purely a vault-I/O surface over the Knowz MCP server.
- No MCP tools in scope do parsing or indexing.
- Clean plugin boundary: `knowz` = vault I/O, `knowzcode` = code workflow.

### Potential NodeIDs (if we chose to build in-house — NOT recommended)

| NodeID | Description | Scope |
|---|---|---|
| `CodeGraphService` | tree-sitter WASM parser + graph store (incremental, content-hashed) | NEW sidecar |
| `CodeGraphMcpServer` | MCP server exposing `find_symbol`, `find_callers`, etc. | NEW |
| `KnowzcodeCodeGraphAdapter` | Agents prefer graph MCP before Grep/Read | MODIFY ~10 agent files |
| `CodeGraphInitBootstrap` | `/knowzcode:init` optional indexing step | MODIFY |
| `CodeGraphStatusDiagnostics` | `/knowzcode:status` reports index health | MODIFY |
| `PlatformAdapterCodeGraphSection` | Per-platform setup notes | MODIFY |
| `ExploreSkillCodeGraphIntegration` | `/knowzcode:explore`/`audit` query graph | MODIFY |

### Recommended path — NodeIDs for ecosystem integration

| NodeID | Description | Scope |
|---|---|---|
| `SymbolMcpDetectionProbe` | `/knowzcode:status` detects available symbol-aware MCPs (Serena, etc.) | MODIFY `skills/status/SKILL.md` |
| `AnalystSymbolAwareMode` | Analyst + scanner agents: prefer symbol MCP when detected, fall back to Grep+Read | MODIFY `agents/analyst.md`, `agents/scanner-direct.md`, `agents/scanner-tests.md` |
| `SymbolIndexIntegrationSpec` | New spec documenting MCP contract, fallback behavior, VERIFY criteria | NEW `knowzcode/specs/symbol_index_integration.md` |
| `PlatformAdapterSymbolMcpSection` | Per-platform Serena setup notes | MODIFY `knowzcode/platform_adapters.md` |

### Affected files (recommended path)
- NEW: `knowzcode/knowzcode/specs/symbol_index_integration.md`
- MODIFY: `agents/analyst.md`, `agents/scanner-direct.md`, `agents/scanner-tests.md`, `skills/status/SKILL.md`, `knowzcode/knowzcode/platform_adapters.md`
- Plugin mirrors under `plugins/knowzcode/` need parallel edits (framework pattern).
- `knowz` plugin: **no changes**.

### Dependency map
- `SymbolIndexIntegrationSpec` → blocks `AnalystSymbolAwareMode` (spec first, implementation second)
- `SymbolMcpDetectionProbe` → independent of the above, can parallelize
- `PlatformAdapterSymbolMcpSection` → can parallelize

## Architecture Proposal

### Recommended approach: **Adopt, do not build**

Primary: Treat symbol-aware code intelligence as an **ecosystem dependency**, not framework code. Document Serena (or compatible symbol-aware MCP) as an optional integration. Teach knowzcode agents to detect and use it when present, fall back to current Grep+Read otherwise.

Why:
- Serena/Aider already solve this; building our own reinvents it inferior-ly.
- Keeps knowzcode a documentation/prompt framework (zero runtime deps).
- Cross-platform via MCP (already how knowz itself works).
- Knowz's charter (durable human knowledge) is incompatible with storing derived/volatile code graphs.

Secondary: A thin `/knowzcode:map` sub-skill is optional polish — nudges analyst to probe the symbol MCP at Stage 0. Only worthwhile if users request it.

### Alternatives considered & rejected

**A. Add a "code-graph" vault type to knowz.** Rejected.
- Violates knowz's charter (vaults hold curated human insights, not derived artifacts).
- Creates SEV-1 PII/IP leakage surface (symbol names → cloud-synced vault → backups/embeddings forever).
- Vault bloat dilutes existing knowledge signal.
- Collides with `knowz-auto` capture rules and user memory feedback ("captures should be non-obvious, surprising").

**B. Build our own tree-sitter indexer inside knowzcode.** Rejected.
- SEV-3 scope creep (grammar matrix: JS/TS/Python/Go/Rust/… each with per-language edge cases).
- SEV-1 Windows distribution risk (tree-sitter native bindings fail on VS 2026 + node-gyp; WASM works but adds 1.75-2.5x parse-time overhead).
- Maintenance burden we can't justify vs adopting existing tools.

**C. External CLI pre-session (Aider-style `--show-repo-map`).** Rejected as primary, acceptable as documented escape hatch.
- Breaks "works in-session" UX — analyst can't call it mid-phase.
- Uneven cross-platform wrappers.

**D. Hook-driven auto-refresh (PostToolUse after Edit/Write).** Supplementary only. Only meaningful once an index layer exists.

### Constraints (from architecture docs + vault memory)
- Platform parity: must work on Claude Code, Codex, Copilot CLI, Gemini CLI (per `platform_adapters.md`).
- User memory: captures should be curated / high-signal — rules out mass-indexed symbol entries in vaults.
- knowzcode's "template framework" nature: `knowzcode/` directory is copied into user projects; framework itself should stay platform-neutral and runtime-free.

### Spec consolidation
No existing spec covers symbol/code-graph integration. One new spec: `symbol_index_integration.md`. Extend scanner-related behavior in existing agent definitions — don't create parallel agents.

## Project Context

- **WIP conflicts**: None. Tracker has one entry (`ServerSideSummary`, unrelated).
- **Related backlog**: None.
- **Recent similar work**: None. CHANGELOG shows no prior work on code indexing/parsing.
- **MCP status this session**: 401 auth failure — any captures should queue to `pending_captures.md`.

## Risk Assessment (ranked, merged from reviewer + analyst)

| SEV | Risk | Mitigation |
|---|---|---|
| 1 | Silent wrong answers from stale index | Content-hash + mtime invalidation; read-verify every hit; disclose "last indexed" in tool output. If adopting Serena, inherit their freshness behavior + document limits. |
| 1 | Native-dep failure on Windows (tree-sitter + node-gyp + VS 2026) | N/A if we adopt Serena (LSP-based, no native parser in our stack). If we ever build: WASM-only (`web-tree-sitter`). |
| 1 | PII/IP leakage if index enters a vault | Hard rule: graph data never leaves local disk. No vault entries for derived symbols. Denylist auth/secret/payment modules if this ever changes. |
| 2 | Watcher/daemon mismatch with CLI plugin lifecycle | Adopt rebuild-on-demand tools (Serena's LSP model handles this). Never ship a long-running daemon from knowzcode. |
| 2 | Token-savings claim overstated | Document realistic scenarios (Stage 0 discovery on large repos). Require benchmark harness before any "saves tokens" language ships. |
| 2 | Platform fragmentation (6 platforms, uneven MCP support) | Document per-platform setup in `platform_adapters.md`. Graceful fallback to Grep+Read must remain canonical. |
| 2 | Duplicate file trees (`knowzcode/` ↔ `plugins/knowzcode/`) | Any agent/spec edit must land in both — existing framework pattern. |
| 3 | Scope creep — reinventing Serena/Aider | Integrate, don't reinvent. v1 = docs + detection probe + agent prompts only. |
| 3 | Vault bloat if graph data ever enters knowz | Enforced by architecture: knowz gets no changes in this plan. |

## Complexity

- **Files (recommended path)**: ~6 (1 new spec, 3-4 agent edits, 1 skill edit, 1 adapter section edit), plus plugin mirror edits.
- **Potential NodeIDs**: 4 (recommended) / 7 (if in-house build).
- **Tier**: **2 (Light)** for recommended path; **3 (Full)** for in-house build.
- **Security-sensitive**: Yes (the decision *not* to store graph data in vaults is a security posture).
- **External integrations**: Yes (Serena MCP as documented optional dependency).

## Decision Required from User

Pick one before moving to `/knowzcode:work`:

**Option 1 (RECOMMENDED) — Adopt Serena-style symbol MCP as documented optional integration.**
- Scope: 4 NodeIDs, Tier 2.
- Effort: small (docs + prompt edits + detection probe).
- Risk: low. Graceful fallback if MCP missing.
- Token savings: realistic 20-40% on Stage 0 discovery for large repos.
- Ownership: knowzcode only. knowz untouched.

**Option 2 — Build in-house tree-sitter sidecar (WASM, on-disk cache).**
- Scope: 7 NodeIDs, Tier 3.
- Effort: substantial (parser service, MCP server, grammar matrix, watcher-free refresh).
- Risk: SEV-1 (stale index correctness), SEV-3 (scope creep, reinvents Serena).
- Token savings: same ceiling as Option 1.
- Recommended only if Option 1 proves insufficient *and* we want to own the stack.

**Option 3 — No-op / defer.**
- Scope: 0. Track this plan as "evaluated, deferred" in the log.
- Reason to pick: ecosystem is still young; let users wire Serena manually for now; revisit if user feedback prioritizes it.

---

**Ready to implement?** Say "implement option 1" (or 2, 3) or "go ahead" to start `/knowzcode:work` with this plan.
