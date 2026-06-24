# Security Policy

## Reporting A Vulnerability

Report security vulnerabilities to support@knowz.io with enough detail to reproduce or understand the issue. Include affected plugin, MCP endpoint, account state, and any relevant request IDs when available.

Please do not include sensitive credentials in reports. Mask API keys and tokens before sending logs.

## Scope

This repository contains Claude Code plugins, platform adapter templates, local workflow files, and helper CLIs for Knowz and KnowzCode. The Knowz MCP server and hosted Knowz application are external services operated by Knowz.

## Expected Handling

Knowz will acknowledge security reports, investigate them with reasonable care, and prioritize fixes based on severity and user impact.

## User Credential Guidance

- Prefer OAuth where supported.
- Prefer local or user-scoped MCP configuration for personal credentials.
- Do not commit API keys, OAuth tokens, `.mcp.json` files with personal secrets, or telemetry provider tokens.
- Rotate any key that may have been exposed.
