## Phase

2A

## Status

complete

## Owned Files

- `knowz/agents/writer.md`
- `knowzcode/agents/analyst.md`
- `knowzcode/agents/architect.md`
- `knowzcode/agents/builder.md`
- `knowzcode/agents/closer.md`
- `knowzcode/agents/enterprise-enforcer.md`
- `knowzcode/agents/frontend-designer.md`
- `knowzcode/agents/knowledge-liaison.md`
- `knowzcode/agents/project-advisor.md`
- `knowzcode/agents/relay-runner.md`
- `knowzcode/agents/reviewer.md`
- `knowzcode/agents/security-officer.md`
- `knowzcode/agents/smoke-tester.md`
- `knowzcode/agents/test-advisor.md`
- `knowzcode/agents/update-coordinator.md`
- `knowzcode/knowzcode/claude_code_execution.md`
- `plugins/knowzcode/knowzcode/claude_code_execution.md`
- `knowzcode/skills/status/SKILL.md`
- `knowzcode/skills/work/SKILL.md`
- `knowzcode/skills/work/references/light-workflow.md`
- `knowzcode/skills/work/references/parallel-orchestration.md`
- `knowzcode/skills/work/references/quality-gates.md`
- `knowzcode/skills/work/references/spawn-prompts.md`
- `plugins/knowz/skills/knowz-flush/SKILL.md`
- `knowz-pending.md`
- `knowzcode/pending_captures.md`

## Findings

- Canonical durability is project-root `knowz-pending.md`. New blocks carry `Operation`, `Idempotency Key`, `Queue Status`, mutation identity, `Target Vault`, source, and payload. The writer owns post-MCP-attempt queuing and emits `QUEUED_IDEMPOTENCY_KEY`; the liaison owns pre-dispatch queuing and never duplicates a writer block (`knowz/agents/writer.md:27`, `knowz/agents/writer.md:84`, `knowzcode/agents/knowledge-liaison.md:172`).
- `/knowz flush` migrates nested legacy blocks append-before-remove, normalizes keyless root blocks from older Knowz producers, fails closed on key collisions/ambiguous targets, and preflights retries for idempotent reconciliation (`plugins/knowz/skills/knowz-flush/SKILL.md:15`).
- The three stranded blocks were preserved with stable keys. Two remain pending; the obsolete prior `41/41` completion claim is quarantined as superseded by this reopened WorkGroup and will not be replayed (`knowz-pending.md:1`). `knowzcode/pending_captures.md` is now a migration-only sentinel.
- Every Claude role containing task-list, DM, broadcast, mailbox, or peer-message behavior now has an explicit named-agent versus coordinated-team contract. Named agents return bounded results to the lead; only real teammates use shared task state or peer messaging. Spawn packets render the mode explicitly (`knowzcode/skills/work/references/spawn-prompts.md:5`, `knowzcode/knowzcode/claude_code_execution.md:46`).
- Gate 3 now waits for a selected security-officer result and autonomous mode pauses while it is pending (`knowzcode/skills/work/references/parallel-orchestration.md:187`, `knowzcode/skills/work/references/quality-gates.md:160`).
- The closer returns `FinalCaptureDelta`, an explicit changed-file list, verification summary, and suggested commit; it cannot call MCP, append queues, stage, commit, or claim user-facing completion (`knowzcode/agents/closer.md:14`).
- All broad staging examples in owned workflow surfaces were replaced with status/scoped-diff inspection, explicit approved path lists, cached diff checks, and staged-name verification (`knowzcode/skills/work/references/quality-gates.md:94`, `knowzcode/skills/work/references/light-workflow.md:108`, `knowzcode/skills/work/references/parallel-orchestration.md:112`).

## Verification

- `git diff --check` — pass.
- Focused workflow contract script — pass: 3 migrated blocks, 3 unique keys, 16 agent definitions scanned; queue schema, mode guards, security wait, closer authority, scoped staging, and flush/writer ownership asserted.
- Claude execution source/plugin `cmp` — pass.
- `npm run test:contracts --prefix knowzcode` — 25/26 pass; sole failure is source/plugin runtime mirror drift in the separate runtime hardening track.
- `node scripts/validate-platform-surfaces.mjs` — workflow/frontmatter checks pass; remaining failures are external-owner generated-surface drift for `platform_adapters.md` and generated Codex setup unmanaged-`AGENTS.md` preservation.

## Risks

- Generated platform adapters, installed Codex loop/work/status guidance, and installer surfaces are outside this writer's ownership and must be synchronized by their assigned owners before the integrated gate can pass.
- Older Knowz save/amend/auto producers outside this ownership still emit keyless root blocks. Flush safely normalizes those blocks before replay, but those producers should later emit explicit idempotency keys at creation.
- No queue replay was sent to live MCP during implementation; correctness was checked structurally and must receive a final integration/smoke replay test with a disposable vault or mocked MCP before release.

## Next Phase Inputs

- Coordinator should review this handoff, merge the canonical queue decision into coordinator-owned loop/Codex guidance, have the packaging owner synchronize generated surfaces, then run the full contract/platform/package/install gate and a fresh independent audit.
- Do not stage or commit from this handoff; use the WorkGroup's explicit approved path list after reviewing the combined multi-writer diff.
