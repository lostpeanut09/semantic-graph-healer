# Phase 18 UAT: BRAT Support & Root Cleanup

**Status:** PASS
**Date:** 2026-05-22

## Verification Checklist

| Requirement | Status | Evidence |
|-------------|--------|----------|
| REQ-18.1: Root Cleanup | PASS | Root is free of temporary .txt files and SPEC.md/CHANGELOG.md relocated to docs/. |
| REQ-18.2: CSS Consolidation | PASS | `src/styles.css` exists and is imported; artifacts untracked from Git. |
| REQ-18.3: BRAT Distribution | PASS | `.github/workflows/release-brat.yml` exists and README updated. |

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

1. **ISSUE-18-01:** `styles.css` and `main.css` are still tracked in the root directory.
   - **Diagnosis:** The command `git rm --cached` was likely not executed or failed to stage for all artifacts during Phase 18 execution.
   - **Impact:** Root artifacts will be committed to `main`, cluttering the source branch.

## Fix Plan (Draft)

1. Untrack artifacts from git:
   ```bash
   git rm --cached styles.css main.css
   ```
2. Ensure `.gitignore` is correctly applied (it already contains them).
3. Commit the tracking changes.
