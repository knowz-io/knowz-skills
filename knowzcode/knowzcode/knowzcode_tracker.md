# KnowzCode - Status Map

**Purpose:** This document tracks the development status of all implementable components (NodeIDs) defined in `knowzcode_architecture.md`.

---
**Progress: 100%**
---

| Status | WorkGroupID | Node ID | Label | Dependencies | Logical Grouping | Spec Link | Classification | Notes / Issues |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 🟢 `[VERIFIED]` | kc-fix-server-side-summary-20260418-132817 | ServerSideSummary | Platform-owned summary generation (groundedness, indexing-state, refresh) | None | Platform contracts | [ServerSideSummary.md](specs/ServerSideSummary.md) | Spec / Draft | Platform-side fix required; spec documents contract for platform team |
| 🟢 `[VERIFIED]` | — | ContextEfficientOrchestration | Shared context-affinity routing, capsules, lineage, telemetry, and efficiency policy | None | Orchestration | [ContextEfficientOrchestration.md](specs/ContextEfficientOrchestration.md) | Complex | 14/14 criteria passed; rollout remains off pending measured paired evidence |
| 🟢 `[VERIFIED]` | — | ClaudeRuntimeCompatibility | Modern Claude forks, resumes, teams, permissions, cache, and relay semantics | ContextEfficientOrchestration | Platform adapters | [ClaudeRuntimeCompatibility.md](specs/ClaudeRuntimeCompatibility.md) | Critical | 14/14 criteria passed; current lifecycle and install safety verified |
| 🟢 `[VERIFIED]` | — | CodexRuntimeParity | Canonical Codex execution contract and install/runtime parity | ContextEfficientOrchestration | Platform adapters | [CodexRuntimeParity.md](specs/CodexRuntimeParity.md) | Critical | 13/13 criteria passed; npm/plugin/install/upgrade parity verified |

---
### Status Legend:

*   ⚪️ **`[TODO]`**: Task is defined and ready to be picked up if dependencies are met.
*   📝 **`[NEEDS_SPEC]`**: Node has been identified but requires a detailed specification.
*   ◆ **`[WIP]`**: Work In Progress. The KnowzCode AI Agent is currently working on this node.
*   🟢 **`[VERIFIED]`**: Node has been implemented and verified.
*   ❗ **`[ISSUE]`**: A significant issue or blocker has been identified.

---
*(This table will be populated as you define your architecture and NodeIDs.)*
