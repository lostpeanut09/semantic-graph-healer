# generate_v9_diff.ps1
# Genera un report Markdown dinamico di TUTTE le modifiche nel plugin
# Rispetto all'ultimo commit ufficiale (HEAD).
#
# Best Practices 2026:
# - Usa 'git add -N' per includere i file nuovi (untracked)
# - Genera un Indice (TOC) all'inizio per navigabilita
# - Forza encoding UTF-8 per compatibilita Obsidian/Windows
# - Esegue cleanup automatico dell'indice Git alla fine

$PluginDir  = "c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"
$OutputFile = "C:\Users\gabri\Desktop\SemanticHealer_DIFF_REPORT.md"

Set-Location $PluginDir

# 1. PREPARAZIONE INDICE (Captura file nuovi senza caricarne il contenuto)
& git add -N . 2>$null

# 2. RILEVAMENTO FILE MODIFICATI
$ModifiedFiles = & git diff --name-only HEAD 2>&1
if ($ModifiedFiles.Count -eq 0) {
    Write-Host "Nessuna modifica rilevata (rispetto a HEAD). Script terminato." -ForegroundColor Yellow
    & git reset . 2>$null
    exit
}

$BaseCommit  = (& git log --oneline -1 2>&1) -join ""
$GeneratedAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

$sb = [System.Text.StringBuilder]::new()

# ── HEADER DEL DOCUMENTO ───────────────────────────────────────────────────────
[void]$sb.AppendLine("# SemanticHealer - Dynamic DIFF Report")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("**Generato il:** $GeneratedAt")
[void]$sb.AppendLine("**Baseline commit:** $BaseCommit")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("> [!TIP]")
[void]$sb.AppendLine("> Questo report e generato dinamicamente usando git diff e include tutti i file modificati, eliminati o nuovi.")
[void]$sb.AppendLine("")

# ── INDICE (TOC) ───────────────────────────────────────────────────────────────
[void]$sb.AppendLine("### Indice dei File Modificati")
foreach ($File in $ModifiedFiles) {
    $Anchor = $File -replace "[/ \.]", "-"
    [void]$sb.AppendLine("- [$File](#file-$Anchor)")
}
[void]$sb.AppendLine("")
[void]$sb.AppendLine("---")
[void]$sb.AppendLine("")

# ── GENERAZIONE DIFF ───────────────────────────────────────────────────────────
foreach ($File in $ModifiedFiles) {
    $FilePath = Join-Path $PluginDir $File
    $Anchor   = $File -replace "[/ \.]", "-"
    
    [void]$sb.AppendLine("## File: $File")
    [void]$sb.AppendLine("<a name='file-$Anchor'></a>")
    [void]$sb.AppendLine("")

    $DiffLines = & git diff HEAD -- $File 2>&1
    
    if ($DiffLines) {
        [void]$sb.AppendLine('```diff')
        foreach ($DiffLine in $DiffLines) {
            [void]$sb.AppendLine($DiffLine)
        }
        [void]$sb.AppendLine('```')
    } else {
        [void]$sb.AppendLine("*Nessuna differenza testuale rilevata.*")
    }

    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("---")
    [void]$sb.AppendLine("")
}

# 3. CLEANUP
& git reset . 2>$null

# 4. SALVATAGGIO CON ENCODING FORZATO UTF8
[System.IO.File]::WriteAllText($OutputFile, $sb.ToString(), [System.Text.Encoding]::UTF8)

# INFO DI CHIUSURA
$SizeKB = [Math]::Round((Get-Item $OutputFile).Length / 1KB, 1)
Write-Host ""
Write-Host "✅ DYNAMIC DIFF REPORT SALVATO: $OutputFile" -ForegroundColor Green
Write-Host "   File processati : $($ModifiedFiles.Count)" -ForegroundColor Cyan
Write-Host "   Dimensione report : $SizeKB KB" -ForegroundColor Cyan
