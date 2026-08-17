# Knowz API safety policy

## Contents

- [Purpose](#purpose)
- [Permitted surface](#permitted-surface)
- [Never exposed](#never-exposed)
- [Mutation protocol](#mutation-protocol)
- [Credential and transport rules](#credential-and-transport-rules)
- [Blocked-operation behavior](#blocked-operation-behavior)

## Purpose

Provide broad control over realistic tenant-scoped client workflows without turning a private API
key into an administration or destructive-operation tool. The executable policy is authoritative;
this document explains it.

## Permitted surface

The client may discover and invoke operations that all satisfy these conditions:

- The route is under `/api/v1/`.
- The route belongs to an ordinary authenticated client workflow rather than a platform/control
  plane.
- The operation is not DELETE and does not carry a destructive, global, internal, public-upload,
  test-only, authentication, key-management, or administrative meaning.
- The operation is not an SSE/streaming endpoint.
- A state-changing call is explicitly scoped to a known target and executed with `--execute`.

This includes ordinary reads and safe tenant-scoped writes for knowledge, vaults, files, comments,
entities, conversations, enrichment, content trees, topics, perspectives, and similar end-user
features. It also includes the curated chunked-upload, single-file reprocess, and single-knowledge
reindex workflows.

## Never exposed

The client filters these operations out of discovery and refuses them by exact selector:

- Every DELETE operation.
- Admin, super-admin, internal callback, bootstrap, diagnostics, cache-control, audit-control, or
  tenant resource/control-plane routes.
- Authentication, identity, OAuth, SSO, API-key, token, secret, credential, invitation, permission,
  grant, and impersonation management. The fixed, non-mutating `auth-check` workflow may call only
  the API-key validation endpoint and never exposes it through generic discovery or requests.
- Billing, pricing administration, subscription, deployment, infrastructure, and provider setup.
- Bulk data import/export/takeout, portability, federation, sync, restore, migration, or backup.
- Public/anonymous upload, webhook, SMS/email routing control, and third-party repository/integration
  management.
- Moderation administration, feature flags, processing-rule configuration, prompt/model/AI provider
  configuration, and tenant-wide settings.
- Test-only endpoints and operations whose names contain destructive verbs such as delete, purge,
  wipe, destroy, reset, remove, revoke, clear, cleanup, bootstrap, impersonate, or rotate.
- Global/bulk indexing and processing such as `index-all`, `reindex-all`, rebuild-all, tenant-wide
  reprocessing, synchronous `process-now`, dead-letter manipulation, and bulk AI batches.
- Streaming/SSE/chat-stream operations, because the bounded client is intentionally request/response.

The policy may conservatively block a harmless operation. That is preferable to accidentally
exposing an unsafe sibling under a broad Swagger tag.

## Mutation protocol

Before any POST, PUT, PATCH, or other mutation:

1. Run `describe` against the exact live spec.
2. State the operation ID, method/path, environment, target IDs, and intended effect.
3. Treat an explicit user request containing the effect and target as authorization; otherwise ask.
4. Validate the target through a read operation when practical.
5. Use `--execute`. The client refuses mutations without it.
6. Use a stable idempotency key for retryable create-like calls when the endpoint accepts one.
7. Inspect the returned envelope. Do not assume HTTP 2xx means `success: true`.
8. On ambiguity, read current state before retrying.

Never broaden a request from one item/vault to all items/vaults. Never substitute a different ID
because the requested resource was not found.

## Credential and transport rules

- Resolve the private key only from `KNOWZ_API_KEY` (or `--key-env`), reviewed Knowz MCP config
  locations, or the active Knowz CLI macOS keychain item. Never accept or persist a literal key
  argument.
- Reuse only values with a recognized private-key prefix and minimum length. Do not treat arbitrary
  Bearer values or MCP OAuth sessions as API keys.
- Read MCP configuration only from the current project/repository and named user-level Codex or
  Gemini config. Do not crawl arbitrary dotfiles.
- Ask the OS keychain only for service `knowz-cli` and the active CLI profile. Never decrypt the
  CLI encrypted-file fallback, print the credential, or offer a credential-export command.
- Never log request headers, environment contents, shell traces, or raw secret-bearing responses.
- Reject caller overrides for `Authorization`, `X-API-Key`, cookies, host, proxy authorization, and
  content-length.
- Use HTTPS for non-loopback servers. HTTP is permitted only for localhost, `127.0.0.1`, or `::1`.
- Do not forward the API key when downloading the Swagger document.
- Redact response fields whose names indicate passwords, tokens, secrets, credentials, private
  keys, API keys, or connection strings.

## Blocked-operation behavior

When an operation is blocked:

1. Do not reveal a hidden route through discovery output.
2. If the user supplied an exact selector, report only that it falls outside the safe client
   surface and summarize the policy category.
3. Do not bypass the policy with `curl`, another script, direct source reconstruction, or a custom
   HTTP client.
4. Offer the supported Knowz web UI, an existing CLI command, MCP, or a human administrator.
5. If a legitimate tenant-scoped client operation is missing, propose a reviewed policy addition as
   a source change to this skill with tests.
