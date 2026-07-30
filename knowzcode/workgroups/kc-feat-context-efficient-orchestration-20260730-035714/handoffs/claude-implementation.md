# Claude Adapter Implementation Handoff

**WorkGroup:** `kc-feat-context-efficient-orchestration-20260730-035714`
**Wave:** Phase 2A / A1
**Status:** Implemented in assigned canonical Claude/skill/agent scope
**Date:** 2026-07-30

## Delivered

- Replaced obsolete team lifecycle guidance with the current first-teammate/session-derived lifecycle and runtime-managed cleanup.
- Made Agent Teams optional and evidence-driven: only direct peer messaging/shared task coordination selects a team; named agents provide quality-equivalent parallel execution.
- Added classification/spec reuse before discretionary spawn and broad vault work, with `local -> resume -> inherited -> fresh capsule -> coordinated team` routing.
- Distinguished real Claude conversation forks from isolated skill `context: fork`; documented inheritance, reviewer-isolation, nesting, capability fallback, and cache-accounting constraints.
- Made compatible named-agent resume the default for architect, builder, reviewer, liaison, sequential, continuation, smoke, and gap-loop follow-ups. Warm workers persist through likely same-phase continuation and release at final gate, lease expiry, incompatibility/sensitivity change, capacity pressure, or no likely continuation.
- Removed unsupported plugin-agent permission frontmatter from all 15 affected `knowzcode/agents/*.md` files and removed the builder permission-bypass dispatch.
- Removed manual agent-definition/framework rereads; referenced Claude agent definitions now load automatically.
- Added bounded capsule/result guidance, progressive file reads, artifact-backed raw output, targeted Stage 0 fan-out, MCP health/baseline TTL reuse, and targeted liaison queries.
- Preserved TDD, all three gates, independent review, security/compliance blocking authority, vault durability, consolidated pre-Gate-3 checks, and strict relay separation.

## Canonical Files Changed

- `knowzcode/knowzcode/claude_code_execution.md`
- `knowzcode/skills/work/{SKILL.md,CLAUDE.md}`
- `knowzcode/skills/work/references/{light-workflow,parallel-orchestration,profile-models,quality-gates,spawn-prompts}.md`
- `knowzcode/skills/{audit,explore,continue,status}/SKILL.md`
- `knowzcode/skills/{audit,explore,continue}/CLAUDE.md`
- `knowzcode/agents/{analyst,architect,builder,closer,enterprise-enforcer,frontend-designer,knowledge-liaison,knowledge-migrator,microfix-specialist,project-advisor,reviewer,security-officer,smoke-tester,test-advisor,update-coordinator}.md`

No relay-execution reference, relay core, orchestration config, platform adapter, installer, validator, specification, or plugin mirror was edited by this worker.

## Verification

Passed:

1. `git diff --check` across every assigned canonical/skill/agent file.
2. Active-surface scan found none of: removed team lifecycle calls/arguments, created/deleted caller-owned teams, executable builder permission bypass, or Teams-default language.
3. Agent-frontmatter scan found no `permissionMode`, `hooks`, or `mcpServers` fields in `knowzcode/agents/*.md`.
4. Prompt scan found no procedural request for named agents/teammates to reread their own definition or the full Claude team guide.

Repository validator:

```text
node scripts/validate-platform-surfaces.mjs
exit 1
- Codex framework file drifted from source: claude_code_execution.md
- Claude current-runtime guidance must not call removed team lifecycle APIs:
  plugins/knowzcode/knowzcode/claude_code_execution.md
```

Both failures are the intentionally untouched generated/plugin mirror of the updated canonical Claude guide. The coordinator owns mirror synchronization; no scoped canonical failure was reported.

## Consolidation Notes

- Synchronize the canonical Claude guide into the plugin mirror, then rerun `validate-platform-surfaces.mjs`.
- Keep the new resume-first lease sentence during mirror generation: retain through likely same-phase fix/re-audit; release only at final gate, lease expiry, invalidation/sensitivity change, capacity pressure, or no likely continuation.
- Do not reintroduce plugin-agent permission fields or permission-bypass dispatch while reconciling generated surfaces.
- Strict relay remains deliberately outside native Agent/fork/Team routing.
