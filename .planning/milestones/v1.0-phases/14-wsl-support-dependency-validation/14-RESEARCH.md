# Phase 14 Research: WSL Support & Dependency Validation

## Current State Analysis

### Environment

- **OS:** Hybrid (Windows host, WSL common for development/CI).
- **Node Version:** Currently undefined in `package.json`. CI uses Node 22.
- **npm Version:** Currently undefined.

### Path Handling

- Multiple instances of `.split('/')` and manual path joining found in `src/`.
- Potential for issues when running on Windows (where `path.sep` is `\`) vs WSL/Linux (where it is `/`).
- Obsidian internal paths are generally POSIX-style (`/`), but local file system operations (like in tests or scripts) might use platform-specific separators.

### Git Hooks (Husky)

- Current hooks are basic shell scripts.
- They assume `npm` is in the PATH and reachable.
- May fail in WSL if trying to call Windows-installed Node/npm or vice-versa without proper path translation.

## Proposed Strategies

### 1. Environment Enforcement

- **Action:** Add `engines` to `package.json`.
- **Constraint:** Node >= 24.0.0, npm >= 11.0.0.
- **Action:** Create `.node-version` file for tools like `fnm`, `nvm`, `asdf`, `volta`.

### 2. POSIX-Consistent Pathing

- **Action:** Add `pathe` as a dependency.
- **Why `pathe`?** It provides a unified path API that always uses forward slashes, even on Windows. This is critical for maintaining consistency between Obsidian's internal representation and the underlying file system in hybrid environments.
- **Impact Areas:**
    - `src/core/DataAdapter.ts`
    - `src/core/TopologyAnalyzer.ts`
    - `src/core/ReasoningService.ts`
    - Any file using `split('/')` for path manipulation.

### 3. Husky Hook Hardening

- **Action:** Refactor `.husky/pre-commit` and `.husky/pre-push`.
- **Enhancement:**
    - Add a check for WSL environment.
    - Normalize binary resolution (e.g., using `which` or absolute paths if necessary).
    - Ensure scripts are strict POSIX (shellcheck compliant).

### 4. CI/CD Agnostic Validation

- **Action:** Update `.github/workflows/quality.yml`.
- **Enhancement:**
    - Set `node-version: '24'`.
    - Add a new job `verify-platform-agnostic` that runs a custom script to scan for hardcoded `\\` or platform-specific logic.

## Dependencies to Add

- `pathe` (Runtime dependency for path normalization).

## Verification Strategy

- **Manual:** Run `npm install` and `npm run build` in both Windows PowerShell and WSL Ubuntu.
- **Automated:** New CI job to scan for anti-patterns.
- **Hook Test:** Verify hooks trigger and pass in both environments.
