# WorkGroup: kc-fix-server-side-summary-20260418-132817

**Primary Goal**: Document Knowz-platform server-side summary quality issues (groundedness, indexing-state, post-processing refresh) as a formal spec; queue vault capture for platform team follow-up.
**Created**: 2026-04-18 13:28:17
**Status**: Active
**Current Phase**: 1B - Specification (lead-direct)
**Tier**: 2 (Light)
**Execution Mode**: Lead-Direct (Subagent Delegation unused — doc-only deliverable; MCP auth failed at probe)
**Autonomous Mode**: Active
**KnowledgeId:**

## Scope Note

The defects being documented are server-side on the Knowz platform. This repository (`knowz-skills`) contains client-side skills/plugins and has no control over the server-side summarizer. The meaningful in-repo deliverable is a formal `ServerSideSummary` spec that mirrors the precedent set by `ServerSideTitle.md` — making the platform-owned debt visible, actionable, and track-able for the platform team.

## Change Set

| NodeID | Description | Files | Type | Risk |
|--------|-------------|-------|------|------|
| ServerSideSummary | Platform-owned summary generation behavior (groundedness, indexing-state gating, post-processing refresh) | `knowzcode/knowzcode/specs/ServerSideSummary.md` (new), `knowzcode/planning/server-side-summary.md` (new) | docs/spec | low |

Single NodeID, no code changes in this repo.

## Todos

- KnowzCode: Initialize WorkGroup
- KnowzCode: Draft ServerSideSummary spec (3 platform issues)
- KnowzCode: Write planning doc, update tracker, log entry
- KnowzCode: Queue vault capture to pending_captures.md (MCP down)

## Phase History

| Phase | Status | Timestamp |
|-------|--------|-----------|
| 1A (Impact) | Completed inline | 2026-04-18 13:28:17 |
| 1B (Spec) | In Progress | 2026-04-18 13:28:17 |

## Research Summary

Three distinct server-side issues observed:

1. **Groundedness gap** — summarizer runs against extremely thin text ("Here's a book I like") and produces a multi-section narrative (Themes, Characters, Memorable Quotes, Life Lessons) that is not supported by the input. LLM hallucination without groundedness guards.

2. **Indexing-state blindness** — when an attachment (e.g., PDF) is referenced but still indexing, the platform runs the summarizer on text-only inputs and returns an authoritative-looking preliminary summary with no "indexing in progress" indicator.

3. **Post-processing refresh gap** — after attachment indexing completes, the summary is NOT automatically regenerated against the now-available content. The user had to manually invoke "resummarize" to get a grounded output. The async post-processing pipeline does not trigger summary refresh.

No matching behavior is defined or controllable in this repo — confirmed via grep for `post[- ]?process`, `re[- ]?summariz`, `refresh.{0,20}summary`, `auto.?summar` (no matches).

## Parallel to ServerSideTitle

`knowzcode/knowzcode/specs/ServerSideTitle.md` (2026-04-07, Draft) already delegates title generation to the platform and notes the same quality risk class in its Debt & Gaps section: *"Title generation quality for media-only items (minimal text content) depends on server fallback chain."* Summary quality is the same debt class, one level up in cost (summaries are more visible and more believable than titles).

## MCP Status

MCP probe at workflow start: **authentication failed (401 — API key invalid or expired)**.
- `VAULT_BASELINE = null`
- No live vault research performed
- Phase 3 capture will queue to `knowzcode/pending_captures.md` per closer MCP Graceful Degradation protocol

## Next

Lead-inline Phase 1B + Phase 3 finalization. No code implementation phase (deliverable is documentation only).
