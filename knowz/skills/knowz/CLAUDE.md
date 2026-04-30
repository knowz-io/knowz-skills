# knowz skill — Operational Rules

This file documents the operational rules for the `/knowz` skill. It supplements `SKILL.md` with constraints that apply across all workflow phases and subagent dispatch.

## Workflow Phases

The `/knowz` skill executes in a fixed phase order on every invocation:

| Phase | Name | Always Runs? |
|-------|------|-------------|
| 0 | Vault file integration | Yes — parse `knowz-vaults.md` before any MCP call |
| 1 | MCP connectivity check | Yes — verify `mcp__knowz__list_vaults` is available |
| Action | Intent dispatch | Yes — route to ask / save / amend / search / browse / setup / status / register / flush |
| Post | Report results | Yes — always surface actionable next steps |

Phase 0 and Phase 1 are mandatory gates. If Phase 1 fails, stop and report — do not proceed to the action phase.

## Agent Dispatch

Agents (`knowledge-worker`, `reader`, `writer`) are dispatched as **`general-purpose` subagents that read the agent `.md` file at runtime**. They are NOT invoked via a `subagent_type` field.

Dispatch pattern:
1. Identify the agent file path relative to the plugin root (e.g. `agents/knowledge-worker.md`).
2. Invoke a `general-purpose` subagent, passing the agent file content (or its path for the subagent to read) as the system/context prompt.
3. Include a self-contained task prompt so the agent can operate without additional context from the parent conversation.

### When to Dispatch Each Agent

| Agent | Dispatch condition |
|-------|--------------------|
| `knowledge-worker` | User requests comprehensive multi-vault research, cross-vault synthesis, or batch capture of multiple insights — too complex for inline execution |
| `reader` | Another plugin (e.g. KnowzCode) needs vault research within its own pipeline; pass a self-contained query prompt |
| `writer` | Another plugin (e.g. KnowzCode at quality gates) needs to write to vaults within its own pipeline; pass a self-contained write prompt |

For single-query or single-save operations, execute inline — do not dispatch an agent for simple tasks.

### Agent Dispatch Constraints

- Pass a **self-contained prompt**: include vault IDs, query/save instructions, and expected output format. Agents have no access to parent conversation context.
- Do not dispatch more than **one agent per `/knowz` invocation** unless the user explicitly requests parallel vault operations.
- Agents write findings back to the caller via their output. Do not duplicate vault writes by also calling MCP tools inline after dispatch.

## File Safety Rules

- **Never overwrite `knowz-vaults.md`** without first reading it and presenting the proposed changes to the user.
- **Always check for `knowz-pending.md`** before performing a flush and confirm the operation when the queue is non-empty.
- Do not create or modify any file outside the project root and the plugin directory.
- `knowz-pending.md` is append-only for failed operations — remove entries only on confirmed successful flush.

## Output Path Conventions

- Vault configuration file: `{project-root}/knowz-vaults.md`
- Pending captures queue: `{project-root}/knowz-pending.md`
- Reference files (read-only during skill execution): `skills/knowz/references/*.md`
- Agent files (read by subagents at runtime): `agents/*.md`

## Constraints

- **Never auto-save** knowledge without explicit user confirmation.
- **Never auto-amend** an existing vault item without showing the target and proposed delta to the user first.
- **Never block the conversation** — if vault lookup fails, continue with the normal response. Vault operations are enhancement, not gate.
- **Zero-config mode is valid** — all actions work without `knowz-vaults.md`; just omit `vaultId` parameters and suggest setup at the end.
- **Enterprise config takes precedence** — if `enterprise.json` exists in the plugin root, use its `brand`, `mcp_endpoint`, and `api_endpoint` values over all defaults. The `--dev` flag is ignored when enterprise config is present.
- **Do not surface internal phase labels** to the user — present only results and actionable next steps.
- **MCP tool names** must always use the full `mcp__knowz__*` prefix (e.g. `mcp__knowz__ask_question`).
- **`amend_knowledge` vs `update_knowledge`**: use `amend_knowledge` for partial/targeted edits (delta only); use `update_knowledge` only for full replacements where the caller provides the complete new payload.
