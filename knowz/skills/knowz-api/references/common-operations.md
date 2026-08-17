# Knowz API common operations

## Contents

- [Configuration](#configuration)
- [Guided authentication](#guided-authentication)
- [Discovery](#discovery)
- [Generic requests](#generic-requests)
- [Chunked file upload](#chunked-file-upload)
- [Reprocessing and reindexing](#reprocessing-and-reindexing)
- [Response handling](#response-handling)
- [Troubleshooting](#troubleshooting)

## Configuration

Start with the guided, secret-safe readiness check:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" setup --json-output
```

It discovers configuration, loads Swagger, and validates the selected private key. The report names
the credential source but never includes the credential or the validation response. Use the focused
check after changing a key or API environment:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" auth-check
```

The preferred portable credential source is the environment:

```bash
export KNOWZ_API_KEY='...'
```

Set it outside shell tracing and in the environment that launches the agent; changing it in an
unrelated terminal does not update an already-running desktop agent. Do not echo it, pass it as an
argument, commit it, or paste it into chat. The client sends it as `X-API-Key` and redacts
secret-shaped fields from printed JSON responses.

Optional configuration:

```bash
export KNOWZ_API_URL='https://api.knowz.io'
export KNOWZ_OPENAPI_SPEC='/absolute/path/to/swagger.json'
```

`KNOWZ_API_URL` may include `/api/v1`; the client normalizes it before joining OpenAPI paths.
`KNOWZ_OPENAPI_SPEC` may be a local file or an HTTP(S) Swagger URL. For a source checkout, the
client looks for the committed client spec under:

```text
knowz-platform/clients/hereforever-mobile-swift/docs/knowz-api-swagger.json
```

Point `KNOWZ_OPENAPI_SPEC` at a running local API's `/swagger/v1/swagger.json` when the generated
runtime contract is newer than that committed artifact.

## Guided authentication

Automatic credential priority is:

1. `KNOWZ_API_KEY`, or the variable selected with `--key-env`.
2. The variable named by `~/.codex/config.toml`'s `bearer_token_env_var`.
3. A valid `ukz_`, `kz_`, `ksh_`, or `sh-` private key already configured for the current project
   in `.gemini/settings.json`, `.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, or
   `.claude/settings.local.json`, followed by the user Gemini config.
4. On macOS, the active Knowz CLI profile when `knowz auth status --json` reports an OS-keychain
   backend. The skill asks macOS Keychain for service `knowz-cli` and the active profile and keeps
   the result in memory only.

Use `--credential-source env|mcp|cli` to require one source instead of automatic selection. Use
`--project-dir /absolute/project/path` when setup runs outside the project whose MCP configuration
should be inspected.

The skill will not:

- turn an MCP OAuth access/refresh token into an API key;
- print, suffix-display, persist, or copy a discovered key;
- decrypt `~/.knowz/credentials.enc` or ask for its wrapping passphrase;
- read arbitrary dotfiles or accept a credential-producing shell command.

If the CLI is authenticated with an encrypted-file backend, continue using the CLI for its existing
operations and separately make the same private API key available through the agent environment or
an API-key MCP config. The planned CLI-native `knowz api` surface should broker advanced operations
inside the CLI so every supported OS/backend can reuse the CLI credential without exporting it. The
skill's access-layer rule already prefers that CLI surface when it becomes available.

To troubleshoot without a network validation request:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" setup --no-verify --json-output
```

`--no-verify` can report local readiness, but only a normal setup or `auth-check` proves the key and
API URL work together end to end.

## Discovery

Inspect the source and operation counts:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" source
```

Search summaries, tags, operation IDs, and paths:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" discover --query upload --limit 30
python3 "$SKILL_DIR/scripts/knowz_api.py" discover --query knowledge --method GET
python3 "$SKILL_DIR/scripts/knowz_api.py" discover --tag "Content Tree"
```

Describe by operation ID or by exact method/path:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" describe ReprocessFile
python3 "$SKILL_DIR/scripts/knowz_api.py" describe 'GET /api/v1/knowledge/{id}/content-tree'
```

`describe` prints parameters, request content types, recursively resolved schemas, response status
codes, and the safety impact. If the live spec has no operation ID, method/path remains a stable
selector.

## Generic requests

GET with a path parameter and query values:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" request GetContentTree \
  --path id="$KNOWLEDGE_ID" \
  --query includeChunks=true
```

POST/PATCH/PUT with JSON:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" request TriggerAgenticEnrichment \
  --path id="$KNOWLEDGE_ID" \
  --json-file /absolute/path/to/request.json \
  --idempotency-key "$STABLE_OPERATION_KEY" \
  --execute
```

Options may repeat:

- `--path name=value` substitutes a declared path parameter.
- `--query name=value` adds one query value. Repeat the option for arrays.
- `--header name=value` adds a non-sensitive operation header. The client rejects attempts to set
  authorization, API key, host, cookie, or content-length headers.
- `--json TEXT` or `--json-file PATH` supplies JSON. Use only one.
- `--raw-file PATH --content-type TYPE` supplies a raw request body for a spec-declared operation.
- `--form name=value` and `--form-file field=/absolute/path` build multipart form data. Generic
  multipart bodies are capped at 64 MiB in memory; use `upload` for larger files.
- `--output PATH` writes a successful binary response to an explicit file. Existing files are not
  overwritten unless `--overwrite-output` is present.
- `--execute` is mandatory for every state-changing method.

The generic client rejects missing required path parameters, unresolved `{placeholders}`, multiple
body modes, unsafe header overrides, non-loopback HTTP, and operations outside the policy.

## Chunked file upload

Upload a standalone file:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" upload /absolute/path/to/file.pdf --execute
```

Upload and create a knowledge item:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" upload /absolute/path/to/file.pdf \
  --create-as knowledge \
  --vault-id "$VAULT_ID" \
  --title "Quarterly research" \
  --execute
```

Upload as an inbox item:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" upload /absolute/path/to/audio.m4a \
  --create-as inbox \
  --title "Interview recording" \
  --execute
```

Useful options:

- `--content-type TYPE` overrides MIME detection.
- `--no-transcription` disables automatic transcription processing.
- `--parent-knowledge-id UUID` associates the completion with a parent knowledge item.
- `--client-created-at ISO-8601` preserves a client creation timestamp when supported.
- `--timeout SECONDS` raises the per-request timeout for large chunks or slow self-hosted links.

The workflow performs:

1. `InitializeUpload` with name, byte size, and content type.
2. `UploadChunk` once per server-advertised chunk using `X-Upload-Id`, `X-Chunk-Index`, and the
   server-compatible base64 MD5 transport checksum.
3. `CompleteUpload` with the returned upload and file-record IDs and a SHA-256 whole-file hash.

Only one server-sized chunk is held in memory at a time. The final JSON includes the stable
`fileRecordId` needed for status reads or a later `reprocess` call. The workflow does not currently
resume an interrupted upload or accept a caller idempotency key.

Do not retry completion with a new file-record ID. On an ambiguous network failure, inspect upload
progress or the resulting file record before retrying.

## Reprocessing and reindexing

Re-run file extraction, transcription, and enrichment as supported by the server:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" reprocess "$FILE_RECORD_ID" --execute
```

Reindex exactly one knowledge item:

```bash
python3 "$SKILL_DIR/scripts/knowz_api.py" reindex "$KNOWLEDGE_ID" --execute
```

These workflows deliberately exclude synchronous `process-now`, tenant-wide reprocessing,
`index-all`, `reindex-all`, rebuild, wipe, and dead-letter operations. Inspect status/read endpoints
after queuing work instead of repeatedly firing the mutation. Upload completion already starts the
normal processing pipeline; use `reprocess` for a genuine second pass after that initial processing
has reached a terminal state, not immediately after every upload.

## Response handling

Most Knowz endpoints return an envelope similar to:

```json
{
  "success": true,
  "message": "optional status text",
  "data": {}
}
```

Treat a 2xx response with `success: false` as an application-level failure. Preserve the HTTP
status, `message`, operation ID, and any correlation/request ID when reporting an error. The client
returns a non-zero exit code for HTTP failures and application envelopes that explicitly report
failure.

For `202 Accepted`, report the job or correlation identifier and use the matching status endpoint.
Do not poll more frequently than the response guidance or once every few seconds when no guidance
exists.

## Troubleshooting

- `No reusable private Knowz API key was found`: run `setup --json-output`; set the reported
  environment variable or configure one of the supported MCP/CLI credential sources.
- `401`: the key is missing, invalid, expired, or belongs to a different environment.
- `403`: the authenticated principal lacks the required tenant/vault permission; do not work around
  it with a broader key.
- `404`: verify the base environment and exact tenant-scoped ID before retrying.
- `409`: inspect existing state before retrying a create/update.
- `413`: the server rejected the file or request size. Use `upload` so the server controls chunk
  size; a tenant upload limit can still reject the file.
- Response too large: generic responses are bounded at 64 MiB. Use a purpose-built client or the
  product UI for larger downloads rather than weakening the safety limit.
- `429`: respect `Retry-After`; do not create an aggressive retry loop.
- Schema or operation not found: run `source`, confirm the expected Swagger source, and point
  `KNOWZ_OPENAPI_SPEC` to the correct environment's live document.
- Spec generation failure: use the committed local spec only as a temporary fallback and report
  that it may lag the deployed API.
