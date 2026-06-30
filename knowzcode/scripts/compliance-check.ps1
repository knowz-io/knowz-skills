#
# KnowzCode Enterprise Compliance Check (PowerShell)
# CI/CD integration script for deterministic compliance validation
#
# Usage:
#   .\scripts\compliance-check.ps1 [-Scope <spec|impl|full>] [-Strict] [-Verbose]
#
# Exit codes:
#   0 - All checks passed (or compliance disabled)
#   1 - Blocking issues found
#   2 - Configuration error
#

param(
    [ValidateSet("spec", "impl", "full")]
    [string]$Scope = "full",
    [switch]$Strict,
    [switch]$VerboseOutput
)

$ErrorActionPreference = "Stop"

# Configuration
$KnowzCodeDir = "knowzcode"
$EnterpriseDir = "$KnowzCodeDir/enterprise"
$ManifestFile = "$EnterpriseDir/compliance_manifest.md"
$GuidelinesDir = "$EnterpriseDir/guidelines"
$SpecsDir = "$KnowzCodeDir/specs"

# Counters
$script:BlockingCount = 0
$script:AdvisoryCount = 0
$script:PassedCount = 0
$script:ReviewCount = 0

function Write-Log {
    param([string]$Message)
    Write-Host "[KC-COMPLIANCE] $Message" -ForegroundColor Cyan
}

function Write-Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor Green
    $script:PassedCount++
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[BLOCKING] $Message" -ForegroundColor Red
    $script:BlockingCount++
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[ADVISORY] $Message" -ForegroundColor Yellow
    $script:AdvisoryCount++
}

function Write-Review {
    param([string]$Message)
    Write-Host "[REVIEW] $Message" -ForegroundColor Yellow
    $script:ReviewCount++
}

function Write-VerboseLog {
    param([string]$Message)
    if ($VerboseOutput) {
        Write-Host "  $Message" -ForegroundColor Gray
    }
}

function Test-Configuration {
    if (-not (Test-Path $EnterpriseDir)) {
        Write-Log "Enterprise compliance not configured (no $EnterpriseDir/ directory)"
        Write-Log "Skipping compliance checks - this is OK if compliance is not required"
        exit 0
    }

    if (-not (Test-Path $ManifestFile)) {
        Write-Log "Manifest file not found: $ManifestFile"
        exit 2
    }

    $manifestContent = Get-Content $ManifestFile -Raw

    if ($manifestContent -match "compliance_enabled:\s*false") {
        Write-Log "Compliance checking is disabled in manifest"
        Write-Log "Set compliance_enabled: true to enable"
        exit 0
    }

    if ($manifestContent -notmatch "compliance_enabled:\s*true") {
        Write-Log "compliance_enabled not set to true in manifest"
        exit 0
    }

    Write-Log "Compliance enabled - running checks..."
}

function Get-ActiveGuidelines {
    param([string]$AppliesTo)

    $guidelines = @()
    $manifestContent = Get-Content $ManifestFile

    foreach ($line in $manifestContent) {
        # Match: | filename.md | enforcement | applies_to | true |
        if ($line -match "^\|\s*(\S+\.md)\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|\s*true\s*\|") {
            $filename = $matches[1]
            $enforcement = $matches[2]
            $applies = $matches[3]

            if ($AppliesTo -eq "all" -or $applies -eq $AppliesTo -or $applies -eq "both") {
                $guidelines += @{
                    Filename = $filename
                    Enforcement = $enforcement
                    AppliesTo = $applies
                }
            }
        }
    }

    return $guidelines
}

function Test-GuidelineHasContent {
    param([string]$FilePath)

    if (-not (Test-Path $FilePath)) {
        return $false
    }

    $content = Get-Content $FilePath -Raw
    # `(?m)` (Multiline) is required: on a -Raw single string, a bare `^` anchors to the
    # start of the whole file, so `^###` would only match a header at the very top.
    return $content -match "(?m)^### [A-Z]+-[A-Z]+-[0-9]+:" -or $content -match "\*\*Requirement:\*\*"
}

function Test-SpecCompliance {
    param(
        [string]$ReqId,
        [string]$Enforcement
    )

    # ARC IDs use underscores (ARC_SEC_AUTH_01a), but requirement IDs are hyphenated
    # (SEC-AUTH-01). Convert hyphens to underscores so the spec match can actually succeed.
    $arcPrefix = "ARC_" + ($ReqId -replace '-', '_')
    $found = $false

    if (Test-Path $SpecsDir) {
        # Use the pipeline result, NOT a $found assignment inside ForEach-Object — that
        # block runs in a child scope, so the assignment would not propagate out.
        $found = [bool](Get-ChildItem "$SpecsDir/*.md" -ErrorAction SilentlyContinue | Where-Object {
            (Get-Content $_.FullName -Raw -ErrorAction SilentlyContinue) -match [regex]::Escape($arcPrefix)
        })
    }

    if ($found) {
        Write-Pass "$ReqId`: ARC criteria found in specs"
    } else {
        if ($Enforcement -eq "blocking") {
            Write-Fail "$ReqId`: ARC criteria NOT found in any spec (blocking)"
        } else {
            Write-Warn "$ReqId`: ARC criteria NOT found in any spec (advisory)"
        }
    }
}

function Test-GuidelineRequirements {
    param(
        [string]$GuidelineFile,
        [string]$Enforcement,
        [string]$CheckType
    )

    if (-not (Test-Path $GuidelineFile)) {
        Write-VerboseLog "Guideline file not found: $GuidelineFile (skipping)"
        return
    }

    if (-not (Test-GuidelineHasContent $GuidelineFile)) {
        Write-VerboseLog "Guideline $(Split-Path $GuidelineFile -Leaf) is empty/template (skipping)"
        return
    }

    $guidelineName = [System.IO.Path]::GetFileNameWithoutExtension($GuidelineFile)
    Write-Log "Checking guideline: $guidelineName ($Enforcement)"

    $content = Get-Content $GuidelineFile -Raw
    $reqMatches = [regex]::Matches($content, "^### ([A-Z]+-[A-Z]+-[0-9]+):", [System.Text.RegularExpressions.RegexOptions]::Multiline)

    foreach ($match in $reqMatches) {
        $reqId = $match.Groups[1].Value

        # Honor each requirement's own **Applies To:** scope, matching compliance-check.sh.
        # Without this, a spec check would (incorrectly) flag implementation-only requirements
        # as blocking, diverging from the bash script and failing CI only on Windows.
        $reqAppliesTo = ''
        $scopeMatch = [regex]::Match($content, "(?ms)^### $([regex]::Escape($reqId)):.*?\*\*Applies To:\*\*\s*(\w+)")
        if ($scopeMatch.Success) { $reqAppliesTo = $scopeMatch.Groups[1].Value }
        if ($reqAppliesTo -ne $CheckType -and $reqAppliesTo -ne 'both') {
            Write-VerboseLog "  $reqId`: N/A (applies to $reqAppliesTo, checking $CheckType)"
            continue
        }

        if ($CheckType -eq "spec") {
            Test-SpecCompliance -ReqId $reqId -Enforcement $Enforcement
        }

        if ($CheckType -eq "implementation") {
            # Static inspection cannot reliably decide whether changed source satisfies a
            # requirement's intent. Emit a REVIEW (deferred to the enterprise-enforcer agent)
            # rather than a FALSE PASS that would mask real violations.
            Write-Review "$reqId ($Enforcement)`: implementation check requires agent/manual review — run /knowzcode:audit compliance"
        }
    }
}

# Main execution
Write-Host ""
Write-Host "========================================"
Write-Host "KnowzCode Enterprise Compliance Check"
Write-Host "========================================"
Write-Host ""

Test-Configuration

$appliesFilter = switch ($Scope) {
    "spec" { "spec"; Write-Log "Scope: Specifications only" }
    "impl" { "implementation"; Write-Log "Scope: Implementation only" }
    "full" { "all"; Write-Log "Scope: Full (spec + implementation)" }
}

Write-Host ""

$guidelines = Get-ActiveGuidelines -AppliesTo $appliesFilter

if ($guidelines.Count -eq 0) {
    Write-Log "No active guidelines found for scope: $Scope"
    exit 0
}

foreach ($guideline in $guidelines) {
    $guidelinePath = "$GuidelinesDir/$($guideline.Filename)"

    if ($Scope -eq "spec" -or $Scope -eq "full") {
        Test-GuidelineRequirements -GuidelineFile $guidelinePath -Enforcement $guideline.Enforcement -CheckType "spec"
    }

    if ($Scope -eq "impl" -or $Scope -eq "full") {
        Test-GuidelineRequirements -GuidelineFile $guidelinePath -Enforcement $guideline.Enforcement -CheckType "implementation"
    }
}

Write-Host ""
Write-Host "========================================"
Write-Host "Summary"
Write-Host "========================================"
Write-Host ""
Write-Host "  Passed:   $script:PassedCount" -ForegroundColor Green
Write-Host "  Blocking: $script:BlockingCount" -ForegroundColor Red
Write-Host "  Advisory: $script:AdvisoryCount" -ForegroundColor Yellow
Write-Host "  Review:   $script:ReviewCount (implementation checks deferred to /knowzcode:audit compliance)" -ForegroundColor Yellow
Write-Host ""

if ($script:BlockingCount -gt 0) {
    Write-Host "FAILED: $script:BlockingCount blocking issue(s) found" -ForegroundColor Red
    exit 1
}

if ($Strict -and $script:AdvisoryCount -gt 0) {
    Write-Host "FAILED (strict mode): $script:AdvisoryCount advisory issue(s) found" -ForegroundColor Yellow
    exit 1
}

Write-Host "PASSED: All compliance checks passed" -ForegroundColor Green
exit 0
