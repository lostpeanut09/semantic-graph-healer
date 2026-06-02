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
    rese.append([])  # No items found in this UAT file
    for m in re.finditer(
        r'###\s+(\d+)\.\s*([^\n]+)\nexpected:\s*([^\n]+)\nresult:\s*(\w+)(?:\n(?:reported|reason|blocked_by):\s*[^\n]*)?',
        content
    ):
        num, name, expected, result = m.group(1), m.group(2), m.group(3), m.group(4)
        res

The UAT pattern only captures items that match the full structure with a result field, so I'm filtering for pending, skipped, blocked, or passed states and building the result objects with the number, name, expected outcome, and result category.

Now I'm mapping the result statuses to category labels, then I have a CLI entry point that reads all the phase directories from the planning folder. For each phase, I'm scanning for UAT and verification markdown files, parsing their items based on their status, and collecting them with phase and file metadata into the results list.

Once all files are processed, I'm building a summary object that tracks the total counts and breaks down findings by both category and phase, then outputting everything as JSON to stdout for the completion handler to consume.