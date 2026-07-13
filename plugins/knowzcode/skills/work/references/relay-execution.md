# Cross-Agent Relay Execution - Codex Host

This reference is the operational protocol for a KnowzCode relay whose fixed
host is Codex. Codex owns planning, specifications, review, user gates,
checkpoints, and finalization. The resolved external target owns Phase 2A and
bounded review-fix rounds.

The only supported target from this package is Claude through the Claude Code
CLI exec/JSONL transport. Do not claim a Claude MCP agent transport and do not
simulate Claude Agent Teams.

## 1. Fixed Host and Resolution Contract

Set `RELAY_HOST=codex` once. Resolve `RELAY_TARGET` exactly once using:

1. Explicit flag: `--relay=none|auto|other|claude|codex`.
2. Unambiguous natural-language delegation intent.
3. Non-`none` project configuration: `relay: none|auto|other|claude|codex`.
4. `/knowzcode:relay` entry-point default: `other`.
5. No relay.

For this host, `auto` and `other` resolve to `claude`. `none` disables relay.
A provider name activates natural-language routing only when the user assigns
it implementation/coding work. Ambiguous role assignments stop for
clarification.

An explicit target equal to the host (`codex`) is an error and is never
reversed. A stale `relay: codex` project setting encountered by ordinary
`/knowzcode:work` produces a warning and falls back to native Phase 2A.

Track `RELAY_INTENT_SOURCE` as `flag`, `natural-language`, `config`, or
`entrypoint`. This controls failure behavior:

- Explicitly named target (`flag` or named natural language) unavailable: stop
  with remediation.
- Automatically/configured target unavailable: emit `[RELAY-FALLBACK]` and use
  native Phase 2A.
- Authentication failure from any source: stop, including autonomous mode.

## 2. Preconditions and Isolation

Relay remains a full/Tier-3 workflow. Before the first target leg:

1. Complete and approve Phase 1A and Phase 1B.
2. Create the normal pre-implementation checkpoint.
3. Require a clean baseline. Do not hide or discard user changes.
4. Use the dedicated `kc-relay/{wgid}` branch when branch creation is safe.
5. Create `knowzcode/workgroups/{wgid}-relay/` and write state before launching
   an external action.
6. Record the exact repository/worktree path. Every Claude initial and resume
   process must use this same path as its process `cwd`.

If the workflow is Micro or Light, announce `[RELAY-SKIP]` and use the native
workflow unless the user explicitly asks to expand it to Full.

## 3. State Schema

New relay state uses schema 2 in
`knowzcode/workgroups/{wgid}-relay/state.md`:

```text
Schema: 2
WorkGroup: {wgid}
Host: codex
Target: claude
State: INIT|PLANNED|TARGET_IMPLEMENTING|TARGET_FAILED|TARGET_DONE|REVIEWING|FIX_ROUND|HOST_TAKEOVER|FINALIZING|DONE|ABORTED
Round: {0..N}
Session ID: {claude session_id or pending}
Manual Attach: {claude --resume command or pending}
Target Version: {version or unknown}
Working Directory: {absolute relay worktree path}
PID: {pid or none}
Log: {relay_dir}/claude-log-r{N}.jsonl
Last Message: {relay_dir}/claude-last-r{N}.md
Error Log: {relay_dir}/claude-err-r{N}.log
Exit Marker: {relay_dir}/exit-r{N}
Last Output At: {ISO timestamp}
Checkpoint: {commit or none}
```

Write the next state before triggering its action. Artifacts are target
qualified: `{target}-log-rN.jsonl`, `{target}-last-rN.md`,
`{target}-err-rN.log`, plus `exit-rN`.

`Manual Attach` is human convenience only — never a monitoring, liveness, or
programmatic-resume channel. Once the session ID is captured, record
`claude --resume {SESSION_ID}` (run from the recorded working directory) so a
human can take over interactively, and echo it once in status output. Claude
deeplinks (`claude-cli://open`) only create new sessions; never present one as
attach or resume. Present the attach command as a post-leg affordance
(`TARGET_DONE`, `TARGET_FAILED`, `HOST_TAKEOVER`) so an interactive client
does not contend with the live headless process.

### Legacy Schema-1 Mapping

Continuation must recognize old state without rewriting it until a successful
transition:

| Legacy field/state | Schema-2 interpretation |
|---|---|
| `Mode: codex` | `Host: claude`, `Target: codex` |
| `CODEX_IMPLEMENTING` | `TARGET_IMPLEMENTING` |
| `CODEX_FAILED` | `TARGET_FAILED` |
| `CODEX_DONE` | `TARGET_DONE` |
| `CLAUDE_REVIEWING` | `REVIEWING` |
| `FIX_ROUND` | `FIX_ROUND` |
| `CLAUDE_TAKEOVER` | `HOST_TAKEOVER` |

`INIT`, `PLANNED`, `REVIEWING`, `FINALIZING`, `DONE`, and `ABORTED` keep the
same role-neutral names.

Legacy `Thread ID` becomes `Session ID`; tolerate `Codex Thread ID` if an
intermediate build emitted that label. Legacy `codex-*` artifacts remain valid
for the mapped Codex target.

## 4. CLAUDE_DETECT

Run this read-only sequence without printing sensitive auth JSON:

1. `command -v claude` - missing means `not-installed`.
2. `claude --version` - nonzero/spawn failure means `broken-install`; otherwise
   capture the version.
3. `claude auth status --json` - parse only `loggedIn`, `authMethod`,
   `apiProvider`, and optionally `subscriptionType`. `loggedIn: false` or a
   nonzero exit means `installed-unauthed`.

`ready` means the executable, version probe, and authentication probe passed.
It does not prove model entitlement, quota, or network health; classify those
from the actual leg's final `result` and stderr.

Never log email, organization identifiers, tokens, or the complete auth JSON.
Re-run `CLAUDE_DETECT` immediately before every initial or resumed target leg.

## 5. Claude Adapter Configuration

Resolve target settings in this order:

- Invocation `--relay-model=` / `--relay-effort=`.
- Claude-specific project keys (`relay_claude_model`,
  `relay_claude_effort`, `relay_claude_fix_effort`, and
  `relay_claude_permission_mode`).
- Documented safe defaults. Do not feed Codex defaults such as
  `gpt-5.6-sol`, `xhigh`, or `workspace-write` to Claude.

`relay_transport: auto|exec` resolves to `exec` for Claude. A configured `mcp`
transport is unsupported for a Claude target; stop with a configuration
message rather than pretending `claude mcp serve` is an implementation agent.

The permission mode must be `dontAsk` for non-interactive execution. Reject
`bypassPermissions` and `--dangerously-skip-permissions`. The relay never
defaults to bypassing permission checks.

## 6. Safe Claude Exec Contract

Spawn Claude directly as an argument vector, not through interpolated shell
text. Set the child process `cwd` to the recorded relay worktree. Send the
self-contained brief on stdin once, then close stdin; do not redirect stdin
from `/dev/null`.

The initial argv contract is:

```text
claude -p
  --verbose
  --output-format stream-json
  --include-partial-messages
  --permission-mode dontAsk
  --tools Bash,Read,Edit,Write,Glob,Grep
  --allowedTools "Bash Edit(./**) Write(./**)"
  --strict-mcp-config
  --no-chrome
  --effort <resolved effort>
  --settings <relay-safe-settings.json>
```

Only add `--model` when a Claude model is explicitly resolved. Optional
`--max-turns` and `--max-budget-usd` bounds may be supplied from configuration.
Do not use `--bare`, `--safe-mode`, `--add-dir`, or
`--no-session-persistence` by default.

Generate `relay-safe-settings.json` inside the relay directory with:

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false
  }
}
```

The allowlist must scope built-in file edits to the relay worktree. Bash may be
approved only while the strict sandbox above is active. Network-dependent
builds require explicit configured domains; they must not silently escape the
sandbox.

The implementation brief must include:

- WorkGroup and approved spec paths.
- Exact acceptance criteria and owned files.
- TDD Red-Green-Refactor requirement.
- Test/static-analysis/build commands known to the project.
- A prohibition on commits, branch changes, spec rewrites, and unrelated edits.
- A request for a concise final summary; disk changes are the source of truth.

## 7. JSONL, Liveness, and Completion

Write stdout to `claude-log-rN.jsonl` and stderr separately to
`claude-err-rN.log`. Capture the session identity immediately from the first
`system/init` record's `session_id`; persist it before waiting for completion.

The final record must satisfy all of:

```text
type == "result"
subtype == "success"
is_error == false
session_id is nonempty
```

Extract the final `result` text into `claude-last-rN.md`. A zero process exit
without a successful final result is not success.

Poll inside the active Codex turn using bounded terminal polls. Never end a turn
expecting a background completion notification. Treat any JSONL record, mtime
advance, `system/api_retry`, assistant event, or stream event as liveness. Keep
the user updated during long legs.

The default stall timeout remains configurable, but Claude's effective minimum
must exceed its default ten-minute API request timeout (use at least 12 minutes
unless `API_TIMEOUT_MS` is deliberately lowered). On timeout, interrupt
gracefully, preserve state and logs, and treat mid-turn resume as best effort.

## 8. Resume and Fix Rounds

For a review-fix round, use the same executable contract and exact same `cwd`,
add:

```text
--resume <persisted session_id>
```

Send a self-contained fix prompt on stdin and close stdin. The prompt includes
the checkpoint diff, ordered review findings, acceptance criteria, required
verification, and the same no-commit/no-unrelated-edit constraints.

Before launching, write `State: FIX_ROUND` and the round artifacts. Validate a
new final result exactly as for the initial leg. Resume after a force-killed
mid-turn is not guaranteed; if it fails, preserve evidence and either use one
fresh self-contained fix leg or transition to `HOST_TAKEOVER` according to the
configured retry budget.

## 9. Workflow State Machine

```text
INIT
  -> PLANNED
  -> TARGET_IMPLEMENTING
  -> TARGET_DONE | TARGET_FAILED
  -> REVIEWING
  -> FIX_ROUND (bounded, repeats review)
  -> HOST_TAKEOVER (when gaps remain after the cap)
  -> FINALIZING
  -> DONE
```

After a successful target leg, Codex verifies the worktree and creates a host-
owned checkpoint; Claude never commits. Codex performs Phase 2B read-only review
against the approved specs. Gaps go to a resumed Claude fix round up to
`relay_max_fix_rounds`. Remaining gaps then transition to `HOST_TAKEOVER`, where
Codex applies normal native fix/audit rules. Authentication or safety failures
pause instead of triggering takeover.

## 10. Failure Handling

| Failure | Required action |
|---|---|
| Missing/broken Claude, explicit target | Stop with install remediation |
| Missing/broken Claude, automatic/configured target | `[RELAY-FALLBACK]` to native Phase 2A |
| Claude unauthenticated | Always stop with authentication remediation |
| Unsupported Claude MCP transport | Stop and request `auto` or `exec` |
| Unsafe permission/bypass setting | Stop; never weaken safety automatically |
| Model/quota error | Stop with the final result/stderr classification |
| Target exits without success result | Persist `TARGET_FAILED`; attempt only the bounded recovery path |
| Timeout | Graceful interrupt, persist evidence, best-effort resume |
| Dirty/unexpected files | Stop before checkpoint; do not discard user work |

Every fallback or takeover is visible in the WorkGroup. Never silently replace
an explicitly requested external target with native execution.

## 11. Continuation

`/knowzcode:continue` reads state before generic phase inference. It maps schema
1 when needed, restores the recorded target, worktree, session ID, round,
artifacts, and resolved settings, reconciles process/log evidence, and resumes
through this target adapter. It must not re-resolve the target from current
prose or changed configuration.
