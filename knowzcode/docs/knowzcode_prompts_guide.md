# KnowzCode Prompts Guide

Quick reference for all KnowzCode prompts and commands.

---

> **Claude Code users**: Use `/knowzcode:work "goal"` to start the full workflow automatically. The prompts below are for direct use with any AI platform.

## The Core Development Loop

This verification-driven sequence is the heart of KnowzCode. You use these prompts in order for every new feature or significant fix.

| Step | Loop Prompt | What It Does | Your Action |
| :--: | :--- | :--- | :--- |
| **1A** | `knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md` | Agent analyzes impact and proposes a "Change Set" of all affected nodes. | **Approve the scope.** |
| **1B** | `knowzcode/prompts/[LOOP_1B]__Draft_Specs.md` | Agent drafts all required specifications for the Change Set. | **Review the specs.** |
| **Gate**| `knowzcode/prompts/Spec_Verification_Checkpoint.md`| **(Optional)** A read-only check to verify spec completeness before coding. | **Run for large Change Sets.** |
| **2A** | `knowzcode/prompts/[LOOP_2A]__Implement_Change_Set.md` | Agent writes code for the Change Set and runs initial verification. | **Authorize implementation.** |
| **Gate**| `knowzcode/prompts/[LOOP_2B]__Verify_Implementation.md`| A **mandatory** read-only audit that compares code to specs and reports a completion %. | **Review audit & decide.** |
| **3** | `knowzcode/prompts/[LOOP_3]__Finalize_And_Commit.md` | Agent updates docs to "as-built," logs work, and commits to the repository. | **Authorize finalization.** |

> **Note**: The `[LOOP_X]` notation indicates the step number in the development cycle.

---

## Workflow & Maintenance Prompts

These are the prompts for managing the project's lifecycle.

### Daily Operations

| Category | Prompt | When to Use |
| :--- | :--- | :--- |
| **Quality** | `knowzcode/prompts/Spec_Verification_Checkpoint.md`| Before Loop 2A, to verify specs for large (10+ node) Change Sets. |
| **Quick Fix** | `knowzcode/prompts/Execute_Micro_Fix.md` | For tiny, localized fixes (< 50 lines) that don't require the full loop. |
| **Tech Debt**| `knowzcode/prompts/Refactor_Node.md` | To execute a `REFACTOR_` task from the tracker and improve code quality. |
| **Investigation** | `knowzcode/prompts/Investigate_Codebase.md` | To research a codebase question with parallel agents. |
| **Migration** | `knowzcode/prompts/Migrate_Knowledge.md` | To import external knowledge into KnowzCode spec format. |

---

## Claude Code Commands

When using the KnowzCode plugin with Claude Code, these commands orchestrate the workflow automatically:

| Command | Description |
|:--------|:------------|
| `/knowzcode:work <goal>` | Start feature workflow (runs all loop phases) |
| `/knowzcode:plan <topic>` | Research before implementing |
| `/knowzcode:audit [type]` | Run quality audits (spec, architecture, security, integration, compliance) |
| `/knowzcode:fix <target>` | Quick targeted fix |
| `/knowzcode:init` | Initialize KnowzCode in project + generate platform adapters |
| `/knowzcode:telemetry` | Investigate production telemetry |
| `/knowzcode:telemetry-setup` | Configure telemetry sources |
| `/knowz setup` | Configure MCP connection (requires knowz plugin) |
| `/knowz save` | Capture learning to vault (requires knowz plugin) |
| `/knowz register` | Register and configure MCP (requires knowz plugin) |
| `/knowzcode:status` | Check MCP and vault status |

---

## Quick Decision Tree

*   **Starting a new project?** -> `/knowzcode:init` (or copy `knowzcode/` directory)
*   **Starting a feature?** -> `/knowzcode:work "goal"` (or Loop 1A prompt)
*   **Have a question about the codebase?** -> `/knowzcode:plan "question"` (or Investigate prompt)
*   **Large Change Set (10+ NodeIDs)?** -> Run `Spec_Verification_Checkpoint` after Loop 1B
*   **Finished with Loop 2A?** -> Always run `[LOOP_2B]__Verify_Implementation` audit
*   **Found a small typo?** -> `/knowzcode:fix "target"` (or `Execute_Micro_Fix` prompt)
*   **Want to improve existing code?** -> `Refactor_Node` prompt
*   **Time for a quality check?** -> `/knowzcode:audit security` (or `/knowzcode:audit` for full audit)

---

## Best Practices

1. **The loop must be followed completely** - don't skip steps, they ensure quality at each phase
2. **Use `/knowzcode:plan` before diving into code** - research saves time by thinking through complexity upfront
3. **Regular audits** (`/knowzcode:audit`) prevent technical debt accumulation
4. **Maintain the WorkGroup todo file** (`knowzcode/workgroups/<WorkGroupID>.md`) and prefix every entry with `KnowzCode:` so automation keeps tasks on-screen
