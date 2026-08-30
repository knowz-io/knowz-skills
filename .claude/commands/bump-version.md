---
description: Bump versions across changed plugins (plugin.json, package.json, CHANGELOG, marketplace.json)
---

# Bump Plugin Versions (Monorepo)

Bump versions across all changed plugins in the knowz-skills monorepo.

**Arguments**: $ARGUMENTS

## Instructions

### 1. Discover plugins

Read `.claude-plugin/marketplace.json` at the repo root. Extract the `plugins` array — each entry has `name`, `source`, and `version`.

### 2. Detect which plugins have changes

For each plugin:

1. Determine the last release tag: `{name}/v{version}` (e.g., `knowzcode/v0.7.4`)
2. Check if the tag exists: `git tag -l "{name}/v{version}"`
3. If the tag exists, check for changes: `git diff {name}/v{version}..HEAD -- {source}/`
4. If the tag does NOT exist, treat all files as changed (first tagged release)
5. Collect the list of plugins with changes

If no plugins have changes, stop: "No plugins have changes since their last release."

### 3. Ask user which plugins to bump

Show the user which plugins have changes and ask which ones to bump. If `$ARGUMENTS` specifies a plugin name and/or version, use that instead of asking.

For each plugin being bumped, ask the bump type (patch/minor/major) using AskUserQuestion:

```
AskUserQuestion:
  question: "What type of version bump for {plugin}? Current version is {version}."
  header: "{plugin} Version"
  options:
    - label: "Patch ({version} → X.Y.Z+1)"
      description: "Bug fixes, minor tweaks"
    - label: "Minor ({version} → X.Y+1.0)"
      description: "New features, non-breaking changes"
    - label: "Major ({version} → X+1.0.0)"
      description: "Breaking changes"
  multiSelect: false
```

Compute the actual version numbers. Normalize any `v` prefix (strip it — files store bare semver). Validate semver and that the new version is strictly higher.

### 4. Apply version updates per-plugin

For each plugin being bumped, update all files that contain the version. Use the OLD version (from marketplace.json) as the search string.

**Always update:**
- `{source}/.claude-plugin/plugin.json` — `"version": "OLD"` → `"version": "NEW"`

**Update if the file exists** (read each file before editing):
- `{source}/package.json` — `"version": "OLD"` → `"version": "NEW"`
- `{source}/README.md` — `version-OLD-blue` → `version-NEW-blue`
- `{source}/skills/*.json` — `"version": "OLD"` → `"version": "NEW"` (glob and edit each)
- `{source}/.knowzcode-version` — replace entire contents with NEW
- `{source}/CHANGELOG.md` — see Step 5 below

**Important**: `bin/knowzcode.mjs` reads its version from `package.json` at runtime and does not need a manual update.

### 5. Update CHANGELOG.md (if it exists for the plugin)

#### 5a. Gather commits

Determine the git tag for the OLD version: `{plugin}/vOLD`. If the tag doesn't exist, try `vOLD`, then fall back to `--all`.

```bash
git log {tag}..HEAD --pretty=format:"%h %s" --no-merges -- {source}/
```

#### 5b. Classify commits

Read the existing `CHANGELOG.md` to understand tone/style. Classify each commit:

| Category | Keywords |
|----------|----------|
| **Added** | add, new, introduce, create, implement, support |
| **Changed** | update, change, rename, move, refactor, replace, improve, adjust, simplify |
| **Fixed** | fix, correct, patch, resolve, repair, handle |
| **Removed** | remove, delete, drop, deprecate, strip |

**Exclude from changelog:**
- Version bump commits
- Changes to gitignored files, local config, IDE settings
- Changes to files outside the published package
- Sensitive content (API keys, internal URLs)
- Pure formatting/whitespace commits

#### 5c. Write entries

- Lead with what changed, not how
- Use past tense consistent with existing entries
- Group related commits into single bullets
- Omit file paths (prefer component names)

#### 5d. Insert new section

After the `## [Unreleased]` line, insert:

```
## [NEW] - YYYY-MM-DD

### Added
- (entries)

### Changed
- (entries)
```

Only include category sections that have entries.

#### 5e. Confirm with user

Show the drafted changelog section. Ask the user to confirm or edit before writing.

### 6. Update root marketplace.json

For each bumped plugin, update its `"version"` in `.claude-plugin/marketplace.json`.

### 7. Verify plugin manifest

For each bumped plugin, read `{source}/.claude-plugin/plugin.json` and verify:

1. **Agents**: Glob `{source}/agents/*.md` — every file should have a corresponding entry in the `"agents"` array
2. **Skills**: Glob `{source}/skills/*/SKILL.md` — every file should have a corresponding entry in the `"skills"` array

If mismatches found, show user and fix.

### 8. Sweep for missed versions

For each bumped plugin, grep the plugin's source directory for the OLD version string:

```
Grep pattern: "OLD"
Path: {source}/
```

Exclude: `CHANGELOG.md`, `node_modules/`, `.git/`, command files (`.claude/commands/`)

If unexpected matches found, show the user and ask whether to update.

### 9. Show summary

Print a summary table:
- Each file updated per plugin
- Old version → New version
- Total files updated
- Whether sweep found remaining occurrences
- Whether manifest changes were made

### 10. Remind about next steps

```
Next steps:
1. Review the CHANGELOG.md entries
2. Run /deploy to commit, push, and create release PR
```
