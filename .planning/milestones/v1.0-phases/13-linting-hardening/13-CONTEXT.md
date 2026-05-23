# Phase 13 Context: Linting & Repository Hardening

## Decisions

### 1. ESLint for Development Scripts

- **Decision:** Allow Node.js modules (`fs`, `path`) for files in the `scripts/` directory via explicit overrides in `eslint.config.js`.
- **Constraint:** Do not ignore Obsidian rules entirely; only relax Node-specific restrictions for non-runtime code.

### 2. Strategy for `any` Type Reduction

- **Decision:** Aim for high type safety.
- **Guideline:** Research SOTA (May 2026) for Obsidian plugin standards. Minimize usage of `any` and unsafe casts, replacing them with proper interfaces or `unknown` + type guards where possible.

### 3. Knip Cleanup (Unused Dependencies)

- **Decision:** Keep the currently identified unused dependencies (`d3-force-3d`, `graphology-dag`, `three`) for now to ensure no regressions in the graph view bundle.
- **Future Note:** Pruning is deferred but acknowledged for post-v1 cleanup.

### 4. UI Sentence Case Enforcement

- **Decision:** Perform a bulk correction of all UI strings (labels, settings names, notices) to follow Obsidian's Human Interface Guidelines (Sentence case).

### 5. Husky Hook Verification & Build Integration

- **Decision:** Verify existing Husky hooks.
- **Action:** Add `npm run build` to the `pre-push` hook to ensure no type errors reach the repository.

## Patterns to Reuse

- Use `import type` as established in Phase 12.
- Follow the vertical port/adapter pattern for any new types needed to replace `any`.

## Research Required

- SOTA May 2026: Official Obsidian plugin review guidelines and community best practices for TypeScript strictness.
