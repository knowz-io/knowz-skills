---
name: relay
description: "Run a Claude-plans / Codex-implements / Claude-reviews relay workflow. Use when the user wants Codex (OpenAI Codex CLI) to execute the implementation while Claude handles planning, code review, and finalization — or wants to set up / enable the Codex relay."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# Claude↔Codex Relay

**Purpose**: Setup-aware entry point for the Claude↔Codex relay. Verifies the Codex CLI is usable, offers to persist the project opt-in, then hands off to `/knowzcode:work --relay=codex`. The full relay protocol lives in `knowzcode/skills/work/references/relay-execution.md` — this skill only handles detection, enablement, and redirect.

**What the relay does**: Claude plans and writes specs (Phase 1A/1B — Fable under the `frontier` profile), the OpenAI Codex CLI (default `gpt-5.6-sol` at `xhigh` reasoning effort) completes the plan and fully implements it headlessly on an isolated `kc-relay/{wgid}` branch, Claude code-reviews the diff (Phase 2B / Gate #3), Codex fixes findings in a resumed session (up to `relay_max_fix_rounds`, default 2), then Claude performs the final review and fixes and finalizes per Phase 3.

This is a **Claude Code-only** capability — Claude drives the Codex CLI as a headless subprocess.

## Step 1: Detect

Run `RELAY_DETECT` (see `knowzcode/skills/work/references/relay-execution.md`):

1. `command -v codex` — missing → **not-installed**
2. `codex --version` — exit 0 → capture version; failure/spawn error → **broken-install** (wrapper present, platform binary missing)
3. `codex login status` — exit 0 → **ready**; nonzero → **installed-unauthed**

Announce the one-line result: `[RELAY-DETECT] {result}`.

## Step 2: Route by result

### not-installed

```
The Codex CLI is not installed. Install it, then re-run /knowzcode:relay:

  npm i -g @openai/codex     (or: brew install codex)
  codex login
```

STOP.

### broken-install

```
The codex command exists but cannot run (missing platform binary). Reinstall, then re-run /knowzcode:relay:

  npm i -g @openai/codex --force     (or: brew reinstall codex)
```

STOP.

### installed-unauthed

```
The Codex CLI is installed ({version}) but not authenticated. Run:

  codex login            (ChatGPT sign-in — or set CODEX_API_KEY)

then re-run /knowzcode:relay.
```

STOP.

### ready

1. Check whether the project has opted in: grep `knowzcode/knowzcode_orchestration.md` for `^relay:\s*codex`.
2. **Not yet enabled** → ask once: "Persist the Codex relay for this project? (writes `relay: codex` to knowzcode/knowzcode_orchestration.md so plain `/knowzcode:work` uses it too — 'No' still runs the relay for this invocation only via the flag.)" On Yes, update the `relay:` line (the `## Relay Configuration` block exists in the template; append it from the template if an older config file lacks it).
3. **Redirect**: invoke `/knowzcode:work --relay=codex $ARGUMENTS` — pass the user's goal and any other flags through untouched. `/knowzcode:work` owns conflict validation, branching, and execution; the full detection is NOT re-run at its pre-flight (your result stands) — only once more at relay preflight, immediately before the Codex leg launches.

If there is no goal in `$ARGUMENTS` and no obvious prior context (recent plan, `knowzcode/planning/*.md`, active `[WIP]` WorkGroup), ask: "What should the relay build?"

## When NOT to Trigger

- KnowzCode is not initialized (`knowzcode/` missing) → suggest `/knowzcode:init` first
- The user wants a micro-fix (<50 LOC) → `/knowzcode:fix` (relay is Tier 3 only)
- The user asked about relay *status* only → `/knowzcode:status` covers detection without starting work

## Related Skills

- `/knowzcode:work` — the workflow this redirects to (`--relay=codex`)
- `/knowzcode:continue` — resumes an in-flight relay after a context clear
- `/knowzcode:status` — reports relay detection + configuration
