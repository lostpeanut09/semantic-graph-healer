<!-- generated-by: gsd-doc-writer -->

## DEPLOYMENT.md

# Deployment: Semantic Graph Healer

This document outlines the deployment process, build pipeline, and distribution methods for the Semantic Graph Healer Obsidian plugin.

## Deployment Targets

The plugin is distributed through the following channels:

- **Obsidian Community Plugins**: The official marketplace for Obsidian users. Deployment here requires a PR to the [obsidian-releases](https://github.com/obsidianmd/obsidian-releases) repository.
- **GitHub Releases (`.github/workflows/release.yml`)**: The primary hosting site for official production artifacts. Users can manually install the plugin by downloading these assets.
- **BRAT (`.github/workflows/release-brat.yml`)**: The Beta Reviewer's Auto-update Tool for Obsidian. Used to distribute beta versions by pushing a compiled bundle to the `dist` branch.

## Build Pipeline

The project uses GitHub Actions to automate the build and release process.

### Production Release (`release.yml`)
1. **Trigger**: Triggered when a new tag matching the `v*` pattern (e.g., `v3.0.0`) is pushed to the repository.
2. **Build**: Runs on `ubuntu-latest` with Node.js 22.
3. **Commands**:
   - `npm install --legacy-peer-deps`
   - `npm run build`
4. **Deploy**: Creates a GitHub release using `gh release create` and uploads `main.js`, `worker.js`, `manifest.json`, and `styles.css`.
   <!-- VERIFY: ladybug-worker.js is built but missing from release.yml upload step -->

### BRAT Beta Release (`release-brat.yml`)
1. **Trigger**: Triggered on push to the `main` branch or via `workflow_dispatch`.
2. **Build**: Runs on `ubuntu-latest`.
3. **Commands**:
   - `npm install`
   - `npm run build`
4. **Deploy**: Copies `main.js`, `manifest.json`, `styles.css`, `worker.js`, and `ladybug-worker.js` into a `dist_bundle` folder, and publishes this directory to the `dist` branch using `s0/git-publish-subdir-action`.

## Versioning and Compatibility

- **Semantic Versioning**: The project follows [SemVer](https://semver.org/).
- **manifest.json**: Defines the current plugin version and the minimum Obsidian version required (`minAppVersion`).
- **versions.json**: A map used by Obsidian to check compatibility between plugin versions and Obsidian app versions.
- **Consistency**: Ensure `package.json` and `manifest.json` versions are synchronized before tagging a release.

## Environment Setup

To run the deployment pipeline locally or in CI:

- **Node.js**: The codebase requires Node.js `>=24.0.0` and npm `>=11.0.0` (as defined in `package.json`). *Note: CI currently runs on Node 22.*
- **GITHUB_TOKEN**: A secret token with `contents: write` permissions is required for the GitHub Action to create releases and push to the `dist` branch.
- **Legacy Peer Deps**: Due to specific dependency constraints, `npm install --legacy-peer-deps` is used in the production pipeline.

## Rollback Procedure

In the event of a faulty release:

1. **Delete Release**: Remove the faulty release from the GitHub Releases page.
2. **Delete Tag**: Delete the associated git tag locally (`git tag -d vX.Y.Z`) and remotely (`git push --delete origin vX.Y.Z`).
3. **Redeploy**: Fix the issue, update the version if necessary, tag, and push a new release.
4. **Manual Downgrade**: Users can manually install a previous version by downloading assets from the GitHub Releases history.

## Monitoring

- **Local Logs**: Plugin activity and errors are logged to the Obsidian developer console (`Ctrl+Shift+I` on Windows/Linux, `Cmd+Option+I` on macOS).
- **External Monitoring**: None detected. The plugin operates entirely locally with no external telemetry, tracking, or centralized error reporting.