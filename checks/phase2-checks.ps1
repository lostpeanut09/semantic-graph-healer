<#
.SYNOPSIS
    Phase 2 compliance gate script for Semantic Graph Healer.
.DESCRIPTION
    Validates project-level policy gates: license, no-network stance,
    test-vault development isolation, and minAppVersion compliance.
.NOTES
    Run from project root:  pwsh -File checks/phase2-checks.ps1
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot -replace '\\checks$', ''
Push-Location $root
try {
    $fail = $false

    # --- LICENSE ---
    if (-not (Test-Path 'LICENSE')) { Write-Warning 'LICENSE missing'; $fail = $true }
    $license = Get-Content 'LICENSE' -Raw -ErrorAction SilentlyContinue
    if ($license -notmatch 'GPL-3\.0|GNU General Public License') { Write-Warning 'LICENSE does not reference GPL-3.0'; $fail = $true }

    # --- README compliance ---
    if (-not (Test-Path 'README.md')) { Write-Warning 'README.md missing'; $fail = $true } else {
        $readme = Get-Content 'README.md' -Raw
        if ($readme -notmatch 'GPL-3\.0|GNU General Public License') { Write-Warning 'README missing GPL-3.0'; $fail = $true }
        if ($readme -notmatch 'no.network|no-network|offline|local-only|local only') { Write-Warning 'README missing no-network statement'; $fail = $true }
        if ($readme -notmatch 'test-vault|test vault') { Write-Warning 'README missing test-vault statement'; $fail = $true }
        if ($readme -notmatch '1\.13\.0') { Write-Warning 'README missing minAppVersion 1.13.0'; $fail = $true }
    }

    # --- .gitignore policy ---
    if (Test-Path '.gitignore') {
        $gitignore = Get-Content '.gitignore' -Raw
        if ($gitignore -notmatch 'test-vault/') { Write-Warning '.gitignore missing test-vault/'; $fail = $true }
        if ($gitignore -notmatch '\.planning/') { Write-Warning '.gitignore missing .planning/'; $fail = $true }
        if ($gitignore -notmatch 'main\.js') { Write-Warning '.gitignore missing main.js'; $fail = $true }
        if ($gitignore -notmatch 'node_modules') { Write-Warning '.gitignore missing node_modules'; $fail = $true }
    }

    if ($fail) { throw 'Phase 2 compliance gate FAILED' }
    Write-Host 'Phase 2 compliance gate: PASSED' -ForegroundColor Green
} finally {
    Pop-Location
}
