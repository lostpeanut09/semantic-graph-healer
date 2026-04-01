import os
import datetime

desktop_path = r"C:\Users\gabri\Desktop\SemanticHealer_HARDENED_CORE_SOURCE.md"
vault_path = r"c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"

# Only the essential high-value logic files for Phase 4 Hardening
files = [
    "main.ts",
    "types.ts",
    "types.schema.ts",
    "DashboardView.ts",
    "core/CacheService.ts",
    "core/TopologyAnalyzer.ts",
    "core/SuggestionExecutor.ts"
]

timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

header = f"""# 🛡️ Semantic Graph Healer: HARDENED CORE SOURCE

**Session**: Phase 4 Hardening (P0–P3)
**Verified**: {timestamp}
**Focus**: Performance, Scoped Scrutiny, and Persistence Refactoring.

*This document contains only the essential source files modified or created during the hardening cycle to ensure focus and readability.*

---
"""

def export_essential():
    try:
        with open(desktop_path, 'w', encoding='utf-8') as f:
            f.write(header)
            for rel_path in files:
                full_path = os.path.join(vault_path, rel_path)
                if os.path.exists(full_path):
                    with open(full_path, 'r', encoding='utf-8', errors='ignore') as src:
                        content = src.read()
                    
                    f.write(f"\n## 📄 {rel_path}\n")
                    f.write(f"```typescript\n")
                    f.write(content)
                    f.write("\n```\n")
                    print(f"Exported: {rel_path}")
                else:
                    print(f"Warning: File not found {rel_path}")
        print(f"\n✅ Essential Core Exported: {desktop_path}")
    except Exception as e:
        print(f"Error during export: {e}")

if __name__ == "__main__":
    export_essential()
