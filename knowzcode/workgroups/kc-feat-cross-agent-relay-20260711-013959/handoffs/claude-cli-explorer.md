## Phase

Phase 1A — read-only Claude CLI capability exploration for a Codex-hosted relay.

## Status

Complete. The installed Claude Code CLI supports a Codex-to-Claude implementation relay through its noninteractive subprocess protocol. Use the CLI/JSONL transport; `claude mcp serve` is not a symmetric agent-delegation transport.

## Owned Files

- `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/claude-cli-explorer.md`

## Findings

### Local verification (facts, 2026-07-11)

- Executable: `/Users/alex/.local/bin/claude`
- Version: `2.1.207 (Claude Code)`
- `claude auth status --json` exited successfully and reported `loggedIn: true`, `authMethod: claude.ai`, `apiProvider: firstParty`, and `subscriptionType: max`. Email and organization fields were deliberately not logged.
- A tool-disabled `claude -p --output-format json` probe returned a single `type: result`, `subtype: success` object with a nonempty `session_id`.
- A second `claude -p --resume <session-id>` call from the same temporary working directory succeeded and retained the same session ID.
- Plain text on stdin worked as the prompt. JSONL on stdin with `--input-format stream-json --output-format stream-json --verbose` also worked.
- `--output-format stream-json --verbose --include-partial-messages` produced live `system`, `assistant`, `stream_event`, `rate_limit_event`, and final `result` records. Without `--verbose`, this installed CLI rejects `stream-json` output.
- `claude mcp serve --help` exists and starts a Claude Code MCP server over stdio.

### Noninteractive invocation and working directory (facts)

- `-p` / `--print` runs one noninteractive agent request and exits. The top-level CLI has no `--cwd` flag; the orchestrator must spawn the subprocess with its `cwd` set to the relay repository/worktree. `--add-dir` grants access to extra directories and should not be added by default.
- Noninteractive mode skips the workspace trust dialog, so the relay must only launch in a directory already trusted by the Codex coordinator/user. Invalid settings files can be silently ignored in print mode.
- Session lookup is scoped to the starting project directory and its git worktrees. Resume calls must use the same repository/worktree `cwd`; a session ID started elsewhere reports “No conversation found.” Do not use `--no-session-persistence` when fix-round resume is required.
- `--continue` is directory-relative and race-prone when multiple sessions exist. Persist and use the explicit `session_id` instead.
- `--bare` is unsuitable as the default relay hygiene flag when the user authenticates through Claude.ai: local help says bare mode never reads OAuth/keychain auth and requires `ANTHROPIC_API_KEY` or an explicit key helper. `--safe-mode` preserves auth and built-in tools, but disables CLAUDE.md, skills, hooks, plugins, and MCP, so it also removes project conventions unless the relay prompt supplies them explicitly.

Official references: [CLI reference](https://code.claude.com/docs/en/cli-usage), [session management](https://code.claude.com/docs/en/sessions), [noninteractive mode](https://code.claude.com/docs/en/headless).

### Permissions and sandboxing (facts)

- `--tools` restricts which built-in tools exist; `--allowedTools` auto-approves matching tools. They are not synonyms.
- `--permission-mode dontAsk` is fully noninteractive: anything that would prompt is denied. `acceptEdits` auto-approves file edits and a small set of filesystem commands, but other Bash/network actions can still prompt and therefore abort a headless run. `bypassPermissions` disables safety checks and is explicitly documented for isolated containers/VMs only; it is not a sandbox.
- Claude's Bash sandbox is disabled by default. It can be enabled with inline `--settings` or settings files using `sandbox.enabled: true`. For relay safety also set `sandbox.failIfUnavailable: true` and `sandbox.allowUnsandboxedCommands: false`; otherwise sandbox startup failure or Claude's escape hatch can run commands unsandboxed.
- The sandbox confines Bash and child processes, with writes limited by default to the working directory and session temp directory. It does **not** sandbox built-in Read/Edit/Write tools, so their permission rules must remain scoped deliberately.
- Network domains are not pre-allowed. In strict headless mode, network-dependent builds need explicit `sandbox.network.allowedDomains`; otherwise those requests should be denied rather than prompting.

Recommended safe baseline (inference): use `dontAsk`, restrict `--tools` to the implementation set, auto-approve only the needed file/search tools with working-directory-scoped permission rules, and enable strict Bash sandboxing. Do not broadly allow unsandboxed `Bash` and do not use `--dangerously-skip-permissions` as the reverse equivalent of Codex's `workspace-write` mode.

Official references: [permission modes](https://code.claude.com/docs/en/permission-modes), [sandboxing](https://code.claude.com/docs/en/sandboxing), [sandbox settings](https://code.claude.com/docs/en/settings#sandbox-settings).

### Output, session capture, and resume (facts)

- `--output-format json` returns one object containing `result`, `session_id`, `subtype`, `is_error`, usage/cost fields, turn count, and timing metadata. Capture `.session_id`; treat success as `type == "result" && subtype == "success" && is_error == false`, not merely process exit zero.
- `--json-schema` can validate a final domain-specific result and places it in `structured_output`, but it is unnecessary for transport framing because JSON/JSONL already has a stable result envelope.
- For liveness and early session capture, use `--output-format stream-json --verbose --include-partial-messages`. `system/init` carries the session ID before completion; a final `result` carries it again.
- Documented result subtypes include `success`, `error_max_turns`, `error_max_budget_usd`, `error_during_execution`, and `error_max_structured_output_retries`. Error results exit nonzero, but still carry a session ID and accounting fields.
- Completed-session resume is verified locally with `claude -p --resume <id> ...`. Resume after a force-killed mid-turn was not tested and is not documented with Codex's “SIGINT flushes rollout” guarantee; treat interrupted-turn recovery as best-effort and keep fix prompts self-contained.

Official references: [structured and streaming output](https://code.claude.com/docs/en/headless#get-structured-output), [result states](https://code.claude.com/docs/en/agent-sdk/agent-loop#handle-the-result).

### Stdin behavior (facts)

- Default text input accepts either a prompt argument or stdin. Piped stdin is capped at 10 MB. Prompt data should be written directly to the child process stdin to avoid shell quoting and then stdin should be closed.
- `--input-format stream-json` accepts JSONL user messages on stdin and supports multiple turns/steering while one process remains alive; it requires print mode and stream-json output. This is available but more complex than one process per relay leg plus explicit resume.
- Do **not** copy the existing Codex relay's unconditional `</dev/null>` rule. Claude can accept a prompt argument with closed stdin, but if the reverse relay chooses stdin for the prompt, `/dev/null` would remove the request. A simple implementation should write the prompt once to stdin and close it; fix rounds spawn a new process with `--resume` and repeat.

Official reference: [noninteractive stdin and streaming](https://code.claude.com/docs/en/headless).

### Timeouts and liveness (facts)

- There is no CLI wall-time flag. `API_TIMEOUT_MS` bounds each API request and defaults to 600,000 ms (10 minutes). An agent session itself can span many requests.
- `--max-turns` and `--max-budget-usd` provide deterministic loop/cost bounds.
- The event-level streaming watchdog is enabled by default; `CLAUDE_STREAM_IDLE_TIMEOUT_MS` defaults to 300,000 ms and explicit values below five minutes are clamped. Direct Anthropic connections also have a default byte-level watchdog of 180 seconds.
- Stream JSON exposes `system/api_retry` records with attempt, retry delay, and error category. Any JSONL record/mtime advance is a useful liveness signal, but stdout silence alone is not proof of a dead process during extended reasoning.

Recommended relay policy (inference): preserve the current 45-minute configurable relay timeout, monitor JSONL mtime and process state, and do not use the current generic seven-minute minimum for Claude. Seven minutes can preempt Claude's documented ten-minute per-request timeout. Use a Claude-target minimum above ten minutes (for example 12) unless the invocation explicitly lowers `API_TIMEOUT_MS`. On timeout, send SIGINT/terminate gracefully, persist the session ID already seen in `system/init`, and attempt one explicit resume; fall back to a fresh self-contained fix prompt if resume fails.

Official reference: [Claude Code environment variables](https://code.claude.com/docs/en/env-vars).

### Auth/readiness probing (facts and recommendation)

Use this read-only sequence and never print the complete auth JSON because it includes email and organization identifiers:

1. `command -v claude` — missing CLI.
2. `claude --version` — broken install if nonzero; persist the version for diagnostics.
3. `claude auth status --json` — official behavior is exit 0 when logged in and 1 when logged out; parse only `.loggedIn`, `.authMethod`, `.apiProvider`, and optionally `.subscriptionType`.

`claude doctor` checks installation/configuration health but is not an inference-readiness probe. `auth status` proves local authentication state, not model entitlement, quota, network reachability, or a healthy API. The actual leg should therefore classify authentication/model/quota failures from stderr/final result. A separate low-cost model call would be a stronger readiness test but adds latency/cost and can race with later quota state; it is not necessary at `/status` time.

Official reference: [CLI auth commands](https://code.claude.com/docs/en/cli-usage#cli-commands).

### MCP availability (facts and inference)

- Claude can consume MCP servers via `--mcp-config`; the CLI supports stdio, HTTP, and legacy SSE configuration, with WebSocket available through JSON configuration. `--strict-mcp-config` ignores ambient MCP configurations. For a deterministic unattended relay, pass strict MCP config with only explicitly needed servers (or none), and use `--no-chrome` to avoid desktop integration.
- `claude mcp serve` exposes Claude Code's **tools** over stdio to an MCP client, and the official documentation says the client is responsible for confirmations. It is not documented as a “send an implementation prompt to a Claude agent and receive a resumable session” tool equivalent to `codex mcp-server`'s agent calls.
- Therefore `relay_transport: auto` should resolve target `claude` to CLI exec/JSONL only for now. Do not claim symmetric MCP support. A future Agent SDK integration is a separate transport option, not the current MCP server.

Official reference: [Claude Code MCP](https://code.claude.com/docs/en/mcp#use-claude-code-as-an-mcp-server).

### Safe exec template (recommended inference)

Spawn directly (no shell interpolation), set `cwd` to the relay branch/worktree, write the brief to stdin, then close stdin:

```text
claude -p
  --verbose
  --output-format stream-json
  --include-partial-messages
  --permission-mode dontAsk
  --tools Bash,Read,Edit,Write,Glob,Grep
  --strict-mcp-config
  --no-chrome
  --max-turns <configured>
  --max-budget-usd <configured>
  --settings <merged strict-sandbox + scoped permission JSON>
```

For a fix round, use the same arguments and `cwd`, add `--resume <session-id>`, write the self-contained fix prompt to stdin, and close stdin. Preserve stdout as JSONL and stderr separately. Persist the session ID as soon as `system/init` arrives, then validate the final `result` subtype and process exit code.

## Blockers

- No documented Claude agent MCP transport equivalent to the current Codex MCP relay; reverse relay must use exec/JSONL (or later add the Agent SDK).
- Forced-interruption resume semantics need an integration test before promising the same recovery guarantee as `codex exec resume`.
- Strict sandbox network allowlists and file-tool permission rules need a project-neutral default plus documented opt-ins for repositories whose builds require package registries, Docker, simulators, or external services.
- Claude has no direct `--ignore-user-config` equivalent that both preserves Claude.ai OAuth and project CLAUDE.md. `--strict-mcp-config`, `--no-chrome`, selected setting sources, and/or an explicit safe-mode policy must be chosen deliberately.

## Next Phase Inputs

- Implement target-Claude relay with exec/JSONL only; keep the transport name/provider separate so `relay_transport: mcp` is rejected or falls back for Claude rather than silently misrepresented.
- Add `CLAUDE_DETECT` using the three-step probe above. Explicit Claude requests stop with remediation on any failed prerequisite; automatic/configured requests may fall back to native Phase 2A.
- Persist target, CLI version, `session_id`, exact `cwd`, PID, log/error paths, result subtype, round, and last-output timestamp in relay state.
- Use the safe exec template, explicit session resume, strict sandbox settings, no ambient MCP, and separate stdout/stderr logs.
- Add integration tests for JSONL init/session capture, success/error result parsing, same-cwd resume, different-cwd resume rejection, auth-status redaction, stdin prompt delivery, timeout handling, and forced-interruption recovery/fallback.
- Make Claude's idle-time minimum target-specific (>10 minutes with the default API timeout); do not blindly reuse the Codex seven-minute lower bound.
