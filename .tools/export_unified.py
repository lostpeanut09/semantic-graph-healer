import os
import datetime

desktop_path = r"C:\Users\gabri\Desktop\SemanticHealer_FULL_ULTRA_HARDENED_SOURCE.md"
vault_path = r"c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"

# Core Root + ALL Logic folders
root_files = ["main.ts", "types.ts", "types.schema.ts", "DashboardView.ts", "SettingsTab.ts", "roadmap.md"]
core_path = os.path.join(vault_path, "core")

timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

header = f"""# 🏆 Semantic Graph Healer: FULL ULTRA-HARDENED SOURCE (v1.4.7)

**Phase**: 4 - Gold Master (Production Ready)
**Verified**: {timestamp}
**Focus**: Architectural Hardening, DI, Purification, and Lifecycle Safety.

*This is the single, unified, and definitive source code file containing all root and core logic.*

---
"""

def export_unified():
    all_targets = []
    
    # 1. Add root files
    for rf in root_files:
        p = os.path.join(vault_path, rf)
        if os.path.exists(p):
            all_targets.append(rf)
            
    # 2. Recursively find all .ts files in core/
    for root, dirs, files in os.walk(core_path):
        for file in files:
            if file.endswith(".ts"):
                rel_path = os.path.relpath(os.path.join(root, file), vault_path)
                all_targets.append(rel_path)
    
    # Sort for predictability
    all_targets.sort(key=lambda x: (x.count(os.sep), x))
    
    try:
        with open(desktop_path, 'w', encoding='utf-8') as f:
            f.write(header)
            
            # Navigable Index
            f.write("## 🗂️ Navigation Index\n\n")
            for rel in all_targets:
                clean = rel.replace('.', '').replace('/', '').replace('\\', '').lower()
                f.write(f"- [{rel}](#doc-{clean})\n")
            f.write("\n---\n")
            
            for rel_path in all_targets:
                full_path = os.path.join(vault_path, rel_path)
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as src:
                    content = src.read()
                
                clean = rel_path.replace('.', '').replace('/', '').replace('\\', '').lower()
                f.write(f"\n<a name=\"doc-{clean}\"></a>\n")
                f.write(f"## 📄 {rel_path}\n")
                f.write(f"```typescript\n")
                f.write(content)
                f.write("\n```\n")
                print(f"Exported: {rel_path}")
                
        print(f"\n[OK] Unified Source Exported: {desktop_path}")
    except Exception as e:
        print(f"Error during export: {e}")

if __name__ == "__main__":
    export_unified()
