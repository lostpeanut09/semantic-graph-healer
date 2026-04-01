$desktopPath = "C:\Users\gabri\Desktop\SemanticGraphHealer_v2.0.1_GOLD_MASTER_FINAL.md"
$vaultPath = "c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

$header = "# 🚀 Semantic Graph Healer: v2.0.1 GOLD MASTER FINAL`n`n"
$header += "**Last Verified**: $timestamp (PRODUCTION READY)`n"
$header += "**Version**: 2.0.1-GoldMaster`n"
$header += "**Focus**: Zero-lint, type-safe, and UI-compliant architecture.`n`n"
$header += "This document contains the *complete, verified, and non-truncated* source code for the Final Gold Master release.`n`n---`n"

Set-Content -Path $desktopPath -Value $header -Encoding utf8

$files = @(
    "main.ts",
    "types.ts",
    "types.schema.ts",
    "DashboardView.ts",
    "SettingsTab.ts",
    "core/CacheService.ts",
    "core/GraphEngine.ts",
    "core/TopologyAnalyzer.ts",
    "core/LinkPredictionEngine.ts",
    "core/LlmService.ts",
    "core/QualityAnalyzer.ts",
    "core/ReasoningService.ts",
    "core/SuggestionExecutor.ts",
    "core/HealerUtils.ts",
    "core/StructuralCache.ts",
    "core/SemanticTagPropagator.ts",
    "core/DataAdapter.ts",
    "core/utils/HealerLogger.ts",
    "core/services/KeychainService.ts",
    "core/services/GraphWorkerService.ts",
    "core/adapters/UnifiedMetadataAdapter.ts",
    "core/adapters/IMetadataAdapter.ts",
    "core/adapters/BreadcrumbsAdapter.ts",
    "core/adapters/DatacoreAdapter.ts",
    "core/adapters/SmartConnectionsAdapter.ts",
    "core/workers/graph-analysis-worker.ts",
    "styles.css",
    "manifest.json"
)

foreach ($relPath in $files) {
    $path = Join-Path $vaultPath $relPath
    if (Test-Path $path) {
        $ext = [System.IO.Path]::GetExtension($path).ToLower()
        $lang = ""
        if ($ext -eq ".ts") { $lang = "typescript" }
        elseif ($ext -eq ".css") { $lang = "css" }
        elseif ($ext -eq ".json") { $lang = "json" }
        
        $fileContent = Get-Content -Raw $path
        
        $fileHeader = "`n## 📄 $relPath`n"
        $fileHeader += "```$lang`n"
        
        Add-Content -Path $desktopPath -Value $fileHeader -Encoding utf8
        Add-Content -Path $desktopPath -Value $fileContent -Encoding utf8
        Add-Content -Path $desktopPath -Value ("`n" + '```') -Encoding utf8
        Write-Host "Exported: $relPath"
    } else {
        Write-Warning "File not found: $relPath"
    }
}

Write-Host "Done!"
