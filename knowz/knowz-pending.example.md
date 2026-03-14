# Knowz Pending Captures

Queued knowledge items waiting to be synced to vaults. Process with `/knowz flush`.

---

### 2026-03-14T10:30:00Z -- Decision: Use UTC for all timestamps
- **Category**: Decision
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-auto
- **Content**:
[CONTEXT] During API design discussion, team debated timezone handling across services.
[INSIGHT] All timestamps stored and transmitted in UTC. Convert to local time only at the UI layer. This eliminates timezone bugs in distributed systems and simplifies database queries.
[RATIONALE] Considered per-user timezone storage but UTC-everywhere is simpler and widely adopted.
[TAGS] decision, timezone, api-design, distributed-systems

---

### 2026-03-14T11:15:00Z -- Convention: Error response format for REST APIs
- **Category**: Convention
- **Target Vault**: Engineering Knowledge
- **Source**: knowz-skill
- **Content**:
[CONTEXT] Standardizing error responses across all REST API endpoints.
[INSIGHT] All API errors return `{ "error": { "code": "ERROR_CODE", "message": "Human-readable message", "details": {} } }` with appropriate HTTP status codes. Never expose stack traces in production.
[RATIONALE] Consistent format makes client-side error handling predictable and simplifies debugging.
[TAGS] convention, rest-api, error-handling

---
