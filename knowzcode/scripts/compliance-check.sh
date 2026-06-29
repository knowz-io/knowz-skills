#!/usr/bin/env bash
#
# KnowzCode Enterprise Compliance Check
# CI/CD integration script for deterministic compliance validation
#
# Usage:
#   ./scripts/compliance-check.sh [scope]
#
# Scopes:
#   spec   - Check specifications only
#   impl   - Check implementation only
#   full   - Check both (default)
#
# Exit codes:
#   0 - All checks passed (or compliance disabled)
#   1 - Blocking issues found
#   2 - Configuration error
#
# Environment variables:
#   KC_COMPLIANCE_STRICT=true  - Fail on advisory issues too
#   KC_COMPLIANCE_VERBOSE=true - Show detailed output
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
KNOWZCODE_DIR="knowzcode"
ENTERPRISE_DIR="${KNOWZCODE_DIR}/enterprise"
MANIFEST_FILE="${ENTERPRISE_DIR}/compliance_manifest.md"
GUIDELINES_DIR="${ENTERPRISE_DIR}/guidelines"
SPECS_DIR="${KNOWZCODE_DIR}/specs"

# Defaults
SCOPE="${1:-full}"
STRICT="${KC_COMPLIANCE_STRICT:-false}"
VERBOSE="${KC_COMPLIANCE_VERBOSE:-false}"

# Counters
BLOCKING_COUNT=0
ADVISORY_COUNT=0
PASSED_COUNT=0
CHECKED_COUNT=0
REVIEW_COUNT=0

log() {
    echo -e "${BLUE}[KC-COMPLIANCE]${NC} $1"
}

log_pass() {
    echo -e "${GREEN}[PASS]${NC} $1"
    PASSED_COUNT=$((PASSED_COUNT + 1))
}

log_fail() {
    echo -e "${RED}[BLOCKING]${NC} $1"
    BLOCKING_COUNT=$((BLOCKING_COUNT + 1))
}

log_warn() {
    echo -e "${YELLOW}[ADVISORY]${NC} $1"
    ADVISORY_COUNT=$((ADVISORY_COUNT + 1))
}

log_review() {
    echo -e "${YELLOW}[REVIEW]${NC} $1"
    REVIEW_COUNT=$((REVIEW_COUNT + 1))
}

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "  $1"
    fi
}

# Check if compliance is configured
check_configuration() {
    if [[ ! -d "$ENTERPRISE_DIR" ]]; then
        log "Enterprise compliance not configured (no ${ENTERPRISE_DIR}/ directory)"
        log "Skipping compliance checks - this is OK if compliance is not required"
        exit 0
    fi

    if [[ ! -f "$MANIFEST_FILE" ]]; then
        log "Manifest file not found: ${MANIFEST_FILE}"
        exit 2
    fi

    # Check if compliance is enabled
    if grep -q "compliance_enabled: false" "$MANIFEST_FILE" 2>/dev/null; then
        log "Compliance checking is disabled in manifest"
        log "Set compliance_enabled: true to enable"
        exit 0
    fi

    if ! grep -q "compliance_enabled: true" "$MANIFEST_FILE" 2>/dev/null; then
        log "compliance_enabled not set to true in manifest"
        exit 0
    fi

    log "Compliance enabled - running checks..."
}

# Parse active guidelines from manifest
get_active_guidelines() {
    local applies_to_filter="$1"

    # Extract guideline rows where Active = true
    # Format: | filename.md | enforcement | applies_to | true |
    grep -E "^\|.*\.md.*\|.*\|.*\| *true *\|" "$MANIFEST_FILE" 2>/dev/null | while read -r line; do
        local filename=$(echo "$line" | awk -F'|' '{print $2}' | tr -d ' ')
        local enforcement=$(echo "$line" | awk -F'|' '{print $3}' | tr -d ' ')
        local applies_to=$(echo "$line" | awk -F'|' '{print $4}' | tr -d ' ')

        # Filter by scope
        if [[ "$applies_to_filter" == "all" ]] || \
           [[ "$applies_to" == "$applies_to_filter" ]] || \
           [[ "$applies_to" == "both" ]]; then
            echo "${filename}|${enforcement}|${applies_to}"
        fi
    done
}

# Check if a guideline file has actual content (not just template)
has_content() {
    local file="$1"

    if [[ ! -f "$file" ]]; then
        return 1
    fi

    # Check if file has actual requirements (not just comments/template)
    # Look for requirement patterns like "### SEC-" or "**Requirement:**"
    if grep -qE "^### [A-Z]+-[A-Z]+-[0-9]+:|^\*\*Requirement:\*\*" "$file" 2>/dev/null; then
        return 0
    fi

    return 1
}

# Extract requirements from a guideline
check_guideline_requirements() {
    local guideline_file="$1"
    local enforcement="$2"
    local check_type="$3"  # spec or implementation (matches the guideline's **Applies To:** vocabulary)

    if [[ ! -f "$guideline_file" ]]; then
        log_verbose "Guideline file not found: $guideline_file (skipping)"
        return
    fi

    if ! has_content "$guideline_file"; then
        log_verbose "Guideline $guideline_file is empty/template (skipping)"
        return
    fi

    local guideline_name=$(basename "$guideline_file" .md)
    log "Checking guideline: $guideline_name ($enforcement)"

    # Extract requirement IDs and their applies_to scope.
    # NOTE: read from a process substitution, NOT a pipe — a `grep | while` pipe runs the
    # loop body in a subshell, so counter increments (CHECKED_COUNT, etc.) would be lost.
    while read -r req_line; do
        local req_id=$(echo "$req_line" | grep -oE "[A-Z]+-[A-Z]+-[0-9]+")
        CHECKED_COUNT=$((CHECKED_COUNT + 1))

        # Get the applies_to for this specific requirement.
        # Use sed (portable) rather than `grep -oP` — BSD/macOS grep has no -P (Perl) flag.
        local req_applies_to=$(grep -A5 "^### ${req_id}:" "$guideline_file" | sed -n 's/.*\*\*Applies To:\*\* *//p' | tr -d ' ' | head -1)

        # Check if this requirement applies to current check type
        if [[ "$req_applies_to" != "$check_type" ]] && [[ "$req_applies_to" != "both" ]]; then
            log_verbose "  $req_id: N/A (applies to $req_applies_to, checking $check_type)"
            continue
        fi

        # For spec checks
        if [[ "$check_type" == "spec" ]]; then
            check_spec_compliance "$req_id" "$enforcement" "$guideline_file"
        fi

        # For impl checks
        if [[ "$check_type" == "implementation" ]]; then
            check_impl_compliance "$req_id" "$enforcement" "$guideline_file"
        fi
    done < <(grep -E "^### [A-Z]+-[A-Z]+-[0-9]+:" "$guideline_file" 2>/dev/null)
}

# Check spec compliance for a requirement
check_spec_compliance() {
    local req_id="$1"
    local enforcement="$2"
    local guideline_file="$3"

    # Extract ARC criteria for this requirement
    local arc_criteria=$(grep -A20 "^### ${req_id}:" "$guideline_file" | grep -E "^- ARC_" | head -5)

    if [[ -z "$arc_criteria" ]]; then
        log_verbose "  $req_id: No ARC criteria defined (skipping)"
        return
    fi

    # ARC IDs use underscores (ARC_SEC_AUTH_01a), but requirement IDs are hyphenated
    # (SEC-AUTH-01). Convert hyphens to underscores so the spec grep can actually match.
    local arc_prefix="ARC_${req_id//-/_}"

    # Check if any spec files reference this requirement's ARC criteria
    local found=false
    for spec_file in "$SPECS_DIR"/*.md; do
        if [[ -f "$spec_file" ]]; then
            if grep -q "$arc_prefix" "$spec_file" 2>/dev/null; then
                found=true
                break
            fi
        fi
    done

    if [[ "$found" == "true" ]]; then
        log_pass "$req_id: ARC criteria found in specs"
    else
        if [[ "$enforcement" == "blocking" ]]; then
            log_fail "$req_id: ARC criteria NOT found in any spec (blocking)"
        else
            log_warn "$req_id: ARC criteria NOT found in any spec (advisory)"
        fi
    fi
}

# Check implementation compliance for a requirement.
#
# This script statically inspects specs and guideline structure; it cannot reliably
# decide whether changed source code satisfies a requirement's intent. Rather than
# emit a FALSE PASS (which would mask real violations and give false CI confidence),
# we report implementation-tier requirements as needing review by the
# enterprise-enforcer agent (`/knowzcode:work`) or `/knowzcode:audit compliance`.
check_impl_compliance() {
    local req_id="$1"
    local enforcement="$2"
    local guideline_file="$3"

    log_review "$req_id ($enforcement): implementation check requires agent/manual review — run \`/knowzcode:audit compliance\`"
}

# Main execution
main() {
    echo ""
    echo "========================================"
    echo "KnowzCode Enterprise Compliance Check"
    echo "========================================"
    echo ""

    check_configuration

    local applies_to_filter="all"
    case "$SCOPE" in
        spec)
            applies_to_filter="spec"
            log "Scope: Specifications only"
            ;;
        impl)
            applies_to_filter="implementation"
            log "Scope: Implementation only"
            ;;
        full)
            applies_to_filter="all"
            log "Scope: Full (spec + implementation)"
            ;;
        *)
            echo "Unknown scope: $SCOPE"
            echo "Usage: $0 [spec|impl|full]"
            exit 2
            ;;
    esac

    echo ""

    # Get and process active guidelines
    local guidelines=$(get_active_guidelines "$applies_to_filter")

    if [[ -z "$guidelines" ]]; then
        log "No active guidelines found for scope: $SCOPE"
        exit 0
    fi

    # Iterate via a here-string, NOT `echo "$guidelines" | while` — a pipe would run the
    # loop (and all log_*/counter increments) in a subshell, so the summary and exit code
    # would always read 0 blocking. A here-string keeps the loop in the current shell.
    while IFS='|' read -r filename enforcement applies_to; do
        [[ -z "$filename" ]] && continue
        local guideline_path="${GUIDELINES_DIR}/${filename}"

        if [[ "$SCOPE" == "spec" ]] || [[ "$SCOPE" == "full" ]]; then
            check_guideline_requirements "$guideline_path" "$enforcement" "spec"
        fi

        if [[ "$SCOPE" == "impl" ]] || [[ "$SCOPE" == "full" ]]; then
            check_guideline_requirements "$guideline_path" "$enforcement" "implementation"
        fi
    done <<< "$guidelines"

    echo ""
    echo "========================================"
    echo "Summary"
    echo "========================================"
    echo ""
    echo -e "  ${GREEN}Passed:${NC}   $PASSED_COUNT"
    echo -e "  ${RED}Blocking:${NC} $BLOCKING_COUNT"
    echo -e "  ${YELLOW}Advisory:${NC} $ADVISORY_COUNT"
    echo -e "  ${YELLOW}Review:${NC}   $REVIEW_COUNT (implementation checks deferred to /knowzcode:audit compliance)"
    echo ""

    # Determine exit code
    if [[ $BLOCKING_COUNT -gt 0 ]]; then
        echo -e "${RED}FAILED: $BLOCKING_COUNT blocking issue(s) found${NC}"
        exit 1
    fi

    if [[ "$STRICT" == "true" ]] && [[ $ADVISORY_COUNT -gt 0 ]]; then
        echo -e "${YELLOW}FAILED (strict mode): $ADVISORY_COUNT advisory issue(s) found${NC}"
        exit 1
    fi

    echo -e "${GREEN}PASSED: All compliance checks passed${NC}"
    exit 0
}

main "$@"
