#!/usr/bin/env python3
"""
Audit UAT/VERIFICATION items across all phases.

Drop-in replacement for `gsd-sdk query audit-uat` which is broken in WSL
due to path resolution issues in the Node.js shim.

Usage:
  python scripts/extract-audit-findings.py              # all (default)
  python scripts/extract-audit-findings.py --severity high
  python scripts/extract-audit-findings.py --source audit-uat  # same
  python scripts/extract-audit-findings.py --dry-run       # no fix attempts
"""
import argparse, json, os, re, sys
from pathlib import Path

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='audit-uat')
    p.add_argument('--severity', default='medium')
    p.add_argument('--max', type=int, default=10)
    p.add_argument('--dry-run', action='store_true')
    return p.parse_args()

def load_frontmatter(content):
    m = re.match(r'^---\n(.*?)\n---', content, re.DOTALL)
    if not m:
        return {}
    try:
        import yaml; return yaml.safe_load(m.group(1)) or {}
    except Exception:
        return {}

def parse_uat_items(content):
    items = []
    # Pattern to capture standard UAT items:
    # ### 1. Item Name
    # expected: ...
    # result: PENDING/PASSED/FAILED/etc.
    pattern = r'###\s+(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?'
    for m in re.finditer(pattern, content):
        num, name, expected, result = m.group(1), m.group(2), m.group(3), m.group(4)
        items.append({
            "number": num,
            "name": name.strip(),
            "expected": expected.strip(),
            "result": result.strip()
        })
    return items

def main():
    args = parse_args()
    planning_dir = Path('.planning')
    if not planning_dir.exists():
        print(json.dumps({"error": ".planning directory not found"}, indent=2))
        sys.exit(1)

    results = []
    
    # Define search paths for phases/milestones/quick tasks
    search_paths = [
        planning_dir / 'phases',
        planning_dir / 'milestones',
        planning_dir / 'quick'
    ]
    
    # Also check direct subdirectories of .planning that look like phases
    potential_phases = [d for d in planning_dir.iterdir() if d.is_dir() and d.name not in ['phases', 'milestones', 'quick', 'research', 'logs']]
    
    all_containers = [p for p in search_paths if p.exists()] + potential_phases
    
    for container in all_containers:
        # If it's a container like 'phases/', iterate its children
        if container.name in ['phases', 'milestones', 'quick']:
            subdirs = [d for d in container.iterdir() if d.is_dir()]
        else:
            subdirs = [container]
            
        for subdir in subdirs:
            for file in subdir.glob('**/*.md'):
                # Scan for UAT or VERIFICATION files
                if any(x in file.name.upper() for x in ['UAT', 'VERIFICATION', 'PLAN', 'SUMMARY']):
                    try:
                        content = file.read_text(encoding='utf-8')
                        items = parse_uat_items(content)
                        if items:
                            results.append({
                                "phase": subdir.name,
                                "file": str(file.relative_to(planning_dir)),
                                "items": items
                            })
                    except Exception as e:
                        # Skip files that can't be read
                        continue

    # Map result statuses to categories
    category_map = {
        "PENDING": "pending",
        "TODO": "pending",
        "SKIP": "skipped",
        "SKIPPED": "skipped",
        "BLOCKED": "blocked",
        "PASS": "passed",
        "PASSED": "passed",
        "FAIL": "failed",
        "FAILED": "failed"
    }

    summary = {
        "total_items": 0,
        "categories": {
            "pending": 0,
            "skipped": 0,
            "blocked": 0,
            "passed": 0,
            "failed": 0,
            "other": 0
        },
        "phases": {},
        "findings": results
    }

    for res in results:
        phase_name = res["phase"]
        if phase_name not in summary["phases"]:
            summary["phases"][phase_name] = {"total": 0, "pending": 0, "passed": 0}
            
        for item in res["items"]:
            summary["total_items"] += 1
            summary["phases"][phase_name]["total"] += 1
            
            cat = category_map.get(item["result"].upper(), "other")
            summary["categories"][cat] += 1
            if cat == "pending":
                summary["phases"][phase_name]["pending"] += 1
            elif cat == "passed":
                summary["phases"][phase_name]["passed"] += 1

    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
