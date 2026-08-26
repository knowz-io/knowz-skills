# Privacy Policy

Last updated: June 24, 2026

This policy covers the Knowz Claude Code and Grok Build plugins in this repository and the Knowz services they can connect to. The hosted Knowz product privacy page is available at https://knowz.io/privacy.

## Data Collection

The Claude Code and Grok Build plugins are local instruction files. They do not collect data on their own and they do not send conversation data anywhere unless a user explicitly configures or invokes a workflow that connects to an external service.

When users configure or use the Knowz MCP server, Knowz may receive:

- Account registration details such as name, email address, and password.
- Knowledge content that the user chooses to save, upload, import, search, or query.
- Vault metadata, tags, topics, and usage metadata needed to provide search, Q&A, and synchronization features.
- Technical logs needed for reliability, security, abuse prevention, and support.

KnowzCode stores workflow state in local project files by default. It only sends data to Knowz when the user has configured Knowz and chooses a workflow that writes or queries vault knowledge. Telemetry workflows only connect to user-configured providers such as Sentry or Azure Application Insights.

## Usage And Storage

Knowz uses submitted data to provide the requested service: account access, vault storage, semantic search, AI-assisted tagging and summaries, MCP tool responses, troubleshooting, and security monitoring.

Knowledge content is stored in the user's Knowz account or organization. Local workflow files created by KnowzCode remain in the user's project unless the user separately saves them to Knowz.

## Third-Party Sharing

Knowz does not sell user knowledge content. Knowz may share limited data with service providers that are necessary to operate the service, such as cloud hosting, storage, logging, monitoring, email delivery, support tooling, and AI processing providers. These providers process data only for the service functions they support.

Knowz may disclose data when required by law, to protect the service and users, or as part of a business transfer subject to appropriate safeguards.

## AI Processing

Knowz uses AI features for semantic search, summaries, tags, chat, and related knowledge operations. User knowledge content is processed to provide those features. Knowz does not use user knowledge content to train third-party AI models.

## Data Retention

Knowz retains account and knowledge data while the account is active or as needed to provide the service. Users may delete knowledge content. When an account is deleted, Knowz deletes or anonymizes personal information within a reasonable timeframe unless retention is required for legal, security, or operational reasons.

Local files created by the plugins are retained only in the user's own project or user configuration until the user removes them.

## Security

Knowz uses HTTPS for service communication and supports OAuth or bearer-token authentication for MCP access. Users should prefer local or user-scoped credentials and avoid committing personal API keys to project repositories.

Report security concerns to support@knowz.io.

## Contact

Questions about privacy or data handling can be sent to support@knowz.io.
