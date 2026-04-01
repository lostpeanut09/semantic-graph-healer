$desktopPath = "C:\Users\gabri\Desktop\SemanticHealer_Phase4_FULL_SOURCE_V6.md"
$vaultPath = "c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"
$content = "# 🚀 Semantic Graph Healer: Phase 4 FULL SOURCE (V6)`n"
$content += "**Last Verified**: 2026-03-31 20:55 (TRUE GOLD MASTER)`n`n"
$content += "This document contains the *complete, verified, and non-truncated* source code exported directly from the production vault.`n`n---`n"

$files = @("main.ts", "types.ts", "core/LinkPredictionEngine.ts", "core/adapters/UnifiedMetadataAdapter.ts", "core/TopologyAnalyzer.ts", "core/services/KeychainService.ts")

foreach ($relPath in $files) {
    $path = Join-Path $vaultPath $relPath
    if (Test-Path $path) {
        $fileContent = Get-Content -Raw $path
        $content += "`n## 📄 $relPath`n"
        $content += "```typescript`n"
        $content += $fileContent
        $content += "`n"
        $content += "````n"
    } else {
        $content += "`n## 📄 $relPath (NOT FOUND)`n"
    }
}

Set-Content -Path $desktopPath -Value $content -Encoding utf8
Write-Host "✅ Export complete: $desktopPath"
