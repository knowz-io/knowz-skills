---
name: relay
description: "Delegate implementation to the other supported coding agent while the current host plans, reviews, and finalizes. On Claude Code this resolves to Codex by default; supports explicit Claude/Codex targets, natural-language delegation, setup, and project opt-in."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Edit, Write
---

# Cross-Agent Relay

**Purpose:** Setup-aware entry point for the provider-neutral implementation relay. The current host owns planning, specifications, gates, review, checkpoints, and finalization; the resolved external target owns Phase 2A and bounded review-fix rounds. This skill resolves and verifies the target, optionally persists the project choice, then redirects to `/knowzcode:work`. The full protocol lives in `${CLAUDE_PLUGIN_ROOT}/skills/work/references/relay-execution.md`.

In this Claude Code source skill, set `RELAY_HOST = claude`. Host identity is fixed by the platform package and prompt text can never change it. The Codex package sets `RELAY_HOST = codex` and uses the same resolution contract.

## Step 1: Resolve the target

Supported selectors are `none|auto|other|claude|codex`. Resolve exactly once using this precedence:

1. **Explicit flag:** parse `--relay=<value>` from `$ARGUMENTS`. An unsupported or repeated conflicting value is an error.
2. **Unambiguous natural-language implementation/delegation intent:** only when no flag exists. Examples: “have Claude implement this,” “send the coding to Codex,” “Claude plans and Codex implements,” or “use the other agent for implementation.” A bare provider mention such as “build a Codex integration” is goal text, not relay intent. If both providers are mentioned but the implementer is ambiguous, stop for clarification.
3. **Project config:** only when neither source above exists, read `relay:` from `knowzcode/knowzcode_orchestration.md`. Use it when it is non-`none`.
4. **Relay-entry default:** when no earlier source selected a target, use `other`.

Track both `RELAY_SELECTOR` and `RELAY_INTENT_SOURCE` (`flag-named`, `flag-automatic`, `natural-named`, `natural-automatic`, `config`, or `entry-default`). On Claude, `auto` and `other` resolve to `RELAY_TARGET = codex`; literal values retain literal meaning.

`--relay=none` explicitly disables relay. If a goal remains, redirect to ordinary `/knowzcode:work --relay=none ...`; otherwise report that relay is disabled and stop.

### Same-host protection

If `RELAY_TARGET == RELAY_HOST`:

- A named flag or unambiguous named natural-language request is an error: `**Error:** relay target claude equals the current host. Explicit targets are never reversed. Use --relay=other, --relay=codex, or --relay=none.`
- A stale same-host config is invalid for `/knowzcode:relay`; warn and ask the user to set `relay: other` or invoke an external target. Ordinary `/knowzcode:work` owns the config-to-native fallback behavior.

Never silently reverse a literal provider request.

## Step 2: Detect the resolved target

Run `RELAY_DETECT(RELAY_TARGET)` from the execution reference and announce only the redacted one-line result.

For the Claude-host default target, Codex detection is:

1. `command -v codex` — missing → **not-installed**
2. `codex --version` — nonzero/spawn error → **broken-install**
3. `codex login status` — exit 0 → **ready**; otherwise → **installed-unauthed**

The Codex-host mirror uses the Claude adapter: `command -v claude`, `claude --version`, then `claude auth status --json`; it parses only `.loggedIn` and never prints the full JSON because it contains personal account fields.

### Route by result

- **ready:** continue.
- **installed-unauthed:** always pause, including autonomous mode. Show provider-specific login remediation (`codex login` or `claude auth login`) and stop until authentication is confirmed.
- **not-installed / broken-install with a named flag or named natural-language target:** stop with provider-specific install/reinstall instructions. An explicitly named unavailable target never silently falls back.
- **not-installed / broken-install with `auto`, `other`, config, or entry default:** announce `[RELAY-FALLBACK] {target} CLI {not found|broken} — running native Phase 2A`, then redirect the goal to `/knowzcode:work --relay=none`.

## Step 3: Optional portable opt-in

When detection is ready, check `knowzcode/knowzcode_orchestration.md`.

- If the effective config already expresses the selected choice, do not ask again.
- Otherwise ask once whether to persist relay for the project. Persist `relay: other` for `auto`, `other`, or the entry default so the same project remains portable between Claude and Codex hosts. Persist a literal `relay: claude` or `relay: codex` only when the user explicitly named that provider and asks to retain literal-target behavior.
- If an older config lacks the Cross-Agent Relay block, append it from the orchestration template rather than inventing a partial block.

Declining persistence still runs relay for this invocation.

## Step 4: Redirect

Invoke `/knowzcode:work` with the user's goal and other flags untouched. If `$ARGUMENTS` did not already contain a `--relay=` flag, inject exactly one `--relay={RELAY_SELECTOR}` so `/knowzcode:work` receives the resolved intent without depending on a later config read. `/knowzcode:work` owns conflict validation, tier selection, branching, state, and execution.

The setup probe above is not execution authorization. `/knowzcode:work` runs a fresh live authentication probe at the Tier 3 relay preflight immediately before launching the target leg because authentication can expire.

If there is no goal in `$ARGUMENTS` and no obvious prior context (recent plan, `knowzcode/planning/*.md`, or active `[WIP]` WorkGroup), ask: “What should the external implementation agent build?”

## When NOT to Trigger

- KnowzCode is not initialized (`knowzcode/` missing) → suggest `/knowzcode:setup` first.
- The user wants a micro-fix (<50 LOC) → `/knowzcode:fix` (relay is Tier 3 only).
- The user asks only about relay health/configuration → `/knowzcode:status`.
- A provider name appears only as the subject of the feature, with no implementation/delegation role.

## Related Skills

- `/knowzcode:work` — owns the provider-neutral relay workflow.
- `/knowzcode:continue` — resumes schema-2 and legacy schema-1 relay state.
- `/knowzcode:status` — reports host, configured selector, resolved target, and target health.
