<!-- generated-by: gsd-doc-writer -->

# INFRASTRUCTURE.md

This document describes the external services, background processes, security mechanisms, core dependencies, and development operations that comprise the Semantic Graph Healer infrastructure.

## Web Workers

To maintain UI responsiveness during computationally expensive graph operations, the plugin utilizes Web Workers to offload processing from the main thread.

### Multi-Worker Architecture

The plugin utilizes two distinct workers, bundled as IIFE modules via `esbuild`:

1.  **`worker.js` (Graph Analysis Core)**:
    - **Source**: `src/core/workers/graph-analysis-worker.ts`
    - **Responsibilities**: Standard graph theory algorithms (Betweenness Centrality, Toplological Diagnostics, Co-Citation analysis).
    - **Lifecycle**: Managed by `GraphWorkerService`.

2.  **`ladybug-worker.js` (High-Performance Engine)**:
    - **Source**: `src/core/workers/ladybug-worker.ts`
    - **Responsibilities**: High-performance WASM-based graph operations using `@ladybugdb/wasm-core`, PageRank analysis, and Louvain Community Detection.
    - **Lifecycle**: Managed by `LadybugService`.

### Platform Constraints & Degradation

- **Desktop**: Full Web Worker support enabled. Workers are initialized as Blobs created from the plugin directory's `.js` files.
- **Mobile (iOS/Android)**: Web Workers are **explicitly disabled** to prevent stability issues and crashes in Capacitor-based environments.
- **Graceful Degradation**: When workers are unavailable, the plugin falls back to main-thread execution for standard analysis and "Legacy" mode for WASM-heavy operations, often utilizing adaptive batching to preserve UI responsiveness.

## External AI Services

Semantic Graph Healer integrates with various Large Language Model (LLM) and Embedding providers to perform semantic analysis and vector-based search.

### LLM Integration (`LlmService`)

Supports multiple providers for reasoning, validation, and metadata extraction:

- **Cloud Providers**: OpenAI, Anthropic, DeepSeek.
- **Local Providers**: Ollama (native `/api/generate`), LocalAI, and custom OpenAI-compatible endpoints.
- **Tribunal System**: A dual-model consensus mechanism (AI Tribunal) that validates suggestions using primary and secondary models.

### Embedding Integration (`EmbeddingService`)

Handles vector generation for GraphRAG and similarity-based link prediction:

- **Supported Providers**: Ollama (native `/api/embeddings`), LocalAI, and OpenAI.
- **Semantic Anchors**: Periodic alignment checks compare vector similarities of known concept pairs to verify the stability of the configured embedding model.

## Security & Keychain Integration

Sensitive data, specifically API keys for AI services, are handled via a multi-layered security architecture that prioritizes local-first privacy.

### `KeychainService` Hierarchy

Storage and retrieval of secrets follow a strict hierarchy:

1.  **Obsidian SecretStorage (v1.11.4+)**: The primary target for secure, vault-local storage via the official Obsidian API.
2.  **Legacy Keychain**: Fallback for older versions of Obsidian or specific UI-only implementations.
3.  **Encrypted Settings**: If no secure storage is available, keys are stored in the plugin's `data.json` file, encrypted with AES-256-GCM.

### Encryption Specifications (`CryptoUtils`)

- **Algorithm**: AES-256-GCM (Authenticated Encryption).
- **Key Derivation**: PBKDF2 with 600,000 iterations and SHA-256 hashing.
- **Entropy/Salt**: Utilizes the unique `app.appId` (vault identifier) as a stable salt, ensuring that encrypted keys are specific to the local vault and cannot be decrypted if moved to another vault.

## Build System & Tooling

The project uses a modern toolchain located in the `.config/` directory to manage the complexity of a multi-threaded Obsidian plugin.

### Bundling Configuration (`esbuild.config.mjs`)

Orchestrates the build process into two primary contexts:

- **Main Context**: Compiles `src/main.ts` into CommonJS (`main.js`) for the Obsidian plugin runtime. Includes Svelte compilation and style extraction into `styles.css`.
- **Worker Context**: Compiles background workers into IIFE format (`worker.js`, `ladybug-worker.js`) for browser `Worker` compatibility.

### Linting & Static Analysis

- **ESLint**: Strict TypeScript linting via `.config/eslint.config.js`, including `eslint-plugin-obsidianmd`.
- **Stylelint**: CSS validation via `.config/.stylelintrc.json`.
- **Prettier**: Code formatting enforced via `.config/.prettierrc`.
- **Knip**: Audits for unused files, exports, and dependencies via `.config/knip.json`.
- **nano-staged**: Runs linters and formatters on staged files during the commit process.

### Git Hooks (Husky)

Husky manages client-side Git hooks to enforce quality standards:

- **`pre-commit`**: Runs `npm run lint:fix` and `npm run format`.
- **`pre-push`**: Executes `npm run build`, `npm run lint`, and `npm test`.

## Testing Infrastructure

Unit and integration tests are powered by **Vitest**, optimized for the Obsidian environment.

- **Environment**: `jsdom` (simulated browser).
- **Mocking**: The Obsidian API is mocked via `tests/obsidian.ts`, aliased in `vitest.config.ts`.
- **Web Workers**: Tested using `@vitest/web-worker`.
- **Benchmarks**: Custom benchmarking suite for performance auditing (`tests/benchmarks/`).

## Continuous Integration & Deployment (CI/CD)

Automated pipelines run on **GitHub Actions** across three primary workflows:

### Quality Pipeline (`quality.yml`)

Runs on every push/PR to `main` or `master`.

- **Jobs**:
    - `quality`: Full suite of Linting, Prettier checks, Knip audit, Vitest tests, and Build validation.
    - `verify-platform-agnostic`: Scans the codebase for hardcoded Windows-specific path separators to ensure cross-platform compatibility.

### Release Pipeline (`release.yml`)

Triggered on tag creation (`v*`).

- **Artifacts**: Bundles `main.js`, `worker.js`, `manifest.json`, and `styles.css`.
- **Deployment**: Automatically creates a GitHub Release and uploads the production assets.

### BRAT Release (`release-brat.yml`)

Automates early-access releases for the BRAT community.

- **Deployment**: Pushes the compiled bundle to a dedicated `dist` branch.

## Runtime Requirements

- **Runtime**: Node.js >= 24.0.0
- **Package Manager**: NPM >= 11.0.0
- **Obsidian API**: Optimized for Obsidian v1.11.4+ (required for native `SecretStorage`).
- **Plugin Dependencies**: Strictly requires the [Datacore](https://github.com/blacksmithgu/datacore) plugin for the core query engine.

## Core Dependencies (NPM)

| Library                | Purpose                                                           |
| ---------------------- | ----------------------------------------------------------------- |
| `graphology`           | Foundation for graph data structures and topological metrics.     |
| `@ladybugdb/wasm-core` | WASM-based graph engine for high-performance analysis.            |
| `3d-force-graph`       | 3D visualization engine for the Graph Visualizer.                 |
| `svelte`               | Reactive UI framework for the Dashboard and Settings.             |
| `zod`                  | Schema validation for internal data structures and API responses. |
| `p-queue`              | Concurrency management for worker requests and AI calls.          |
