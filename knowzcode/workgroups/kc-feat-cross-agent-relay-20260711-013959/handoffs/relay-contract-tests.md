## Phase

2A — TDD contract and packaging validation.

## Status

complete

## Owned Files

- `scripts/validate-platform-surfaces.mjs`
- `scripts/sync-codex-relay-surfaces.mjs`

## Findings

- The red gate was established before production edits. The validator failed on missing host/target resolution, selectors, natural-language precedence, same-host protection, schema 2/legacy mapping, Claude authentication/stream/resume/sandboxing, Codex relay packaging, lifecycle support, and provider-specific configuration.
- The validator now checks both supported host surfaces, requires Codex relay discovery/lifecycle files, keeps Gemini relay absent, verifies byte-coupled framework mirrors, and exercises the real Codex adapter parser/writer in a temporary project.
- The adapter-generation smoke test verifies `AGENTS.md`, `knowzcode-relay/SKILL.md`, the nested work reference, the project-level `knowzcode/relay_execution.md`, and current-version injection.
- `scripts/sync-codex-relay-surfaces.mjs` mechanically embeds seven marketplace-plugin relay surfaces into both platform-adapter mirrors and is idempotent.
- Green verification:
  - `node scripts/validate-platform-surfaces.mjs` — passed.
  - `git diff --check` — passed.
  - Temporary Codex install — 16 generated skills, one nested relay reference, schema/support core present, v0.20.0 injected.
  - `npm pack --dry-run --json` — relay entry, canonical reference, and project relay reference included.

## Blockers

None.

## Remaining Work

The independent Phase 2B audit must confirm every approved `VERIFY:` criterion and flag any semantic drift not expressible as a static contract.

## Next Phase Inputs

- Approved spec: `knowzcode/knowzcode/specs/CrossAgentRelay.md`
- Main validator: `node scripts/validate-platform-surfaces.mjs`
- Packaging verification: run `npm pack --dry-run --json` from `knowzcode/`.
