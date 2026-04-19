# Implementation Plan: Server-Side Summary Groundedness, Indexing-State Gating, and Post-Processing Refresh

## Goal

Document three related defects in the Knowz platform's AI summary generation so the platform team has a concrete, verifiable target. Formalize the contract via a `ServerSideSummary` spec that mirrors the precedent set by `ServerSideTitle`. Queue a completion capture for the ecosystem vault so the platform team can reference this work when scheduling the fix.

## Prior Knowledge (from vaults)

**Baseline (lead-direct):** N/A — MCP authentication failed at probe (401 — API key invalid or expired). No live vault queries ran.
**Deep research (knowledge-liaison):** N/A — agent not spawned (doc-only deliverable, Tier 2 Light, MCP down).

## Impact Analysis

### Defects being documented

1. **Groundedness gap** — summarizer emits fabricated facts (themes, characters, quotes, life lessons) that are not present in the source text. Reproduced from a real user save: body `"Here's a book I like"` plus an attached PDF (still indexing) produced a multi-section narrative summary about "AJ Jobs" sharing a favorite book.

2. **Indexing-state blindness** — preliminary summaries are generated and rendered as authoritative while attached files are still being post-processed. No UI indicator distinguishes preliminary output from final.

3. **Post-processing refresh gap** — after attachment indexing completes, the stale preliminary summary is NOT automatically regenerated. User must manually click "Resummarize" in the UI.

### Estimated NodeIDs

- **ServerSideSummary** (1 new) — platform-owned contract for summary generation. Mirrors `ServerSideTitle`.

### Affected files

- `knowzcode/knowzcode/specs/ServerSideSummary.md` — NEW
- `knowzcode/planning/server-side-summary.md` — NEW (this file)
- `knowzcode/workgroups/kc-fix-server-side-summary-20260418-132817.md` — NEW
- `knowzcode/knowzcode/knowzcode_tracker.md` — MODIFIED (add NodeID row)
- `knowzcode/knowzcode/knowzcode_log.md` — MODIFIED (append completion entry)
- `knowzcode/pending_captures.md` — NEW (MCP down, capture queued)

### Dependency map

Single NodeID, no parallelization concerns. All changes are documentation / tracking artifacts.

## Architecture Proposal

### In-repo deliverable: spec file

Follow the `ServerSideTitle.md` template:

- **Context** — what the platform owns, why skills don't implement it
- **Observed Defects** — concrete reproduction
- **Rules & Decisions** — the agreed contract (groundedness, indexing-state gating, refresh rule, provenance)
- **Interfaces** — platform-side changes required (out of repo scope)
- **Verification Criteria** — testable `VERIFY:` statements for the platform team
- **Debt & Gaps** — known tuning decisions (threshold, SLA) left to platform team

### Alternatives considered

- **Client-side defensive summarization.** Rejected. Would duplicate platform logic, mask the defect, violate the `ServerSideTitle` precedent, and add coupling we've already decided to avoid.
- **Single-issue spec (groundedness only).** Rejected. All three defects share the same pipeline and the same debt class — fragmenting them across three specs produces churn and obscures the common root cause (summarizer lifecycle ignores source state).
- **File issue on Knowz platform issue tracker instead of writing a spec here.** Not mutually exclusive — the spec is the canonical in-repo record regardless. Filing an issue upstream is a reasonable follow-up but not an alternative.

### Constraints

- **Precedent compatibility:** `ServerSideTitle.md` (Status: Draft) already sets the "platform owns it, skills pass null" pattern. `ServerSideSummary` must be structurally parallel to keep the two readable together.
- **No code changes in this repo:** the defects are server-side. Attempting to "fix" them here would be wrong.

### Spec consolidation opportunities

- No existing spec overlaps. `ServerSideTitle.md` is adjacent but distinct (titles vs summaries — different pipelines, different defect shapes).

## Project Context

- **WIP conflicts:** none. `knowzcode_tracker.md` is currently empty (no active NodeIDs).
- **Related backlog:** none. No `REFACTOR_*` tasks touch summary or platform-generation behavior.
- **Recent similar work:** `ServerSideTitle.md` (2026-04-07) — same "delegate to platform" pattern. Reuse structure.

## Risk Assessment

- **Risk:** platform team may disagree with the proposed thresholds (50-word below-threshold floor, 5-minute post-processing refresh SLA).
  **Mitigation:** thresholds are flagged in Debt & Gaps as placeholders pending platform-team tuning. Spec is a draft.
- **Risk:** spec sits as draft indefinitely if no one picks it up on the platform side.
  **Mitigation:** this WorkGroup queues a capture to the ecosystem vault (once MCP is restored) so platform team sees it. Follow-up: file issue in platform tracker (out of repo scope).
- **Risk:** MCP auth is broken — capture queued to `pending_captures.md` may sit unflushed.
  **Mitigation:** queue format matches canonical `/knowz flush` schema. Next run of `/knowz flush` with a valid API key will sync the capture automatically.

## Complexity

- **Files:** 6 total (3 new, 2 modified, 1 new pending-captures queue)
- **Potential NodeIDs:** 1 (`ServerSideSummary`)
- **Tier:** 2 (Light) — doc-only, no code, no architectural change
- **Security-sensitive:** No
- **External integrations:** No (MCP vault capture is queued, not live)

---

Ready to implement? **Already implemented inline** — this plan is an as-built artifact of `kc-fix-server-side-summary-20260418-132817`.
