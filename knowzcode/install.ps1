# KnowzCode PowerShell Bootstrap
# Delegates to the Node.js installer (bin/knowzcode.mjs)
#
# Usage: .\install.ps1 [install|uninstall|upgrade|detect] [options]
# All arguments are forwarded to the Node.js CLI.

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$MinNodeVersion = 18

function Test-NodeVersion {
    try {
        $ver = (node -v 2>$null) -replace '^v', '' -split '\.' | Select-Object -First 1
        return [int]$ver -ge $MinNodeVersion
    } catch {
        return $false
    }
}

if (-not (Test-NodeVersion)) {
    Write-Host ""
    Write-Host "[ERROR] Node.js $MinNodeVersion+ is required to run the KnowzCode installer." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install Node.js: https://nodejs.org/"
    Write-Host ""
    Write-Host "Alternative (no Node.js needed):"
    Write-Host "  Claude Code plugin:  /plugin marketplace add knowz-io/knowz-plugins"
    Write-Host "                       /plugin install knowzcode@knowz-marketplace"
    Write-Host ""
    exit 1
}

$localBin = Join-Path $ScriptDir "bin\knowzcode.mjs"

if (Test-Path $localBin) {
    & node $localBin @args
} else {
    & npx knowzcode @args
}
