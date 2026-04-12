# ServerSideTitle: Platform-Owned Title Generation

**Updated:** 2026-04-07
**Status:** Draft
**KnowledgeId:**

## Rules & Decisions

- Decision: delegate title generation entirely to the server platform. Skills stop generating titles and pass `title: null`. Rationale: gives the platform full control over title format and quality; reduces skill complexity; enables AI-generated titles from content.
- Rule: when `title` is null or empty, the platform generates a title. Fallback chain: AI-generated from content -> `"{KnowledgeType} -- {ISO date}"` -> `"Untitled -- {UUID prefix}"`. The platform never stores null/empty titles.
- Rule: when `title` is provided and non-empty, the platform uses it as-is (backward compatible for explicit user titles).
- Decision: pending queue headers keep human-readable format `### {timestamp} -- {description}` for local file readability. When flushing to MCP, pass `title: null` so the platform generates the real title.
- Decision: dedup shifts from title-based to content-based semantic search. This is an improvement — title-based dedup missed items with different titles but similar content.
- Rule: dedup queries use a brief content summary (first ~100 words or key phrases) as the `query` parameter to `search_knowledge`, not the title.

## Interfaces

**No MCP schema change needed:** `title` is already optional with `default: null` in `create_knowledge`.

**Title generation removal (9 locations):**

| File | Current | Change |
|------|---------|--------|
| `knowz/skills/knowz/SKILL.md` save action step 6 | Generates `{Category}: {Descriptive summary}` | Remove step 6 entirely; pass `title: null` in step 8 |
| `knowz/platform_adapters.md` ~line 94 | Template generates `{Category}: {Descriptive summary}` | Remove title generation instruction from generated adapter |
| `knowz/agents/knowledge-worker.md` ~line 69 | Generates `{Category}: {descriptive summary}` | Remove title generation; pass `title: null` |
| `knowz/agents/writer.md` ~line 37 | Default title: `{Category}: {descriptive summary with technology names}` | Remove default title template; pass `title: null` unless dispatch prompt provides an explicit title |
| `knowzcode/agents/closer.md` ~lines 113-124 | Learning Category Routing table has Title Prefix column | Remove Title Prefix column from routing table |
| `knowzcode/agents/knowledge-liaison.md` ~lines 134, 144, 152 | Phase Extraction Guide has title prefix guidance | Remove title prefix lines from all phase sections |
| `knowzcode/knowzcode/knowzcode_loop.md` line 438 | "with appropriate title prefix" | Remove "with appropriate title prefix" |
| `plugins/knowz/skills/knowz-save/SKILL.md` line 36 | Generates `{Category}: {Descriptive summary}` | Remove title generation step; pass `title: null` |
| `plugins/knowzcode/knowzcode/knowzcode_loop.md` line 438 | Mirror of loop | Mirror the loop change |

**Dedup redesign (4 locations):**

| File | Current Dedup | New Dedup |
|------|--------------|-----------|
| `knowz/skills/knowz/SKILL.md` save action step 7 | `search_knowledge(generated_title, vaultId, 3)` | `search_knowledge(content_summary, vaultId, 3)` where `content_summary` is a brief summary of the content being saved |
| `knowz/agents/knowledge-worker.md` ~line 70 | `search_knowledge(title, vaultId, 3)` | `search_knowledge(content_summary, vaultId, 3)` |
| `knowz/agents/writer.md` ~line 45 | `search_knowledge(title, vaultId, 3)` | `search_knowledge(content_summary, vaultId, 3)` where `content_summary` is derived from the formatted content |
| `knowzcode/agents/closer.md` ~line 144 | `search_knowledge(title, vaultId, 3)` | `search_knowledge(content_summary, vaultId, 3)` |

**Plugin sync:** `plugins/knowz/skills/knowz-save/SKILL.md` and `plugins/knowzcode/knowzcode/knowzcode_loop.md` must mirror their originals.

## Verification Criteria

- VERIFY: no skill or agent in this repo generates titles for `create_knowledge` calls (grep for `{Category}:` title patterns returns zero matches outside specs and plan files)
- VERIFY: `create_knowledge` calls in all save/write/capture flows pass `title: null` (or omit `title`) unless an explicit user-provided title exists
- VERIFY: dedup checks in all 4 locations use content-based queries (not title-based) with `search_knowledge`
- VERIFY: pending queue flush passes `title: null` to `create_knowledge` regardless of the human-readable header in `### {timestamp} -- {description}`
- VERIFY: the closer's Learning Category Routing table has no Title Prefix column
- VERIFY: `plugins/knowz/skills/knowz-save/SKILL.md` matches `knowz/skills/knowz/SKILL.md` save action for title and dedup behavior
- VERIFY: `plugins/knowzcode/knowzcode/knowzcode_loop.md` matches `knowzcode/knowzcode/knowzcode_loop.md` for capture protocol

## Debt & Gaps

- Server-side AI title generation must be deployed before skills can rely on `title: null` producing good titles
- Title generation quality for media-only items (minimal text content) depends on server fallback chain
- Title generation latency — server may use async/provisional title approach; not controlled by this repo
