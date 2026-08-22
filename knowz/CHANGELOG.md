# Changelog

All notable changes to Knowz and the `knowz-mcp` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.11.0] - 2026-08-22

### Changed

- The npm package is now published as **`@knowzai/mcp`**, alongside `@knowzai/cli` in the `@knowzai` scope. Install with `npx @knowzai/mcp install`. The previous unscoped `knowz-mcp` package stops receiving updates at 0.10.1.
- The executable is still named `knowz-mcp`, so the `knowz` command continues to belong to the Knowz CLI.

## [0.10.1] - 2026-08-21

### Fixed

- Generated Gemini commands, skills, and adapters are now written with LF line endings regardless of how the package was built. Previous releases built on Windows shipped CRLF content, which stopped KnowzCode from recognizing a Knowz Gemini installation and claiming shared custody of the `mcpServers.knowz` entry.
- Ownership checks on installed Gemini commands tolerate CRLF so installs from earlier releases are still recognized.

## [0.10.0] - 2026-08-14

### Added

- A `knowz-cli` skill covering the full `@knowzai/cli` command surface — knowledge, vaults, search, chat, local indexing, agent memory, sync, backup, CMEK, and the portable platform. It is generated from the CLI's own oclif manifest, so the inventory cannot drift from the commands that actually ship.

### Changed

- The `knowz` skill now checks whether the `knowz` CLI is on PATH and prefers it for knowledge operations. With no CLI installed, every MCP step behaves exactly as before.

## [0.9.0] - 2026-08-02

### Added

- Exact per-product ownership manifests for generated skills, adapters, settings, and shared Gemini MCP configuration.
- A canonical project-root `knowz-pending.md` queue with deterministic mutation identities and idempotent replay guidance.
- Product-specific active-install evidence and digest claims for safely sharing Gemini's `mcpServers.knowz` entry with KnowzCode.

### Changed

- Install, upgrade, and uninstall now preflight containment, file shape, symlink ancestry, settings structure, ownership collisions, and shared-custody state before mutation.
- Vault readers treat stored knowledge as prior context to verify against current code, tests, and documentation; writers use bounded, operation-specific mutation plans.
- Published npm binary paths use npm's canonical package-relative form so publication does not rewrite the manifest.

### Fixed

- Unmanaged skills, adapters, settings, MCP entries, and credentials are preserved across install and uninstall flows.
- Interrupted or stale peer ownership evidence no longer leaves an orphaned shared Gemini entry or credential, regardless of uninstall order.
- Missing, replaced, leaf-symlinked, and ancestor-symlinked ownership evidence now fails closed without mutating unowned state.
