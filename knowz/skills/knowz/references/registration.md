# Registration API Reference

## Endpoints

| Environment | API Endpoint | MCP Endpoint |
|:------------|:-------------|:-------------|
| **Production** (default) | `https://api.knowz.io/api/v1/auth/register` | `https://mcp.knowz.io/mcp` |
| **Development** (`--dev`) | `https://api.dev.knowz.io/api/v1/auth/register` | `https://mcp.dev.knowz.io/mcp` |

## Request Format

```bash
curl -X POST https://api.knowz.io/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "{name}",
    "email": "{email}",
    "password": "{password}"
  }'
```

## Response Structure

```json
{
  "api_key": "kz_live_abc123...",
  "vault_id": "vault_xyz789...",
  "vault_name": "KnowzCode"
}
```

Field name variants: `apiKey`/`api_key`/`token`, `vault_id`/`vaultId`, `vault_name`/`vaultName`.

## Input Validation

| Field | Rules |
|-------|-------|
| **Name** | Non-empty, 2-100 characters, letters/spaces/hyphens/apostrophes |
| **Email** | Must contain `@` and domain, no leading/trailing whitespace |
| **Password** | Minimum 8 characters |

## Error Codes

### Email Already Registered (HTTP 409)

```
The email {email} is already associated with an account.

Options:
1. Use a different email — run /knowz register again
2. Retrieve existing API key — visit https://knowz.io/api-keys
3. Reset password — https://knowz.io/forgot-password

If this is your account, you can configure your existing key:
  /knowz setup <your-existing-api-key>
```

### Invalid Input (HTTP 400)

```
Registration failed — validation errors:
{error_message_from_response}

Please correct the issue and try again.
```

Return to the step corresponding to the invalid field.

### Rate Limited (HTTP 429)

```
Too many requests. Registration is temporarily rate limited.
Please wait a few minutes and try again.

If you continue to see this error, contact support:
  https://knowz.io/support
```

### Network Error

```
Cannot reach registration server.

Troubleshooting:
1. Check your internet connection
2. Verify firewall/proxy settings allow HTTPS to api.knowz.io
3. Try again in a few moments

Status page: https://status.knowz.io
Support: https://knowz.io/support
```

### Server Error (HTTP 500+)

```
Server encountered an error. This is not your fault.

Please:
1. Try again in a few minutes
2. Check status: https://status.knowz.io
3. Contact support if persists: https://knowz.io/support
```

### MCP Configuration Failed (registration succeeded)

```
Account created, but MCP configuration failed.

Your account:
  Email: {email}
  API Key: {masked_key}
  Vault: {vault_name} ({vault_id prefix...})

Configure manually:
  /knowz setup {masked_key}

Or visit https://knowz.io/api-keys to retrieve your key later.
```

### API Response Missing Vault ID

```
Account created, but no vault was auto-provisioned.

This may indicate:
  - Account provisioning is still in progress
  - Server-side configuration needed

You can:
  1. Wait a few minutes and run /knowz status to check
  2. Contact support: https://knowz.io/support
  3. Run /knowz setup later to configure vaults
```

## Security Considerations

- **HTTPS only** — all API calls use HTTPS
- **Password not stored** — sent once, never saved locally
- **Password not logged** — never display password in output
- **Minimal data** — only collect what's needed for registration
- **Mask displayed keys** — show only first 6 + last 4 chars (e.g., `kz_liv...wxyz`)
- **Never log full keys** — exclude from diagnostic output
- **Warn about project scope** — API key will be in git-committed `.mcp.json`
- **Recommend local scope** — default to most secure option

## What Registration Provides

- **API Key** — unique key for MCP server authentication
- **Knowz Vault** — auto-created vault for learnings, conventions, and patterns
- **Vector Search** — AI-powered semantic search across vaults
- **AI Q&A** — question answering with research mode
- **Knowledge Capture** — save insights with automatic formatting

Free tier: 1,000 API calls/month, single user, basic vector search.
Upgrades: https://knowz.io/pricing
