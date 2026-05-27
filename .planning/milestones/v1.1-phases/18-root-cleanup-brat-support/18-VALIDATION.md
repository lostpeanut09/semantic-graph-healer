# Phase 18: BRAT Support & Root Cleanup - Validation

## Validation Architecture

This phase validates that the repository structure is clean, build artifacts are properly handled, and the automated distribution channel is functional.

## Automated Validation

Automated checks are implemented in `tests/Phase18Validation.test.ts`.

### Running Validation

```bash
npm run test tests/Phase18Validation.test.ts
```

## UAT Criteria (User Acceptance)

1. **Clean Root:** Root directory contains no tracked `.js`, `.css`, or AI planning files (`CLAUDE.md`, etc.).
2. **Unified CSS:** `npm run build` produces a single `styles.css` (renamed from `main.css`) which is imported in `src/main.ts`.
3. **Ignored Artifacts:** Build artifacts (`main.js`, `styles.css`, etc.) are untracked and ignored by Git.
4. **BRAT Compatibility:** The `.github/workflows/release-brat.yml` exists and `README.md` contains BRAT instructions.

## Verification Commands

- `git ls-files *.js *.css`: Should return no root files.
- `ls main.js styles.css worker.js ladybug-worker.js`: Should confirm local build existence.
- `npm run build`: Should succeed and generate `styles.css`.
- `git check-ignore main.js`: Should return `main.js`.
