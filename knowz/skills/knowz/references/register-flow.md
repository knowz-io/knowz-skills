# Registration Flow Reference

Detailed steps, UI copy, and error handling for the `/knowz register` action.

## Contents

1. [Step R2: Welcome and Collect Information](#step-r2-welcome-and-collect-information)
2. [Step R3: Confirm Details](#step-r3-confirm-details)
3. [Step R4: Call Registration API](#step-r4-call-registration-api)
4. [Step R5: Configure MCP Server](#step-r5-configure-mcp-server)
5. [Step R6: Vault Configuration (Deferred)](#step-r6-vault-configuration-deferred)
6. [Step R7: Success Message](#step-r7-success-message)

---

## Step R2: Welcome and Collect Information

**CRITICAL: Interactive Flow — ask ONE question, then WAIT for response.**

Display welcome:
```
KNOWZ REGISTRATION

Welcome! Let's set up your Knowz account.

This will:
1. Create your Knowz account
2. Generate an API key
3. Configure the MCP server automatically

All data transmitted securely over HTTPS.
Privacy policy: https://knowz.io/privacy
```

Then use AskUserQuestion to collect (one at a time, validating each):

1. **Name** — "What is your name?"
   - Validation: non-empty, 2-100 characters
   - Split into first/last name for the API: split on the last space (e.g., "Alex Headscarf" → firstName: "Alex", lastName: "Headscarf"). If single word, use it as both firstName and lastName.
2. **Email** — "What is your email address?"
   - Validation: contains `@` and domain
3. **Password** — "Create a password (minimum 8 characters)"
   - Note: "Your password will be sent securely over HTTPS. It will NOT be stored locally."
   - Validation: minimum 8 characters

---

## Step R3: Confirm Details

```
CONFIRM REGISTRATION

Name:      {name}
Email:     {email}
Password:  ********

Is this correct?
```

Use AskUserQuestion with options: Yes / No / Edit.
- If "Edit": go back to Step R2
- If "No": cancel and STOP
- If "Yes": proceed

---

## Step R4: Call Registration API

Determine endpoint based on `--dev` flag (see [registration.md](registration.md)).

```bash
curl -s -X POST https://api.knowz.io/api/v1/users/register \
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

Handle response codes per [registration.md](registration.md).

Extract from response: API key from `data.personalApiKey` (prefix: `ukz_`). Vault info is NOT in the response — a default vault is auto-provisioned server-side and will be discoverable via MCP after restart.

---

## Step R5: Configure MCP Server

Parse scope from arguments (default: `local`). If `project` scope, warn about `.mcp.json` git visibility.

Ask auth method:
```
How would you like to authenticate with the MCP server?

  OAuth (recommended) — authenticate via browser, tokens auto-managed
  API Key — use the key from registration, no browser step needed
```

Configure per [mcp-setup.md](mcp-setup.md).

Verify: `CLAUDECODE= claude mcp get knowz`

---

## Step R6: Vault Configuration (Deferred)

Vault info is not available during registration — MCP requires a restart before it can be used. Skip `knowz-vaults.md` generation here. The vault will be discovered and configured after restart via `/knowz status` or `/knowz setup`.

---

## Step R7: Success Message

```
REGISTRATION COMPLETE

Account:
  Email: {email}
  Auth: {OAuth OR API Key: ukz_...masked}

MCP Configuration:
  Scope: {scope}
  Endpoint: {endpoint}
  Status: Configured
```

Then display the restart box:
```
┌─────────────────────────────────────────────────────┐
│  RESTART REQUIRED                                   │
│                                                     │
│  Claude Code must be restarted to load the new      │
│  MCP server — this is a platform limitation.        │
│                                                     │
│  → Close and reopen Claude Code                     │
│  → Then run: /knowz status                          │
│                                                     │
│  {If OAuth: "Your browser will open for login on    │
│   the first MCP call after restart."}               │
└─────────────────────────────────────────────────────┘

After restart:
  1. Verify connection: /knowz status
  2. Set up vault config: /knowz setup
  3. Try: /knowz ask "your first question"
  4. Save knowledge: /knowz save "your first insight"
```
