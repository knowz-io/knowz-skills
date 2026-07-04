# Execution Profiles — Model Mappings

**Purpose:** Single source of truth for profile → agent-model mappings. Read by `/knowzcode:work` (Step 2.3, Stage 0-3 spawns) and `/knowzcode:audit` (Step 1.1) at startup.

Profile resolution order: CLI flag `--profile={advisor|teams|classic|frontier}` wins over `profile:` in `knowzcode/knowzcode_orchestration.md`. If neither is set, default is `teams`.

---

## Profile Definitions

| Profile | Purpose | Execution Mode | Advisor Required |
|---------|---------|----------------|------------------|
| `advisor` | Cost-optimized via advisor tool; near-Opus quality at Sonnet prices | Parallel Teams (forced) | Yes |
| `teams` (default) | Current behavior; all agents use frontmatter model assignments | Any (Parallel/Sequential/Subagent) | No |
| `classic` | Force Subagent Delegation mode; no teams, no advisor | Subagent Delegation (forced) | No |
| `frontier` | Frontier-grade planning: **Fable** for planning/analysis/spec/review, **Opus** for execution. Opt-in; higher cost. | Any (Parallel/Sequential/Subagent) | No |

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

Apply at every agent spawn site (Stage 0, 1, 2, 3 in Parallel Teams; each spawn in Sequential Teams; each `Task()` in Subagent Delegation):

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

When `MODEL_FOR` returns non-null, include `model: <value>` in the spawn call (Agent Teams `TeamSpawn` or subagent `Task()`). When it returns `null`, OMIT the `model` parameter entirely so the agent's frontmatter value is used.

> **Never hardcode model names at spawn sites.** Always route through `MODEL_FOR(agent_name, profile, execute_on_fable)` so profile changes affect every spawn consistently.

---

## Spawn-Prompt Injection Placeholders

Two placeholder blocks are resolved at spawn time based on the active profile (see [spawn-prompts.md](spawn-prompts.md)):

- `{advisor_guidance}` — substitute the Advisor Guidance block when `profile == "advisor"` AND `MODEL_FOR(agent, profile) == "sonnet"`; otherwise empty string.
- `{spec_depth_guidance}` — substitute the Spec-Depth Guidance block when `profile == "frontier"` AND the agent is `analyst` or `architect`; otherwise empty string. This raises the Change Set / spec bar to per-change coverage so the Opus builder has an exhaustive, unambiguous spec to execute against.

---

## Profile → Execution Mode Constraints

- `advisor` → forces **Parallel Teams**. Reject `--sequential` or `--subagent` with an error (see `/knowzcode:work` Step 2.3).
- `teams` → existing mode selection logic applies. `--sequential` → Sequential Teams; `--subagent` → Subagent Delegation; default → Parallel Teams.
- `classic` → forces **Subagent Delegation**. Equivalent to `--subagent` today.
- `frontier` → **no execution-mode constraint.** Works in Parallel / Sequential / Subagent — model routing is orthogonal to orchestration mode.

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
