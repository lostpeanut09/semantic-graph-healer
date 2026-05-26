# Phase 14 Context: WSL Support & Dependency Validation

## Status: LOCKED

**Date:** 2026-05-20
**Strategy:** Declarative/Library-Based Environment Support

---

## Decisions

### 1. Environment Standards & Versioning

- **Node Version:** Minimum >= 24.0.0.
- **npm Version:** Minimum >= 11.0.0.
- **Enforcement:** Use `engines` field in `package.json` and a `.node-version` file.
- **Tooling:** Developers are encouraged to use `fnm` or `Volta` for shimming.
- **Libraries:** Integrate `pathe` for all internal path operations to ensure POSIX consistency.

### 2. Husky & Git Hook Resilience

- **Scripts:** All `.husky/` scripts must be refactored to strict POSIX shell compatibility.
- **Path Detection:** Implement a preamble in hooks to detect WSL/Windows context and normalize Node binary resolution.
- **Automation:** Add `postinstall` logic to ensure hook registration in hybrid environments.

### 3. Subagent Protocol

- **Pathing:** All subagents MUST use root-relative paths for shared state and communication.
- **Bridges:** Use `pathe.normalize()` to handle any unavoidable absolute paths from the host.

### 4. CI/CD Validation

- **Quality Runner:** Add a `verify-platform-agnostic` job to `.github/workflows/quality.yml`.
- **Audit Steps:**
    - Scan for Windows-specific separators (`\\`).
    - Verify build environment matches `engines` constraint.

---

## Success Criteria for Phase 14

1. `npm install` and `npm run build` pass consistently in both native Windows and WSL.
2. Git hooks execute without path errors in both environments.
3. Subagents can share state between Windows and WSL without path translation failures.
4. CI/CD catches any platform-specific path hardcoding.
