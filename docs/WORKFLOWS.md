<!-- generated-by: gsd-doc-writer -->

# WORKFLOWS.md

## Overview

This document outlines the standard workflows for developing, testing, auditing, and releasing the Semantic Graph Healer plugin. It serves as a guide for maintainers and contributors to ensure consistency and quality across the codebase.

## GSD Audit & Planning Workflows

The project utilizes GSD methodology for tracking tasks, auditing implementations, and performing User Acceptance Testing (UAT).

### Extracting Audit Findings

We use a custom Python script to extract UAT and VERIFICATION items across all implementation phases. This serves as a reliable cross-platform alternative to the standard `gsd-sdk query audit-uat`.

- **Script:** `scripts/extract-audit-findings.py`
- **Purpose:** Scans the project (such as the `.planning/` directory) for UAT items and summarizes their status (pending, blocked, skipped, passed).
- **Usage Examples:**

    ```bash
    # Extract all findings (default)
    python scripts/extract-audit-findings.py

    # Filter by high severity
    python scripts/extract-audit-findings.py --severity high

    # Run without making any automated fixes
    python scripts/extract-audit-findings.py --dry-run
    ```

## Local Development Workflow

The primary development loop involves making changes to TypeScript or Svelte files and seeing them reflected in Obsidian.

1. **Start Dev Build**: Run the following command to start `esbuild` in watch mode.

    ```bash
    npm run dev
    ```

    This watches `src/main.ts` and worker files, recompiling them into `main.js` and `worker.js` whenever a change is detected.

2. **Obsidian Integration**:
    - Ensure the plugin is enabled in your test vault.
    - Use the **Hot Reload** plugin for Obsidian (recommended) or manually disable/enable the plugin in settings to refresh the logic.

3. **UI Development**: The dashboard uses Svelte 5 (Runes). Changes to `.svelte` files in `src/views` are handled by `esbuild-svelte`.

## Benchmark & Performance Workflow

Since the plugin processes large graphs, performance is critical. We use custom scripts to measure execution time on large vaults.

1. **Generate Mock Vault**: Create a large synthetic vault (e.g., 10,000 notes) using the Barabási–Albert model.

    ```bash
    npm run bench:generate
    ```

    _Note: Customize the size by setting `NUM_FILES` environment variable (default: 10000)._

2. **Run Benchmark**: Measure the performance of graph construction and analysis.
    ```bash
    npm run bench:run
    ```

## Quality Assurance Workflow

Before submitting any code, it must pass the quality gate.

### 1. Linting & Formatting

We use ESLint for logic checks, Stylelint for CSS, and Prettier for consistent formatting.

- **Logic Check (TS/JS)**: `npm run lint`
- **Style Check (CSS)**: `npm run lint:css`
- **Auto-fix**: `npm run lint:fix`
- **Format**: `npm run format`

### 2. Dependency Audit

We use `knip` to detect unused dependencies, exports, and files.

- **Command**: `npm run knip`

### 3. Testing

We use Vitest for unit and integration testing.

- **Full Suite**: `npm test`
- **Specific Components**:
    - `npm run test:adapter`: Tests for adapters (e.g., Datacore).
    - `npm run test:breadcrumbs`: Tests for Breadcrumbs integration.
    - `npm run test:worker`: Tests for the Graph Analysis worker core.

## Pre-commit Workflow

The project uses `husky` and `nano-staged` to enforce quality before code is committed.

- When you run `git commit`, `nano-staged` automatically triggers:
    - `eslint --fix` and `prettier --write` on `.ts` files.
    - `stylelint --fix` and `prettier --write` on `.css` files.
    - `prettier --write` on `.json` and `.md` files.
- If any linting or formatting step fails and cannot be auto-fixed, the commit will be blocked.

## CI/CD Pipeline & Releases

The project uses GitHub Actions to automate quality checks and deployments. Workflows are defined in `.github/workflows/`.

### Quality Pipeline (`quality.yml`)

Triggered on every push and pull request to `main`.

- **Linting**: Runs Prettier, ESLint, and Stylelint.
- **Audit**: Runs `knip` to find dead code.
- **Tests**: Executes the Vitest suite.
- **Build Check**: Ensures the project compiles for production.

### BRAT Release (Beta) Pipeline (`release-brat.yml`)

Triggered on every push to `main` or manually via workflow dispatch.

- **Builds** the plugin.
- **Prepares** a distribution bundle containing `main.js`, `manifest.json`, `styles.css`, and worker bundles (`worker.js`, `ladybug-worker.js`).
- **Publishes** the bundle to the `dist` branch. This allows beta testers to install the latest edge version of the plugin using the Obsidian BRAT plugin by pointing it to the repository.

### Production Release Pipeline (`release.yml`)

Triggered when a new tag starting with `v` (e.g., `v3.0.0`) is pushed.

1. **Build**: Compiles the plugin in production mode (`npm run build`).
2. **Create Release**: Generates a GitHub Release using `gh release create`.
3. **Upload Artifacts**: Attaches all compiled artifacts (`main.js`, `worker.js`, `manifest.json`, `styles.css`, etc.) directly to the GitHub release for standard Obsidian plugin distribution.

## Versioning & Tags

1. Update `version` in `package.json` and `manifest.json`.
2. Commit the changes: `git commit -m "chore: bump version to vX.Y.Z"`.
3. Create a tag: `git tag vX.Y.Z`.
4. Push the tag: `git push origin vX.Y.Z`.
