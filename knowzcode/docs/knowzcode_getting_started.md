# Getting Started with KnowzCode: A Complete Guide

KnowzCode is a systematic development methodology that adds TDD, quality gates, and living documentation to AI-assisted development. It uses a structured loop and a library of prompts to build software that is well-documented, properly tested, and robust enough for long-term maintenance.

**Why KnowzCode?** Without structure, AI-driven projects tend toward unmanageable complexity, outdated documentation, and inconsistent quality. KnowzCode adds process to prevent this.

---

## Table of Contents

1. [Quick Start](#quick-start-your-first-project-with-knowzcode)
2. [Installation](#installation)
3. [Initial Setup Process](#initial-setup-process)
4. [The KnowzCode Loop](#the-heart-of-knowzcode-the-four-step-loop)
5. [Daily Workflow](#your-daily-workflow)
6. [Specialized Workflows](#specialized-workflows)
7. [Command Reference](#command-reference)
8. [Troubleshooting](#troubleshooting)
9. [Best Practices](#best-practices-for-success)
10. [MCP Integration (Cloud Features)](#mcp-integration-cloud-features)
11. [Migration from Pre-Release Versions](#migration-from-pre-release-versions)

---

## Quick Start: Your First Project with KnowzCode

### Overview of the Process

Unlike traditional setups, KnowzCode has a unique workflow:

1. **Prepare** your project vision (3 key files)
2. **Build** an initial prototype with AI
3. **Install** KnowzCode to manage the project going forward
4. **Develop** systematically using the KnowzCode loop
5. **Start the automated loop** with `/kc` to capture your PrimaryGoal and initialize the active WorkGroup todo list

This approach ensures KnowzCode documents what you ACTUALLY built, not just what you planned.

---

## Installation

### Claude Code Plugin (Recommended)

```bash
/plugin marketplace add knowz-io/knowz-skills
/plugin install knowzcode@knowz-skills
cd your-project/
/knowzcode:init
```

### Script Install (Any Platform)

```bash
npx knowzcode
```

This auto-detects your AI platforms and walks you through setup interactively. Commands available as `/work`, `/plan`, `/fix` (without `kc:` prefix). For the `/knowzcode:` prefix, also run: `/plugin install knowzcode@knowz-skills`.

```bash
npx knowzcode install --platforms claude,cursor   # Specific platforms
npx knowzcode install --platforms all             # All 6 platforms
npx knowzcode detect                              # See what's detected
```

### Alternative: Download ZIP

1. **Download the latest release:** [knowzcode.starter.zip](https://github.com/knowz-io/knowzcode/releases/latest)
2. **Keep the ZIP file handy** - you'll extract it AFTER your initial build

The ZIP contains:
```
your-project/
└── knowzcode/                    # Everything inside!
    ├── knowzcode_project.md
    ├── knowzcode_architecture.md
    ├── knowzcode_tracker.md
    ├── knowzcode_log.md
    ├── knowzcode_loop.md
    ├── environment_context.md
    ├── specs/
    ├── workgroups/
    └── prompts/
```

---

## Initial Setup Process

### Step 1: Prepare Your Vision (Before Any Coding)

You need to create three foundational documents. There are many ways to approach this - through conversation with your AI, using specific prompts, or a combination. Here's one structured approach:

#### Option A: Structured Design Strategy Approach

1. **Blueprint/Design Document** (using a Design Strategy prompt)
   - One effective method is using a UI/UX Design Strategy System prompt
   - This generates Design Pillars → Implementation Tasks → Visual Blueprint
   - Provides comprehensive strategic foundation for your project

2. **Project Overview** (`knowzcode/knowzcode_project.md`)
   - Create through conversation with your AI based on your blueprint
   - Or use `/knowzcode:init` to generate a starter template
   - Defines technology stack, standards, and scope

3. **Architecture Diagram** (`knowzcode/knowzcode_architecture.md`)
   - Design through discussion with your AI using your blueprint as reference
   - Or use `/knowzcode:init` to generate a starter template
   - Creates the technical system design

#### Option B: Conversational Approach

Simply have an extended conversation with your AI about:
- What you want to build
- Who will use it
- Core features and functionality
- Technical preferences
- System design

#### Option C: Hybrid Approach

Mix prompts and conversation:
- Start with a structured prompt for initial ideas
- Refine through conversation
- Use specific prompts for technical details

**Pro tip:** Create all three documents in the same chat session, allowing each to inform and refine the others. The key is having clear, comprehensive plans before any code is written.

### Step 2: Build Your Initial Prototype

1. **Give all three documents to your AI**
   ```
   "Here are my project plans: [paste the 3 documents]
   Please build the initial version of this application."
   ```

2. **Let the AI build the first version**
   - It will create the basic structure
   - Implement core features
   - Set up the project

3. **Test and verify** the initial build works

### Step 3: Install KnowzCode (After Initial Build)

NOW install KnowzCode into your project:

```bash
# Recommended: use npx
cd your-project/
npx knowzcode install

# Or extract the ZIP if you downloaded it
unzip knowzcode.starter.zip -d your-project/
```

You should see:
```
your-project/
├── your-code-files...        (already built)
└── knowzcode/                   (just installed)
    ├── environment_context.md
    ├── knowzcode_project.md
    └── ... other KnowzCode files
```

### Step 4: Initialize and Audit

If using Claude Code with the KnowzCode plugin:
```bash
/knowzcode:init
/knowzcode:audit
```

If using prompts directly with any AI:
1. Give the AI your project context files
2. Run the Loop 1A prompt to verify the system recognizes your codebase
3. The AI will audit the installation and identify any missing NodeIDs

### Step 5: Begin Systematic Development

You're now ready to use the KnowzCode loop for all future development!

If using Claude Code:
```bash
/knowzcode:work "your first feature goal"
```

If using prompts directly:
> Start with `knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md`

---

## The Heart of KnowzCode: The Four-Step Loop

Every feature you build follows this robust, structured, and verification-driven loop:

```
┌────────────────────────────────────────────────────────┐
│                    THE KNOWZCODE LOOP                     │
│                                                        │
│  You Provide a `PrimaryGoal` (e.g., "Add user login")  │
│                      ↓                                 │
│  [LOOP 1A] Propose Change Set                          │
│       ↓ (Agent analyzes impact, you approve)           │
│  [LOOP 1B] Draft Specs                                 │
│       ↓ (Optional: Spec Verification for large sets)   │
│  [LOOP 2A] Implement Change Set                        │
│       ↓ (Agent builds & runs initial tests)            │
│  [LOOP 2B] Verify Implementation                       │
│       ↓ (Agent audits code vs. spec, reports %)        │
│  [LOOP 3] Finalize & Commit                            │
│       ↓ (Agent updates docs, logs, and commits)        │
│                                                        │
│  ← Return to Start Work Session for the next Goal      │
└────────────────────────────────────────────────────────┘
```

### What Each Step Does:

**`knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md`**
*   **Agent's Job:** Analyzes the `PrimaryGoal` and identifies every single new or existing node that will be affected.
*   **Your Job:** Review and approve the proposed Change Set.

**`knowzcode/prompts/[LOOP_1B]__Draft_Specs.md`**
*   **Agent's Job:** Marks all nodes as `[WIP]` and writes detailed specifications.
*   **Your Job:** Review the specs in the `knowzcode/specs/` directory.
*   **Quality Gate:** For large Change Sets (≥10 NodeIDs), the AI will recommend running a `Spec_Verification_Checkpoint` to ensure quality before implementation.

**`knowzcode/prompts/[LOOP_2A]__Implement_Change_Set.md`**
*   **Agent's Job:** Writes all code, runs tests, and performs an initial verification against specs.
*   **Your Job:** Monitor progress, available for any blockers.

**`knowzcode/prompts/[LOOP_2B]__Verify_Implementation.md`**
*   **Agent's Job:** Performs a **read-only audit** comparing the implemented code to the specifications. It reports a factual completion percentage (e.g., "85% complete").
*   **Your Job:** Decide whether to fix the gaps, accept the work, or modify the specs.

**`knowzcode/prompts/[LOOP_3]__Finalize_And_Commit.md`**
*   **Agent's Job:** Updates specs to "as-built" state, logs work, commits.
*   **Your Job:** Nothing - this step is fully automated.

---

## Your Daily Workflow

### Starting Every Work Session

If using Claude Code:
```bash
/knowzcode:work "your next feature goal"
```

If using prompts directly, start with Loop 1A. The agent will:
- Sync with your project state
- Review recent changes
- Propose a Change Set for your goal

### Building a New Feature (Example with Quality Gates)

This example shows how the new quality gates work with a large feature.

```
You: /knowzcode:work "Implement a full e-commerce checkout flow"
  (or: knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md)
Agent: [Starts LOOP 1A]
      "This is a large feature affecting 12 NodeIDs. [...] Approve this Change Set?"

You: "I approve"
Agent: [Starts LOOP 1B]
      "...Drafted specs for all 12 NodeIDs. Based on a Change Set size of 12, I recommend we proceed to the Spec Verification Checkpoint."

You: knowzcode/prompts/Spec_Verification_Checkpoint.md
Agent: "Specification Verification Checkpoint complete. All specs are present and meet quality standards. Ready to proceed."

You: knowzcode/prompts/[LOOP_2A]__Implement_Change_Set.md
Agent: [Implements all 12 nodes...]
      "Implementation and Initial Verification for WorkGroupID [ID] is complete. The Change Set is now ready for the Loop 2B Implementation Completeness Audit."

You: knowzcode/prompts/[LOOP_2B]__Verify_Implementation.md
Agent: "Audit complete.
      - Overall Implementation Completion: 80%
      - Fully Implemented: 8/12 nodes
      - Partially Implemented: 2/12 nodes (missing error handling)
      - Not Implemented: 2/12 nodes (payment gateway timeout logic)
      Awaiting Orchestrator decision."

You: "Return to Loop 2 to implement the missing requirements."
Agent: [Returns to implementation to fix gaps...]
```

---

## Specialized Workflows

### Quick Fixes (Micro-Fix)
For tiny changes (typos, small CSS tweaks):
```
knowzcode/prompts/Execute_Micro_Fix.md

Target: UI_LoginForm
Issue: Fix typo in button text "Sigin" -> "Sign in"
```

### Handling Bugs
When something is broken, use the micro-fix workflow or a full work session:
```bash
/knowzcode:fix "API_Authentication - Login returns 500 error after 5 failed attempts"
# or for larger fixes:
/knowzcode:work "Fix login 500 error after 5 failed attempts"
```

### Code Cleanup (Refactoring)
To improve existing code:
```
knowzcode/prompts/Refactor_Node.md

Target NodeID: API_UserSearch
Refactoring Goal: Optimize database queries to reduce N+1 problem
```

### Planning Features
Before building, research your approach:
```bash
/knowzcode:plan "Add social login with Google and GitHub OAuth"
/knowzcode:plan "Email notification system architecture"
```

---

## Command Reference

### Claude Code Commands
| Command | Purpose | When to Use |
|:--------|:--------|:------------|
| `/knowzcode:init` | Initialize KnowzCode in project | Once, at project setup |
| `/knowzcode:work <goal>` | Start feature workflow | Every new feature or fix |
| `/knowzcode:plan <topic>` | Research before implementing | When investigating options |
| `/knowzcode:audit [type]` | Run quality audits | Periodic quality checks |
| `/knowzcode:fix <target>` | Quick targeted fix | Typos, small bugs |
| `/knowz save` | Capture learnings to vault | After discoveries |
| `/knowzcode:status` | Check MCP connection | Verify setup |

### Core Loop Prompts (for any AI platform)
| Prompt | Purpose | When to Use |
|:-------|:--------|:------------|
| `knowzcode/prompts/[LOOP_1A]__Propose_Change_Set.md` | Analyze feature impact | Start of each feature |
| `knowzcode/prompts/[LOOP_1B]__Draft_Specs.md` | Create blueprints | After approving Change Set |
| `knowzcode/prompts/Spec_Verification_Checkpoint.md` | **Quality Gate:** Verify specs | Recommended for large Change Sets |
| `knowzcode/prompts/[LOOP_2A]__Implement_Change_Set.md` | Build and test | After approving specs |
| `knowzcode/prompts/[LOOP_2B]__Verify_Implementation.md` | **Quality Gate:** Audit code | After implementation |
| `knowzcode/prompts/[LOOP_3]__Finalize_And_Commit.md` | Document and commit | After audit passes |

### Quick Actions
| Prompt | Use Case |
|:-------|:---------|
| `knowzcode/prompts/Execute_Micro_Fix.md` | Typos, small tweaks |
| `knowzcode/prompts/Refactor_Node.md` | Code quality improvements |
| `knowzcode/prompts/Investigate_Codebase.md` | Codebase questions |

---

## Troubleshooting

### Common Issues and Solutions

#### "Command not found" or environment errors
**Symptoms:** AI tries to run commands that don't work

**Solutions:**
- Check `knowzcode/environment_context.md` was filled out during installation
- Verify commands work in your terminal
- Common fixes:
  - Use `python3` instead of `python`
  - Add `npx` before commands
  - Include virtual environment activation

#### AI seems confused about project state
**Symptoms:** AI suggests already-completed tasks or misunderstands architecture

**Solutions:**
- Run `/knowzcode:work` or start a new loop from Loop 1A to resync
- Check all NodeIDs in tracker have spec files
- Verify architecture diagram matches implementation
- Ensure recent changes were committed

#### Initial build doesn't match plans
**Symptoms:** What was built differs significantly from blueprints

**Solutions:**
- This is normal! Plans evolve during implementation
- Run `/knowzcode:audit` to reconcile documentation with actual state
- Review the reconciled files carefully before approving
- The system documents reality, not ideals

#### Changes aren't being tracked
**Symptoms:** Progress percentage wrong, work not showing as verified

**Solutions:**
- Follow the complete 4-step Loop
- Check `knowzcode/knowzcode_tracker.md` shows correct statuses
- Verify git commits are happening
- Don't skip steps - each updates different files

### Getting Help

When stuck, check these in order:
1. **Review `knowzcode/knowzcode_log.md`** - Recent entries often reveal issues
2. **Check `knowzcode/knowzcode_tracker.md`** - Ensure dependencies are correct
3. **Verify architecture** - Missing connections cause confusion
4. **Test environment commands** - Manual testing reveals broken commands
5. **Review recent git commits** - See what actually changed

---

## Best Practices for Success

### For Initial Setup
- **There's no single "right way"** - Use prompts, conversation, or hybrid approaches
- **Take time with your blueprints** - Good planning makes everything smoother
- **Start with a simple project** - Learn KnowzCode with something manageable
- **Review reconciliation carefully** - This sets the foundation

### For Daily Development
- **Always start with a work session** - Keeps AI synchronized
- **Trust the process** - The loop prevents problems
- **Review specs before implementation** - Catches issues early
- **Use planning prompts for complex features** - Saves time overall

### For Long-term Success
- **Regular health checks** - Run Architecture Health Review monthly
- **Address technical debt** - Don't let REFACTOR_ tasks pile up
- **Keep environment updated** - When tools change, update the file
- **Embrace the commits** - Clean history helps debugging

---

## Next Steps

1. Prepare your three foundational documents
2. Build your initial prototype
3. Install KnowzCode: `npx knowzcode` or `/knowzcode:init` (Claude Code) or copy the `knowzcode/` directory
4. Start systematic development with `/knowzcode:work "your first goal"`!

Remember: The first project might feel slow as you learn the workflow, but each subsequent project becomes faster and more natural. KnowzCode's value increases as projects grow in complexity.

---

## MCP Integration (Cloud Features)

KnowzCode works perfectly without cloud features — agents use traditional file search and reading tools. But connecting to **KnowzCode Cloud** via Model Context Protocol (MCP) adds AI-powered enhancements:

- **Vector Knowledge Search** — Semantic search across indexed code and documentation
- **AI-Powered Q&A** — Ask questions with optional research mode (8000+ token comprehensive answers)
- **Learning Capture** — Save patterns, decisions, and conventions to your knowledge vault
- **Smart Context** — Agents automatically receive relevant context for their tasks

### Available MCP Tools

| Tool | Purpose |
|:-----|:--------|
| `search_knowledge` | Vector search across vaults with tag/date filtering |
| `ask_question` | AI Q&A with optional `researchMode` for comprehensive answers |
| `create_knowledge` | Save learnings, notes, decisions to vault |
| `update_knowledge` | Update existing knowledge items |
| `get_knowledge_item` | Retrieve item by ID with related items |
| `bulk_get_knowledge_items` | Batch fetch up to 100 items |
| `list_vaults` | List accessible vaults with stats |
| `list_vault_contents` | Browse vault items with filters |
| `find_entities` | Find people, locations, events in your knowledge |

### Setup

```bash
# One-time setup per project
/knowz setup <your-api-key>

# Optional: Custom endpoint (self-hosted)
/knowz setup <your-api-key> --endpoint https://your-domain.com/mcp

# Restart Claude Code to activate, then verify
/knowzcode:status
```

Get your API key at [app.knowz.io/settings/api-keys](https://app.knowz.io/settings/api-keys).

### How Agents Use MCP

Once connected, KnowzCode agents automatically use MCP tools:

| Agent | Uses MCP For |
|:------|:-------------|
| **Analyst** | `search_knowledge` to find related code and past decisions |
| **Architect** | `ask_question` for conventions, `search_knowledge` for patterns |
| **Builder** | `search_knowledge` for similar implementations |
| **Closer** | `create_knowledge` to capture learnings automatically |

### Configuration Scopes

Choose how to configure the MCP server:

- **local** (default): Only this project, private to you
- **project**: Shared with team via `.mcp.json` (committed to git)
- **user**: Available across all your projects

```bash
/knowz setup <api-key>                  # Local scope (default)
/knowz setup <api-key> --scope project  # Project-wide (team access)
/knowz setup <api-key> --scope user     # Global (all your projects)
```

### Graceful Degradation

KnowzCode works identically without MCP — agents simply use traditional grep/glob/read tools. MCP enhances their capabilities but is never required.

---

## Migration from Pre-Release Versions

If you used KnowzCode during pre-release with `.claude/` directories:

1. **Install the plugin**: `/plugin install knowzcode@knowz-skills`
2. **Your data is safe**: The `knowzcode/` directory is preserved automatically
3. **Remove `.claude/`**: Commands now come from the plugin
4. **Agents consolidated**: 24 → 10 (same functionality, less overhead)
5. **Commands simplified**: 16 → 11

Removed commands: `/knowzcode:step`, `/knowzcode:continue` (command), `/knowzcode:compliance`, `/knowzcode:resolve-conflicts`, `/knowzcode:migrate-knowledge`. The `continue` skill still works — just say "continue" in conversation to resume active WorkGroups.

See the [full documentation](../docs/) for more details on version changes.
