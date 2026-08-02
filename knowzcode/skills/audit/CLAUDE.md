# audit — Claude Operational Rules

Strictly zero-write spec, architecture, security, integration, and compliance audit.

Classify the requested audit and evidence slices before any vault query. Default to local sequential `Read`/`Glob`/`Grep` only: no Bash, tests, agents, Team/task state, or filesystem persistence. Runtime-write authorization and persistence authorization are separate; neither implies the other.

Only after explicit runtime-write authorization may the audit resume a compatible reviewer lineage, dispatch fresh independent named reviewers with scoped capsules, run a write-capable test, or form a coordinated team when reviewers must challenge/message peers. Those tools remain normally permission-gated. A single reviewer never forms a team; the first eligible teammate spawn forms it and runtime cleanup is automatic.

Claude automatically loads each referenced reviewer/officer definition. Spawn prompts contain only audit scope, read paths, applicable specifications/guidelines, checkpoint, evidence budget, and bounded result contract. Default output is a bounded chat result; artifacts, logs, WorkGroup updates, and vault writes require explicit persistence authorization.

After runtime-write authorization, full audit slices may run in parallel when independently useful: spec+architecture, security+integration, and compliance. Specialists are evidence-driven. A single reviewer never forms a team. Preserve zero-write behavior, HIGH/CRITICAL security blocks, blocking compliance rules, profile model routing, and explicitly authorized persistence in every mode.
