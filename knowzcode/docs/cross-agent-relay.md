# Cross-Agent Relay

> **Experimental.** Supported hosts are Claude Code and OpenAI Codex.

Let the current host plan, specify, review, and finalize while the **other coding agent implements**. From Claude Code the default external target is the OpenAI Codex CLI; from Codex the default external target is the Claude Code CLI. The target completes Phase 2A headlessly, the host reviews the checkpoint diff at Gate #3, the target resumes for bounded fix rounds, and the host takes over any remaining fixes after the configured cap.

## Enable it

Flags, natural language, or portable project configuration:

```bash
/knowzcode:relay Add rate limiting to the API      # targets the other agent
/knowzcode:work --relay=other <goal>               # portable explicit selection
/knowzcode:work --relay=claude <goal>              # literal Claude target
/knowzcode:work --relay=codex <goal>               # literal Codex target
/knowzcode:work have Claude implement the approved plan
# or set `relay: other` in knowzcode/knowzcode_orchestration.md
```

## Target resolution

Deterministic precedence: explicit `--relay=` flag → unambiguous natural language → project `relay:` configuration → `/knowzcode:relay` defaults to `other`. Ordinary `/knowzcode:work` remains native when none of those enable relay. `auto` and `other` select the opposite supported host; an explicitly named same-host target is an error and is never silently reversed.

## Requirements

The selected target CLI must be installed and authenticated:

- **Codex target** — install [Codex](https://developers.openai.com/codex) and run `codex login`.
- **Claude target** — install [Claude Code](https://code.claude.com/docs/en/setup) and run `claude auth login`.

Missing automatic/configured targets visibly fall back to native Phase 2A; explicitly named unavailable targets and authentication failures stop with remediation.

## Tuning

Per-invocation `--relay-model=`, `--relay-effort=`, and `--relay-max-fix-rounds=N` overrides, plus provider-specific config (`relay_codex_*`, `relay_claude_*`) and shared `relay_transport`, `relay_max_fix_rounds`, and `relay_timeout_minutes` in `knowzcode/knowzcode_orchestration.md`.

## Transports

Codex targets use the synchronous `codex mcp-server` transport when registered, otherwise `codex exec`. Claude targets use `claude -p` with streaming JSONL and explicit `--resume`; `claude mcp serve` is not an agent-delegation transport. Both exec adapters poll inside the active orchestrator turn — never a background wake-up — and persist the provider session ID as soon as it appears.

## Safety model

Relay runs on a dedicated `kc-relay/{wgid}` branch, never the default branch, with a clean C0 baseline. The target never commits; the host checkpoints each completed leg. Codex uses `workspace-write` with approvals disabled. Claude uses `dontAsk`, a bounded implementation tool set, strict Bash sandboxing, strict MCP configuration, and never defaults to bypassing permissions. Schema-2 state records host, target, role state, and session ID in `knowzcode/workgroups/{wgid}-relay/state.md`; `/knowzcode:continue` also reads legacy v0.20 Codex state.

## Constraints

Tier 3 (Full) workflows only; incompatible with `--profile advisor`; supported hosts are Claude Code and Codex. Gemini remains native-only because "other" is ambiguous there.

## Full protocol

The complete execution reference — state machine, adapters, failure matrix, resume rules — lives at [`skills/work/references/relay-execution.md`](../skills/work/references/relay-execution.md).
