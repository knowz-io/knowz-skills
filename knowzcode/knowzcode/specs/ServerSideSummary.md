# ServerSideSummary: Platform-Owned Content Summarization

**Updated:** 2026-04-18
**Status:** Draft
**KnowledgeId:**

## Context

The Knowz platform generates an AI summary on every `create_knowledge` call. Observed production behavior shows three distinct quality defects when the input is thin or contains attached files still being post-processed. This spec documents the defects and the platform contract required to resolve them. Skills in this repository do not and should not implement any summarization logic — this is analogous to the precedent established in `ServerSideTitle.md`.

## Observed Defects

### Defect 1: Groundedness gap (hallucinated content)

**Symptom:** On a `Document` item with body `"Here's a book I like"` and a PDF attachment still indexing, the platform emitted a multi-section narrative summary including fabricated "Themes" (friendship, courage, self-discovery), "Characters", "Memorable Quotes", and "Life Lessons" — none of which were present in the provided content.

**Root cause:** The summarizer prompt is unconstrained. Given insufficient source material, the LLM confabulates plausible content rather than acknowledging the lack of information.

### Defect 2: Indexing-state blindness

**Symptom:** The preliminary summary was generated while the attached PDF was still being indexed. The output was rendered as authoritative — there was no label, banner, or caveat indicating the content was preliminary or that attached material had not yet been consumed.

**Root cause:** The summary pipeline does not check attachment indexing state before running, and does not tag its output with provenance (which inputs it actually consumed).

### Defect 3: Post-processing refresh gap

**Symptom:** After the attached PDF finished indexing, the stale preliminary summary was NOT automatically replaced. The user had to manually select "Resummarize" in the UI to get a grounded output.

**Root cause:** The async post-processing pipeline (file indexing, entity extraction, etc.) does not emit a completion signal that re-triggers summary generation. The summary is generated once at save time and never re-evaluated unless the user manually requests it.

## Rules & Decisions

- **Decision:** delegate summary generation entirely to the server platform. Skills stop generating summaries client-side and never populate a `summary` field on `create_knowledge`. Rationale: matches the `ServerSideTitle` pattern; keeps skills platform-agnostic; gives the platform full control over format, groundedness guards, and lifecycle.
- **Rule (groundedness):** the summarizer MUST NOT emit facts, themes, characters, quotes, or claims that are not demonstrably present in the source content. When source content is below a platform-defined word threshold (suggested: 50 words of non-boilerplate text) AND no indexed attachments exist, the summary MUST be one of:
  - extractive (verbatim first N words of the body), or
  - an empty/minimal placeholder like `"Short note — no summary generated."`, or
  - omitted entirely.
  Generative summarization is prohibited for below-threshold inputs.
- **Rule (indexing-state gating):** if any referenced attachment has not completed post-processing at summary-generation time, the platform MUST either
  - (a) defer summary generation until all attachments complete, or
  - (b) generate a clearly labeled preliminary summary that includes an explicit provenance line identifying which inputs were consumed and which were pending (e.g., `"Preliminary — generated from text body only; attachment(s) still indexing."`).
  Implicit preliminary summaries without a provenance label are prohibited.
- **Rule (post-processing refresh):** completion of any attachment post-processing step (indexing, OCR, transcription) MUST enqueue a summary regeneration job. The regeneration MUST replace the prior preliminary summary once produced, without requiring a user action. Users may still manually trigger "Resummarize", but manual action MUST NOT be required for the system to converge to a grounded summary.
- **Rule (provenance):** every persisted summary SHOULD carry metadata indicating (a) which source inputs were consumed, (b) whether attachments were fully indexed at generation time, and (c) the summary generation timestamp. This enables staleness detection and makes refresh logic auditable.
- **Decision (client-side):** skills in this repository continue to omit the `summary` field on `create_knowledge`. No client-side defense against platform defects is added — defects are platform-owned and platform-visible; adding client workarounds masks the issue.

## Interfaces

**No MCP schema change required.** The `create_knowledge` MCP tool already does not accept a `summary` parameter — summary is platform-generated exclusively. The defects are behind the MCP boundary.

**Platform-side additions required** (out of scope for this repo, tracked here for platform team):

| Surface | Current | Required |
|---------|---------|----------|
| Summarizer prompt | Unconstrained generative prompt | Groundedness-constrained prompt with below-threshold fallback |
| Save-time pipeline | Runs summary immediately, ignores attachment state | Checks attachment indexing state; defers OR labels preliminary |
| Post-processing pipeline | Emits no summary-refresh signal | Enqueues summary regen on index/OCR/transcription completion |
| Summary metadata | Stored as plain text | Stored with provenance: `sources_consumed`, `attachments_pending`, `generated_at`, `is_preliminary` flags |
| UI | Preliminary output indistinguishable from final | Visible preliminary banner with provenance; auto-refresh when regen completes |

## Verification Criteria

- VERIFY: grep for `summary:` in `create_knowledge` call sites across `knowz-skills` returns zero matches — no skill passes a `summary` field.
- VERIFY: a `create_knowledge` call with body `"Here's a book I like"` and no attachments produces either an extractive (verbatim) summary, a minimal placeholder, or no summary — NOT a generative multi-section narrative. (Platform-side test.)
- VERIFY: a `create_knowledge` call with thin body text and an attached file observes the platform either deferring summary generation or emitting a clearly labeled preliminary summary with provenance. (Platform-side test.)
- VERIFY: after attachment indexing completes on a `Document` created with the above pattern, the stored summary is replaced by a grounded summary without user intervention within a platform-defined SLA (suggested: 5 minutes after indexing completion). (Platform-side test.)
- VERIFY: the summary metadata surface exposes `is_preliminary`, `sources_consumed`, and `generated_at` for any client that needs to detect staleness.

## Debt & Gaps

- This is a platform-owned spec — resolution is not implementable from this repository. The spec exists to (a) document the defects precisely, (b) record the agreed-upon contract, and (c) set verification criteria that the platform team can execute.
- The "below-threshold" word count is a placeholder (50 words) — the platform team should tune this against a corpus of existing knowledge items to avoid over-triggering on legitimate short notes.
- Manual "Resummarize" button is the current user-visible mitigation. After the post-processing refresh rule is implemented, this button remains useful for user-initiated regen but is no longer required for correctness.
- Entity extraction and tag generation may share the same lifecycle defects (generated at save, not refreshed after indexing). Spec is scoped to summary only; adjacent features should be audited separately.
- No telemetry recommendation is included. Platform team may want to add counters for: preliminary summaries served, refresh jobs enqueued, refresh SLA breaches, thin-input guard triggers.

## Related

- `knowzcode/knowzcode/specs/ServerSideTitle.md` — same delegation pattern for titles; established the "platform owns it, skills pass null" precedent. Summary is the same debt class, one visibility level up.
