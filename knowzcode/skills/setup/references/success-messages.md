# KnowzCode Init — Platform Adapter Success Messages

Success messages to display to the user after generating each platform adapter in Step 8.

## Contents

- [Codex Success Message](#codex-success-message)
- [Gemini Success Message](#gemini-success-message)
- [Copilot Success Message](#copilot-success-message)

## Codex Success Message

```
OpenAI Codex adapter generated:
  AGENTS.md                                       (primary instructions)
  .agents/skills/knowzcode-work/SKILL.md                (/knowzcode:work — start workflow)
  .agents/skills/knowzcode-work/references/relay-execution.md (cross-agent relay protocol)
  .agents/skills/knowzcode-relay/SKILL.md               (/knowzcode:relay — delegate implementation to the other agent)
  .agents/skills/knowzcode-explore/SKILL.md                (/knowzcode:explore — research)
  .agents/skills/knowzcode-fix/SKILL.md                 (/knowzcode:fix — quick fix)
  .agents/skills/knowzcode-audit/SKILL.md               (/knowzcode:audit — quality audit)
  .agents/skills/knowzcode-learn/SKILL.md               (/knowz save — capture learning)
  .agents/skills/knowzcode-regroup/SKILL.md             (/knowzcode:regroup — local handoff)
  .agents/skills/knowzcode-regroup-trigger/SKILL.md     (pause/handoff intent router)
  .agents/skills/knowzcode-continue/SKILL.md            (/knowzcode:continue — resume workflow)
  .agents/skills/knowzcode-setup/SKILL.md                (/knowzcode:setup — initialize project)
  .agents/skills/knowzcode-status/SKILL.md              (/knowzcode:status — check status)
  .agents/skills/knowzcode-telemetry/SKILL.md           (/knowzcode:telemetry — investigate errors)
  .agents/skills/knowzcode-telemetry-setup/SKILL.md     (/knowzcode:telemetry-setup — configure sources)
  .agents/skills/knowzcode-connect-mcp/SKILL.md         (/knowz setup — configure MCP)
  .agents/skills/knowzcode-register/SKILL.md            (/knowz register — create account)
  .agents/skills/knowzcode-start-work/SKILL.md          (implementation/relay intent router)

Tip: Run `npx @knowzai/knowzcode install --platforms codex --global` to install
skills globally to ~/.agents/skills/ (available in all projects).
```

## Gemini Success Message

```
Gemini CLI adapter generated:
  GEMINI.md                                       (primary instructions)
  .gemini/commands/knowzcode/work.toml                  (/knowzcode:work — start workflow)
  .gemini/commands/knowzcode/explore.toml                  (/knowzcode:explore — research)
  .gemini/commands/knowzcode/fix.toml                   (/knowzcode:fix — quick fix)
  .gemini/commands/knowzcode/audit.toml                 (/knowzcode:audit — quality audit)
  .gemini/commands/knowzcode/status.toml                (/knowzcode:status — connection status)
  .gemini/commands/knowzcode/continue.toml              (/knowzcode:continue — resume workflow)
  .gemini/commands/knowzcode/setup.toml                  (/knowzcode:setup — initialize project)
  .gemini/commands/knowzcode/telemetry.toml             (/knowzcode:telemetry — investigate errors)
  .gemini/commands/knowzcode/telemetry-setup.toml       (/knowzcode:telemetry-setup — configure sources)
  .gemini/skills/knowzcode-work/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-explore/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-fix/SKILL.md                 (discoverable skill)
  .gemini/skills/knowzcode-audit/SKILL.md               (discoverable skill)
  .gemini/skills/knowzcode-continue/SKILL.md            (discoverable skill)
  .gemini/skills/knowzcode-setup/SKILL.md                (discoverable skill)
  .gemini/skills/knowzcode-status/SKILL.md              (discoverable skill)
  .gemini/skills/knowzcode-telemetry/SKILL.md           (discoverable skill)
  .gemini/skills/knowzcode-telemetry-setup/SKILL.md     (discoverable skill)
  .gemini/agents/knowzcode-*.md (14 subagents)          (experimental — if opted in)

MCP: [Configured (.gemini/settings.json) | Not configured — run /knowz setup later]

Tip: Run `npx @knowzai/knowzcode install --platforms gemini --global` to install
skills globally to ~/.gemini/skills/ (available in all projects).
```

## Copilot Success Message

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
