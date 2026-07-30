# Execution Profiles — Model Mappings

**Purpose:** Single source of truth for profile → agent-model mappings. Load only when a workflow will dispatch a profiled agent or must resolve a profile fallback.

Profile resolution order: CLI flag `--profile={advisor|teams|classic|frontier}` wins over `profile:` in `knowzcode/knowzcode_orchestration.md`. If neither is set, default is `frontier`.

---

## Profile Definitions

| Profile | Purpose | Execution Mode | Advisor Required |
|---------|---------|----------------|------------------|
| `advisor` | Cost-optimized via advisor tool; near-Opus quality at Sonnet prices | Any adaptive/sequential/coordinated mode | Yes |
| `teams` | Use frontmatter model assignments (mostly Opus). The historical name selects model policy, not Team mode. | Any | No |
| `classic` | Disable conversation inheritance and Team mode; allow compatible named-agent resume | Local/resume/fresh named agents | No |
| `frontier` (default) | Frontier-grade planning: **Fable** for planning/analysis/spec/review, **Opus** for execution. Higher cost; auto-falls back to Opus if Fable is unavailable. | Any | No |

---

## Profile → Agent-Model Mapping

| Agent | `advisor` | `teams` | `classic` | `frontier` | Rationale |
|-------|-----------|---------|-----------|------------|-----------|
| architect | opus | opus | opus | **fable** | Specification drafting — deepest reasoning; Fable produces the per-change spec |
| analyst | opus | opus | opus | **fable** | Impact analysis / Change Set — strategic reasoning |
| security-officer | opus | opus | opus | **fable** | Threat modeling / OWASP analysis — review reasoning |
| enterprise-enforcer | opus | opus | opus | **fable** | Guideline interpretation + ARC mapping — review reasoning |
| reviewer | **sonnet** | opus | opus | **fable** | Completeness/quality audit — review reasoning (audits the Opus build) |
| test-advisor | sonnet | sonnet | sonnet | **fable** | Test-quality review — review reasoning |
| project-advisor | sonnet | sonnet | sonnet | **fable** | Backlog / future-work brainstorming — planning reasoning |
| builder | **sonnet** | opus | opus | opus | Execution — implements the detailed spec (Opus) |
| closer | **sonnet** | opus | opus | opus | Execution — mechanical finalization (docs, commits) |
| smoke-tester | **sonnet** | opus | opus | opus | Execution — runtime verification |
| frontend-designer | **sonnet** | opus | opus | opus | Execution — browser-based E2E verification |
| microfix-specialist | **sonnet** | opus | opus | opus | Execution — small, localized changes |
| knowledge-migrator | opus | opus | opus | opus | Execution/utility — migrates external knowledge |
| update-coordinator | opus | opus | opus | opus | Utility — framework update merges |
| knowledge-liaison | sonnet | sonnet | sonnet | sonnet | Retrieval/IO — model choice adds nothing to vault reads |

**Bold cells** indicate a spawn-time override away from the agent's frontmatter default (shown in the `teams` column).

**High-value escape hatch (`frontier` only):** when `execute_on_fable` is set (via the `--fable-execution` flag or `execute_on_fable: true` in `knowzcode_orchestration.md`), the execution agents (builder, closer, smoke-tester, frontend-designer, microfix-specialist, knowledge-migrator, update-coordinator) also resolve to `fable`. Off by default — use it only for the rare job where the implementation itself needs frontier-level reasoning. knowledge-liaison stays on Sonnet even then.

---

## MODEL_FOR() Resolution

Apply at every agent spawn or resume decision in adaptive, sequential, and coordinated execution:

```
MODEL_FOR(agent_name, profile, execute_on_fable=false):
  IF profile == "advisor" AND agent_name IN {builder, reviewer, closer, smoke-tester, microfix-specialist, frontend-designer}:
    RETURN "sonnet"

  IF profile == "frontier":
    IF agent_name IN {analyst, architect, reviewer, security-officer, test-advisor, project-advisor, enterprise-enforcer}:
      RETURN "fable"        # planning / analysis / specification / review
    IF agent_name == "knowledge-liaison":
      RETURN null           # retrieval/IO — stays sonnet (frontmatter default)
    # execution agents: builder, closer, smoke-tester, frontend-designer,
    #                   microfix-specialist, knowledge-migrator, update-coordinator
    IF execute_on_fable:
      RETURN "fable"        # high-value escape hatch (--fable-execution / execute_on_fable: true)
    RETURN "opus"           # default: execution on Opus

  RETURN null               # teams / classic → agent frontmatter default
```

`execute_on_fable` defaults to `false`; callers that don't pass it (e.g. `/audit`, `/fix`) get the default, and it only affects the `frontier` profile.

When `MODEL_FOR` returns non-null, include `model: <value>` in the current agent or teammate spawn call. When it returns `null`, omit the parameter so the agent's frontmatter value is used. Keep model and effort stable while resuming one lineage; a change invalidates warmth and requires an explicit fresh dispatch.

> **Never hardcode model names at spawn sites.** Always route through `MODEL_FOR(agent_name, profile, execute_on_fable)` so profile changes affect every spawn consistently.

---

## Spawn-Prompt Injection Placeholders

Two placeholder blocks are resolved at spawn time based on the active profile (see [spawn-prompts.md](spawn-prompts.md)):

- `{advisor_guidance}` — substitute the Advisor Guidance block when `profile == "advisor"` AND `MODEL_FOR(agent, profile) == "sonnet"`; otherwise empty string.
- `{spec_depth_guidance}` — substitute the Spec-Depth Guidance block when `profile == "frontier"` AND the agent is `analyst` or `architect`; otherwise empty string. This raises the Change Set / spec bar to per-change coverage so the Opus builder has an exhaustive, unambiguous spec to execute against.

---

## Profile -> Execution Mode Constraints

- `advisor` -> no coordination constraint. Advisor availability affects model/tool guidance only.
- `teams` -> no coordination constraint. Despite its legacy name, it does not force Agent Teams.
- `classic` -> disables Team mode and conversation inheritance; local, compatible resume, and fresh named agents remain available.
- `frontier` -> no coordination constraint. Model routing is orthogonal to orchestration mode.

Agent Teams is a separate explicit runtime opt-in. No profile enables, recommends, or requires it. Even when configured, select coordinated-team mode only when at least two active peers need shared tasks or direct messaging.

## Advisor Requirements & Graceful Fallback

For `advisor`, fall back to `teams` model policy when `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1`, or when `ANTHROPIC_BASE_URL` is set and is not an Anthropic endpoint. Announce the exact reason. Do not probe by making a paid API call. This fallback changes model/tool policy only; it never changes the selected coordination mode.

---

## `frontier` Requirements & Graceful Fallback

Fable (the `fable` alias → `claude-fable-5`) requires the direct Anthropic API (or Claude Platform on AWS) — it is **not** available on Amazon Bedrock, Google Vertex AI, or Microsoft Foundry — and requires 30-day data retention (not available under zero-data-retention orgs).

When `frontier` is requested but Fable can't be used, `/knowzcode:work` (Step 2.3) resolves the would-be `fable` spawns to `opus` and announces the downgrade — the run proceeds as an all-Opus flow rather than failing. Detection mirrors the advisor env-guard: if `ANTHROPIC_BASE_URL` is set and does NOT contain `"anthropic.com"` (case-insensitive; likely Bedrock/Vertex/custom endpoint), downgrade `fable → opus` up front. The other unavailability cases — a zero-data-retention org, no Fable entitlement, or an older Claude Code that doesn't recognize the `fable` alias — can't be probed in advance, so they're caught at spawn time: **if any `fable` spawn is rejected at runtime for any reason, re-spawn that agent with `model: opus` and continue.** The run always degrades to Opus rather than failing — no restart and no `--profile` change needed.

Model identifiers use the bare aliases `fable` and `opus` (never pinned versions), so routing always targets the latest Fable and the latest Opus — a new model release can't break it. Version-locking is possible but discouraged: replace the aliases with pinned IDs (e.g. `claude-fable-5`, `claude-opus-4-8`) in the mapping above only if you deliberately want to freeze a version.

**Effort.** The profile selects *models*, not reasoning effort. In Claude Code, Opus runs at `xhigh` effort by default — the recommended setting for agentic coding — so frontier execution gets high effort automatically. Effort is a Claude Code session-level setting, not something the profile pins per agent; if you lower the session effort, it applies to every agent regardless of profile.

---

## Related

- `knowzcode/skills/work/SKILL.md` — Steps 1.5 / 2.3 / 2.4 (profile + `--fable-execution` resolution, detection/fallback) and flag handling
- `knowzcode/skills/work/references/spawn-prompts.md` — `{advisor_guidance}` and `{spec_depth_guidance}` placeholder rules
- `knowzcode/skills/work/references/parallel-orchestration.md` — spawn-time model-override application
- `knowzcode/skills/audit/SKILL.md` — audit-side profile handling
- `knowzcode/knowzcode/knowzcode_orchestration.md` — `profile:` and `execute_on_fable:` config
