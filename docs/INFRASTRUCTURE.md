<!-- generated-by: gsd-doc-writer -->

# INFRASTRUCTURE.md

This document describes the external services, background processes, security mechanisms, core dependencies, and development operations that comprise the Semantic Graph Healer infrastructure.

## Web Workers

To maintain UI responsiveness during computationally expensive graph operations, the plugin utilizes Web Workers to offload processing from the main thread.

### `ladybug-worker.js`

The primary background worker is a bundled JavaScript file (`ladybug-worker.js`) generated via `esbuild`. It encapsulates the graph theory engines and high-performance algorithms.

- **Lifecycle Management**: Managed by `GraphWorkerService`. The service reads the worker script from the plugin directory, creates a Blob URL, and initializes the `Worker` instance.
- **Offloaded Tasks**:
    - **PageRank Analysis**: Weighted graph centrality scoring to identify vault hubs.
    - **Louvain Community Detection**: Clustering notes into thematic neighborhoods.
    - **Betweenness Centrality**: Identifying "bridges" and critical path nodes.
    - **Topological Diagnostics**: Detecting cycles, black holes, and flow stagnation.
    - **Co-Citation Analysis**: Discovering implicit links based on shared citation patterns.
- **Graceful Degradation**: If Web Workers are unavailable (e.g., specific mobile environments or restrictive security policies), the plugin is designed to gracefully degrade by disabling heavy background features or falling back to synchronous execution for small datasets.

## External AI Services

Semantic Graph Healer integrates with various Large Language Model (LLM) and Embedding providers to perform semantic analysis and vector-based search.

### LLM Integration (`LlmService`)

Supports multiple providers for reasoning, validation, and metadata extraction:

- **Cloud Providers**: OpenAI, Anthropic, DeepSeek.
- **Local Providers**: Ollama, LocalAI, and Custom OpenAI-compatible endpoints.
- **Tribunal System**: An "AI Tribunal" can be configured to cross-validate suggestions using a primary and secondary model to ensure high-confidence healing.

### Embedding Integration (`EmbeddingService`)

Handles vector generation for GraphRAG and similarity-based link prediction:

- **Supported Providers**: Ollama (native `/api/embeddings`), LocalAI, and OpenAI.
- **Semantic Anchors**: Periodic alignment checks compare vector similarities of known concept pairs (e.g., "king" and "queen") to verify the stability of the configured embedding model.

## Security & Keychain Integration

Sensitive data, specifically API keys for AI services, are handled via a multi-layered security architecture.

### `KeychainService`

The `KeychainService` orchestrates the storage and retrieval of secrets using the following hierarchy:

1. **Obsidian SecretStorage (v1.11.4+)**: The primary target for secure, vault-local storage via the official Obsidian API.
2. **Legacy Keychain**: Fallback for older versions of Obsidian.
3. **Encrypted Settings**: If no secure storage is available, keys are stored in the plugin's `data.json` file, encrypted with AES-256-GCM to remain sync-resilient.

### Double-Layer Encryption

To mitigate potential plaintext exposures in the underlying storage APIs, the plugin implements a double-locking mechanism:

- **Algorithm**: AES-256-GCM.
- **Key Derivation**: PBKDF2 with 600,000 iterations.
- **Salt**: Utilizes the unique `app.appId` (vault identifier) to ensure that encrypted keys are specific to the local vault environment.

## Development & Operations Infrastructure

The project utilizes modern web development tooling to enforce code quality, manage tests, and automate releases.

### Build System

The project is bundled using `esbuild` to produce optimized assets for Obsidian.

- **TypeScript**: `tsc` is used strictly for type checking (`--noEmit`) prior to production builds.
- **Esbuild (`.config/esbuild.config.mjs`)**: Orchestrates the bundling process.
    - **Main Context**: Compiles `src/main.ts` into a CommonJS (`main.js`) module for the Obsidian plugin runtime. It uses `esbuild-svelte` to compile Svelte components and extracts associated styles into `styles.css`.
    - **Worker Context**: Compiles background workers (`graph-analysis-worker.ts`, `ladybug-worker.ts`) into IIFE format (`worker.js`, `ladybug-worker.js`) suitable for browser `Worker` initialization.

### Linting & Formatting

A comprehensive suite of tools ensures code consistency and quality:

- **ESLint**: Lints TypeScript/JavaScript files based on `.config/eslint.config.js`.
- **Prettier**: Enforces consistent code formatting using `.config/.prettierrc`.
- **Stylelint**: Analyzes CSS files for errors and conventions (`.config/.stylelintrc.json`).
- **Knip**: Audits for unused files, exports, and dependencies (`.config/knip.json`).
- **nano-staged**: Optimizes commit times by running linters and formatters only on staged files.

### Git Hooks (Husky)

Husky manages client-side Git hooks to prevent bad commits and pushes. (Includes WSL path normalization to ensure Node.js compatibility).

- **`pre-commit`**: Automatically runs `npm run lint:fix` and `npm run format`.
- **`pre-push`**: Executes a full suite of checks including `npm run build`, `npm run lint`, and `npm test` to verify code integrity before pushing to remote.

### Testing (Vitest)

Unit and integration tests are powered by **Vitest**.

- **Configuration**: Defined in `vitest.config.ts`.
- **Environment**: Runs in a `jsdom` environment to mock the browser context.
- **Web Workers**: Utilizes `@vitest/web-worker` to test worker thread execution directly.
- **Obsidian API**: The Obsidian plugin API (`obsidian`) is mocked via an alias pointing to `tests/obsidian.ts`.

### Continuous Integration & Deployment (CI/CD)

Automated pipelines run on **GitHub Actions**.

- **Quality Pipeline (`quality.yml`)**: Triggered on push and pull requests to `main`/`master`. Validates the codebase by running Prettier formatting, ESLint, Stylelint, a Knip dependency audit, the Vitest test suite, and a full build check. It also includes a `verify-platform-agnostic` job to prevent Windows-specific path separators.
- **Release Pipeline (`release.yml`)**: Triggered when a new tag (`v*`) is pushed. Builds the plugin and automatically creates a GitHub Release, attaching the required compiled assets (`main.js`, `worker.js`, `manifest.json`, `styles.css`).
- **BRAT Release (`release-brat.yml`)**: Automates early-access releases for the Obsidian BRAT community plugin tester.

## Core Dependencies

The infrastructure relies on several high-performance third-party libraries:

| Library                | Purpose                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `graphology`           | The foundation for graph data structures and topological metrics.    |
| `@ladybugdb/wasm-core` | High-performance WASM-based graph operations (integrated in worker). |
| `3d-force-graph`       | 3D Force-Directed Graph visualization engine.                        |
| `three.js`             | WebGL-based rendering for 3D graph visualizations.                   |
| `d3-force-3d`          | 3D physics engine for graph layout calculations.                     |
| `svelte`               | Reactive UI framework for the Dashboard and Reasoning views.         |
| `zod`                  | Schema validation for internal data structures and API responses.    |

## Environment Requirements

- **Runtime**: Node.js >= 24.0.0
- **Package Manager**: NPM >= 11.0.0
- **Obsidian Compatibility**: Optimized for Obsidian v1.11.4+ (for SecretStorage), with fallback support for earlier versions.
- **Platform Support**: Desktop (Windows/macOS/Linux) and Mobile (iOS/Android). <!-- VERIFY: Mobile Web Worker stability on latest Capacitor versions -->
