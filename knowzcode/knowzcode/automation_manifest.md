# KnowzCode Automation Manifest

This manifest describes the resources that support the KnowzCode workflow.

## Commands

| Command | Purpose |
| --- | --- |
| `/knowzcode:work` | Start feature workflow with TDD, quality gates, and structured phases |
| `/knowzcode:explore` | Research and investigate using parallel agents before implementing |
| `/knowzcode:audit` | Run quality audits (spec, architecture, security, integration) |
| `/knowzcode:fix` | Execute targeted micro-fix workflow |
| `/knowzcode:setup` | Initialize KnowzCode in current project + generate platform adapters |
| `/knowzcode:telemetry` | Investigate production telemetry |
| `/knowzcode:telemetry-setup` | Configure telemetry sources |
| `/knowz setup` | Configure MCP server connection (knowz plugin) |
| `/knowz save` | Capture learning to vault (knowz plugin) |
| `/knowz register` | Register and configure MCP (knowz plugin) |
| `/knowzcode:status` | Check MCP and vault status |

## Agents

| Agent | Phase | Description |
| --- | --- | --- |
| `analyst` | 1A | Impact analysis and Change Set proposals |
| `architect` | 1B | Specification drafting and architecture review |
| `builder` | 2A | TDD implementation and verification loops |
| `reviewer` | 2B | Quality audit, security review, compliance |
| `closer` | 3 | Finalization — specs, tracker, log, architecture |
| `microfix-specialist` | - | Scope-gated quick fixes |
| `knowledge-migrator` | - | External knowledge import |
| `update-coordinator` | - | Framework self-update |

## Skills

| Skill | Purpose |
| --- | --- |
| `start-work` | Detect implementation intent and redirect to /knowzcode:work |
| `continue` | Detect continuation intent and resume active WorkGroup |
| `load-core-context` | Load project overview, architecture, tracker into memory |
| `generate-workgroup-id` | Produce WorkGroupID timestamps |
| `journal-shard-writer` | Create one immutable journal shard per work event |
| `spec-template` | Seed specs with 4-section template |
| `spec-quality-check` | Verify spec completeness |
| `journal-shard-frontmatter` | Structure required shard frontmatter |
| `architecture-diff` | Highlight differences between specs and architecture docs |
| `environment-guard` | Confirm environment context is complete |
| `journal-scan` | Derive in-flight WorkGroups and recent history from the journal tree |
| `alias-resolver` | Convert natural language to canonical KnowzCode values |
| `spec-validator` | Validate individual spec quality |

## State Files

The authoritative state:
- `knowzcode/journal/` — immutable shards, one per work event; the operational record. A WorkGroup is in flight until its folder gains an `arc-completion` or `workgroup-abandoned` shard. Never edit a shard, never maintain an index file.
- `knowzcode/specs/` — NodeID specifications and as-built node status
- `knowzcode/workgroups/` — session todo queues (local, gitignored)
- `knowzcode/knowzcode_architecture.md` — architecture documentation

Frozen archives, never written to:
- `knowzcode/knowzcode_tracker.md` — pre-journal backlog and node status
- `knowzcode/knowzcode_log.md` — pre-journal operational history
