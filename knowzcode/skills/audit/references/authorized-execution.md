# Authorized Audit Execution

Load this reference only after the user explicitly authorizes runtime writes for an audit. That authorization permits normally permission-gated agent, Team/task-state, or test execution only; it does not authorize any report, artifact, log, WorkGroup/tracker/settings, or vault persistence.

## Common reviewer packet

Every reviewer receives only:

- audit type and exact slice;
- minimum exact read paths and applicable specs/guidelines;
- checkpoint and evidence/tool-call budget;
- a fresh reviewer capsule for a new independent audit, or its own compatible lineage for re-audit;
- bounded output: status, scored findings, severity, file:line/test evidence, unresolved risks, and remaining work.

Agent definitions load automatically. Resolve `MODEL_FOR(agent_name, PROFILE)` and the advisor-guidance placeholder immediately before dispatch. Never give a reviewer builder lineage. Artifact output still requires separate artifact persistence authorization.

## Named-agent route

Do not form a team for one reviewer. Run locally when smaller; otherwise dispatch one fresh `reviewer` for a specific audit or independent reviewers for these disjoint full-audit slices:

1. specification quality plus architecture health;
2. security plus integration;
3. compliance only when explicitly requested or enabled by the manifest.

Add one `knowledge-liaison` only for a recorded material vault-backed evidence question. Add `security-officer` or `test-advisor` only when enabled by `--specialists`, `--specialists=...`, or project defaults. `--no-specialists` clears them. Wait for bounded results and release lineage unless a compatible same-scope re-audit is likely inside its lease.

Example reviewer prompt:

> **Audit scope**: {exact type and slice}
> **Read paths**: {minimum exact paths}
> **Applicable specs/guidelines**: {exact paths or none}
> **Checkpoint**: {checkpoint}
> **Evidence budget**: {bounded budget}
> Return scored findings, severity, file:line/test evidence, unresolved risks, and remaining work.
> {advisor_guidance}

## Coordinated-team route

Use only when Agent Teams is explicitly configured/callable and at least two active reviewers/officers must directly challenge peers or coordinate a shared task graph. The first teammate spawn forms the session-derived team.

Create and pre-assign one task per selected disjoint slice, include the task ID in its scoped prompt, and require the owner to claim and complete only that ID. Team coordination tools are for decision-relevant messages only. A single reviewer never forms a team. Wait for every selected result, request graceful release, and rely on runtime-managed cleanup.

## Authorized tests

Before each test command, state that it may write caches, coverage, snapshots, or generated output and confirm it falls within the explicit runtime-write authorization. Run the narrowest relevant command with normal permission checks. Do not redirect output or persist an artifact unless separately authorized. A test command never grants permission to edit source, settings, reports, logs, WorkGroups, trackers, or vaults.
