# Phase 18: BRAT Support & Root Cleanup - Research

**Researched:** 2026-05-22
**Domain:** Obsidian Plugin Deployment & Build Engineering
**Confidence:** HIGH

## Summary

This research phase focused on enabling support for the Obsidian BRAT plugin via a dedicated `dist` branch and cleaning up the repository's root directory. Investigation confirms that BRAT requires a branch containing the compiled `main.js` and `manifest.json` at the root. For this project, `worker.js`, `ladybug-worker.js`, and `styles.css` are also required for full functionality.

**Primary recommendation:** Use a GitHub Action to automate building the plugin and force-pushing only the five required artifacts (`main.js`, `manifest.json`, `styles.css`, `worker.js`, `ladybug-worker.js`) to a new `dist` branch.

## Architectural Responsibility Map

| Capability          | Primary Tier         | Secondary Tier | Rationale                                              |
| ------------------- | -------------------- | -------------- | ------------------------------------------------------ |
| Plugin Loading      | Obsidian API         | —              | Obsidian core reads manifest and loads main.js         |
| Beta Distribution   | GitHub (dist branch) | BRAT Plugin    | Decouples source code from ready-to-use artifacts      |
| Build Orchestration | esbuild              | GitHub Actions | Transforms TypeScript/Svelte into browser-ready assets |

## Standard Stack

### Core

| Library           | Version | Purpose       | Why Standard                                    |
| ----------------- | ------- | ------------- | ----------------------------------------------- |
| esbuild           | 0.28.0  | Bundler       | Extreme performance and first-class CSS support |
| esbuild-svelte    | 0.9.5   | Svelte plugin | Native Svelte 5 support for esbuild             |
| svelte-preprocess | 6.0.3   | TS support    | Standard preprocessor for Svelte components     |

## Architecture Patterns

### GitHub Action for 'dist' Branch

The following workflow (`.github/workflows/dist.yml`) is recommended to automate the BRAT-compatible distribution:

```yaml
name: BRAT Distribution
on:
    push:
        branches: [main]
jobs:
    build:
        runs-on: ubuntu-latest
        permissions:
            contents: write
        steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                  node-version: '22'
                  cache: 'npm'
            - run: npm install --legacy-peer-deps
            - run: npm run build
            - name: Deploy to dist
              uses: s0/git-publish-subdir-action@develop
              env:
                  REPO: self
                  BRANCH: dist
                  FOLDER: .
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
                  SKIP_EMPTY_COMMITS: true
                  FILES: main.js,manifest.json,styles.css,worker.js,ladybug-worker.js
```

### CSS Consolidation

Currently, `esbuild.config.mjs` generates `main.css`. Obsidian requires `styles.css`.

1. Modify `entryPoints` in `esbuild.config.mjs` to ensure the CSS output is named `styles.css`.
2. Ensure `src/main.ts` imports the global `src/styles.css` to trigger bundling.

## Don't Hand-Roll

| Problem        | Don't Build                 | Use Instead                  | Why                                             |
| -------------- | --------------------------- | ---------------------------- | ----------------------------------------------- |
| Branch Pushing | Custom git bash script      | s0/git-publish-subdir-action | Handles orphan branches and token auth securely |
| CSS Bundling   | Manual string concatenation | esbuild CSS loader           | Handles imports and minification automatically  |

## Common Pitfalls

### Pitfall 1: Missing Workers in BRAT

**What goes wrong:** Plugin installs via BRAT but fails to start or throws "Worker not found".
**How to avoid:** Explicitly include `worker.js` and `ladybug-worker.js` in the `FILES` list of the deployment action.

### Pitfall 2: Manifest Version Sync

**What goes wrong:** BRAT doesn't detect updates.
**How to avoid:** Ensure the build process doesn't overwrite `manifest.json` with a stale version.

## Root Cleanup Plan

The following files should be moved or ignored to clean the root directory:

| File              | Disposition | Destination              |
| ----------------- | ----------- | ------------------------ |
| CHANGELOG.md      | Move        | docs/CHANGELOG.md        |
| SPEC.md           | Move        | docs/SPEC.md             |
| REVIEW.md         | Move        | .planning/REVIEW.md      |
| lint_output.txt   | Ignore      | .gitignore               |
| tsc_out.txt       | Ignore      | .gitignore               |
| ladybug-worker.js | Dist-only   | Keep in root (generated) |

## Assumptions Log

| #   | Claim                        | Section | Risk if Wrong                                            |
| --- | ---------------------------- | ------- | -------------------------------------------------------- |
| A1  | BRAT supports extra JS files | Summary | Critical - Workers won't load if BRAT only pulls 2 files |
| A2  | esbuild-svelte 0.9.5         | Core    | Low - Version is confirmed in package.json               |
