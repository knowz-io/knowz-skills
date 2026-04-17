# Knowz Pending Captures

Queued knowledge operations waiting to be synced to vaults. Process with `/knowz flush`.

Each block has an **Operation** (`create`, `amend`, or `update`) and a **Payload**. Amend and update blocks also carry a **KnowledgeId** referencing the target vault item.

For backward compatibility, a block with no `Operation` field is treated as `create`, and a `Content:` field is treated as `Payload:`.

---

### 2026-03-14T10:30:00Z -- Decision: Use UTC for all timestamps
- **Operation**: create
- **Category**: Decision
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-auto
- **Payload**:
[CONTEXT] During API design discussion, team debated timezone handling across services.
[INSIGHT] All timestamps stored and transmitted in UTC. Convert to local time only at the UI layer. This eliminates timezone bugs in distributed systems and simplifies database queries.
[RATIONALE] Considered per-user timezone storage but UTC-everywhere is simpler and widely adopted.
[TAGS] decision, timezone, api-design, distributed-systems

---

### 2026-03-14T11:15:00Z -- Convention: Error response format for REST APIs
- **Operation**: create
- **Category**: Convention
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-skill
- **Payload**:
[CONTEXT] Standardizing error responses across all REST API endpoints.
[INSIGHT] All API errors return `{ "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": {} } }` with appropriate HTTP status codes. Never expose stack traces in production.
[RATIONALE] Consistent format makes client-side error handling predictable and simplifies debugging.
[TAGS] convention, rest-api, error-handling

---

### 2026-03-14T14:05:00Z -- Decision: Auth cookie policy (amend)
- **Operation**: amend
- **KnowledgeId**: 123e4567-e89b-12d3-a456-426614174000
- **Category**: Decision
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-auto
- **Payload**:
Add a caveat that SameSite=None requires Secure in production, and note that Safari still requires the Secure flag even on localhost for cross-site iframes.

---

### 2026-03-14T16:42:00Z -- Pattern: Retry with jitter (update)
- **Operation**: update
- **KnowledgeId**: 987fcdeb-51a2-43f1-a567-426614174999
- **Category**: Pattern
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-skill
- **Payload**:
[CONTEXT] Full rewrite of the retry-with-jitter pattern entry to use exponential backoff.
[INSIGHT] Start with a 200ms base delay, double on each retry up to 5 attempts, and add ±25% jitter to avoid thundering-herd on shared dependencies.
[RATIONALE] Replaces the earlier linear-backoff note after we observed retry storms during the 2026-03 outage.
[TAGS] pattern, retry, resilience, backoff

---
