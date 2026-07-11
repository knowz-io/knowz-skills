## Phase

Phase 1A — canonical Claude-side relay source exploration.

## Status

Complete. Read-only analysis finished; no canonical source was modified.

## Owned Files

- `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/relay-source-explorer.md` (this findings file only)

## Findings

### 1. Current relay is structurally Claude-host/Codex-target, not merely worded that way

- The entry skill defines the product as “Claude plans / Codex implements / Claude reviews,” redirects only to `--relay=codex`, and explicitly declares itself Claude Code-only (`knowzcode/skills/relay/SKILL.md:3`, `knowzcode/skills/relay/SKILL.md:8-14`, `knowzcode/skills/relay/SKILL.md:63-65`).
- `/work` recognizes only `--relay=codex` or `relay: codex`, probes only the `codex` executable, and binds every announcement/conflict to Codex (`knowzcode/skills/work/SKILL.md:78-89`). Its public flag table also exposes only Codex (`knowzcode/skills/work/SKILL.md:614-617`).
- The execution reference hard-codes Codex detection, MCP/exec transports, event schemas, session recovery, command flags, artifact names, state names, takeover owner, commit messages, and failure remediation (`knowzcode/skills/work/references/relay-execution.md:11-33`, `knowzcode/skills/work/references/relay-execution.md:54-97`, `knowzcode/skills/work/references/relay-execution.md:107-163`, `knowzcode/skills/work/references/relay-execution.md:240-309`, `knowzcode/skills/work/references/relay-execution.md:330-377`).
- The runner likewise knows Codex-specific MCP tools, JSONL selectors, `$CODEX_HOME`, and `codex exec resume` (`knowzcode/agents/relay-runner.md:20-36`, `knowzcode/agents/relay-runner.md:38-55`).

Therefore a wording-only change cannot make relay bidirectional. The workflow must separate a provider-neutral coordinator from target adapters.

### 2. Required target-resolution contract

Use two variables everywhere: `RELAY_HOST` (`claude` or `codex`) and `RELAY_TARGET` (`claude` or `codex`). “Relay” means the host keeps planning/review/finalization while the selected external target performs implementation and fix rounds.

Recommended precedence, highest first:

1. Explicit flag: `--relay=claude|codex|other|auto|none`.
2. Unambiguous natural-language delegation in `$ARGUMENTS` or the invoking message: “have Claude implement,” “send the coding to Codex,” “Claude plans and Codex implements,” or “use the other agent.” A provider name without a delegation/implementation role (for example, “build a Codex integration”) must not activate relay.
3. Project configuration: `relay: claude|codex|other|auto|none`.
4. Entrypoint default: `/knowzcode:relay` with no target resolves `other`; ordinary `/knowzcode:work` with no target/config remains native (`none`).

Resolution rules:

- `other` and, on supported hosts, `auto` resolve to the complement: Claude host → Codex target; Codex host → Claude target.
- Explicit intent is never reversed. If the resolved target equals the host, halt for an explicit flag/natural-language target; for a stale config on ordinary `/work`, warn and use native Phase 2A. Suggest `--relay=other` or the actual external provider.
- An ambiguous natural-language role assignment (both providers mentioned without a clear implementer) must ask/stop, not guess.
- An explicit unavailable target pauses with provider-specific remediation. An automatically selected unavailable target may fall back to native Phase 2A with a visible `[RELAY-FALLBACK]` line.
- Persist `relay: other` when `/relay`’s default is accepted. Persisting concrete `codex` from Claude makes the same project contradictory when opened in Codex; the current template does exactly that (`knowzcode/knowzcode/knowzcode_orchestration.md:102-154`).

This preserves current `relay: codex` behavior on Claude while giving portable “other agent” semantics.

### 3. Provider-neutral state machine and legacy compatibility

The existing schema encodes roles in state tokens (`CODEX_IMPLEMENTING`, `CODEX_DONE`, `CLAUDE_TAKEOVER`) and omits host identity (`knowzcode/skills/work/references/relay-execution.md:123-150`, `knowzcode/skills/work/references/relay-execution.md:342-358`). Replace new state with versioned, role-based fields/tokens:

```text
Schema: 2
Host: claude|codex
Target: claude|codex
State: INIT|PLANNED|TARGET_IMPLEMENTING|TARGET_FAILED|TARGET_DONE|
       REVIEWING|FIX_ROUND|HOST_TAKEOVER|FINALIZING|DONE|ABORTED
Session ID: provider session/thread id
```

Keep the transition graph unchanged semantically: target implements → host reviews → target resumes for bounded fixes → host takeover → native finalization. Preserve the current “write state before triggering the action” invariant (`knowzcode/skills/work/references/relay-execution.md:152-163`).

`/continue` must accept both schemas. Legacy `Mode: codex` plus `CODEX_*`/`CLAUDE_TAKEOVER` maps to `Host: claude`, `Target: codex`, and the new role-based states. Do not rewrite old state until a successful transition. Current continuation assumes only a dead Codex process and Codex JSONL evidence (`knowzcode/skills/continue/SKILL.md:82-88`; `knowzcode/skills/continue/CLAUDE.md:14-16`). New reconciliation must dispatch to the recorded target adapter.

Keep `kc-relay/{wgid}`, checkpoints, round caps, branch isolation, clean C0 baseline, and Gate #3 safety rules provider-neutral. Make artifact names target-qualified (`{target}-log-rN`, `{target}-last-rN`, `{target}-err-rN`) while continuing to recognize existing `codex-*` files.

### 4. Target adapter boundary

The coordinator should call a target adapter that owns:

- live install/version/auth detection and remediation;
- transport selection;
- initial command/tool call and resume command/tool call;
- session-ID extraction and recovery;
- completion detection, final-message extraction, and liveness signal;
- provider-specific auth/argument/runtime error classification.

The Codex adapter is the current protocol: `codex login status`, Codex MCP or exec, `thread.started`, `turn.completed`, `$CODEX_HOME/sessions`, and `codex exec resume` (`knowzcode/skills/work/references/relay-execution.md:16-31`, `knowzcode/skills/work/references/relay-execution.md:58-89`, `knowzcode/skills/work/references/relay-execution.md:250-309`).

The new Claude adapter needs a separately validated exec protocol. A local read-only CLI probe found Claude Code 2.1.207 exposes `claude auth status`, `-p/--print`, `--output-format stream-json`, `--resume`, `--session-id`, `--effort`, and permission modes. Before shipping, validate the stream event containing the session ID, completion event, safe unattended edit permission mode, resume flag ordering, SIGINT/session persistence, and final-output extraction. Do not copy Codex JSONL selectors or sandbox flags.

The generic runner should receive `TARGET`, provider-built `COMMAND`/`RESUME_COMMAND` (or tool args), provider-specific artifact paths, and session/completion selectors; it must continue never composing commands itself. MCP remains Codex-only unless Claude gains a verified equivalent. The iron rule and in-turn polling remain valid (`knowzcode/agents/relay-runner.md:14-20`, `knowzcode/agents/relay-runner.md:46-55`).

### 5. Configuration compatibility

Expand `relay:` values to `none|auto|other|claude|codex`. Keep `--relay=codex` backward compatible and add `--relay=claude`, `--relay=other`, and `--relay=none`.

Existing `relay_model`, `relay_transport`, and `relay_sandbox` are documented as Codex-specific and default to Codex values (`knowzcode/skills/work/references/relay-execution.md:37-52`; `knowzcode/knowzcode/knowzcode_orchestration.md:115-149`). Do not feed `gpt-5.6-sol` or `workspace-write` into Claude. Treat existing keys as legacy Codex-adapter settings and add target-specific Claude settings (at minimum model, effort/fix effort, and the validated permission mode), while retaining the generic per-invocation `--relay-model`/`--relay-effort` as overrides for the selected target.

### 6. Init, status, and continuation implications

- Init currently probes only Codex and writes `relay: codex` (`knowzcode/skills/init/SKILL.md:129-145`). It must detect the host, probe the other provider, phrase the enable question dynamically, and persist `relay: other`.
- The embedded init template does not contain any relay block at all, despite init claiming it does: `templates.md` ends its orchestration template after basic keys (`knowzcode/skills/init/references/templates.md:117-160`). Add the full provider-neutral block there.
- Codex adapter generation lists 12 skills and omits relay (`knowzcode/skills/init/SKILL.md:197-218`), and its success message also omits relay (`knowzcode/skills/init/references/success-messages.md:11-28`). Bidirectional support requires generating/reporting the Codex relay skill.
- Status currently reports only “Codex Relay,” only Codex health, and `none|codex` config (`knowzcode/skills/status/SKILL.md:98-111`). Report host, configured selector, resolved target, target health, and any same-host/config warning.
- Continuation must restore target-specific settings and adapter, then reconcile evidence using that adapter rather than hard-coded Codex filenames/events (`knowzcode/skills/continue/SKILL.md:63-88`).

### 7. Existing contradictions/drift to fix while editing

- `/work` Step 1.6 says it performs only `command -v codex` and defers full detection (`knowzcode/skills/work/SKILL.md:82-87`), but the Tier 3 summary says `RELAY_DETECT already passed (Step 1.6)` (`knowzcode/skills/work/SKILL.md:523-530`). Correct the summary.
- Init says the generated template has relay comments/config (`knowzcode/skills/init/SKILL.md:129-145`), but `init/references/templates.md` has none (`knowzcode/skills/init/references/templates.md:117-160`).
- The shipped config says relay keys are informational/inert on Codex (`knowzcode/knowzcode/knowzcode_orchestration.md:152-154`), README says there is no Codex-side relay (`knowzcode/README.md:138-158`), and the v0.20 changelog says a validator enforces that absence (`knowzcode/CHANGELOG.md:13-20`). These must change together; record the new work under `Unreleased` rather than rewriting the historical v0.20 claims.

### 8. Exact canonical files that must change

1. `knowzcode/skills/relay/SKILL.md` — provider-neutral purpose, host/target resolution, natural-language intent, dynamic detection/persistence/redirect.
2. `knowzcode/skills/work/SKILL.md` — precedence parser, same-host validation, dynamic announcements/fallbacks, generic relay summary and flags.
3. `knowzcode/skills/work/CLAUDE.md` — generic runner/constraints/relay operational summary (`knowzcode/skills/work/CLAUDE.md:25`, `knowzcode/skills/work/CLAUDE.md:60`, `knowzcode/skills/work/CLAUDE.md:78`).
4. `knowzcode/skills/work/references/relay-execution.md` — major split into neutral coordinator + Codex/Claude target adapters, schema v2, legacy mapping, dynamic failures and resume.
5. `knowzcode/agents/relay-runner.md` — target-aware inputs, selectors, artifacts, exit report; preserve command non-composition and iron rule.
6. `knowzcode/skills/continue/SKILL.md` and `knowzcode/skills/continue/CLAUDE.md` — schema/adapter-aware resume plus legacy state support.
7. `knowzcode/skills/status/SKILL.md` — host/resolved-target health instead of Codex-only status.
8. `knowzcode/skills/init/SKILL.md` — other-provider detection, `relay: other`, and Codex relay-skill generation.
9. `knowzcode/skills/init/references/templates.md` — add provider-neutral relay config block.
10. `knowzcode/skills/init/references/success-messages.md` — include generated Codex relay skill.
11. `knowzcode/knowzcode/knowzcode_orchestration.md` — new values, portable default semantics, provider-specific settings, remove inert-on-Codex claim, update precedence table.
12. `knowzcode/README.md` — bidirectional behavior, precedence/natural-language examples, requirements for both directions, revised platform constraint and command description (`knowzcode/README.md:138-158`, `knowzcode/README.md:220-233`).
13. `knowzcode/CHANGELOG.md` — add an `Unreleased` entry; leave v0.20 history intact.

No relay-specific changes were found necessary in `light-workflow.md`, `parallel-orchestration.md`, `profile-models.md`, `quality-gates.md`, or `spawn-prompts.md`; their generic Tier/Gate mechanics can be reused.

## Blockers

- The Claude-target exec adapter is not safe to claim complete until its headless permission behavior, stream-json schema, resume semantics, and interruption recovery are exercised end-to-end. This is the only hard canonical implementation gate.
- Codex-side skill/package surfaces are outside this explorer’s assigned boundary but are required for actual reverse relay. Canonical Claude-side edits alone only document the reverse direction.

## Next Phase Inputs

1. Implement the resolution contract first and use one resolved `RELAY_HOST`/`RELAY_TARGET` pair downstream; do not re-resolve in later phases.
2. Introduce schema v2 plus a legacy-state parser before changing state tokens/artifact names, so in-flight v0.20 relays remain resumable.
3. Extract the existing Codex behavior unchanged into a target adapter, then add and E2E-validate the Claude adapter.
4. Update init/status/continue/config/docs only after the adapter contract is stable.
5. Acceptance matrix must cover both hosts; flag vs natural language vs config vs `/relay` default; `other`/`auto`; same-host rejection; missing/broken/unauthenticated target; Tier 2 skip; old Codex state continuation; target failure/resume/takeover; and a clean successful round-trip in each direction.
