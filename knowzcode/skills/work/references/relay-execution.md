# Claude↔Codex Relay — Execution Reference

**Purpose:** Single source of truth for the `--relay=codex` execution path. Read by `/knowzcode:work` (Step 1.6 + Tier 3 Relay Execution), `/knowzcode:relay` (setup entry point), `/knowzcode:init` (detection + optional enable), `/knowzcode:status` (health line), and `/knowzcode:continue` (relay resume).

**What the relay does:** Claude plans (Phase 1A/1B — Fable under `frontier`), the **OpenAI Codex CLI** completes the plan and fully implements it headlessly, Claude reviews the diff (Phase 2B — Gate #3 as usual), Codex fixes findings in a **resumed session**, and after the fix-round cap Claude takes over remaining fixes itself and finalizes per Phase 3. The relay replaces only Phase 2A + the builder gap loop; every other phase, gate, and agent is unchanged.

The relay is a **Claude Code capability** (Claude drives the Codex CLI as a subprocess). It has no Codex- or Gemini-side equivalent.

---

## RELAY_DETECT — shared detection procedure

Read-only, never blocks, safe to run anywhere. Used by `/knowzcode:init`, `/knowzcode:relay`, `/knowzcode:status`, and the relay Preflight (below). **Run it live once at relay preflight — immediately before the leg's branch setup, after the tier is known — and never trust a cached or persisted detection result for execution (auth expires).** `/knowzcode:work` Step 1.6 runs only the cheap `command -v codex` existence check up front; the full probe belongs at the execution point so Tier 2 runs never pay for it and `/knowzcode:relay` redirects don't double-probe.

```
RELAY_DETECT():
  1. command -v codex           → miss → RESULT = not-installed
  2. codex --version            → exit 0 → capture version string (e.g. "codex-cli 0.144.1")
                                → exit ≠0 / spawn error → RESULT = broken-install
                                  (real case: the npm wrapper exists but the platform
                                   binary is missing — ENOENT from the wrapper)
  3. codex login status         → exit 0 → RESULT = ready (v{X.Y.Z}, authed)
                                → exit ≠0 → RESULT = installed-unauthed
```

Always announce the outcome as one line: `[RELAY-DETECT] ready (codex-cli 0.144.1, authed)` / `[RELAY-DETECT] installed-unauthed — run: codex login` / `[RELAY-DETECT] not-installed` / `[RELAY-DETECT] broken-install — reinstall @openai/codex`.

Remediation text (used by `/knowzcode:relay` and any pause):
- not-installed → `Install the Codex CLI: npm i -g @openai/codex (or: brew install codex), then run: codex login`
- broken-install → `The codex command exists but cannot run (missing platform binary). Reinstall: npm i -g @openai/codex --force (or: brew reinstall codex)`
- installed-unauthed → `Authenticate the Codex CLI: codex login (ChatGPT sign-in) or set CODEX_API_KEY`

`broken-install` behaves like `not-installed` everywhere (workflow falls back to standard Phase 2A; no enable question at init) — only the remediation text differs.

---

## Configuration & Precedence

Per-invocation flags win over `knowzcode/knowzcode_orchestration.md` keys, which win over defaults (same pattern as every other orchestration setting).

| Setting | Flag | Config key | Default | Values |
|---------|------|------------|---------|--------|
| relay | `--relay=codex` | `relay:` | `none` | `none`, `codex` |
| transport | — | `relay_transport:` | `auto` | `auto`, `mcp`, `exec` (see Transports below) |
| model | `--relay-model=` | `relay_model:` | `gpt-5.6-sol` | any Codex CLI model id |
| effort (round 0) | `--relay-effort=` | `relay_effort:` | `xhigh` | `low`, `medium`, `high`, `xhigh`, `max` (`max` is bleeding-edge, GPT-5.6-era) |
| effort (fix rounds) | — | `relay_fix_effort:` | `high` | same values — fix rounds are small scoped patches; `high` converges faster |
| sandbox | — | `relay_sandbox:` | `workspace-write` | `workspace-write`, `danger-full-access` |
| fix rounds | `--relay-max-fix-rounds=` | `relay_max_fix_rounds:` | `2` | 1–3 (clamp out-of-range) |
| timeout | — | `relay_timeout_minutes:` | `45` | minutes without new output before the leg is stalled — applies to every leg (never set below 7: Codex has an internal ~300s watchdog that self-recovers; killing earlier aborts legs that would have finished) |

**Sandbox rationale:** `workspace-write` lets Codex edit files and run tests while confining writes to the repo; combined with the mandatory `-a never` (headless — no interactive approvals exist) and branch isolation below, this is the safe default. `danger-full-access` is opt-in via `relay_sandbox:` only, for test suites that genuinely need network/system access — never make it a flag default. `read-only` is never valid (it defeats the implementation leg).

## Transports — how the Codex leg is actually executed

**THE ONE IRON RULE (learned from a real production stall): the orchestrating agent must NEVER end its turn to "wait for a completion notification" from a background Codex process.** Background/async completion signals in Claude Code are known to be dropped or mis-routed (anthropics/claude-code issues #6854, #21191, #9905) — an agent that ends its turn hoping to be re-woken can sit idle indefinitely. Both transports below are designed so the wait happens *inside* an active turn.

`relay_transport: auto` resolves per run: use `mcp` when a `codex` MCP server is registered and its tools are callable; otherwise `exec`.

### Transport `mcp` — synchronous tool call (preferred when registered)

Codex ships an MCP server (`codex mcp-server`, stdio). A Codex leg becomes ONE blocking MCP tool call inside the turn — the stall class is eliminated by construction.

One-time registration (user action, documented by `/knowzcode:relay`):

```bash
claude mcp add --transport stdio --scope user codex -- codex mcp-server
```

or in `.mcp.json` — the per-server `timeout` (ms) must cover the longest leg:

```json
{ "mcpServers": { "codex": { "command": "codex", "args": ["mcp-server"], "timeout": 2700000 } } }
```

Also set `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0` (env) — Claude Code aborts stdio MCP calls that stay silent for 30 min by default, and it is UNCONFIRMED whether Codex's `codex/event` notifications reset that idle timer. Verify one long leg empirically before relying on this transport for 30+ minute runs.

- **Round 0:** call the `codex` tool with `prompt` (the brief), `cwd` (repo root), `sandbox` (`{RELAY_SANDBOX}`), `approval-policy: "never"`, and `config` overrides `{model: {RELAY_MODEL}, model_reasoning_effort: {RELAY_EFFORT}}`. Capture the thread id from **`structuredContent.threadId`** in the tool result (present on codex ≥ 0.50) and persist it exactly like the exec path's thread_id.
- **Fix rounds:** call `codex-reply` with `threadId` + the fix prompt.
- Requires codex CLI ≥ 0.50 for the threadId return; on older builds fall back to `exec`.
- Caveats: stdio MCP spawns one process per connection (avoid concurrent relay legs on this transport), and rollout files still land in `$CODEX_HOME/sessions/` so `codex exec resume` remains available as a recovery path if the MCP call is severed.

### Transport `exec` — subprocess with agent-driven in-turn polling (universal fallback)

The pattern the official OpenAI Claude Code plugin itself uses: detached process + exit-marker file + the agent polling **within its own active turn** (never ending the turn to wait).

1. Launch the leg with the wrapper writing an exit marker (see command templates below — note the trailing `; echo $? > exit-r{N}`), as a background Bash task.
2. The runner then stays in-turn and polls with successive bounded foreground Bash calls (each well under the 600s Bash cap), e.g. `for i in $(seq 1 8); do test -f exit-r{N} && break; sleep 60; done; test -f exit-r{N} && cat exit-r{N}; stat -f %m codex-log-r{N}.jsonl 2>/dev/null || stat -c %Y codex-log-r{N}.jsonl` — when the marker isn't there yet, it immediately issues the NEXT poll call. The turn stays alive for the whole leg; there is no wake-up to miss. (The authoritative copy of this loop lives in `agents/relay-runner.md` — if the two ever differ, the agent file wins.)
3. Liveness = the JSONL (or `$CODEX_HOME/sessions/` rollout) mtime advancing. Static for `relay_timeout_minutes` → stalled: kill with **SIGINT** (`kill -INT` / `timeout --signal=SIGINT`) so Codex flushes its rollout file cleanly, keeping `codex exec resume` viable.

---

## Headless Hygiene (exec transport — all mandatory)

- **`</dev/null` on every invocation.** `codex exec` blocks on stdin when it is an open non-TTY pipe (confirmed upstream: openai/codex #20919, #27019). Every headless call must redirect stdin from /dev/null. Note (verified on 0.144.1): Codex still *prints* the informational line "Reading additional input from stdin…" to stderr even with the redirect — the guard prevents the HANG, not the log line. Health checks must key on completion (exit marker / exit code), never on the presence of that string.
- **`--ignore-user-config` on relay legs.** Skips `$CODEX_HOME/config.toml` (auth is unaffected — it lives in `auth.json`). This stops the user's personal MCP servers from loading mid-leg (observed: HTTP 504 retries against an unreachable MCP server) and prevents desktop integrations (e.g. Computer Use) from firing macOS TCC/AppleScript permission prompts during an unattended run. The relay re-supplies everything it needs via flags/`-c` overrides, so nothing is lost. (`-c 'mcp_servers={}'` is a silent no-op upstream — do not rely on it.)
- **macOS note:** if an unexpected OS permission dialog (AppleScript / Screen Recording / "Codex Computer Use") appears during a relay leg, deny it — no relay leg legitimately needs OS automation, and `--ignore-user-config` should prevent the prompt in the first place.

**Conflicts (validated in `/knowzcode:work` Step 1.6):**
- `--relay` + `--profile=advisor` → halt (advisor exists to route the builder to Sonnet; relay removes the builder).
- `--fable-execution` / `execute_on_fable: true` → announce `execute_on_fable ignored for the implementation leg — Codex executes`.
- Parallel Teams `max_builders` → announce `max_builders ignored under relay — Codex is a single process`.
- Tier 2 Light → relay not supported; announce and run the normal Light flow.

---

## Relay Artifacts

All relay state lives in `knowzcode/workgroups/{wgid}-relay/` (git-ignored via the existing `workgroups/` ignore):

| File | Written by | Purpose |
|------|-----------|---------|
| `state.md` | lead | Authoritative state machine — single source of truth |
| `brief-r0.md` | lead | Claude → Codex implementation brief (round 0 prompt) |
| `feedback-r{N}.md` | lead (from reviewer Gate #3 output) | Structured review findings for fix round N (N ≥ 1) |
| `fix-prompt-r{N}.md` | lead | Exact prompt sent on the round-N resume (self-contained) |
| `codex-last-r{N}.md` | codex (`-o`) | Codex's final message for round N |
| `codex-log-r{N}.jsonl` | codex (stdout) | Full JSONL event stream |
| `codex-err-r{N}.log` | codex (stderr) | Diagnostics on failure |

The WorkGroup file additionally gets a `## Relay` snapshot section (see below) so `/knowzcode:continue` detects an in-flight relay without scanning directories.

### `state.md` schema

```markdown
# Relay State: {wgid}

**Mode:** codex
**State:** {INIT|PLANNED|CODEX_IMPLEMENTING|CODEX_FAILED|CODEX_DONE|REVIEWING|FIX_ROUND|CLAUDE_TAKEOVER|FINALIZING|DONE|ABORTED}
**Round:** {0..cap}
**Max Fix Rounds:** {2}
**Thread ID:** {codex thread_id | pending}
**Model:** {gpt-5.6-sol}
**Effort:** {xhigh}
**Sandbox:** {workspace-write}
**Branch:** kc-relay/{wgid}
**Updated:** {ISO timestamp}

## Checkpoints
| Label | SHA | Meaning |
|-------|-----|---------|
| C0 | {sha} | Specs approved — pre-relay baseline |
| C1 | {sha} | Codex round 0 implementation |

## Round Log
| Round | Leg | Started | Ended | Exit | Result |
|-------|-----|---------|-------|------|--------|
| 0 | codex-implement | {ts} | {ts} | 0 | {summary} |
| 1 | claude-review | {ts} | {ts} | — | {gaps found} |
```

**Update discipline:** rewrite `state.md` (State, Round, Updated, Round Log row) **before** performing the action the transition triggers, so a context clear at any moment resumes correctly.

### WorkGroup `## Relay` section

```markdown
## Relay

**Mode:** codex | **State:** {state} | **Round:** {n} | **Thread:** {thread_id|pending}
**State File:** knowzcode/workgroups/{wgid}-relay/state.md
```

Update the snapshot whenever `state.md` changes State, Round, or Thread ID.

### `brief-r0.md` schema (Claude → Codex)

Generated by the lead from the Gate #1 Change Set and Gate #2 specs. Reference spec *paths* — Codex has repo access and reads them itself (see the Specifications section rule below); it must implement, not re-derive.

```markdown
# KnowzCode Relay Brief — {wgid} (round 0)

## Mission
You are the implementation engineer. A plan and per-change specifications were
prepared and approved. First refine/complete the implementation plan where the
specs leave room (record refinements in your final message), then FULLY
implement it.

## Goal
{primary goal, one paragraph}

## Change Set
{NodeIDs + descriptions + dependency order, from the WorkGroup file}

## Specifications
{for each NodeID: the path knowzcode/specs/{NodeID}.md and a one-line summary.
 Do NOT inline full spec bodies — Codex runs with repo access and MUST read each
 listed spec file itself. State explicitly: "Read every spec file listed above;
 the VERIFY criteria in them are your acceptance bar." Inline a spec body only
 when the file does not exist on disk (then flag it as [SPEC_ISSUE] input).}

## Constraints
- TDD: write or extend tests; every VERIFY criterion must have a passing test.
- Test command(s): {project test commands}
- Do NOT run `git commit`, `git push`, or switch branches — leave all changes in the working tree.
- Do NOT modify files under `knowzcode/` — report spec problems in Spec Issues instead.
- Stay within this repository.

## Output Contract (your final message MUST contain these sections)
### Files Changed
{path — one-line what/why, per file}
### Tests
{added/modified tests, command(s) run, pass/fail counts}
### Plan Refinements
{deviations from or completions of the specs and why, or "None"}
### Spec Issues
{[SPEC_ISSUE] items for the reviewer, or "None"}
### Remaining Work
{"None" if complete}
```

The Output Contract mirrors the Phase 2B reviewer's inputs and the existing `[SPEC_ISSUE]` convention (`agents/reviewer.md`).

### `feedback-r{N}.md` schema (Claude review → Codex)

Serialize the reviewer's Gate #3 output using the reviewer's Structured Gap Report table verbatim:

```markdown
# Relay Review — {wgid}, round {N}

**ARC Completion:** {X}%   **Security:** {status}   **Verdict:** FIX_ROUND | ACCEPT | TAKEOVER

## Gaps ({count})
| # | NodeID | File:Line | VERIFY Criterion | Expected | Actual | Severity |
|---|--------|-----------|------------------|----------|--------|----------|

## Required Actions
1. {one imperative instruction per gap, referencing the table row}

## Reply Contract
For each numbered action: state what you changed (file:line) and which test
proves it. Do not commit. Do not refactor beyond the listed actions.
```

### `fix-prompt-r{N}.md` rule — self-contained

The fix prompt = a short resume preamble (goal, branch, spec paths, "you previously implemented this — the review found gaps") + the full `feedback-r{N}.md` content. **Write it so it works verbatim in a FRESH Codex session** (restate goal/branch/spec paths, don't say "as discussed"): if the resume id is gone, the same file launches a new session without edits.

---

## Preflight (before touching the tree)

Run in order when `RELAY_ACTIVE` (this is where the full live detection happens — Step 1.6 only checked existence):

1. **RELAY_DETECT** — `not-installed` / `broken-install` → fallback per matrix; `installed-unauthed` → pause per matrix (even in autonomous mode).
2. **Branch isolation** — refuse to run the Codex leg on the default branch. Create `kc-relay/{wgid}` from current HEAD (or offer to reuse the current non-default feature branch).
3. **Clean tree** — working tree must be clean before round 0 (the Gate #2 pre-implementation commit covers `knowzcode/`; commit or stash anything else). Record HEAD as checkpoint **C0** in `state.md`.

---

## Codex Invocation

### Round 0 (initial implementation leg)

```bash
cd {repo_root} && codex -a never exec \
  -C "{repo_root}" --skip-git-repo-check --ignore-user-config \
  -s {RELAY_SANDBOX} \
  -m {RELAY_MODEL} \
  -c model_reasoning_effort="{RELAY_EFFORT}" \
  --json \
  -o "knowzcode/workgroups/{wgid}-relay/codex-last-r0.md" \
  "$(cat knowzcode/workgroups/{wgid}-relay/brief-r0.md)" \
  < /dev/null \
  > "knowzcode/workgroups/{wgid}-relay/codex-log-r0.jsonl" \
  2> "knowzcode/workgroups/{wgid}-relay/codex-err-r0.log"; \
  echo $? > "knowzcode/workgroups/{wgid}-relay/exit-r0"
```

- `-a never` is the **global** approval flag and must precede `exec` (headless runs cannot answer approval prompts).
- `--json` streams JSONL events to stdout (redirected to the log); `-o` writes only the final agent message to the file — both are used.
- `< /dev/null`, `--ignore-user-config`, and the `exit-r{N}` marker are mandatory — see Headless Hygiene and the exec transport protocol above.
- Exit codes: `0` success, `1` runtime/auth failure, `2` argument-parse error.

### Thread-id capture (immediately after launch — do not wait for completion)

The session id is the `thread_id` of the **first** JSONL event:

```bash
jq -r 'select(.type=="thread.started").thread_id' \
  "knowzcode/workgroups/{wgid}-relay/codex-log-r0.jsonl" | head -1
```

Persist it to `state.md` **and** the WorkGroup `## Relay` section as soon as it appears — a crash must never lose the resume handle. Fallback derivation: newest `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*-{id}.jsonl` (`CODEX_HOME` defaults to `~/.codex`).

### Rounds 1..N (resumed fix legs)

**`exec resume` accepts a NARROWER flag set than `exec`** (verified on codex-cli 0.144.1): no `-C/--cd`, no `-s/--sandbox`, no `-a`. Run it from the repo root (the `cd` supplies the cwd) and pass sandbox/approval as `-c` config overrides — a resume invocation using `-C` or `-s` fails with an argument-parse error (exit 2).

```bash
cd {repo_root} && codex exec resume {THREAD_ID} \
  --skip-git-repo-check --ignore-user-config \
  -m {RELAY_MODEL} \
  -c model_reasoning_effort="{RELAY_FIX_EFFORT}" \
  -c sandbox_mode="{RELAY_SANDBOX}" \
  -c approval_policy="never" \
  --json \
  -o "knowzcode/workgroups/{wgid}-relay/codex-last-r{N}.md" \
  "$(cat knowzcode/workgroups/{wgid}-relay/fix-prompt-r{N}.md)" \
  < /dev/null \
  > "knowzcode/workgroups/{wgid}-relay/codex-log-r{N}.jsonl" \
  2> "knowzcode/workgroups/{wgid}-relay/codex-err-r{N}.log"; \
  echo $? > "knowzcode/workgroups/{wgid}-relay/exit-r{N}"
```

Re-specify model/effort/sandbox/approval on every resume — resume does not reliably re-inherit overrides from the original session.

### Final-message extraction

Prefer the `-o` file. Fallback from the JSONL: `jq -r 'select(.item.type=="agent_message").item.text' codex-log-r{N}.jsonl | tail -1`.

---

## Non-Blocking Execution — relay-runner

The Codex leg runs for many minutes — too long for one foreground Bash call (600s hard cap), and background-notification waiting is forbidden (see THE ONE IRON RULE). Delegate to the **relay-runner** agent (`agents/relay-runner.md`, fixed `model: sonnet` — outside `MODEL_FOR`, like knowledge-liaison):

- **Parallel/Sequential Teams:** spawn relay-runner as a teammate — the lead stays in delegate mode (lead NEVER writes code or runs the leg itself).
- **Subagent Delegation:** dispatch relay-runner via `Task()`.
- **Degraded fallback:** if neither is available, the lead runs the leg itself using the same in-turn protocol.

Relay-runner protocol (full contract in `agents/relay-runner.md`):
1. **MCP transport:** make the single blocking `codex` / `codex-reply` tool call; capture `structuredContent.threadId`; done — no polling needed.
2. **Exec transport:** launch the wrapper (with `exit-r{N}` marker) as a background Bash task, then **remain in-turn**: extract and report the `thread_id` in the first poll, then issue successive bounded poll calls (each a foreground Bash of ~5–8 min of `test -f exit-r{N} || sleep` chunks) until the marker exists. NEVER end the turn while the marker is absent. The lead's spawn prompt supplies the launch `COMMAND` verbatim and — when the automatic retry is allowed — a ready-built `RESUME_COMMAND` (from the Rounds 1..N template, with a `{THREAD_ID}` placeholder); the runner composes no codex commands itself.
3. Report progress only on meaningful transitions in the JSONL — first `file_change`, first test execution, `turn.completed` — not on a timer.
4. Stall policy: JSONL/rollout mtime static for `relay_timeout_minutes` (≥7) → `kill -INT` the process (SIGINT lets Codex flush its rollout so `exec resume` stays viable), report `timeout`.
5. On exit report `{exit code (from the marker file), last-message path, elapsed, stderr tail if nonzero}`.

---

## Review Loop Protocol

1. **Checkpoint commit (lead):** after a Codex leg exits 0, the lead commits everything as `KnowzCode relay: Codex round {N} for {wgid}` → checkpoint C{N+1}. Codex is instructed never to commit, so each leg's diff is exactly `git diff C{N}..C{N+1}` — attribution is unambiguous and the review scope is precise.
2. **Phase 2B unchanged:** the reviewer (on `MODEL_FOR(reviewer, PROFILE)` — Fable under frontier) audits that diff against the specs; Gate #3 is presented exactly as today.
3. **Gaps + round < cap:** lead writes `feedback-r{N}.md` + `fix-prompt-r{N}.md`, transitions to FIX_ROUND, launches the resume leg.
4. **Gaps + round ≥ cap, or the same gap survives two consecutive rounds:** transition to **CLAUDE_TAKEOVER** — remaining gaps flow into the normal builder gap loop (existing 3-iteration cap and autonomous-pause rules apply). Takeover is the *designed* final leg ("Claude does the final review and final fixes"), not an error path.
5. **Clean:** FINALIZING — Phase 3 closer runs unchanged (as-built specs, tracker, log, architecture, learning capture, final commit).

**Autonomous mode:** rounds auto-proceed; all existing Gate #3 safety exceptions (HIGH/CRITICAL security, `[COMPLIANCE-BLOCK]`, ARC < 50%) still pause — unchanged from `references/quality-gates.md`. Auth failures also pause even in autonomous mode (see matrix).

---

## State Machine

```
INIT ── preflight ok, Gate #2 approved, C0 committed, brief written ──▶ PLANNED
PLANNED ── background launch ──▶ CODEX_IMPLEMENTING     (thread_id persisted on first event)
CODEX_IMPLEMENTING ── exit 0 ──▶ CODEX_DONE             (lead commits C{N+1})
CODEX_IMPLEMENTING ── exit ≠0 / timeout ──▶ CODEX_FAILED
CODEX_FAILED ── resume once ──▶ CODEX_IMPLEMENTING      (same round: resume {id} "Continue exactly where you left off")
CODEX_FAILED ── 2nd failure / resume impossible ──▶ CLAUDE_TAKEOVER
CODEX_DONE ──▶ REVIEWING                                (Phase 2B on diff C{N}..C{N+1}, Gate #3)
REVIEWING ── gaps ∧ round < cap ──▶ FIX_ROUND ──▶ CODEX_IMPLEMENTING   (round+1, exec resume)
REVIEWING ── gaps ∧ (round ≥ cap ∨ repeated gap) ──▶ CLAUDE_TAKEOVER
REVIEWING ── clean ──▶ FINALIZING
CLAUDE_TAKEOVER ── normal gap loop clean ──▶ FINALIZING
FINALIZING ──▶ DONE
any state ── user cancel ──▶ ABORTED                    (kill process, abandonment protocol)
```

---

## Failure / Fallback Matrix

| Failure | Detection | Action |
|---------|-----------|--------|
| Codex not installed / broken install | RELAY_DETECT `not-installed` or `broken-install` | Announce `[RELAY-FALLBACK] Codex CLI {not found | broken} — running standard Phase 2A`; autonomous mode falls back automatically; interactive mode offers fallback or abort |
| Not authenticated | RELAY_DETECT `installed-unauthed`, or exit 1 + auth text in stderr | **Pause even in autonomous mode**: show `codex login` remediation, retry once on confirmation; on decline → `[RELAY-FALLBACK]` to standard Phase 2A |
| Exit 2 (arg parse) | exit code | Framework/config bug: show the exact command + stderr; one repair attempt (e.g. drop an unsupported flag); then fallback |
| Stall / timeout | JSONL/rollout mtime static for `relay_timeout_minutes` (≥7 — Codex's internal ~300s watchdog self-recovers shorter gaps) | `kill -INT` (SIGINT flushes the rollout); commit WIP checkpoint if the tree is dirty; `codex exec resume {id} "Continue exactly where you left off"` once; second stall → CLAUDE_TAKEOVER from the last checkpoint |
| Orchestrator never notified of leg completion | (design defect, not runtime) | Prevented by construction: MCP transport waits inside a blocking tool call; exec transport polls the `exit-r{N}` marker in-turn. Never end a turn to await a background-task notification — Claude Code drops them (upstream issues #6854, #21191) |
| MCP call aborted mid-leg (idle/wall timeout, severed stdio) | MCP tool error | The Codex session survives on disk — recover the thread id from `$CODEX_HOME/sessions/` rollout filename and continue via `codex exec resume` on the exec transport |
| Crash mid-leg (exit 1, partial diff) | exit code + dirty tree | Commit WIP checkpoint; resume with the continue prompt; the leg finishes on top |
| Resume id gone | `codex exec resume` errors | Launch a **fresh** session with the self-contained fix-prompt plus a `git diff --stat C0..HEAD` summary; persist the new thread_id over the old |
| Review fails after cap | round ≥ `relay_max_fix_rounds` at Gate #3 | CLAUDE_TAKEOVER → normal builder gap loop |
| Same gap repeats 2 rounds | lead compares consecutive feedback tables | Early CLAUDE_TAKEOVER — don't burn the cap on a non-converging fix |
| Fable unavailable for review legs | existing frontier fallback | Orthogonal — reviews degrade to Opus per `profile-models.md`; relay unaffected |
| User cancels | any point | Kill the background task; existing abandonment protocol; state → ABORTED |

---

## Resume After Context Clear (`/knowzcode:continue`)

If the WorkGroup file has a `## Relay` section: read `state.md`. For `CODEX_IMPLEMENTING` the process is necessarily dead after a clear — reconcile from evidence: the round's JSONL ends with a completed turn and the `-o` file exists → treat as `CODEX_DONE` (commit the checkpoint if not yet committed); otherwise treat as `CODEX_FAILED` and follow its protocol. All other states resume exactly where the state machine says.

`/knowzcode:regroup` needs no changes — its handoff's Next Step / References naturally point at the relay state file.

---


## Related

- `knowzcode/skills/work/SKILL.md` — Step 1.6 (relay parse + preflight) and the Tier 3 Relay Execution branch
- `knowzcode/agents/relay-runner.md` — background launch/monitor contract
- `knowzcode/skills/relay/SKILL.md` — setup-aware entry point
- `knowzcode/skills/continue/SKILL.md` — relay resume detection
- `knowzcode/knowzcode/knowzcode_orchestration.md` — `relay*` config keys
- `knowzcode/skills/work/references/quality-gates.md` — Gate #3 mechanics reused by the review legs
