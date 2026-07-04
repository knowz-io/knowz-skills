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
- **When to save**:
  - A decision is made about architecture, tooling, or approach
  - A useful code pattern is discovered or created
  - A workaround for a limitation is found
  - A convention or standard is established
  - When durable learnings are extracted from substantial in-progress work or research
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
  Workflow handoffs belong in KnowzCode local files; vault entries should capture
  durable decisions, patterns, workarounds, conventions, and architecture findings.

---

## Trust & Freshness

Vault entries are point-in-time notes. They can be **stale, superseded, or wrong** if the
project moved on since they were saved. Treat retrieved knowledge as **leads to verify,
not ground truth**:

- Before acting on a vault entry, check it against the live codebase, tests, current
  docs, and the user's stated intent. The live source wins.
- When an entry conflicts with what you observe now, **prefer the current reality and
  surface the conflict** — don't silently follow the vault.
- Weigh an entry's age when it's decision-relevant; a recent change outranks an old note.
- This is guidance for *consuming* knowledge — it doesn't discourage saving. Save durable
  learnings freely (see Defaults), just don't treat what you read back as automatically true.
