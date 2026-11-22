# KnowzCode Automation Manifest

This manifest describes the resources that support the KnowzCode workflow. Skills and agents ship in the installed KnowzCode plugin; hosts without named agents run the same phases inline.

## Skills

Each skill is invoked by name. Claude Code and Gemini CLI use the `/knowzcode:<name>` form; other hosts list the same skills without the prefix.

| Skill | Purpose |
| --- | --- |
| `work` | Feature workflow with TDD, quality gates, and structured phases |
| `explore` | Research and planning before implementing |
| `audit` | Read-only quality audits (spec, architecture, security, integration, compliance) |
| `fix` | Targeted single-file micro-fix |
| `setup` | Initialize KnowzCode in a project and generate platform adapters |
| `status` | Framework health, agent availability, MCP and vault summary |
| `continue` | Resume an active WorkGroup or the latest handoff |
| `regroup` | Write a local handoff before clearing context |
| `relay` | Delegate implementation to the other supported coding agent |
| `telemetry` | Investigate production telemetry |
| `telemetry-setup` | Configure telemetry sources |
| `start-work` | Detect implementation intent and route to `work` |
| `regroup-trigger` | Detect pause or hand-off intent and offer `regroup` |

Vault commands (`/knowz setup`, `/knowz save`, `/knowz register`) come from the separate Knowz plugin.

## Agents

| Agent | Phase | Description |
| --- | --- | --- |
| `analyst` | 1A | Impact analysis and Change Set proposals |
| `architect` | 1B | Specification drafting and architecture review |
| `builder` | 2A | TDD implementation and verification loops |
| `reviewer` | 2B | Quality audit, security review, compliance |
| `smoke-tester` | 2B | Runtime smoke testing |
| `closer` | 3 | Finalization — specs, journal shard, architecture, learning capture |
| `knowledge-liaison` | 0–3 | On-demand context and vault capture |
| `security-officer` | 0–3 | Threat modeling and vulnerability scanning (opt-in) |
| `test-advisor` | 0–3 | TDD enforcement and test quality (opt-in) |
| `project-advisor` | 0–2 | Backlog curation and idea capture (opt-in) |
| `frontend-designer` | 0–3 | Design questions, mockups, and UI verification (UI projects) |
| `enterprise-enforcer` | 0–3 | Compliance guideline mapping and gate blocking (when compliance is enabled) |
| `microfix-specialist` | - | Scope-gated quick fixes |
| `relay-runner` | 2A | Monitors one external-agent relay leg |
| `knowledge-migrator` | - | External knowledge import |
| `update-coordinator` | - | Framework self-update |

## State Files

The authoritative state:
- `knowzcode/journal/` — immutable shards, one per work event; the operational record. A WorkGroup is in flight until its folder gains an `arc-completion` or `workgroup-abandoned` shard. Never edit a shard, never maintain an index file.
- `knowzcode/specs/` — NodeID specifications and as-built node status
- `knowzcode/workgroups/` — session todo queues (local, gitignored)
- `knowzcode/knowzcode_architecture.md` — architecture documentation

Frozen archives, never written to:
- `knowzcode/knowzcode_tracker.md` — pre-journal backlog and node status
- `knowzcode/knowzcode_log.md` — pre-journal operational history
