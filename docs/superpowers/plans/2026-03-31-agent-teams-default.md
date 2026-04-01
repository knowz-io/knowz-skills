# Agent Teams as Default Mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agent teams the expected execution mode for all Tier 2+ KnowzCode workflows, ensuring persistent knowledge-liaison coverage.

**Architecture:** Four targeted edits — work skill Step 2 becomes opinionated (warn on fallback), Tier 2 gets a lightweight team (knowledge-liaison + builder), init Step 9 auto-enables with opt-out, and the CLAUDE.md template gains an Agent Teams section.

**Tech Stack:** Markdown skill/template files (no code — these are LLM instruction documents)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `knowzcode/skills/work/SKILL.md` | Modify (lines 52-76, 302-375) | Step 2 opinionated teams preference + Tier 2 lightweight team |
| `knowzcode/skills/init/SKILL.md` | Modify (lines 376-421) | Step 9 auto-enable with opt-out |
| `knowzcode/knowzcode/platform_adapters.md` | Modify (lines 59-63) | Add Agent Teams section to CLAUDE.md template |

---

### Task 1: Rewrite Step 2 in work/SKILL.md — Opinionated Teams Preference

**Files:**
- Modify: `knowzcode/skills/work/SKILL.md:52-76`

- [ ] **Step 1: Read the current Step 2 section**

Read `knowzcode/skills/work/SKILL.md` lines 52-76 to confirm the exact content before editing.

- [ ] **Step 2: Replace Step 2 with opinionated version**

Use the Edit tool to replace lines 52-76. Find the exact block starting with `## Step 2: Select Execution Mode` up to and including the `> **Note:** Agent Teams is experimental and the API may change.` line. Replace with:

```markdown
## Step 2: Select Execution Mode

**Agent Teams is the expected execution mode for Tier 2+ workflows.** It enables persistent knowledge-liaison coverage, parallel orchestration, and consistent vault capture. Subagent delegation is a degraded fallback — it works, but knowledge capture is reduced and orchestration is single-threaded.

Determine the execution mode using try-then-fallback:

1. Note user preferences from `$ARGUMENTS`:
   - `--sequential` → prefer Sequential Teams
   - `--subagent` → force Subagent Delegation (skip team creation attempt)

2. **If `--subagent` NOT specified**, attempt `TeamCreate(team_name="kc-{wgid}")`:
   - **If TeamCreate succeeds** → Agent Teams is available. Choose mode:
     - `--sequential` → **Sequential Teams**: `**Execution Mode: Sequential Teams** — created team kc-{wgid}`
     - Tier 2 → **Lightweight Teams**: `**Execution Mode: Lightweight Teams** — created team kc-{wgid} (knowledge-liaison + builder)`
     - Tier 3 (default) → **Parallel Teams**: `**Execution Mode: Parallel Teams** — created team kc-{wgid}`
   - **If TeamCreate fails** (error, unrecognized tool, timeout) → **Subagent Delegation** with degradation warning:
     ```
     **Execution Mode: Subagent Delegation** — Agent Teams not available
     > WARNING: Knowledge capture and parallel orchestration degraded. The knowledge-liaison
     > will not run persistently — vault reads are one-shot and captures may be inconsistent.
     > Enable Agent Teams: set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.local.json`
     ```

3. **If `--subagent` specified** → **Subagent Delegation** directly (no TeamCreate attempt):
   - Announce: `**Execution Mode: Subagent Delegation** — per user request`

For all Agent Teams modes (Sequential, Lightweight, and Parallel):
- You are the **team lead** in delegate mode — you coordinate phases, present quality gates, and manage the workflow. You NEVER write code, specs, or project files directly. All work is done by teammates. (Tip: the user can press Shift+Tab to system-enforce delegate mode.)
- After completion or if the user cancels, shut down all active teammates and clean up the team (see Cleanup section)

For Subagent Delegation:
- For each phase, delegate via `Task()` with the parameters specified in phase sections below

The user MUST see the execution mode announcement before any phase work begins. The phases, quality gates, and interactions are identical across all paths.

> **Note:** Agent Teams is experimental and the API may change.
```

- [ ] **Step 3: Verify the edit applied cleanly**

Read `knowzcode/skills/work/SKILL.md` lines 52-80 to confirm the replacement is correct and no duplicate content exists.

- [ ] **Step 4: Commit**

```bash
git add knowzcode/skills/work/SKILL.md
git commit -m "feat(work): make agent teams the expected execution mode with degradation warnings"
```

---

### Task 2: Rewrite Tier 2 Light Workflow in work/SKILL.md — Lightweight Team

**Files:**
- Modify: `knowzcode/skills/work/SKILL.md:302-375`

- [ ] **Step 1: Read the current Tier 2 section**

Read `knowzcode/skills/work/SKILL.md` lines 300-377 to confirm the exact Tier 2 content.

- [ ] **Step 2: Replace the Tier 2 section header and intro**

Find the block:
```markdown
## Tier 2: Light Workflow (2-phase fast path)

When Tier 2 is selected, execute this streamlined workflow instead of the 5-phase Tier 3 below.

> **Tier 2 still requires**: WorkGroup file (Step 4), tracker updates, log entry, and vault capture attempt. "Light" means fewer agents and phases — not fewer artifacts or vault writes.
```

Replace with:
```markdown
## Tier 2: Light Workflow (2-phase fast path)

When Tier 2 is selected, execute this streamlined workflow instead of the 5-phase Tier 3 below.

> **Tier 2 still requires**: WorkGroup file (Step 4), tracker updates, log entry, and vault capture attempt. "Light" means fewer agents and phases — not fewer artifacts or vault writes.

### Tier 2 Team Setup

If Agent Teams is available (TeamCreate succeeded in Step 2):
1. Create team `kc-{wgid}` (already done in Step 2)
2. Spawn `knowledge-liaison` as persistent teammate using the Stage 0 spawn prompt from `references/spawn-prompts.md`. Pass `VAULT_BASELINE` from Step 3.6 in the spawn prompt.
3. Knowledge-liaison performs startup protocol (reads local context, dispatches vault readers if vaults configured, sends Context Briefing — but only to lead since no analyst/architect in Tier 2)

If Agent Teams is NOT available (subagent fallback):
- Knowledge-liaison dispatched as one-shot `Task(subagent_type="knowzcode:knowledge-liaison")` for vault baseline research before Phase 2
- Degradation warning already shown in Step 2
```

- [ ] **Step 3: Replace the Light Phase 1 section**

Find the block starting with `### Light Phase 1 (Inline — lead does this, no agent)` and replace only the header line:

Old:
```markdown
### Light Phase 1 (Inline — lead does this, no agent)
```

New:
```markdown
### Light Phase 1 (Inline — lead coordinates, knowledge-liaison active)
```

- [ ] **Step 4: Replace the Light Phase 2A header to reference teammate**

Find:
```markdown
### Light Phase 2A: Implementation (Builder agent)

Spawn the builder using the standard Phase 2A prompt below (same for both tiers).
```

Replace with:
```markdown
### Light Phase 2A: Implementation (Builder teammate)

**Agent Teams mode**: Spawn the builder as a teammate in the `kc-{wgid}` team using the standard Phase 2A spawn prompt from `references/spawn-prompts.md` (same prompt for both tiers). The builder runs as a persistent teammate alongside the knowledge-liaison.

**Subagent fallback**: Spawn the builder via `Task(subagent_type="knowzcode:builder")` with the standard Phase 2A prompt (current behavior).
```

- [ ] **Step 5: Update the Light Phase 3 section to add knowledge-liaison capture**

Find the line:
```markdown
### Light Phase 3 (Inline — lead does this, no agent)
```

Replace with:
```markdown
### Light Phase 3 (Inline — lead coordinates, knowledge-liaison captures)
```

Then find the block starting with `6. **Vault Write Checklist (MUST — do not skip, do not defer)**:` and insert before it (after item 5 "Report completion."):

```markdown
6. **Knowledge-Liaison Capture** (Agent Teams mode only):
   - DM the knowledge-liaison: `"Capture Phase 3: {wgid}. Your task: #{task-id}"`
   - Wait for knowledge-liaison to confirm capture (max 2 minutes, else proceed with warning)
   - After capture, shut down knowledge-liaison, then delete team `kc-{wgid}`
```

Renumber the existing item 6 ("Vault Write Checklist") to item 7.

- [ ] **Step 6: Update the DONE line**

Find:
```markdown
**DONE** — 3 agents skipped (analyst, architect, reviewer, closer).
```

Replace with:
```markdown
**DONE** — Lightweight team: knowledge-liaison (persistent) + builder. Skipped: analyst, architect, reviewer, closer.
```

- [ ] **Step 7: Verify the Tier 2 section reads correctly**

Read `knowzcode/skills/work/SKILL.md` lines 300-400 to verify the full Tier 2 section is coherent with no broken references or duplicate content.

- [ ] **Step 8: Commit**

```bash
git add knowzcode/skills/work/SKILL.md
git commit -m "feat(work): add lightweight team support for Tier 2 with persistent knowledge-liaison"
```

---

### Task 3: Rewrite Step 9 in init/SKILL.md — Auto-Enable with Opt-Out

**Files:**
- Modify: `knowzcode/skills/init/SKILL.md:376-421`

- [ ] **Step 1: Read the current Step 9 section**

Read `knowzcode/skills/init/SKILL.md` lines 376-421 to confirm the exact content.

- [ ] **Step 2: Replace Step 9 with auto-enable version**

Find the block starting with `### 9. Enable Agent Teams (Claude Code only)` through the line `**Step 7.5d: If no, proceed normally** — subagent delegation works without any configuration.`. Replace with:

```markdown
### 9. Enable Agent Teams (Claude Code only)

If the user is on Claude Code, **auto-enable Agent Teams with opt-out confirmation**:

**Step 9a: Announce and confirm**

Present to the user:
```
Agent Teams will be enabled for this project (recommended).

Agent Teams provides persistent knowledge-liaison coverage, parallel orchestration,
and consistent vault capture across all workflow phases. Without it, knowledge
operations are one-shot and orchestration is single-threaded.

Press enter to confirm, or type 'no' to use single-agent fallback.
```

**Step 9b: Handle response**

- **If confirmed** (enter, "yes", "y", or any affirmative):
  1. Write `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to `.claude/settings.local.json` (project-level, gitignored)
  2. Follow-up prompt: `"Enable globally for all projects too? (y/n)"`
     - If yes: also write to `~/.claude/settings.json` (home-level global config)
     - If no: project-only (done)

- **If declined** ("no", "n"):
  1. Skip env var write
  2. Announce: `"Agent Teams not enabled. Knowledge capture will be reduced — vault operations will be one-shot instead of persistent. You can enable later by adding CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 to .claude/settings.local.json"`

Read the target settings file(s) if they exist. Merge the Agent Teams env var into existing content:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

If the file already has other keys, preserve them and merge. If it doesn't exist, create it with the content above.

**Step 9c: Windows note**

If the platform is Windows (`process.platform === 'win32'` or detected via environment):
```
Note: On Windows, Agent Teams runs in "in-process" mode by default
(split-pane tmux mode is not supported in Windows Terminal).
This works correctly — no action needed.
```
```

- [ ] **Step 3: Verify the edit applied cleanly**

Read `knowzcode/skills/init/SKILL.md` lines 376-425 to confirm the replacement is correct.

- [ ] **Step 4: Update the Step 12 success report to reflect new default**

Find the line in the success report:
```markdown
Agent Teams: [Enabled (.claude/settings.local.json) | Not enabled (subagent fallback)]
```

Replace with:
```markdown
Agent Teams: [Enabled (.claude/settings.local.json) — recommended | Declined (subagent fallback — reduced knowledge capture)]
```

- [ ] **Step 5: Commit**

```bash
git add knowzcode/skills/init/SKILL.md
git commit -m "feat(init): auto-enable agent teams with opt-out confirmation"
```

---

### Task 4: Update CLAUDE.md Template in platform_adapters.md — Agent Teams Section

**Files:**
- Modify: `knowzcode/knowzcode/platform_adapters.md:59-63`

- [ ] **Step 1: Read the current Agents section**

Read `knowzcode/knowzcode/platform_adapters.md` lines 55-104 to confirm the exact content of the Agents section and surrounding context.

- [ ] **Step 2: Replace the Agents section with expanded Agent Teams guidance**

Find the block:
```markdown
## Agents
Specialized agents handle each phase when using Agent Teams or subagent execution:
- `analyst` (1A), `architect` (1B), `builder` (2A), `reviewer` (2B), `closer` (3)
- Agent Teams is the preferred execution model when enabled (experimental, requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` env var)
- Subagent fallback for environments without Agent Teams
```

Replace with:
```markdown
## Agent Teams (Expected Execution Mode)

Agent Teams is the expected execution mode for all KnowzCode workflows (Tier 2+).
Without it, knowledge capture is degraded and parallel orchestration is unavailable.

| Tier | Team Mode | Agents |
|------|-----------|--------|
| Tier 1 (Micro) | No team | Redirected to `/knowzcode:fix` |
| Tier 2 (Light) | Lightweight team | `knowledge-liaison` (persistent) + `builder` |
| Tier 3 (Full) | Full parallel team | `knowledge-liaison`, `analyst`, `architect`, `builder(s)`, `reviewer(s)`, `closer` + opt-in specialists |

If Agent Teams is not available, KnowzCode falls back to subagent delegation with a degradation warning.
Enable via `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in `.claude/settings.local.json`.

### Why Agent Teams Matters
The `knowledge-liaison` agent runs persistently across all phases, coordinating vault reads (two-tier: baseline + deep research) and vault writes (at every quality gate). Without Agent Teams:
- Vault reads collapse to baseline-only (one-shot queries, no deep research)
- Vault writes happen inconsistently (no persistent coordinator)
- No parallel orchestration (builders run sequentially)

**Always prefer `/knowzcode:work` over `/knowzcode:fix`** for anything beyond single-file micro-fixes to ensure knowledge-liaison coverage.
```

- [ ] **Step 3: Verify the edit applied cleanly**

Read `knowzcode/knowzcode/platform_adapters.md` lines 55-85 to confirm the replacement is correct and the surrounding sections (Commands, MCP Integration) are undamaged.

- [ ] **Step 4: Commit**

```bash
git add knowzcode/knowzcode/platform_adapters.md
git commit -m "feat(template): add Agent Teams as expected execution mode in CLAUDE.md template"
```

---

### Task 5: Update Tier 2 Specialist Constraint in work/SKILL.md

**Files:**
- Modify: `knowzcode/skills/work/SKILL.md:142-144`

- [ ] **Step 1: Read the specialist mode constraints**

Read `knowzcode/skills/work/SKILL.md` lines 140-150 to confirm the exact content.

- [ ] **Step 2: Update the mode constraint to reference Lightweight Teams**

Find:
```markdown
- Sequential Teams / Tier 2: Not supported — if specialists were detected, announce: `> **Specialists: SKIPPED** — not supported in {Sequential Teams / Tier 2} mode.`
```

Replace with:
```markdown
- Sequential Teams / Lightweight Teams (Tier 2): Not supported — if specialists were detected, announce: `> **Specialists: SKIPPED** — not supported in {Sequential Teams / Lightweight Teams} mode.`
```

- [ ] **Step 3: Commit**

```bash
git add knowzcode/skills/work/SKILL.md
git commit -m "fix(work): update specialist constraint to reference Lightweight Teams mode"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Read all modified files end-to-end**

Read each modified file to verify internal consistency:
- `knowzcode/skills/work/SKILL.md` — verify Step 2 references "Lightweight Teams" and Tier 2 section references the team setup, no broken cross-references
- `knowzcode/skills/init/SKILL.md` — verify Step 9 flows correctly, Step 12 success report matches
- `knowzcode/knowzcode/platform_adapters.md` — verify CLAUDE.md template section order is logical, no duplicate sections

- [ ] **Step 2: Check for stale references**

Search for any remaining references to old patterns that should have been updated:
- Search for `"Execution Mode: Sequential Teams"` — should NOT appear as the only non-Parallel option (Lightweight Teams should also be listed)
- Search for `"3 agents skipped"` — should be replaced with lightweight team language
- Search for `"Yes, for this project only (recommended)"` — should be replaced with auto-enable language

- [ ] **Step 3: Commit verification results**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: clean up stale references after agent teams default changes"
```
