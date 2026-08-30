---
description: Commit on develop, PR to main, merge, tag per-plugin, mirror knowz/ to its standalone repo
---

# Deploy Release (Monorepo)

Deploy the current version: commit all changes on develop, push, create PR to main, merge, tag per-plugin, and return to develop.

## Instructions

### 1. Pre-flight checks

- **Verify branch**: Run `git branch --show-current`. If not on `develop`, stop: "Deploy must be run from the `develop` branch. Currently on `{branch}`."
- **Read versions**: Read `.claude-plugin/marketplace.json` and extract plugin names + versions.
- **Check working tree**: Run `git status` to see uncommitted changes.
- **Check remote sync**: Verify the branch is not behind the remote.
- **Detect changed plugins**: For each plugin, check if its version differs from the latest tag:
  - Look for tag `{plugin}/v{version}` — if it doesn't exist, this plugin has a new version to release
  - Also check `git diff origin/main..HEAD -- {source}/` for changes
- **Check root-level changes**: Also check `git diff origin/main..HEAD -- .claude-plugin/ README.md .gitignore` for changes to root files that should be included in the release commit (these aren't plugin-specific but still need to ship).
- If no changes and working tree is clean: stop: "Nothing to deploy — working tree is clean and no new versions to release."

### 2. Commit all changes on develop

- Stage all modified/untracked files relevant to the release using `git add`.
- Build the commit message based on which plugins have new versions:
  - Single plugin: `chore: release {plugin} v{version}`
  - Multiple plugins: `chore: release knowzcode v{version}, knowz v{version}`
- Commit and show the summary via `git log -1 --stat`.

### 3. Push develop

- Push develop to origin: `git push origin develop`
- If push fails, stop and show the error.

### 4. Create PR develop → main

- For each changed plugin that has a `CHANGELOG.md`, extract the latest version section: read the file, find the `## [{version}]` section, capture everything until the next `## [` line.
- Create a PR using `gh pr create`:
  - Base: `main`
  - Head: `develop`
  - Title (single plugin): `Release: {plugin} v{version}`
  - Title (multiple): `Release: knowzcode v{version}, knowz v{version}`
  - Body: Combined changelog sections, each under a `## {plugin}` header. If no changelog exists for a plugin, list the commits instead.
- Show the PR URL to the user.

### 5. Merge the PR

- Ask the user for confirmation: "Ready to merge PR #{number} into main. Proceed?"
- On confirmation, merge with: `gh pr merge --merge`
- If merge fails, stop and show the error.

### 6. Tag the release

- Switch to main and pull: `git checkout main && git pull origin main`
- For each changed plugin, create a per-plugin tag:
  - `git tag {plugin}/v{version}` (e.g., `knowzcode/v0.7.4`, `knowz/v0.2.1`)
- Push all tags: `git push origin --tags`

### 7. Mirror `knowz/` to the standalone repo (knowz releases only)

**Run this step only when `knowz` is among the plugins released this run** (from the changed-plugin detection in Step 1). Skip it entirely for knowzcode-only releases.

`knowz-io/knowz` is a **public mirror** of the `knowz/` subtree — the standalone distribution of the knowz plugin. It holds no independent commits, so the force-push is intentional and safe. Run this from `main` (you're already there after Step 6) so the mirror reflects the released, tagged commit.

- Confirm with the user before pushing to the external public repo: "Mirror knowz/ → github.com/knowz-io/knowz (force-push to main). Proceed?"
- On confirmation, run:

```bash
# Split the knowz/ subtree so its contents become the repo root, then mirror it.
# (If _knowz_split exists from a failed prior run, delete it first: git branch -D _knowz_split)
git subtree split --prefix=knowz -b _knowz_split
git push --force https://github.com/knowz-io/knowz.git _knowz_split:main
git branch -D _knowz_split
```

- Mirrors **only** `knowz/` — `knowzcode/` and the marketplace stay out of the standalone repo.
- The split places `knowz/`'s contents at the **root** of `knowz-io/knowz`, which is what npm and standalone consumers expect.
- First run populates the (currently empty) repo; later runs keep it in sync.
- This is a git-only operation, independent of `npm publish` ordering.

### 8. Return to develop

- Switch back to develop and pull: `git checkout develop && git pull origin develop`

### 9. Summary

Print a release summary:

```
Release deployed successfully.

  Plugins released:
    {plugin}: v{version} (tag: {plugin}/v{version})
    ...

  PR:      {PR URL}
  Branch:  main
  Mirror:  github.com/knowz-io/knowz (knowz subtree force-pushed to main) — only if knowz was released

Next steps:
  1. npm publish (knowz / knowzcode, if applicable)
  2. Verify tags: git tag -l
  3. If knowz was released: verify github.com/knowz-io/knowz reflects knowz/ at its root
```
