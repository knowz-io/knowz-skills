---
name: fix
description: "Execute a targeted micro-fix for single-file changes under 50 lines. Use when asked to fix a small bug, typo, or localized issue. Redirects to /knowzcode:work for larger changes."
user-invocable: true
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
argument-hint: "[target] [summary]"
---

# KnowzCode Micro-Fix

Execute a targeted micro-fix within the KnowzCode framework.

**Usage**: `/knowzcode:fix <target> <summary>`
**Example**: `/knowzcode:fix src/auth/login.ts "Fix null reference in password validation"`

## When NOT to Trigger

- Change spans **multiple files** or **>50 lines** → use `/knowzcode:work`
- Change needs **exploration first** before fixing → use `/knowzcode:explore`
- User wants a **codebase audit**, not a targeted fix → use `/knowzcode:audit`
- User is asking "how to fix" (question, not action) → answer directly, don't invoke skill

---

## Scope Guard

**This command is for micro-fixes only.** Before proceeding, verify:

| Criteria | Required |
|----------|----------|
| Change affects ≤1 file | ✓ |
| Change is <50 lines | ✓ |
| No ripple effects to other components | ✓ |
| No new dependencies introduced | ✓ |
| Existing tests cover the change area | ✓ |

**If ANY criteria fails**: Stop and suggest `/knowzcode:work` for full orchestration.

---

## Workflow Steps

### 1. Validate Scope
- Confirm the fix meets micro-fix criteria above
- If scope exceeds limits, redirect to `/knowzcode:work`

### 2. Load Context
- Read the target file to understand current implementation
- Identify existing test coverage for the affected code

### 3. Implement Fix
- Apply the minimal change required
- Follow existing code patterns and style

### 4. Verification Loop (MANDATORY)

**⛔ DO NOT skip verification. DO NOT claim "done" without passing tests.**

```
REPEAT until all checks pass:
  1. Run relevant tests:
     - Unit tests covering the changed code
     - Integration tests if the fix touches boundaries
     - E2E tests if the fix affects user-facing behavior

  2. If tests FAIL:
     - Analyze failure
     - Apply corrective fix
     - RESTART verification from step 1

  3. If tests PASS:
     - Run static analysis / linter
     - If issues found, fix and RESTART from step 1

  4. All checks pass → Exit loop
```

**Test Selection Guidance:**
| Fix Type | Required Tests |
|----------|---------------|
| Logic bug in function | Unit tests for that function |
| API endpoint fix | Unit + Integration tests |
| UI/UX fix | Unit + E2E tests |
| Configuration fix | Integration tests |
| Data handling fix | Unit + Integration tests |

### 5. Log and Commit
- Log MicroFix entry in `knowzcode/knowzcode_log.md`
- Include verification evidence (which tests passed)
- Commit with `fix:` prefix

---

## Arguments

- `target` (required): NodeID or file path that requires the micro-fix
- `summary` (required): One-line description of the requested change

## Example Usage

```
/knowzcode:fix src/auth/login.ts "Fix null reference in password validation"
/knowzcode:fix NODE_AUTH_123 "Update error message formatting"
```

## Flags

| Flag | Effect |
|------|--------|
| `--profile={advisor\|teams\|classic}` | Select execution profile — see `knowzcode/skills/work/references/profile-models.md` |

The `advisor` profile routes the micro-fix through Sonnet with advisor-tool guidance (per spec). `teams` and `classic` use the agent's frontmatter default (Opus) with no guidance injection.

## Profile Resolution (pre-dispatch)

Before the `Task()` dispatch, resolve `PROFILE`:

1. **Flag**: if `$ARGUMENTS` contains `--profile=<value>`, set `PROFILE = <value>`. Valid: `advisor`, `teams`, `classic`. Invalid → warn + fall back to `teams`.
2. **Config**: else read `knowzcode/knowzcode_orchestration.md` for the `^profile:\s*(\S+)` line. Use that value if valid; else `teams`.
3. **Default**: if config file is absent or line is missing, `PROFILE = "teams"`.
4. **Advisor detection** (only when `PROFILE == "advisor"`):
   - If `CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS == "1"` → fall back to `teams`, announce reason.
   - If `ANTHROPIC_BASE_URL` is set AND does NOT contain `"anthropic.com"` → fall back to `teams`, announce reason.
   - Otherwise proceed with `advisor`.

See `knowzcode/skills/work/references/profile-models.md` for `MODEL_FOR()` semantics. For `/fix`, `MODEL_FOR("microfix-specialist", "advisor") == "sonnet"`; all other cases return null.

## Execution

Delegate to the **microfix-specialist** agent via `Task()`.

Resolve two spawn-time values from `PROFILE`:

- `MODEL_OVERRIDE` = `MODEL_FOR("microfix-specialist", PROFILE)` — include `model: "sonnet"` in `Task()` parameters if non-null; omit entirely otherwise.
- `ADVISOR_GUIDANCE` = the Advisor Guidance block from `knowzcode/skills/work/references/spawn-prompts.md` if `PROFILE == "advisor"` AND `MODEL_OVERRIDE == "sonnet"`; otherwise empty string.

`Task()` parameters:
- `subagent_type`: `"microfix-specialist"`
- `model`: `"sonnet"` — included ONLY when `MODEL_OVERRIDE` is non-null; OMIT the parameter otherwise (agent frontmatter default applies)
- `prompt`: Task-specific context only (role definition is auto-loaded from `agents/microfix-specialist.md`):
  > **Target**: {target file or NodeID}
  > **Fix summary**: {summary}
  > Validate scope, implement the minimal fix, run the verification loop, log the outcome, and commit.
  > {advisor_guidance}   ← resolves to `ADVISOR_GUIDANCE` (the full block when advisor, else empty)
- `description`: `"Micro-fix: {summary}"`
- `mode`: `"bypassPermissions"`

> **Note:** Micro-fixes use subagent delegation only. Agent Teams overhead is not justified for single-file, <50 line fixes. The profile selection affects model choice and guidance injection, not execution mode.

## Related Skills

- `/knowzcode:work` — Full workflow for multi-file or >50 line changes
- `/knowzcode:explore` — Research before deciding on a fix approach
- `/knowzcode:audit` — Read-only scan to find issues
