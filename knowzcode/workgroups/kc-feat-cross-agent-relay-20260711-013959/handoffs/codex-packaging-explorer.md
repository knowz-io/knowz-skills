## Phase

1A

## Status

complete

## Owned Files

- Read: `plugins/knowzcode/**`
- Read: `knowzcode/knowzcode/platform_adapters.md`
- Read: `knowzcode/bin/knowzcode.mjs`
- Read: `.agents/plugins/marketplace.json`
- Read: `knowzcode/.gemini/**`, `knowzcode/package.json`, `knowzcode/DEV_GUIDE.md`, and `scripts/validate-platform-surfaces.mjs` for mirror/validation evidence
- Written: `knowzcode/workgroups/kc-feat-cross-agent-relay-20260711-013959/handoffs/codex-packaging-explorer.md`

## Findings

### Codex has two independent delivery paths

1. **Codex marketplace plugin.** `.agents/plugins/marketplace.json` only points at `./plugins/knowzcode`; the plugin manifest then exposes the whole `./skills/` directory (`.agents/plugins/marketplace.json:7-17`, `plugins/knowzcode/.codex-plugin/plugin.json:24-28`). Adding a top-level `plugins/knowzcode/skills/relay/SKILL.md` and a nested `plugins/knowzcode/skills/work/references/relay-execution.md` therefore requires no marketplace schema change. Codex skills officially support colocated `references/` and optional `scripts/`; the existing plugin should keep relay orchestration in skill/reference content rather than inventing another package type.

2. **`npx knowzcode --platforms codex`.** This path does not read `plugins/knowzcode/skills/`. It parses the OpenAI Codex section of `knowzcode/knowzcode/platform_adapters.md`, treating each file-like `####` heading as a generated file, then writes the primary `AGENTS.md` and every extracted file (`knowzcode/bin/knowzcode.mjs:550-570`, `knowzcode/bin/knowzcode.mjs:679-720`, `knowzcode/bin/knowzcode.mjs:1269-1333`). Consequently the Codex adapter must embed both `.agents/skills/knowzcode-relay/SKILL.md` and `.agents/skills/knowzcode-work/references/relay-execution.md`; nested reference paths already work without parser changes. Global installation also maps every `.agents/skills/` path under the user's home (`knowzcode/bin/knowzcode.mjs:1320-1329`).

3. **Mirrors are manually synchronized.** The declared rule is that `knowzcode/skills/` is canonical while the packaged Codex skills and both `platform_adapters.md` copies remain behaviorally aligned with platform-specific frontmatter allowed (`knowzcode/DEV_GUIDE.md:57-68`). There is no generator from source skills into `plugins/knowzcode/skills/`; `knowzcode/bin/knowzcode.mjs` only generates end-user adapters at install/upgrade time. The validator enforces byte equality for the two `platform_adapters.md` copies but not behavioral/content equality between source skills, packaged Codex skills, and embedded adapter skills (`scripts/validate-platform-surfaces.mjs:325-341`).

### Recommended Codex relay package shape

- Add a user/implicit entry skill at `plugins/knowzcode/skills/relay/SKILL.md` (`name: relay`) and the standalone generated equivalent `.agents/skills/knowzcode-relay/SKILL.md`. Its description must explicitly contain routing phrases such as **relay**, **Claude**, **other agent**, and **delegate implementation**, because Codex decides implicit activation from the frontmatter description before loading the body; the validator already recognizes this discovery rule for audit skills (`scripts/validate-platform-surfaces.mjs:483-501`).
- Put target resolution and the Codex-to-Claude transport in `plugins/knowzcode/skills/work/SKILL.md` plus `plugins/knowzcode/skills/work/references/relay-execution.md`. The entry skill should only detect/setup/persist and redirect to work, matching the existing source relay separation (`knowzcode/skills/relay/SKILL.md:8-18`, `knowzcode/skills/relay/SKILL.md:61-79`).
- Do **not** add `plugins/knowzcode/agents/relay-runner.md` or `.agents/agents/*`. The Codex package deliberately has no active Claude-style agents, the validator forbids that directory, and the adapter explicitly says agent definitions are unsupported (`scripts/validate-platform-surfaces.mjs:292-295`, `knowzcode/knowzcode/platform_adapters.md:691-697`). Codex should launch and poll the headless Claude CLI from its coordinator/terminal primitive, with state persisted under the WorkGroup relay directory so status/continue can recover it.
- Update `plugins/knowzcode/skills/start-work/SKILL.md` to preserve unambiguous natural-language relay intent in its `flags` payload rather than dropping it when the generic implementation router wins; that router currently forwards only generic flags and always hands off to work (`plugins/knowzcode/skills/start-work/SKILL.md:13-31`).
- Update `plugins/knowzcode/skills/status/SKILL.md` and `plugins/knowzcode/skills/continue/SKILL.md`: neither currently reads relay configuration/state or reports external-agent availability (`plugins/knowzcode/skills/status/SKILL.md:13-18`, `plugins/knowzcode/skills/continue/SKILL.md:13-27`).
- Update `plugins/knowzcode/knowzcode/codex_execution.md` with the Codex-host relay exception: native subagents remain the default, but a resolved external Claude implementation leg is a subprocess transport, not an attempted simulation of Claude Agent Teams (`plugins/knowzcode/knowzcode/codex_execution.md:9-31`, `plugins/knowzcode/knowzcode/codex_execution.md:170-177`).

### Existing contradictions and validation gaps

- The shipped orchestration template explicitly says relay is Claude-only and inert on Codex/Gemini, and only documents `relay: none|codex` plus Codex-specific model/sandbox keys (`plugins/knowzcode/knowzcode/knowzcode_orchestration.md:102-154`). Both source and plugin copies must be rewritten together.
- The packaged Codex work skill always enters native Phase 2A and has no resolution/preflight/state-machine hook (`plugins/knowzcode/skills/work/SKILL.md:30-44`).
- The validator currently codifies the old design: it requires the source Claude relay but explicitly forbids a Codex plugin relay and Gemini relay (`scripts/validate-platform-surfaces.mjs:296-323`). The Codex assertion must be inverted; the Gemini negative assertion should remain because this WorkGroup supports Claude and Codex hosts, not Gemini.
- The current validator passes even though the installed-template Codex work skill in `platform_adapters.md` is materially smaller/different from the marketplace plugin skill. It validates frontmatter, selected phrases, version comments, and a few named contracts, but never executes the adapter parser or compares generated output with the plugin (`scripts/validate-platform-surfaces.mjs:49-69`, `scripts/validate-platform-surfaces.mjs:369-413`, `scripts/validate-platform-surfaces.mjs:540-559`).
- Add a generator smoke test to `scripts/validate-platform-surfaces.mjs`: install Codex into a temporary target with `--force`, then assert generated `AGENTS.md`, `knowzcode-relay/SKILL.md`, the nested relay reference, and version injection. Static `platform_adapters.md` regex checks alone will not catch a malformed heading/fence that the parser silently skips (`knowzcode/bin/knowzcode.mjs:695-720`).
- The checked-in `knowzcode/.gemini/**` tree is not part of the npm package's `files` list (`knowzcode/package.json:9-15`) and is not a Codex source. Do not add a Gemini relay mirror for this feature. Gemini generation is independently parsed from `.gemini/*` headings (`knowzcode/bin/knowzcode.mjs:624-676`).

### Exact packaging files for Phase 2A

Required:

- `plugins/knowzcode/skills/relay/SKILL.md` — new Codex entry and implicit natural-language router.
- `plugins/knowzcode/skills/work/SKILL.md` — host/target resolution, intent precedence, relay Phase 2A/gap loop.
- `plugins/knowzcode/skills/work/references/relay-execution.md` — new provider-neutral/Codex-to-Claude transport and state protocol.
- `plugins/knowzcode/skills/start-work/SKILL.md` — preserve natural-language relay target in handoff.
- `plugins/knowzcode/skills/status/SKILL.md` — report resolved target, configuration, detection, and in-flight state.
- `plugins/knowzcode/skills/continue/SKILL.md` — resume an in-flight relay from state.
- `plugins/knowzcode/skills/init/SKILL.md` — mention/configure the supported external-agent option during setup or merge of older configs.
- `plugins/knowzcode/knowzcode/codex_execution.md` — Codex-side subprocess/polling guardrails.
- `knowzcode/knowzcode/platform_adapters.md` — canonical `npx` Codex templates for relay/work/start-work/status/continue plus nested reference.
- `plugins/knowzcode/knowzcode/platform_adapters.md` — exact byte mirror required by validation.
- `plugins/knowzcode/knowzcode/knowzcode_orchestration.md` — exact source-template mirror with provider-neutral target/config semantics.
- `scripts/validate-platform-surfaces.mjs` — reverse the Codex prohibition and add contract/generator assertions.

No functional change required:

- `knowzcode/bin/knowzcode.mjs` — its generic Codex heading parser and recursive path writer already support the new skill/reference. Change only if the team chooses to expose a dedicated adapter-render test/export API.
- `.agents/plugins/marketplace.json` — already points at the whole plugin.
- `plugins/knowzcode/.codex-plugin/plugin.json` — already exposes the whole skills directory; only update its text/version if this change is released as a new package version.
- `knowzcode/.gemini/**` — keep relay absent unless Gemini becomes an explicitly supported host later.

## Blockers

None for packaging. The implementation phase still needs an independently verified Claude CLI headless command/auth/resume contract; that transport detail belongs in the relay protocol work, not in a Codex agent-definition mirror.

## Next Phase Inputs

- Treat `knowzcode/skills/*` as semantic source, but implement a Codex-safe frontmatter/body mirror under `plugins/knowzcode/skills/*` and embed the standalone Codex version in both adapter files.
- Keep precedence identical across plugin and generated skills: explicit flag > unambiguous natural language > project config > `/relay` default to the other supported host > native Phase 2A fallback only for automatic/configured intent.
- Preserve the existing guardrail that an explicit target equal to the host is an error, never silently reversed.
- Keep Gemini's relay skill absent and keep `.agents/plugins/marketplace.json` unchanged.
- Verification must include the updated static validator plus a real temporary-target Codex adapter generation smoke test.
