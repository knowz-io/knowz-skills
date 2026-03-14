# Project Overview

## Goal
*   **Goal:** [concise project objective — 1-2 sentences]
*   **Core Problem:** [specific user problem this solves — 1-2 sentences]

## Stack

| Category | Technology | Version |
|:---------|:-----------|:--------|
| Language | | |
| Backend Framework | | |
| Frontend Framework | | |
| Database | | |
| ORM/ODM | | |
| Testing (Unit) | | |
| Testing (E2E) | | |
| Key Libraries | | |

## Architecture
*   **Style:** [e.g., Monolithic, Microservices, Serverless]
*   **Key Components:** [2-3 sentence description of main components and interactions]

## Standards
*   **Formatter:** [e.g., Prettier, Black]
*   **Linter:** [e.g., ESLint, Flake8]
*   **Test Framework:** [e.g., Jest, PyTest]
*   **Commit Convention:** [e.g., Conventional Commits]
*   **File Naming:** [e.g., kebab-case.js, PascalCase.tsx]

### Component Classification
* **Standard**: Simple components, clear inputs/outputs, minimal business logic
* **Complex**: Significant business logic, multiple dependencies, state management
* **Critical**: Security, payments, user data, system stability

## Testing
*   **Unit Tests:** Required for core business logic and utilities
*   **Integration Tests:** Required for API endpoints and service interactions
*   **E2E Tests:** [Optional for MVP — describe scope if applicable]
*   **Coverage Target:** [e.g., >70% for core logic]
*   **Test Location:** [e.g., adjacent `*.test.js` or `tests/` directory]

## Security Priorities
*   **Authentication:** [method — session-based, JWT, etc. Passwords MUST be hashed]
*   **Authorization:** [approach — RBAC, ownership checks, etc.]
*   **Input Validation:** All user inputs validated server-side
*   **Secrets:** Environment variables only, never hardcoded
*   **Dependencies:** Regular `npm audit` / `pip-audit` checks
