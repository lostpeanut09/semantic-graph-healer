<!-- generated-by: gsd-doc-writer -->

# Deployment: Semantic Graph Healer

This document outlines the deployment process, build pipeline, and distribution methods for the Semantic Graph Healer Obsidian plugin.

## Deployment Targets

The plugin is distributed through the following channels:

- **GitHub Releases (Production)**: The primary hosting site for official production artifacts. Users can manually install the plugin by downloading assets from the [Releases page](https://github.com/lostpeanut09/semantic-graph-healer/releases).
- **BRAT (Beta)**: Distributed via the "Beta Reviewer's Auto-update Tool" for Obsidian. This uses the `dist` branch of the repository as a distribution point for experimental builds.
- **Obsidian Community Plugins**: The official marketplace. Deployment here requires a manual Pull Request to the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository after a GitHub release is created.

## Build Pipeline

The project uses GitHub Actions to automate quality checks and releases.

### Quality Gate (`quality.yml`)

Runs on every push to `main` and on all Pull Requests.

- **Environment**: Node.js 24
- **Checks**: Prettier formatting, ESLint (TS/JS), Stylelint (CSS), Knip (dead code/dependencies), and Vitest (unit/integration tests).
- **Build Check**: Ensures `npm run build` succeeds before merging.

### Production Release (`release.yml`)

Triggered when a new tag matching the `v*` pattern (e.g., `v3.0.0`) is pushed.

- **Environment**: Node.js 22 (Note: Discrepancy with `package.json` requirement of Node >= 24)
- **Build Command**: `npm run build` (uses `npm install --legacy-peer-deps`)
- **Artifacts**: Creates a GitHub release and uploads `main.js`, `worker.js`, `manifest.json`, and `styles.css`.
- <!-- VERIFY: ladybug-worker.js is missing from the upload step in release.yml but is required by LadybugService.ts -->

### BRAT Beta Release (`release-brat.yml`)

Triggered on every push to the `main` branch or via manual `workflow_dispatch`.

- **Environment**: Node.js (Latest available on `ubuntu-latest`)
- **Process**: Builds the plugin and pushes the resulting bundle (`main.js`, `manifest.json`, `styles.css`, `worker.js`, `ladybug-worker.js`) to the `dist` branch.

## Release Process

### Production Release Steps

To publish a new official version:

1.  **Update Version**: Synchronize the `version` field in `package.json` and `manifest.json`.
2.  **Compatibility**: Update `versions.json` by adding the new version key and mapping it to the required minimum Obsidian version (e.g., `"3.0.0": "1.11.4"`).
3.  **Commit & Push**: Commit the version updates to the `main` branch.
4.  **Tagging**: Create and push a git tag:
    ```bash
    git tag v3.0.0
    git push origin v3.0.0
    ```
5.  **Verification**: Ensure the GitHub Action finishes and that all 5 required artifacts are present in the release (including `ladybug-worker.js`).

### Beta Release Steps (BRAT)

Beta builds are automated:

1.  Pushing any change to the `main` branch automatically updates the `dist` branch.
2.  Users with the plugin installed via BRAT will receive the update automatically or upon manual "Check for updates" in Obsidian.

## Versioning and Compatibility

- **Semantic Versioning**: The project follows [SemVer](https://semver.org/).
- **manifest.json**: Defines the current plugin version and `minAppVersion`.
- **versions.json**: A map used by Obsidian to check compatibility between plugin versions and Obsidian app versions.

## Environment Setup

To run the deployment pipeline or build the plugin locally:

- **Node.js**: Requires Node.js `>=24.0.0` and npm `>=11.0.0` (as defined in `package.json`).
- **Legacy Peer Deps**: Use `npm install --legacy-peer-deps` to resolve dependency conflicts in the production environment.
- **GitHub Secrets**: The `GITHUB_TOKEN` is automatically provided by GitHub Actions for release and branch-pushing permissions.

## Rollback Procedure

In the event of a faulty release:

1.  **Delete Release**: Remove the faulty release from the GitHub Releases page.
2.  **Delete Tag**: Delete the associated git tag:
    ```bash
    git tag -d vX.Y.Z
    git push --delete origin vX.Y.Z
    ```
3.  **Redeploy**: Fix the issue, follow the "Production Release Steps" again with the same or a bumped version.
4.  **Manual Downgrade**: Users can manually install a previous stable version by downloading assets from the GitHub Releases history.

## Monitoring

- **Local Logs**: Plugin activity and errors are logged to the Obsidian developer console (`Ctrl+Shift+I` on Windows/Linux, `Cmd+Option+I` on macOS).
- **Error Handling**: The plugin includes internal error boundaries and a `Notifier` service for UI-level feedback.
- **External Monitoring**: None. The plugin operates entirely locally with no external telemetry or centralized error reporting.
