# Explore Research Dispatch

Load only the route and role selected by `/knowzcode:explore`. Referenced agent definitions load automatically. Every packet includes the topic, exact evidence question, bounded read paths, validated context mode/capsule, and a bounded summary contract. Artifact paths require authorized persistence.

## Named-agent route

Start with one `analyst`. Add only the distinct evidence roles that the lead selected:

- `knowledge-liaison`: answer one targeted local/vault question, reuse the lead baseline, preserve KnowledgeId/source dates/conflicts, and skip broad duplicate queries.
- `architect`: answer a concrete boundary/design/pattern-fit question.
- `reviewer`: answer a concrete security, performance, or quality-risk question.

Exploration-mode packets have a ten-tool-call default and return concise findings. Planning-mode packets may additionally return a preliminary Change Set, dependency map, recommended design/rejected alternatives, spec-consolidation opportunities, or risk assessment. Do not launch a fixed roster.

Example packet:

> **Topic**: {topic}
> **Evidence question**: {one exact question}
> **Read paths**: {minimum exact paths}
> **Mode**: exploration | planning
> **Context**: {validated capsule/baseline summary}
> Return bounded findings with file:line evidence, risks, and next input. Use an artifact only when separately authorized.

## Coordinated-team route

Use only when Agent Teams is explicitly configured/callable and at least two active researchers must share a task graph or directly message/challenge peers. Create and pre-assign tasks only for selected evidence slices. Include the task ID in each prompt; each teammate claims and completes only its assigned ID. The first teammate spawn forms the session-derived team.

The analyst remains the baseline. Liaison, architect, and reviewer are conditional, not a fixed roster. The liaison sends one concise briefing only to peers that need it. Wait for selected slices, request graceful release, and rely on runtime-managed cleanup. If the capability is unavailable, use equivalent named agents without changing research criteria.
