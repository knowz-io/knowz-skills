---
guideline_id: DSN-001
name: Design Guidelines
enforcement: advisory
applies_to: both
priority: medium
---

# Design Guidelines

**Purpose:** Define organization-specific UI/UX design standards. Cross-referenced by the `frontend-designer` agent at Stage 0 and during the Gate #3 Design Audit.

> **Note:** This is a template. Add your organization's design requirements below.
> Empty sections are skipped during compliance review.

---

## 1. Design System Conventions

<!-- Add required design system / component-library conventions here -->
<!-- Example:
### DSN-SYSTEM-01: Use Approved Component Library

**Requirement:** All new UI components MUST be composed from the shared `@org/ui-kit` library. Custom components require design-team approval before use.

**Applies To:** both

**Severity:** high

**ARC Verification:**
- ARC_DSN_SYSTEM_01a: Verify no new bespoke components are introduced for use cases covered by @org/ui-kit
- ARC_DSN_SYSTEM_01b: Verify imports come from @org/ui-kit rather than local re-implementations
-->

---

## 2. Accessibility (WCAG)

<!-- Add accessibility requirements here. Frontend-designer's WCAG-lite scan validates these. -->
<!-- Example:
### DSN-A11Y-01: WCAG 2.1 AA Conformance

**Requirement:** All user-facing surfaces MUST meet WCAG 2.1 AA contrast, keyboard-navigation, and ARIA-labeling standards.

**Applies To:** implementation

**Severity:** high

**ARC Verification:**
- ARC_DSN_A11Y_01a: Verify text contrast meets 4.5:1 (normal) or 3:1 (large)
- ARC_DSN_A11Y_01b: Verify every interactive element is keyboard-reachable with visible focus
- ARC_DSN_A11Y_01c: Verify form fields have associated labels and live-region error announcements
-->

---

## 3. Responsive Breakpoints

<!-- Add required responsive breakpoint behavior here -->
<!-- Example:
### DSN-RESP-01: Mobile, Tablet, Desktop Support

**Requirement:** All new UI surfaces MUST render correctly at 360px (mobile), 768px (tablet), and 1280px (desktop).

**Applies To:** implementation

**Severity:** medium

**ARC Verification:**
- ARC_DSN_RESP_01a: Verify no horizontal scrolling at 360px viewport
- ARC_DSN_RESP_01b: Verify tap targets are >= 44x44px on mobile
-->

---

## 4. Empty, Loading, and Error States

<!-- Add state-handling requirements here -->
<!-- Example:
### DSN-STATE-01: All Async Surfaces Must Define Three States

**Requirement:** Every async-rendering surface MUST handle loading, empty, and error states explicitly. "Nothing displayed" is not an acceptable fallback.

**Applies To:** both

**Severity:** medium

**ARC Verification:**
- ARC_DSN_STATE_01a: Verify spec includes VERIFY criteria for loading, empty, error
- ARC_DSN_STATE_01b: Verify implementation renders each state appropriately under simulated conditions
-->

---

## 5. Copy & Microcopy

<!-- Add copy/voice/tone requirements here -->
<!-- Example:
### DSN-COPY-01: Action-Verb Button Labels

**Requirement:** All primary action buttons MUST use action-verb labels ("Save changes", "Delete account") not noun-only labels ("OK", "Submit").
-->

---

## 6. Theme Tokens

<!-- Add theme-token requirements here -->
<!-- Example:
### DSN-THEME-01: No Hard-Coded Colors

**Requirement:** UI components MUST consume colors via design tokens (e.g., `color.primary`). Hard-coded hex/rgb values are prohibited outside the token definition file.

**Applies To:** implementation

**Severity:** medium

**ARC Verification:**
- ARC_DSN_THEME_01a: Verify no hex/rgb literals in component files (allowed only in tokens.ts)
-->

---

## 7. Component Reuse

<!-- Add reuse requirements here -->

---

## Compliance Summary

| ID | Requirement | Severity | Scope |
|:---|:------------|:---------|:------|
<!-- Add your requirements summary here -->

---
