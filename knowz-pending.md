# Pending Knowz Operations

Canonical project-root queue for failed Knowz mutations. Run `/knowz flush` when the Knowz MCP API key is valid. Blocks are replayed by `Operation` and deduplicated by `Idempotency Key`; amend/update never fall through to create.
