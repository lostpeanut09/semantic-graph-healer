---
created: 2025-05-20
status: in-progress
description: Fix WSL dependencies and verify terminal/PowerShell usability
---

# Quick Task: Fix WSL Dependencies + Terminal Check

## Objectives

1. Fix missing TypeScript binary (tsc)
2. Resolve unmet dependencies
3. Address esbuild moderate vulnerability
4. Verify Windows Terminal and PowerShell are usable from WSL
5. Verify git operations work correctly

## Success Criteria

- `type tsc` succeeds or shows a working npx invocation
- `npm ls` shows no UNMET DEPENDENCY errors
- `npm audit` passes at high severity level (or documented exceptions)
- `wt` (Windows Terminal) and `powershell` commands accessible
- `git commit` works without hookspath errors

## Commands

```bash
npm install
npm audit fix --force (if acceptable)
verify tsc
verify wt / powershell
verify git
```
