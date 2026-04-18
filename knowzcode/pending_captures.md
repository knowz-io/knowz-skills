# Pending Vault Captures

Queued writes awaiting MCP availability. Run `/knowz flush` when the Knowz MCP API key is valid to sync.

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
