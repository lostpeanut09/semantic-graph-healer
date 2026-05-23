# Phase 18: BRAT Support & Root Cleanup (CONTEXT)

## Goal

Provide a seamless, clean installation experience for Obsidian BRAT users while maintaining a pristine, professional `main` source branch free of build artifacts and AI-generated planning "garbage".

## Key Decisions (Locked)

1. **Dist Branch Strategy (Option A)**
    - The `main` branch MUST NOT track build artifacts (`main.js`, `worker.js`, `ladybug-worker.js`, `main.css`, `styles.css`).
    - A GitHub Action (`.github/workflows/release-brat.yml` or updated `release.yml`) must be created to automatically build and push the necessary plugin files (`main.js`, `manifest.json`, `styles.css`, `worker.js`, `ladybug-worker.js`) to a dedicated `dist` branch whenever `main` is updated.
    - BRAT users will be instructed (via `README.md`) to install from the `dist` branch.

2. **CSS Consolidation**
    - The global `styles.css` will be renamed and moved to `src/styles.css` (or similar).
    - `esbuild.config.mjs` will be updated to bundle Svelte CSS and the global CSS together.
    - A post-build script (e.g., using Node's `fs.renameSync` inside the esbuild config) will rename the output `main.css` to `styles.css` so Obsidian can load it natively.

3. **Worker Management**
    - Due to WASM dependencies in LadybugDB, workers will NOT be inlined to avoid security/origin issues.
    - They will remain as separate files (`worker.js`, `ladybug-worker.js`) but will only exist as tracked files in the `dist` branch and release assets.

4. **Root Cleanup (File Disposition)**
    - **Hidden/Gitignored (Move to `.planning/` or delete):**
        - `CLAUDE.md`
        - `REVIEW.md`
        - `QUICK-TASKS.md`
        - `ladybug-worker.js` (untrack from `main`)
    - **Kept in `main` root:**
        - `README.md` (Update to mention BRAT installation via `dist` branch)
        - `CONTRIBUTING.md`
        - `LICENSE`
        - `package.json`, `tsconfig.json`, `.gitignore`

## Implementation Notes for Downstream Agents

- **Git Operations:** Be extremely careful when untracking files. Use `git rm --cached <file>` so local builds don't break during development, but the repo stops tracking them.
- **esbuild:** Svelte plugin requires `compilerOptions: { css: 'external' }` to output the CSS, which defaults to `main.css`. This must be renamed to `styles.css`.
- **.gitignore:** Ensure `.planning/` remains in `.gitignore`. Ensure `main.js`, `*.css` (except src), and worker JS files are explicitly in `.gitignore` so they aren't accidentally re-added to `main`.
