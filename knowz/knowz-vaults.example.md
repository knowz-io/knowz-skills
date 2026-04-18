# Knowz Vaults

Connected vaults for this project.

---

## Vaults

### Engineering Knowledge
- **ID**: <vault-id-from-server>
- **Description**: Architecture decisions, code patterns, conventions, and technical learnings.
- **When to query**:
  - Before making architecture or design decisions
  - When asking about past decisions, conventions, or "why did we..."
  - When looking for code patterns or "how did we build..."
  - When checking for best practices or standards
  - When resuming prior work and you need a saved session handoff or resume context
- **When to save**:
  - A decision is made about architecture, tooling, or approach
  - A useful code pattern is discovered or created
  - A workaround for a limitation is found
  - A convention or standard is established
  - Before clearing context on substantial in-progress work or research that should resume later
- **Content template**:
  ```
  [CONTEXT] {Where/why this arose — component, technology, problem}
  [INSIGHT] {The knowledge — detailed, self-contained, actionable}
  [RATIONALE] {Why this approach, alternatives considered}
  [TAGS] {category, technology, domain keywords}
  ```

---

## Defaults

- **Default vault**: Engineering Knowledge
- **Content principle**: Every saved item must be self-contained and detailed
  enough to be useful when retrieved via semantic search months later.
  Include reasoning, technology names, code examples, and file paths.
  Resume handoffs should also preserve the goal, mode, autonomy preference when
  relevant, next steps, and the most helpful references.
