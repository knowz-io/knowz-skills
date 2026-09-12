# Knowz CLI 0.5.0 skill delivery

The Knowz skills and MCP installer package 0.11.1 carries the independently released Knowz CLI 0.5.0 skill. Both Claude and Codex variants are copied byte-for-byte from the [CLI 0.5.0 release](https://github.com/knowz-io/knowz-cli/releases/tag/v0.5.0), built from source `4dc5ceccfaa12ac16829c8183c199731a9454b40`. The inventory describes 113 commands and requires the installed CLI version to match before use. CLI availability does not require starting a local runtime.

The provenance and local package-validation receipt is [knowz-cli-release-0.5.0.json](knowz-cli-release-0.5.0.json). Its manifest hash uses the CLI release generator's canonical serialization, `JSON.stringify(parsedManifest)`; skill asset hashes cover the exact file bytes. Package preparation and public npm publication are distinct actions.

The Claude source is `knowz/skills/knowz-cli/SKILL.md`. The Codex plugin source is `plugins/knowz/skills/knowz-cli/SKILL.md`; the identical Codex bytes also appear inside `knowz/platform_adapters.md`, from which both Codex and Gemini installations are generated. The CLI skill's provenance must stay at its own release version. Other Knowz skills retain the MCP package's generated-version comments.

## Verification

Download the Claude and Codex skill assets from the public release into an isolated directory. Check their hashes against the receipt, then run:

```bash
node scripts/validate-platform-surfaces.mjs
node scripts/validate-knowz-cli-release.mjs \
  --claude /absolute/path/knowz-cli-SKILL.md \
  --codex /absolute/path/knowz-cli-codex-SKILL.md
```

The release validator checks both source variants, matching release metadata and exact installation pins, then exercises real install, reinstall, upgrade, and uninstall commands for Claude, Codex, and Gemini. All projects and HOME/config directories are disposable; tests use a loopback MCP fixture and do not configure the operator's account. Installed ownership manifests must claim the CLI skill. Uninstall must remove that skill while retaining unrelated skills, MCP configuration, profiles, vault routing, and pending knowledge.

To repeat the same lifecycle against an actual npm-installed package, add:

```bash
--package-root /absolute/path/node_modules/@knowzai/mcp
```

The 0.11.1 candidate tarball was packed, installed using npm into a disposable prefix, and passed this complete lifecycle on macOS ARM64. This is installer/content evidence; it does not replace native CLI host acceptance or real MCP account integration.

The old repository content failed release comparison before import. The general platform validator then exposed its outdated assumption that every Codex skill came from the MCP generator. Its narrowly scoped CLI rule now verifies release metadata and Claude/Codex body parity; all other skills retain their existing generator-version checks. Both validation paths pass after the update.
