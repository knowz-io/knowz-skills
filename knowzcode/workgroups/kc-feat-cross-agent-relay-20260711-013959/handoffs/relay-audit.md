## Phase

2B — independent read-only completeness and security audit.

## Status

partial — 13 of 15 specification criteria are fully evidenced (86.7%). Two P2 protocol gaps should return to Phase 2A before finalization. Enterprise compliance is disabled, so no enterprise guideline findings apply.

## Owned Files

- Read: `knowzcode/knowzcode/specs/CrossAgentRelay.md`
- Read: `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959.md`
- Read: all tracked implementation diffs from `git diff -- .` and every untracked file reported by `git ls-files --others --exclude-standard`
- Read: canonical relay/work/lifecycle/configuration/documentation surfaces under `knowzcode/`
- Read: Codex plugin skills and framework support under `plugins/knowzcode/`
- Read: generated Codex/Gemini adapter templates and validation/synchronization scripts
- Written: `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/relay-audit.md`

## Findings

### P2 — Claude success can be accepted without the required resume identity

The canonical Claude wrappers convert an exit-zero process into failure only when the final record is not `type=result`, `subtype=success`, `is_error=false`; neither the round-0 nor resume check requires a nonempty `session_id` (`knowzcode/skills/work/references/relay-execution.md:457-462`, `knowzcode/skills/work/references/relay-execution.md:504-509`). Session extraction is described afterward, but a missing ID does not invalidate the leg (`knowzcode/skills/work/references/relay-execution.md:466-476`). That permits `TARGET_DONE` without the resumable identity required by the spec (`knowzcode/knowzcode/specs/CrossAgentRelay.md:53-55`) and contradicts the stricter Codex-host contract, which requires a nonempty final `session_id` (`plugins/knowzcode/skills/work/references/relay-execution.md:193-209`). Require a nonempty ID from `system/init` or the final result before success/TARGET_DONE; otherwise persist `TARGET_FAILED` and use the bounded recovery path.

### P2 — The generalized runner requires Codex completion commands that the Codex adapter no longer defines

The runner now rejects missing `COMPLETION_COMMAND` and `RESULT_SUBTYPE_COMMAND`, and uses them to decide whether exit zero is truly successful (`knowzcode/agents/relay-runner.md:31-39`, `knowzcode/agents/relay-runner.md:55-56`). The Codex adapter provides launch/resume commands, thread-ID extraction, and final-message fallback, but no concrete completed-turn predicate or result-status command (`knowzcode/skills/work/references/relay-execution.md:377-425`). Thus the lead has no canonical provider-built values for two mandatory runner inputs, risking a regression in the backward-compatible Claude-to-Codex path required by `--relay=codex` (`knowzcode/knowzcode/specs/CrossAgentRelay.md:46`). Add exact Codex JSONL completion/status selectors (for example, the verified `turn.completed` predicate and an explicit status/subtype fallback) to the Codex target adapter and validate their presence.

## Verification Matrix

| VERIFY criterion | Result | Evidence |
|---|---|---|
| Claude host `--relay=codex` preserves Codex semantics | Partial | Resolution and CLI templates remain at `knowzcode/skills/work/SKILL.md:82-100` and `knowzcode/skills/work/references/relay-execution.md:377-425`; mandatory runner completion selectors are missing (P2 above). |
| `other` / `auto` complement both hosts | Pass | Shared matrix at `knowzcode/skills/work/references/relay-execution.md:29-35`; Codex normalization at `plugins/knowzcode/skills/work/SKILL.md:72-77`. |
| Flag precedence and `--relay=none` | Pass | `knowzcode/skills/work/references/relay-execution.md:11-27`; `plugins/knowzcode/skills/work/SKILL.md:58-64`. |
| Natural-language named target; incidental mentions ignored | Pass (contract/static) | `knowzcode/skills/work/references/relay-execution.md:13-17`; Codex entry examples/negative rule at `plugins/knowzcode/skills/relay/SKILL.md:34-43`. |
| Config, `/relay` default, and native `/work` ordering | Pass | `knowzcode/skills/work/references/relay-execution.md:13-17`; Codex work at `plugins/knowzcode/skills/work/SKILL.md:58-64`. |
| Explicit same-host selection halts | Pass | Shared rule at `knowzcode/skills/work/references/relay-execution.md:29-38`; Codex rule at `plugins/knowzcode/skills/work/SKILL.md:79-82`. |
| Explicit-vs-automatic availability fallback and auth pause | Pass | `knowzcode/skills/work/references/relay-execution.md:76-91`; Codex package at `plugins/knowzcode/skills/work/SKILL.md:84-87`. |
| Schema-2 state and target-qualified artifacts | Pass | `knowzcode/skills/work/references/relay-execution.md:185-246`; Codex schema at `plugins/knowzcode/skills/work/references/relay-execution.md:56-82`. |
| Schema-1 migration | Pass | Canonical mapping, including actual v0.20 `Thread ID`, at `knowzcode/skills/work/references/relay-execution.md:257-275` and `knowzcode/skills/continue/SKILL.md:106-133`. Codex correctly labels that legacy state as belonging to the Claude host at `plugins/knowzcode/skills/continue/SKILL.md:54-69`. |
| Claude auth/stream/session/resume/safe sandbox contract | Partial | Redacted readiness at `knowzcode/skills/work/references/relay-execution.md:61-75`; safe permissions/sandbox at `knowzcode/skills/work/references/relay-execution.md:161-171`; commands/resume at `knowzcode/skills/work/references/relay-execution.md:429-513`. Missing required success-time session validation is P2 above. |
| Codex marketplace packaging; no Claude team APIs/agents | Pass | Codex relay/work/continue/init/status skills exist; no `plugins/knowzcode/agents`; validator guard at `scripts/validate-platform-surfaces.mjs:294-363` and API scan at `scripts/validate-platform-surfaces.mjs:647-665`. Targeted `rg` found no `TeamCreate`, `TaskCreate`, `TaskUpdate`, `TaskGet`, `SendMessage`, or `ExitPlanMode` in Codex skills. |
| `npx ... --platforms codex` generation/version injection | Pass | Local `npx --yes ./knowzcode install --target <temp> --platforms codex --force` produced relay/work/reference/continue/init/status/start-work surfaces with v0.20.0 comments and valid frontmatter; automated smoke test is at `scripts/validate-platform-surfaces.mjs:402-449`. |
| Required source/plugin and generated mirrors | Pass | `cmp` confirms orchestration, platform-adapter, and core relay-reference mirrors; a read-only render comparison confirmed all seven embedded Codex relay surfaces equal their plugin sources after the documented name/version transforms in `scripts/sync-codex-relay-surfaces.mjs:11-27`. |
| Gemini omits relay | Pass | No relay path exists under `knowzcode/.gemini`; negative validation is at `scripts/validate-platform-surfaces.mjs:363`. |
| README/workflow/init/status/config consistency | Pass | User contract at `knowzcode/README.md:138-163`; orchestration at `knowzcode/knowzcode/knowzcode_orchestration.md:102-153`; init at `knowzcode/skills/init/SKILL.md:129-158`; status at `knowzcode/skills/status/SKILL.md:99-153`. |

Additional checks:

- `node scripts/validate-platform-surfaces.mjs` — passed.
- `git diff --check` — passed.
- `node --check scripts/validate-platform-surfaces.mjs` and `node --check scripts/sync-codex-relay-surfaces.mjs` — passed.
- Ruby/Psych parsed every changed/new `SKILL.md` frontmatter; all Codex skills contain exactly `name` and `description`.
- Installed Claude CLI 2.1.207 exposes every documented flag. The auth probe was parsed to the safe `loggedIn`, `authMethod`, `apiProvider`, and `subscriptionType` fields only; no personal auth payload was logged.
- No live model-consuming relay leg was run, consistent with the approved debt boundary (`knowzcode/knowzcode/specs/CrossAgentRelay.md:64-65`).

## Blockers

- The two P2 findings prevent a clean Phase 2B approval. Neither is an external blocker; both are bounded Phase 2A documentation/protocol fixes.

## Remaining Work

1. Make Claude completion validation require a nonempty persisted session ID before `TARGET_DONE`, in both initial and resumed wrapper contracts and validator assertions.
2. Define the mandatory Codex `COMPLETION_COMMAND` and `RESULT_SUBTYPE_COMMAND` in the Codex target adapter; add validator checks for their exact predicates.
3. Re-run the full validator, `git diff --check`, frontmatter parsing, mirror comparison, and this two-item audit.

## Next Phase Inputs

- Approved spec: `knowzcode/knowzcode/specs/CrossAgentRelay.md`
- Canonical transport: `knowzcode/skills/work/references/relay-execution.md`
- Runner contract: `knowzcode/agents/relay-runner.md`
- Codex transport mirror: `plugins/knowzcode/skills/work/references/relay-execution.md`
- Validation: `scripts/validate-platform-surfaces.mjs`

## Re-audit

Focused re-audit complete: both P2 findings are resolved, raising the result to 15 of 15 criteria (100%) with no remaining audit blockers.

- **Claude resumable-success finding — resolved.** Both round-0 and resume wrapper predicates now require `type=result`, `subtype=success`, `is_error=false`, and a nonempty `session_id`; otherwise the effective exit marker becomes nonzero (`knowzcode/skills/work/references/relay-execution.md:490-495`, `knowzcode/skills/work/references/relay-execution.md:537-542`).
- **Codex completion-selector finding — resolved.** The Codex adapter now supplies a concrete `COMPLETION_COMMAND` requiring exit zero, a nonempty session/thread ID, `turn.completed`, and a nonempty final message, plus a `RESULT_SUBTYPE_COMMAND` that reports `turn.completed`, `turn.failed`, or `unknown` (`knowzcode/skills/work/references/relay-execution.md:427-458`). These satisfy the runner's mandatory input and completion-validation contract (`knowzcode/agents/relay-runner.md:31-39`, `knowzcode/agents/relay-runner.md:55`).
- Regression assertions now cover both contracts (`scripts/validate-platform-surfaces.mjs:313-320`). The two core relay mirrors are byte-identical, `node scripts/validate-platform-surfaces.mjs` passes, and `git diff --check` passes.

**Re-audit verdict:** complete — proceed to Phase 3 finalization.
