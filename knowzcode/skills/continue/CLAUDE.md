# continue — Claude Operational Rules

Resume an active WorkGroup or explicit/latest local handoff without creating a new workflow.

Restore the selected handoff/active WorkGroup and current phase first. Load only current-phase specs, checkpoint, capsule, relevant config keys, and lineage records; do not reload completed phase or unrelated framework history. For each outstanding unit, validate role, scope, spec, checkpoint, model/effort, tools, permissions, sensitivity, lease, and transcript availability. Resume a compatible named agent with a bounded delta; otherwise record the invalidation and cold-start from the capsule. Explore/Plan built-ins and prior in-process teammates are not resumable.

Reconstruct a coordinated team only when the remaining peers still require shared tasks or direct messaging and the capability is configured/callable. The first teammate spawn forms a new session-derived team; do not recreate caller-owned team identity. Otherwise continue with named agents without reducing gates, TDD, compliance, or capture.

Relay state remains provider-authoritative. Preserve recorded host/target/cwd/session and use the strict provider resume/takeover protocol. Never map native conversation forks or Agent Teams into strict relay.
