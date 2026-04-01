$target = "C:\Users\gabri\Desktop\SemanticGraphHealer_Source.md"
$srcDir = "C:\Scuola 2\.obsidian\plugins\semantic-graph-healer"
$files = @(
  "$srcDir\main.ts",
  "$srcDir\types.ts",
  "$srcDir\SettingsTab.ts",
  "$srcDir\DashboardView.ts"
)
$files += Get-ChildItem "$srcDir\core\*.ts" | Select-Object -ExpandProperty FullName
$files += Get-ChildItem "$srcDir\src\" -Recurse -Filter "*.ts" | Select-Object -ExpandProperty FullName

Clear-Content $target -ErrorAction SilentlyContinue

foreach ($f in $files) {
    if (Test-Path $f) {
        $relPath = $f.Replace($srcDir, "").Trim("\")
        Add-Content $target "# File: $relPath"
        Add-Content $target "---"
        Add-Content $target '```typescript'
        Get-Content $f | Add-Content $target
        Add-Content $target '```'
        Add-Content $target "`n---`n"
    }
}
Write-Output "Aggiornamento completato: $target"
