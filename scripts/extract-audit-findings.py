#!/usr/bin/env python3
"""
Audit UAT/VERIFICATION items across all phases.

Drop-in replacement for `gsd-sdk query audit-uat` which is broken in WSL
due to path resolution issues in the Node.js shim.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='audit-uat')
    p.add_argument('--severity', default='medium')
    p.add_argument('--max', type=int, default=10)
    p.add_argument('--dry-run', action='store_true')
    return p.parse_args()

def parse_uat_items(content):
    items = []
    # Flexible pattern for matching UAT items:
    # ### 1. Name
    # [optional newlines]
    # expected: ...
    # result: [pending] or PASS
    pattern = r'###\s+(\d+)\.\s*([^\n]+)\s*\n\s*expected:\s*([^\n]+)\s*\n\s*result:\s*\[?(\w+)\]?'
    for m in re.finditer(pattern, content, re.MULTILINE):
        num, name, expected, result = m.groups()
        status = result.upper()
        if status in ['PENDING', 'SKIPPED', 'BLOCKED', 'FAILED', 'FAIL']:
            items.append({
                'id': num,
                'name': name.strip(),
                'expected': expected.strip(),
                'result': status
            })
    return items

def main():
    args = parse_args()
    planning_dir = Path('.planning')
    if not planning_dir.exists():
        planning_dir = Path('..') / '.planning'
    
    if not planning_dir.exists():
        print(json.dumps({'error': 'Planning directory (.planning) not found'}, indent=2))
        sys.exit(1)

    phases_dir = planning_dir / 'phases'
    all_findings = []
    
    if phases_dir.exists():
        for phase_path in sorted(phases_dir.iterdir()):
            if not phase_path.is_dir():
                continue
            
            phase_name = phase_path.name
            for doc in phase_path.glob('*.md'):
                name_up = doc.name.upper()
                if any(x in name_up for x in ['UAT', 'VERIFICATION', 'VALIDATION']):
                    try:
                        with open(doc, 'r', encoding='utf-8') as f:
                            content = f.read()
                            items = parse_uat_items(content)
                            if items:
                                all_findings.append({
                                    'phase': phase_name,
                                    'file': doc.name,
                                    'items': items
                                })
                    except Exception:
                        pass

    summary = {
        'total_phases_with_issues': len(all_findings),
        'total_items': sum(len(f['items']) for f in all_findings),
        'findings': all_findings
    }
    
    print(json.dumps(summary, indent=2))

if __name__ == '__main__':
    main()
