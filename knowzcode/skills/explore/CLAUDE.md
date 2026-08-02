# explore — Claude Operational Rules

Research and planning workflow for codebase investigation, architecture options, and implementation preparation.

Classify Exploration versus Planning and identify the minimum evidence slices before broad vault queries or agent dispatch. Start with deterministic local search and one analyst. Add architect, reviewer, knowledge-liaison, or scanner only for a material independent question. Named agents automatically receive their definitions; prompts contain scoped questions and a bounded result contract.

Prefer local work, compatible resume, a real conversation fork only for high context affinity, then a fresh capsule. A skill with `context: fork` does not inherit the active chat. Use a coordinated team only when active researchers must share tasks or message/challenge peers. If unavailable, named agents provide the same research quality; no degradation warning is warranted.

When context efficiency is enabled, call the read-only `context_efficiency_runtime.mjs` stdin CLI for each non-trivial dispatch, direct capsule/privacy and lineage checks, and result-policy selection. Rollout controls only adaptive recommendation application and redacted telemetry. Safety validation is fail-closed and is never skipped through `CAPABILITY_FALLBACK`.

Probe MCP only for a named prior-decision/policy question or an explicit save. Reuse a relevant lead baseline and perform only targeted follow-ups; never query every vault for generic coverage. Exploration results are bounded inline summaries; planning results go to `knowzcode/planning/{slug}.md`, with raw evidence in artifacts only when material. Load `references/research-dispatch.md` only for the selected non-local route. Gracefully release workers after synthesis; Team cleanup is runtime-managed.
