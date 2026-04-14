# Execution Profiles — Model Mappings

**Purpose:** Single source of truth for profile → agent-model mappings. Read by `/knowzcode:work` (Step 2.3, Stage 0-3 spawns) and `/knowzcode:audit` (Step 1.1) at startup.

Profile resolution order: CLI flag `--profile={advisor|teams|classic}` wins over `profile:` in `knowzcode/knowzcode_orchestration.md`. If neither is set, default is `teams`.

---

## Profile Definitions

| Profile | Purpose | Execution Mode | Advisor Required |
|---------|---------|----------------|------------------|
| `advisor` | Cost-optimized via advisor tool; near-Opus quality at Sonnet prices | Parallel Teams (forced) | Yes |
| `teams` (default) | Current behavior; all agents use frontmatter model assignments | Any (Parallel/Sequential/Subagent) | No |
| `classic` | Force Subagent Delegation mode; no teams, no advisor | Subagent Delegation (forced) | No |

---

## Profile → Agent-Model Mapping

| Agent | `advisor` | `teams` | `classic` | Rationale |
|-------|-----------|---------|-----------|-----------|
| architect | opus | opus | opus | Pure strategic reasoning — advisor adds no value |
| analyst | opus | opus | opus | Pure strategic reasoning |
| security-officer | opus | opus | opus | Deep analysis (OWASP scanning) needs full power |
| builder | **sonnet** | opus | opus | Heavy mechanical token generation with periodic strategic decisions |
| reviewer | **sonnet** | opus | opus | Heavy mechanical token generation with periodic strategic analysis |
| closer | **sonnet** | opus | opus | Mechanical finalization work (writing docs, commits) |
| smoke-tester | **sonnet** | opus | opus | Mechanical test execution |
| microfix-specialist | **sonnet** | opus | opus | Small, localized changes |
| knowledge-liaison | sonnet | sonnet | sonnet | Already Sonnet — no change |
| test-advisor | sonnet | sonnet | sonnet | Already Sonnet — no change |
| project-advisor | sonnet | sonnet | sonnet | Already Sonnet — no change |
| knowledge-migrator | opus | opus | opus | Utility agent (not in main workflow); unchanged |
| update-coordinator | opus | opus | opus | Utility agent (not in main workflow); unchanged |

**Bold cells** indicate a spawn-time override away from the agent's frontmatter default.

---

## MODEL_FOR() Resolution

Apply at every agent spawn site (Stage 0, 1, 2, 3 in Parallel Teams; each spawn in Sequential Teams; each `Task()` in Subagent Delegation):

```
MODEL_FOR(agent_name, profile):
  IF profile == "advisor" AND agent_name IN {builder, reviewer, closer, smoke-tester, microfix-specialist}:
    RETURN "sonnet"
  ELSE:
    RETURN null  # use agent frontmatter default
```

When `MODEL_FOR` returns non-null, include `model: <value>` in the spawn call (Agent Teams `TeamSpawn` or subagent `Task()`). When it returns `null`, OMIT the `model` parameter entirely so the agent's frontmatter value is used.

> **Never hardcode model names at spawn sites.** Always route through `MODEL_FOR(agent_name, profile)` so profile changes affect every spawn consistently.

---

## Profile → Execution Mode Constraints

- `advisor` → forces **Parallel Teams**. Reject `--sequential` or `--subagent` with an error (see `/knowzcode:work` Step 2.3).
- `teams` → existing mode selection logic applies. `--sequential` → Sequential Teams; `--subagent` → Subagent Delegation; default → Parallel Teams.
- `classic` → forces **Subagent Delegation**. Equivalent to `--subagent` today.

---

## Related

- `knowzcode/skills/work/SKILL.md` — Step 2.3 (profile resolution + detection/fallback) and flag handling
- `knowzcode/skills/work/references/spawn-prompts.md` — `{advisor_guidance}` placeholder rule
- `knowzcode/skills/work/references/parallel-orchestration.md` — spawn-time model-override application
- `knowzcode/skills/audit/SKILL.md` — audit-side profile handling
- `knowzcode/knowzcode/knowzcode_orchestration.md` — `profile:` config
