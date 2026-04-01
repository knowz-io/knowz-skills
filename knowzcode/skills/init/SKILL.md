---
name: init
description: "Initialize KnowzCode framework in the current project. Use when asked to set up, install, or bootstrap KnowzCode in a new or existing project."
user-invocable: true
allowed-tools: Read, Write, Bash, Glob, Grep
---

# KnowzCode Project Initialization

You are the **KnowzCode Initialization Agent**. Set up the KnowzCode framework in the current working directory.

## Enterprise Configuration

Before using any endpoints or brand names in this skill, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json`). Read it once at the start of initialization.

If the file exists, use its values:
- `brand` → replaces "Knowz" in all user-facing messages and generated config
- `mcp_endpoint` → replaces `https://mcp.knowz.io/mcp` in all MCP commands and generated config (e.g., Gemini settings.json)
- `api_endpoint` → replaces `https://api.knowz.io/api/v1` in all API references

If the file is absent or a field is missing, use the defaults:
- brand: `Knowz`
- mcp_endpoint: `https://mcp.knowz.io/mcp`
- api_endpoint: `https://api.knowz.io/api/v1`

When `enterprise.json` is present, ignore the `--dev` flag for endpoint selection.

## What KnowzCode Provides

KnowzCode is a structured development methodology that provides:
- **Structured TDD workflow** with quality gates
- **Specification-driven development** with living documentation
- **Comprehensive tracking** of WorkGroups and specifications
- **Platform-agnostic** — works with Claude Code, Codex, Gemini, Cursor, Copilot, and more

## When NOT to Trigger

- Project is **already initialized** (knowzcode/ directory exists with content) — inform user, offer merge/overwrite
- User is asking **about KnowzCode features**, not requesting setup → answer directly
- User wants to **start a feature** → use `/knowzcode:work` (which checks initialization itself)
- User wants to **connect MCP** → use `/knowz setup`

## Steps to Execute

### 1. Check if already initialized

- Look for existing `knowzcode/` directory
- If exists and has content, ask user:
  - **Abort** (preserve existing)
  - **Merge** (add missing files only)
  - **Overwrite** (reset to templates)

### 2. Create directory structure

```
knowzcode/
├── knowzcode_project.md
├── knowzcode_tracker.md
├── knowzcode_log.md
├── knowzcode_architecture.md
├── knowzcode_loop.md
├── knowzcode_orchestration.md
├── platform_adapters.md
├── environment_context.md
├── user_preferences.md (if configured)
├── .gitignore
├── specs/
├── workgroups/
├── prompts/
└── enterprise/ (optional)
```

### 3. Copy template files

Use the embedded templates below.

### 4. Generate environment context

- Detect project language, framework, tools
- Populate `environment_context.md`
- Include package managers, test runners, build tools

### 5. Capture user preferences (optional)

- Ask: "Would you like to configure development preferences? (optional)"
- If yes: prompt for testing frameworks, code style, quality priorities
- Create `knowzcode/user_preferences.md`

### 6. Configure orchestration defaults (optional)

Ask: "Would you like to configure agent orchestration defaults? (optional — can be changed later in knowzcode/knowzcode_orchestration.md)"

If yes: prompt for:
- Max concurrent builders (1-5, default: 5)
- Scout mode (full/minimal/none, default: full)
- Default specialists (checkboxes: security-officer, test-advisor, project-advisor)
- MCP agents enabled (yes/no, default: yes)

If no: generate with all defaults.

Generate `knowzcode/knowzcode_orchestration.md` from the template (always — it's part of the standard file set).

### 7. Create .gitignore

Protect environment-specific files from git:
```
environment_context.md
workgroups/
*.local.md
.scratch/
```

### 8. Detect AI platforms and generate adapters

Check which AI platforms are present and offer to generate adapter files.

**Step 7a: Detect platforms**
```
CHECK for existing files:
  - CLAUDE.md → offer to append KnowzCode section
  - AGENTS.md or AGENTS.override.md → offer to generate Codex adapter
  - GEMINI.md or ~/.gemini/GEMINI.md → offer to generate Gemini adapter
  - .cursor/rules/ or .cursorrules (deprecated) → offer Cursor adapter (.cursor/rules/knowzcode.mdc)
  - .github/copilot-instructions.md OR .github/ directory → offer Copilot adapter (full prompt files)
  - .windsurf/rules/ or .windsurfrules (deprecated) → offer Windsurf adapter (.windsurf/rules/knowzcode.md)
```

**Step 7b: Present options**
```
PRESENT to user:
  "Which AI platform adapters would you like to generate?"
  Options:
  - Detected platforms only
  - All platforms
  - Skip (just use knowzcode/ directly)
```

**Step 7c: Generate project-specific adapters**

When generating adapters, inject detected project info to make them project-specific:

1. From `environment_context.md`, extract:
   - Test runner command (e.g., `npm test`, `pytest`, `dotnet test`)
   - Build command (e.g., `npm run build`, `go build`)
   - Language/framework (e.g., TypeScript/React, Python/FastAPI)

2. Inject into adapter templates where applicable:
   - Replace generic test/build references with detected commands
   - Add framework-specific notes (e.g., "Use Composer for multi-file React edits" for Cursor)

3. For Codex: note that `AGENTS.override.md` can be used for user-local overrides

**Step 7c-codex: Generate Codex skill files**

When Codex is selected, generate skill files in addition to `AGENTS.md`:

```
1. Create .agents/skills/ directory
2. Generate 12 skill files from platform_adapters.md "Codex Skill Files" section.
   Each generated SKILL.md should include `allowed-tools:` in frontmatter matching the platform's available tools.
   - .agents/skills/knowzcode-work/SKILL.md
   - .agents/skills/knowzcode-explore/SKILL.md
   - .agents/skills/knowzcode-fix/SKILL.md
   - .agents/skills/knowzcode-audit/SKILL.md
   - .agents/skills/knowzcode-learn/SKILL.md
   - .agents/skills/knowzcode-continue/SKILL.md
   - .agents/skills/knowzcode-init/SKILL.md
   - .agents/skills/knowzcode-status/SKILL.md
   - .agents/skills/knowzcode-connect-mcp/SKILL.md
   - .agents/skills/knowzcode-register/SKILL.md
   - .agents/skills/knowzcode-telemetry/SKILL.md
   - .agents/skills/knowzcode-telemetry-setup/SKILL.md
3. Replace "vX.Y.Z" with current KnowzCode version
```

**Codex success message:**
```
OpenAI Codex adapter generated:
  AGENTS.md                                       (primary instructions)
  .agents/skills/knowzcode-work/SKILL.md                (/knowzcode:work — start workflow)
  .agents/skills/knowzcode-explore/SKILL.md                (/knowzcode:explore — research)
  .agents/skills/knowzcode-fix/SKILL.md                 (/knowzcode:fix — quick fix)
  .agents/skills/knowzcode-audit/SKILL.md               (/knowzcode:audit — quality audit)
  .agents/skills/knowzcode-continue/SKILL.md            (/knowzcode:continue — resume workflow)
  .agents/skills/knowzcode-init/SKILL.md                (/knowzcode:init — initialize project)
  .agents/skills/knowzcode-status/SKILL.md              (/knowzcode:status — check status)
  .agents/skills/knowzcode-telemetry/SKILL.md           (/knowzcode:telemetry — investigate errors)
  .agents/skills/knowzcode-telemetry-setup/SKILL.md     (/knowzcode:telemetry-setup — configure sources)

Tip: Run `npx knowzcode install --platforms codex --global` to install
skills globally to ~/.agents/skills/ (available in all projects).
```

**Step 7c-gemini-mcp: Offer MCP configuration for Gemini CLI**

After generating GEMINI.md + commands + skills + subagents, run Smart Discovery first:
1. Check `KNOWZ_API_KEY` environment variable
2. Check `knowzcode/mcp_config.md` — if `Connected: Yes`, endpoint and key info available
3. Check `.mcp.json` or `.vscode/mcp.json` for existing API key (extract Bearer token)

If existing config found:
  "Found existing MCP config (endpoint: {endpoint}, key ending ...{last4}).
   Configure Gemini using this existing config? [Yes] [No, enter different key] [Skip]"
  If Yes: write .gemini/settings.json using discovered config (no key prompt needed)

If no existing config found, ask:
```
"Would you like to configure MCP for Gemini CLI? (Requires a KnowzCode API key)"
```

- If **"Yes, I have a key"**: Accept API key →
  1. Write `.gemini/settings.json` (merge with existing if present):
     ```json
     {
       "mcpServers": {
         "knowz": {
           "httpUrl": "https://mcp.knowz.io/mcp",
           "headers": {
             "Authorization": "Bearer <api-key>",
             "X-Project-Path": "<project-path>"
           }
         }
       }
     }
     ```
  2. Verify by calling `list_vaults` if possible
  3. Update `knowzcode/mcp_config.md` with connection status
- If **"Yes, register first"**: Direct to `/knowz setup`
- If **"No"**: Skip, mention `/knowz setup` for later setup

**Step 7c-gemini: Generate Gemini TOML commands, skills, and subagents**

When Gemini is selected, generate TOML command files, skill files, and subagent definitions in addition to `GEMINI.md`:

```
1. Create .gemini/commands/knowzcode/ directory
2. Generate 12 TOML files from platform_adapters.md "Native Commands" section:
   - .gemini/commands/knowzcode/work.toml
   - .gemini/commands/knowzcode/explore.toml
   - .gemini/commands/knowzcode/fix.toml
   - .gemini/commands/knowzcode/audit.toml
   - .gemini/commands/knowzcode/learn.toml
   - .gemini/commands/knowzcode/status.toml
   - .gemini/commands/knowzcode/continue.toml
   - .gemini/commands/knowzcode/init.toml
   - .gemini/commands/knowzcode/connect-mcp.toml
   - .gemini/commands/knowzcode/register.toml
   - .gemini/commands/knowzcode/telemetry.toml
   - .gemini/commands/knowzcode/telemetry-setup.toml
3. Create .gemini/skills/ directory
4. Generate 12 skill files from platform_adapters.md "Gemini Skill Files" section:
   - .gemini/skills/knowzcode-work/SKILL.md
   - .gemini/skills/knowzcode-explore/SKILL.md
   - .gemini/skills/knowzcode-fix/SKILL.md
   - .gemini/skills/knowzcode-audit/SKILL.md
   - .gemini/skills/knowzcode-learn/SKILL.md
   - .gemini/skills/knowzcode-continue/SKILL.md
   - .gemini/skills/knowzcode-init/SKILL.md
   - .gemini/skills/knowzcode-status/SKILL.md
   - .gemini/skills/knowzcode-connect-mcp/SKILL.md
   - .gemini/skills/knowzcode-register/SKILL.md
   - .gemini/skills/knowzcode-telemetry/SKILL.md
   - .gemini/skills/knowzcode-telemetry-setup/SKILL.md
5. Replace "vX.Y.Z" with current KnowzCode version
```

**Step 7c-gemini-agents: Generate Gemini subagent files (experimental, opt-in)**

Ask user: "Would you like to generate Gemini subagent definitions? (experimental — requires `experimental.enableAgents: true` in Gemini settings.json)"

If yes:
```
1. Create .gemini/agents/ directory
2. Generate 11 subagent files from platform_adapters.md "Gemini Subagents" section:
   - .gemini/agents/knowzcode-analyst.md
   - .gemini/agents/knowzcode-architect.md
   - .gemini/agents/knowzcode-builder.md
   - .gemini/agents/knowzcode-reviewer.md
   - .gemini/agents/knowzcode-closer.md
   - .gemini/agents/knowzcode-microfix.md
   - .gemini/agents/knowzcode-knowledge-migrator.md
   - .gemini/agents/knowzcode-update-coordinator.md
   - .gemini/agents/knowzcode-security-officer.md
   - .gemini/agents/knowzcode-test-advisor.md
   - .gemini/agents/knowzcode-project-advisor.md
3. Replace "vX.Y.Z" with current KnowzCode version
```

**Gemini success message:**
```
Gemini CLI adapter generated:
  GEMINI.md                                       (primary instructions)
  .gemini/commands/knowzcode/work.toml                  (/knowzcode:work — start workflow)
  .gemini/commands/knowzcode/explore.toml                  (/knowzcode:explore — research)
  .gemini/commands/knowzcode/fix.toml                   (/knowzcode:fix — quick fix)
  .gemini/commands/knowzcode/audit.toml                 (/knowzcode:audit — quality audit)
  .gemini/commands/knowzcode/status.toml                (/knowzcode:status — connection status)
  .gemini/commands/knowzcode/continue.toml              (/knowzcode:continue — resume workflow)
  .gemini/commands/knowzcode/init.toml                  (/knowzcode:init — initialize project)
  .gemini/commands/knowzcode/telemetry.toml             (/knowzcode:telemetry — investigate errors)
  .gemini/commands/knowzcode/telemetry-setup.toml       (/knowzcode:telemetry-setup — configure sources)
  .gemini/skills/knowzcode-work/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-explore/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-fix/SKILL.md                 (discoverable skill)
  .gemini/skills/knowzcode-audit/SKILL.md               (discoverable skill)
  .gemini/skills/knowzcode-continue/SKILL.md            (discoverable skill)
  .gemini/skills/knowzcode-init/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-status/SKILL.md              (discoverable skill)
  .gemini/skills/knowzcode-telemetry/SKILL.md           (discoverable skill)
  .gemini/skills/knowzcode-telemetry-setup/SKILL.md     (discoverable skill)
  .gemini/agents/knowzcode-*.md (14 subagents)          (experimental — if opted in)

MCP: [Configured (.gemini/settings.json) | Not configured — run /knowz setup later]

Tip: Run `npx knowzcode install --platforms gemini --global` to install
skills globally to ~/.gemini/skills/ (available in all projects).
```

**Step 7d: Validate generated adapters**

After generation, verify each adapter:
- References correct `knowzcode/` file paths
- Contains all 5 phase descriptions
- Mentions TDD enforcement and quality gates
- Includes PAUSE/STOP instructions at quality gates

Adapter templates are in `knowzcode/platform_adapters.md`. Copy the relevant sections into the appropriate files.

**Step 7e: Copilot-specific generation**

When Copilot is selected, generate the full prompt file suite in addition to the instructions file:

```
1. Create .github/ directory if it doesn't exist
2. Create .github/copilot-instructions.md from platform_adapters.md template Section A
3. Create .github/prompts/ directory
4. Generate all 9 prompt files from platform_adapters.md template Section B:
   - .github/prompts/knowzcode-work.prompt.md
   - .github/prompts/knowzcode-analyze.prompt.md
   - .github/prompts/knowzcode-specify.prompt.md
   - .github/prompts/knowzcode-implement.prompt.md
   - .github/prompts/knowzcode-audit.prompt.md
   - .github/prompts/knowzcode-finalize.prompt.md
   - .github/prompts/knowzcode-fix.prompt.md
   - .github/prompts/knowzcode-explore.prompt.md
   - .github/prompts/knowzcode-continue.prompt.md
5. Replace "vX.Y.Z" in generated files with the current KnowzCode version
6. Optionally create .vscode/mcp.json skeleton from template Section C
   (ask user: "Would you like to generate MCP configuration for VS Code?")
```

**Skip Agent Teams enablement for Copilot** — Copilot uses single-agent sequential execution.

**Copilot success message:**
```
GitHub Copilot adapter generated:
  .github/copilot-instructions.md     (repository-level instructions)
  .github/prompts/knowzcode-work.prompt.md   (start workflow: #prompt:knowzcode-work)
  .github/prompts/knowzcode-analyze.prompt.md
  .github/prompts/knowzcode-specify.prompt.md
  .github/prompts/knowzcode-implement.prompt.md
  .github/prompts/knowzcode-audit.prompt.md
  .github/prompts/knowzcode-finalize.prompt.md
  .github/prompts/knowzcode-fix.prompt.md    (quick fix: #prompt:knowzcode-fix)
  .github/prompts/knowzcode-explore.prompt.md   (research: #prompt:knowzcode-explore)
  .github/prompts/knowzcode-continue.prompt.md (resume: #prompt:knowzcode-continue)

Usage in VS Code:
  #prompt:knowzcode-work "Build user authentication"  — Start a feature
  #prompt:knowzcode-fix "Fix login redirect bug"      — Quick fix
  #prompt:knowzcode-continue                          — Resume where you left off

See knowzcode/copilot_execution.md for the full execution guide.
```

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

### 10. Optional: Set up enterprise compliance (experimental)

- Ask: "Would you like to set up enterprise compliance features? (optional)"
- If yes: create `knowzcode/enterprise/` directory with manifest and templates
- Compliance is disabled by default

### 11. Optional: Configure MCP

Inform user about enhanced features:
```
Optional: For knowledge vault features: `claude plugin install knowz` then `/knowz setup`
```

### 12. Report success

```
KnowzCode initialized successfully!

Created:
  knowzcode/knowzcode_project.md
  knowzcode/knowzcode_tracker.md
  knowzcode/knowzcode_log.md
  knowzcode/knowzcode_architecture.md
  knowzcode/knowzcode_loop.md
  knowzcode/knowzcode_orchestration.md
  knowzcode/platform_adapters.md
  knowzcode/.gitignore
  knowzcode/specs/
  knowzcode/workgroups/
  knowzcode/prompts/

Platform adapters: [list generated adapters or "None (skip)"]

Agent Teams: [Enabled (.claude/settings.local.json) — recommended | Declined (subagent fallback — reduced knowledge capture)]

Next steps:
  1. Review knowzcode/knowzcode_project.md and add project details
  2. Start your first feature: /knowzcode:work "your feature description"
  3. Research first: /knowzcode:explore "your question"
```

---

## Template Files

**Templates**: Read [references/templates.md](references/templates.md) for the full template content to generate.

Templates included: `knowzcode_project.md`, `knowzcode_tracker.md`, `knowzcode_log.md`, `knowzcode_architecture.md`, `environment_context.md`, `knowzcode_orchestration.md`.

---

## Related Skills

- `/knowzcode:work` — Start first feature after initialization
- `/knowzcode:explore` — Research the codebase after initialization
- `/knowz setup` — Configure MCP and vaults
- `/knowzcode:status` — Verify setup

## Error Handling

If initialization fails:
1. Report which step failed
2. Show partial progress
3. Suggest remediation
4. Offer to clean up

Execute this initialization now.
