# Pending Vault Captures

Queued writes awaiting MCP availability. Run `/knowz flush` when the Knowz MCP API key is valid to sync.

---

### 2026-04-19 12:35:00 -- Decision: Code-graph / symbol-index integration belongs to knowzcode, never knowz — deferred
- **Operation**: create
- **Intent**: Exploration capture (planning mode, deferred)
- **Category**: Decision
- **Target Vault Type**: ecosystem
- **Source**: /knowzcode:explore kc-explore-tree-sitter-knowz, 2026-04-19
- **Payload**:

[CONTEXT]
Evaluated whether to integrate a tree-sitter / code-graph capability (as user framed it: "monitors codebase, reduces token count") into knowz or knowzcode. Four-agent team investigation (knowledge-liaison, analyst, architect, reviewer). User elected to defer (Option 3); this capture preserves the durable architecture decision and the premise correction so the evaluation doesn't have to be re-run from scratch.

[INSIGHT]
Three durable findings:

1. **Premise correction (ecosystem literacy).** "Tree-sitter reduces tokens" conflates three layers. Tree-sitter itself is a parser-generator — it doesn't monitor anything or save tokens. The token-reduction behavior comes from *layered* tools: Aider's repo-map (tree-sitter + PageRank + token-budget fitting), or LSP-based symbol MCPs like Serena (which skip tree-sitter entirely). Future conversations citing "tree-sitter" for code intelligence should disambiguate which layer is actually being discussed.

2. **Architecture boundary: code graphs never belong in knowz vaults.** A symbol/code graph is derived, volatile, regenerated on every file change. Storing it in a knowz vault violates knowz's charter (durable curated human knowledge), creates SEV-1 PII/IP leakage (symbol names, auth-flow identifiers, proprietary domain vocabulary synced to cloud backups/embeddings), and bloats the signal-to-noise ratio of vault content. If this capability ever ships, it lives in knowzcode (or a sidecar plugin it depends on) — never in a knowz vault.

3. **Realistic cost analysis.** Symbol-aware MCPs deliver ~20–40% token savings on Stage 0 discovery turns for repos >200 files. They do NOT beat targeted grep+Read for: one-shot edits in a known file, small repos (<50 files), non-code content, or sessions with few symbol lookups. Any future "saves tokens" claim must ship with benchmark numbers, not vibes.

[RATIONALE]
- knowz and knowzcode have deliberately clean separation of concerns (knowz = vault I/O, knowzcode = code workflow). All 86 code-inspection call sites live in knowzcode agents; knowz does no source inspection. Blurring this boundary would force knowz to pull parser runtimes and grammar binaries it has no business shipping.
- Two independent existing tools (Serena LSP-based; Aider tree-sitter+PageRank) already solve this, with active maintenance. Building in-house reinvents them inferiorly (reviewer SEV-3).
- If we ever proceed, recommended path is adopting Serena or compatible symbol-aware MCP as an **optional ecosystem dependency**, with detection probe in `/knowzcode:status` and graceful fallback to Grep+Read in analyst/scanner agents. Full plan preserved at `knowzcode/planning/tree-sitter-knowz-fit.md`.
- Reviewer flagged Windows native-dep hazards (tree-sitter + node-gyp + VS 2026). If future work does build in-house, WASM (`web-tree-sitter`) is mandatory — not native bindings.

[TAGS]
tree-sitter, code-graph, symbol-index, Serena, Aider, repo-map, knowzcode, knowz-boundary, plugin-separation, token-economy, architecture-decision, deferred

---

### 2026-04-18 13:28:17 -- Decision: Knowz platform summary generation — groundedness, indexing-state gating, and post-processing refresh
- **Operation**: create
- **Intent**: Phase 3 capture
- **Category**: Decision
- **Target Vault Type**: ecosystem
- **Source**: closer / WorkGroup kc-fix-server-side-summary-20260418-132817
- **Payload**:

[CONTEXT]
The Knowz platform generates an AI summary on every `create_knowledge` call. A production save surfaced three distinct defects when the input is thin or references attachments still being post-processed. The summary came back ungrounded (fabricated themes, characters, quotes, life lessons from the input "Here's a book I like" with a still-indexing PDF), had no "preliminary" provenance label, and was NOT auto-refreshed after the PDF finished indexing — the user had to manually click "Resummarize" to get a grounded output.

[INSIGHT]
Summary generation is platform-owned (skills never pass a `summary` field — mirrors the `ServerSideTitle` pattern). The fix is exclusively server-side and requires three changes to the platform summarizer:

1. **Groundedness guard**: for below-threshold text (~50 words) with no indexed attachments, the summarizer must fall back to extractive/placeholder/omit, NOT generative. Generative summarization of thin inputs hallucinates.
2. **Indexing-state gating**: when attachments are still post-processing, either defer summary generation OR emit a provenance-labeled preliminary ("generated from text body only; attachments still indexing"). Implicit preliminary summaries without provenance are prohibited.
3. **Post-processing refresh**: attachment indexing completion must enqueue a summary regeneration job that replaces the preliminary summary without user action. Manual "Resummarize" should remain as a user control but MUST NOT be required for correctness.

Summary metadata should carry `is_preliminary`, `sources_consumed`, `attachments_pending`, and `generated_at` for staleness detection.

[RATIONALE]
- `ServerSideTitle.md` (2026-04-07, Draft) already set the "platform owns it, skills pass null" precedent for a parallel concern. Summaries are the same debt class, one visibility level up (summaries are larger, more authoritative-looking, more believable than titles — higher credibility cost from hallucinations).
- Client-side defensive summarization was considered and rejected: it would duplicate logic, mask the defect, and violate the precedent.
- Three-defect spec (single file) was chosen over three separate specs because all three share the same root cause (summarizer lifecycle ignores source state — thin-input, indexing-state, post-processing completion). Fragmenting would create churn and obscure the common root.
- Thresholds (50-word floor, 5-minute refresh SLA) are flagged as placeholders for platform-team tuning.

Canonical spec: `knowzcode/knowzcode/specs/ServerSideSummary.md` (Draft, 2026-04-18).
Parallel spec: `knowzcode/knowzcode/specs/ServerSideTitle.md` (Draft, 2026-04-07).

[TAGS]
knowz-platform, summarization, groundedness, hallucination, post-processing, server-side-contract, debt, spec, ServerSideSummary, ServerSideTitle

---
