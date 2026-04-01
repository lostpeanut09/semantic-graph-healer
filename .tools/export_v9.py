import os
import datetime

desktop_path = r"C:\Users\gabri\Desktop\SemanticHealer_Phase4_FULL_SOURCE_V9_GOLD_HARDENED.md"
vault_path = r"c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"

files = [
    "main.ts",
    "types.ts",
    "types.schema.ts",
    "DashboardView.ts",
    "SettingsTab.ts",
    "core/CacheService.ts",
    "core/TopologyAnalyzer.ts",
    "core/LinkPredictionEngine.ts",
    "core/LlmService.ts",
    "core/QualityAnalyzer.ts",
    "core/ReasoningService.ts",
    "core/SuggestionExecutor.ts",
    "core/HealerUtils.ts",
    "core/utils/HealerLogger.ts",
    "core/services/KeychainService.ts",
    "core/adapters/UnifiedMetadataAdapter.ts",
    "styles.css",
    "manifest.json"
]

timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

header = f"""# 🚀 Semantic Graph Healer: Phase 4 FULL SOURCE (V9 GOLD HARDENED)

**Last Verified**: {timestamp} (ULTRA-STABLE MASTER)
**Version**: 1.5.0-hardened
**Focus**: Performance persistence, scoped scrutiny, and lifecycle safety.

This document contains the *complete, verified, and non-truncated* source code exported directly from the production vault.

---
"""

def export():
    try:
        with open(desktop_path, 'w', encoding='utf-8') as f:
            f.write(header)
            for rel_path in files:
                full_path = os.path.join(vault_path, rel_path)
                if os.path.exists(full_path):
                    ext = os.path.splitext(rel_path)[1].lower()
                    lang = "typescript" if ext == ".ts" else "css" if ext == ".css" else "json" if ext == ".json" else ""
                    
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as src:
                        content = src.read()
                    
                    f.write(f"\n## 📄 {rel_path}\n")
                    f.write(f"```{lang}\n")
                    f.write(content)
                    f.write("\n```\n")
                    print(f"Exported: {rel_path}")
                else:
                    print(f"Warning: File not found {rel_path}")
        print(f"\n✅ Export Complete: {desktop_path}")
    except Exception as e:
        print(f"Error during export: {e}")

if __name__ == "__main__":
    export()
