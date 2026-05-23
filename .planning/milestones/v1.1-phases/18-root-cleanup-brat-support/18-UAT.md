# Phase 18 UAT: BRAT Support & Root Cleanup

**Status:** PASS
**Date:** 2026-05-22

## Verification Checklist

| Requirement                 | Status | Evidence                                                                          |
| --------------------------- | ------ | --------------------------------------------------------------------------------- |
| REQ-18.1: Root Cleanup      | PASS   | Root is free of temporary .txt files and SPEC.md/CHANGELOG.md relocated to docs/. |
| REQ-18.2: CSS Consolidation | PASS   | `src/styles.css` exists and is imported; artifacts untracked from Git.            |
| REQ-18.3: BRAT Distribution | PASS   | `.github/workflows/release-brat.yml` exists and README updated.                   |

## Test Cases

### 1. Root Directory Audit

- **Action:** `ls` in root.
- **Expected:** No `SPEC.md`, `CHANGELOG.md`, `CLAUDE.md`, or build artifacts tracked.
- **Result:** `SPEC.md`, `CHANGELOG.md` moved to `docs/`. `CLAUDE.md` moved to `.planning/docs/`.
- **Finding:** All root artifacts are now untracked.

### 2. Git Tracking Audit

- **Action:** `git ls-files main.js worker.js ladybug-worker.js styles.css main.css`
- **Expected:** No output.
- **Result:** (Empty output)
- **Finding:** All build artifacts correctly removed from the index.

### 3. CSS Consolidation

- **Action:** Check `src/main.ts` and `.config/esbuild.config.mjs`.
- **Result:** `import './styles.css'` found in `src/main.ts`. `renameStylesPlugin` found in `esbuild.config.mjs`.
- **Finding:** Implementation is correct, but the output file tracking needs to be removed.

### 4. BRAT Workflow

- **Action:** `cat .github/workflows/release-brat.yml`
- **Result:** Workflow correctly builds and publishes `dist_bundle` to `dist` branch.

### 5. README Instructions

- **Action:** `grep "BRAT" README.md`
- **Result:** Instructions for BRAT installation via `dist` branch are present.

## Issues Identified

None. All issues are successfully resolved and verified.

### Historical Audit Notes:

1. **ISSUE-18-01:** `styles.css` and `main.css` are still tracked in the root directory. (RESOLVED)
    - **Diagnosis:** The command `git rm --cached` was verified and successfully applied.
    - **Verification:** `git ls-files` returns empty, confirming they are no longer tracked.
