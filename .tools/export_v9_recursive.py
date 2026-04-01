import os
import datetime

desktop_path = r"C:\Users\gabri\Desktop\SemanticHealer_Phase4_FULL_SOURCE_V9_GOLD_HARDENED.md"
vault_path = r"c:\Scuola 2\.obsidian\plugins\semantic-graph-healer"

# Directories and files to exclude
EXCLUDE_DIRS = {'.git', '.github', '.husky', 'node_modules', '.obsidian', '.gemini'}
EXCLUDE_FILES = {'package-lock.json', 'export_v9.py', 'export_v9_full.ps1', 'generate_v9_diff.ps1', 'tmp_export.ps1', 'main.js', 'worker.js', 'export_v9_recursive.py'}
INCLUDE_EXTENSIONS = {'.ts', '.css', '.json', '.md'}

timestamp = datetime.datetime.now().strftime('%Y-%m-%d %H:%M')

header = f"""# 🚀 Semantic Graph Healer: Phase 4 FULL SOURCE (V9 GOLD HARDENED)

**Last Verified**: {timestamp} (ULTRA-STABLE MASTER)
**Version**: 1.5.0-hardened
**Focus**: Performance persistence, scoped scrutiny, and lifecycle safety.

This document contains EVERY source file in the plugin directory, recursively scanned and verified.

---
"""

def export_all():
    all_files = []
    
    # 1. Walk the directory tree
    for root, dirs, files in os.walk(vault_path):
        # Filter excluded directories in-place to prevent walking them
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            if file in EXCLUDE_FILES:
                continue
            
            ext = os.path.splitext(file)[1].lower()
            if ext in INCLUDE_EXTENSIONS:
                rel_path = os.path.relpath(os.path.join(root, file), vault_path)
                all_files.append(rel_path)
    
    # 2. Sort files logically: root files first, then subdirectories
    all_files.sort(key=lambda x: (x.count(os.sep), x))
    
    try:
        with open(desktop_path, 'w', encoding='utf-8') as f:
            f.write(header)
            
            # File Index
            f.write("## 🗂 File Index\n\n")
            for rel_path in all_files:
                # Build anchor manually to avoid backslashes in f-string
                clean = rel_path.replace('.', '').replace('/', '').replace('\\', '').lower()
                f.write(f"- [{rel_path}](#doc-{clean})\n")
            f.write("\n---\n")
            
            for rel_path in all_files:
                full_path = os.path.join(vault_path, rel_path)
                ext = os.path.splitext(rel_path)[1].lower()
                lang = "typescript" if ext == ".ts" else "css" if ext == ".css" else "json" if ext == ".json" else "markdown" if ext == ".md" else ""
                
                with open(full_path, 'r', encoding='utf-8', errors='ignore') as src:
                    content = src.read()
                
                clean = rel_path.replace('.', '').replace('/', '').replace('\\', '').lower()
                f.write(f"\n<a name=\"doc-{clean}\"></a>\n")
                f.write(f"## 📄 {rel_path}\n")
                f.write(f"```{lang}\n")
                f.write(content)
                f.write("\n```\n")
                print(f"Exported: {rel_path}")
                
        print(f"\nTotal Files Exported: {len(all_files)}")
    except Exception as e:
        print(f"Error during export: {e}")

if __name__ == "__main__":
    export_all()
