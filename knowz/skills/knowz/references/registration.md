# Registration API Reference

## Enterprise Configuration

Before using any endpoints or brand names below, check for an `enterprise.json` file in the plugin root directory (the directory containing `.claude-plugin/plugin.json`). If present, use its values: `api_endpoint` replaces `https://api.knowz.io/api/v1` (registration becomes `{api_endpoint}/users/register`), `mcp_endpoint` replaces `https://mcp.knowz.io/mcp`, and `brand` replaces "Knowz" in user-facing messages. When enterprise config is present, ignore the `--dev` flag. If absent, use the defaults below.

## Endpoints

| Environment | API Endpoint | MCP Endpoint |
|:------------|:-------------|:-------------|
| **Production** (default) | `https://api.knowz.io/api/v1/users/register` | `https://mcp.knowz.io/mcp` |
| **Development** (`--dev`) | `https://api.dev.knowz.io/api/v1/users/register` | `https://mcp.dev.knowz.io/mcp` |

## Request Format

```bash
curl -X POST https://api.knowz.io/api/v1/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "{email}",
    "email": "{email}",
    "password": "{password}",
    "firstName": "{firstName}",
    "lastName": "{lastName}",
    "registrationSource": "knowzcode",
    "returnPersonalApiKey": true
  }'
```

Notes:
- `username` is set to the email address (simplifies UX — users don't need a separate username)
- `registrationSource` tracks that this registration came from the knowz skill — always send `"knowzcode"`
- `returnPersonalApiKey` must be `true` to receive the API key in the response

## Response Structure

Success response (HTTP 200) is wrapped in an `ApiResponse` envelope:

```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "tenantId": "uuid",
    "username": "string",
    "email": "string",
    "token": "jwt-token",
    "expiresAt": "2026-04-05T12:00:00Z",
    "personalApiKey": "ukz_...",
    "refreshToken": "string"
  },
  "message": "User registered successfully"
}
```

Key fields:
- `data.personalApiKey` — the API key for MCP authentication (prefix: `ukz_`)
- `data.tenantId` — the tenant ID (a default vault is auto-provisioned server-side)
- Vault info is NOT in the registration response — discover it via MCP `list_vaults` after MCP is configured

## Input Validation

| Field | Rules |
|-------|-------|
| **FirstName** | Non-empty, letters/spaces/hyphens/apostrophes |
| **LastName** | Non-empty, letters/spaces/hyphens/apostrophes |
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

Configure manually:
  /knowz setup {masked_key}

Or visit https://knowz.io/api-keys to retrieve your key later.
```

## Security Considerations

- **HTTPS only** — all API calls use HTTPS
- **Password not stored** — sent once, never saved locally
- **Password not logged** — never display password in output
- **Minimal data** — only collect what's needed for registration
- **Mask displayed keys** — show only first 6 + last 4 chars (e.g., `ukz_...wxyz`)
- **Never log full keys** — exclude from diagnostic output
- **Warn about project scope** — API key will be in git-committed `.mcp.json`
- **Recommend local scope** — default to most secure option

## What Registration Provides

- **API Key** — personal API key (`ukz_` prefix) for MCP server authentication
- **Knowz Vault** — auto-provisioned server-side (discoverable via MCP `list_vaults` after setup)
- **Vector Search** — AI-powered semantic search across vaults
- **AI Q&A** — question answering with research mode
- **Knowledge Capture** — save insights with automatic formatting

Free tier: 1,000 API calls/month, single user, basic vector search.
Upgrades: https://knowz.io/pricing
