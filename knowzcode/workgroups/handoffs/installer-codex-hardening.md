## Phase

2A

## Status

complete

## Owned Files

- `knowzcode/bin/knowzcode.mjs`
- `knowzcode/knowzcode/platform_adapters.md`
- `plugins/knowzcode/knowzcode/platform_adapters.md`
- `plugins/knowzcode/skills/setup/SKILL.md`
- `plugins/knowzcode/skills/status/SKILL.md`
- `plugins/knowzcode/skills/work/SKILL.md`
- `plugins/knowzcode/skills/work/references/relay-execution.md`
- `scripts/sync-codex-relay-surfaces.mjs`
- `scripts/validate-platform-surfaces.mjs`

## Findings

- Added explicit Codex and Claude ownership manifests. Install, upgrade, plugin-takeover cleanup, and uninstall now preserve unowned same-name entries and all unrelated `kc-*`/`knowzcode-*` entries.
- Unmanaged `AGENTS.md` is preserved and no longer counts as an installed KnowzCode adapter. Legacy generated markers can migrate safely to the new manifest.
- Local operations never target HOME, reject project symlink escapes, and snapshot tests cover local install, upgrade, and uninstall isolation.
- Install and upgrade preflight every generated adapter/framework destination used by these paths, including exact file-vs-directory collisions, malformed settings, ownership collisions, and symlinks before mutation.
- `upgrade --platforms ...` now scopes every platform refresh; Codex-only `--agent-teams` cannot mutate Claude components or settings.
- Global Codex lifecycle is isolated and deletes only manifest-owned stale entries. The global setup skill bootstraps another repository through `npx --yes knowzcode --target ...`.
- Generated Codex relay references resolve through `../knowzcode-work/...`; `fork_turns` guidance covers omitted/`"all"`, positive recent-history strings, `"none"`, inherited model/effort, and fallback.
- Canonical pending capture guidance uses project-root `knowz-pending.md`; `knowzcode/pending_captures.md` is migration input only.
- Claude adapter guidance reflects current `/subtask`, `/fork` Agent View fallback, depth-three nesting, plugin-vs-local custom-agent fields, ID-based `SendMessage` auto-resume, per-run Team approval, and targeted messages without broadcast.
- Independent review findings were reproduced and remediated: symlink escape, ignored upgrade scope, unowned Codex collision, unsafe Claude name-based cleanup, and late framework collision partial writes.
- Canonical Claude plugin sources now retain `knowzcode:<role>`, `knowz:<reader|writer>`, and `/knowzcode:<skill>` identifiers; npx-local copies rewrite KnowzCode-owned identifiers and slash commands to their bare local names.
- External Knowz roles are localized only when marker-verified local Knowz agent definitions are present and the Knowz marketplace plugin is not active. Same-name unrelated files do not trigger rewriting, and plugin preference keeps external roles scoped.
- Installer summaries advertise `/setup` and `/work` for local mode and `/knowzcode:*` only for plugin mode. Validation covers canonical plugin, local-only, Knowz-local, Knowz-plugin-preferred, and unowned same-name matrices.

## Blockers

- None.

## Verification

- `node --check knowzcode/bin/knowzcode.mjs`
- `node --check scripts/sync-codex-relay-surfaces.mjs`
- `node --check scripts/validate-platform-surfaces.mjs`
- `node scripts/sync-codex-relay-surfaces.mjs --check`
- `node scripts/validate-platform-surfaces.mjs`
- `npm run test:contracts --prefix knowzcode` (28/28 passing)
- `npm pack --dry-run` from `knowzcode/`
- `git diff --check` on the owned surfaces
