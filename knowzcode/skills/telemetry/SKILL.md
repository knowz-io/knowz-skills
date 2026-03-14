---
name: telemetry
description: "Investigate telemetry data from Sentry, App Insights, and other sources. Use when asked to debug production errors, trace exceptions, check error rates, or diagnose monitoring issues."
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Task
argument-hint: "[natural language description]"
---

# KnowzCode Telemetry Investigation

Investigate production telemetry to diagnose errors, trace issues, and identify root causes.

**Usage**: `/knowzcode:telemetry "<natural language description>"`

Describe everything in plain English - environment, timeframe, and error context will be extracted automatically.

**Examples**:
```
/knowzcode:telemetry "in staging in the last 20 min, error 500"
/knowzcode:telemetry "NullReferenceException in production over the past hour"
/knowzcode:telemetry "checkout failures in dev since this morning"
/knowzcode:telemetry "slow API responses in user service today"
```

## When NOT to Trigger

- User wants to **configure telemetry sources** → use `/knowzcode:telemetry-setup`
- User wants to **fix a bug** identified from telemetry → use `/knowzcode:fix` or `/knowzcode:work`
- User wants to **audit code quality** → use `/knowzcode:audit`
- Telemetry sources are not configured yet → suggest `/knowzcode:telemetry-setup` first

---

## Parameter

| Parameter | Required | Description |
|-----------|----------|-------------|
| `description` | Yes | Natural language query describing what to investigate, including any context about environment, timeframe, etc. |

---

## Workflow

### Step 1: Parse Natural Language Query

Extract from the user's description:
- **Environment**: staging/production/dev (from phrases like "in staging", "in prod")
- **Timeframe**: How far back to search (from phrases like "last 20 min", "past 4 hours")
- **Search query**: The error/symptom to investigate (everything else)

### Step 2: Load Configuration and Detect Sources

Before investigation, load configuration and verify sources are available AND authenticated.

#### 2.1 Load Telemetry Configuration

Read `knowzcode/telemetry_config.md` to get environment-to-resource mappings.

**Parse the config** to extract:
- **Sentry**: Enabled status, **method** (cli or mcp), organization, environment-to-project mappings
- **App Insights**: Enabled status, subscription, environment-to-app ID mappings

#### 2.2 Detect Tool Installation

```bash
# Check Sentry CLI installation
which sentry-cli 2>/dev/null && echo "SENTRY_CLI_INSTALLED" || echo "NO_SENTRY_CLI"

# Check Azure CLI + App Insights extension
which az 2>/dev/null && az extension list --query "[?name=='application-insights'].name" -o tsv 2>/dev/null && echo "APPINSIGHTS_INSTALLED" || echo "NO_APPINSIGHTS"
```

#### 2.3 Verify Authentication

For each installed tool, verify it's authenticated:

```bash
# Sentry: Check authentication (quick check)
sentry-cli info 2>&1 | grep -q "Organization" && echo "SENTRY_AUTHENTICATED" || echo "SENTRY_NOT_AUTHENTICATED"

# Azure: Check authentication
az account show --query "name" -o tsv 2>/dev/null && echo "AZURE_AUTHENTICATED" || echo "AZURE_NOT_AUTHENTICATED"
```

#### 2.4 Handle Configuration Issues

**If config doesn't exist or sources not configured:**

```markdown
Telemetry not configured.

Run `/knowzcode:telemetry-setup` to:
1. Detect available telemetry tools
2. Verify authentication
3. Auto-discover projects/resources
4. Configure environment mappings

After setup, re-run your telemetry query.
```

**If tools not authenticated:**

```markdown
Telemetry tools detected but not authenticated.

Sentry: {status}
App Insights: {status}

Run `/knowzcode:telemetry-setup` to verify authentication and configure sources.
```

### Step 3: Investigate Telemetry

Spawn the **reviewer** agent to perform the telemetry investigation:

```
Task(reviewer):
  Investigate telemetry for the following issue.

  Natural Language Query: {user's full natural language description}
  Available Sources: {detected sources that are installed AND authenticated}

  Telemetry Configuration:
  - Sentry: {enabled, method, org, environment mappings}
  - App Insights: {enabled, subscription, environment mappings}

  Instructions:
  1. Parse the natural language query to extract environment, timeframe, and search terms
  2. Use the environment to look up the correct project/app ID from config
  3. Query available sources using CLI tools (sentry-cli, az monitor)
  4. Synthesize into unified timeline
  5. Generate root cause hypothesis
  6. Return structured findings
```

### Step 4: Present Findings

Display the synthesized telemetry investigation results:

```markdown
## KnowzCode Telemetry Investigation

**Original Query**: {user's natural language description}
**Extracted**:
  - Environment: {extracted env}
  - Timeframe: {extracted timeframe}
  - Search: {extracted search terms}
**Sources Queried**: {list of sources}

### Event Timeline (merged)
| Timestamp | Source | Type | Summary |
|-----------|--------|------|---------|
| ... | ... | ... | ... |

### Root Cause Hypothesis
**Most Likely**: {hypothesis}
**Evidence**: {supporting evidence}
**Confidence**: HIGH/MEDIUM/LOW

### Recommendations
1. {quick fix recommendation}
2. {proper fix recommendation}

---

**Next Steps:**
- `/knowzcode:fix {target}` - Apply a micro-fix
- `/knowzcode:work "Fix {issue}"` - Full implementation workflow
```

---

## Integration with Other Commands

| Command | Relationship |
|---------|--------------|
| `/knowzcode:fix` | Hand off quick fixes discovered |
| `/knowzcode:work` | Hand off larger remediation tasks |
| `builder` | Can invoke telemetry investigation during debugging |
| `microfix-specialist` | Can invoke telemetry investigation for verification |

---

## Logging

After investigation, log to `knowzcode/knowzcode_log.md`:

```markdown
---
**Type:** Telemetry Investigation
**Timestamp:** {timestamp}
**Query:** {original natural language query}
**Extracted**: env={env}, timeframe={timeframe}
**Sources:** {sources queried}
**Finding:** {one-line root cause summary}
**Status:** Complete
---
```

## Related Skills

- `/knowzcode:telemetry-setup` — Configure telemetry sources
- `/knowzcode:fix` — Apply a micro-fix for discovered issues
- `/knowzcode:work` — Full implementation for larger remediation
- `/knowzcode:audit` — Broader code quality scan
