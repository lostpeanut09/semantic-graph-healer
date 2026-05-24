<!-- generated-by: gsd-doc-writer -->

# Development: Semantic Graph Healer

This guide is for developers who want to contribute to the Semantic Graph Healer plugin.

## Local Setup

### Prerequisites
- **Node.js**: `^24.0.0` (as specified in `.node-version`)
- **npm**: `^11.0.0`
- **Obsidian**: A development vault with the **Dataview**, **Breadcrumbs**, and/or **Smart Connections** plugins installed for integration testing.

### Installation
1. Clone the repository into your Obsidian vault's plugins directory:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins
   git clone https://github.com/lostpeanut09/semantic-graph-healer.git
   cd semantic-graph-healer
   ```
2. Install dependencies:
    ```bash
    npm install
    ```
3. Run the development build:
    ```bash
    npm run dev
    ```

## Project Structure

The project follows a modular architecture to separate core logic from Obsidian views and external adapters.

| Directory | Purpose |
| :--- | :--- |
| `src/core/` | Core engines (GraphEngine, LinkPrediction), services, and business logic. |
| `src/core/adapters/` | Integration adapters for external plugins (Dataview, Breadcrumbs, Ladybug, etc.). |
| `src/core/workers/` | Web Workers for performing heavy topological analysis off the main thread. |
| `src/views/` | User interface built with **Svelte 5**, including the Dashboard and Graph Visualizer. |
| `.config/` | Centralized configuration for build tools (`esbuild`), linters (`eslint`, `stylelint`), and formatters (`prettier`). |
| `tests/` | Comprehensive test suite including unit, integration, and benchmark tests. |
| `scripts/` | Utility scripts for generating mock data or extracting audit findings. |

### Configuration Management (`.config/`)
To keep the project root clean, all tool-specific configuration files are stored in the `.config/` directory. This includes:
- `esbuild.config.mjs`: Handles the dual-build process for the main plugin (CJS) and workers (IIFE).
- `eslint.config.js`: Modern flat configuration for TypeScript and Obsidian-specific linting.
- `.prettierrc`: Code formatting rules.
- `.stylelintrc.json`: CSS standards enforcement.

## Build Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts `esbuild` in watch mode. Rebuilds `main.js`, `styles.css`, and worker files on changes. |
| `npm run build` | Production build. Minifies output and omits source maps. Runs `tsc` first for type checking. |
| `npm run lint` | Checks TypeScript and JavaScript files for errors and style violations. |
| `npm run lint:css` | Validates CSS files against Stylelint rules. |
| `npm run lint:fix` | Automatically fixes most linting and styling issues. |
| `npm run format` | Enforces consistent code formatting across the entire project via Prettier. |
| `npm run knip` | Analyzes the project for unused dependencies, files, and exports. |
| `npm run test` | Executes the full Vitest suite. |
| `npm run test:adapter` | Runs tests specifically for the Datacore adapter. |
| `npm run bench:run` | Runs performance benchmarks to ensure no regressions in graph processing speed. |

## Code Style

- **TypeScript**: All core logic must be typed. Use interfaces for adapter ports to maintain decoupling.
- **Svelte**: UI components use Svelte 5 "Runes" for state management.
- **Linter**: Configuration in `.config/eslint.config.js`.
- **CSS**: Scoped styles preferred within Svelte components or defined in `src/styles.css`.

## Testing Strategy

We use **Vitest** for testing. Tests are categorized into:
- **Unit Tests**: Found in `tests/core/` and `tests/views/`.
- **Hardening Tests**: Specific suites to test edge cases and error handling in adapters.
- **Benchmarks**: Located in `tests/benchmarks/` to monitor performance on large vaults (e.g., 10k+ nodes).

To run a single test file during development:
```bash
npx vitest tests/core/GraphEngine.test.ts
```

## Branch Conventions

- `feat/`: New features (e.g., `feat/new-adapter-xyz`).
- `fix/`: Bug fixes.
- `docs/`: Documentation updates.
- `chore/`: Maintenance (dependencies, refactoring).

The primary development branch is `main`.

## PR Process

1. **Create Branch**: Work on a branch prefixed with the appropriate type.
2. **Commit**: Use Conventional Commits.
3. **Quality Gate**: Ensure `npm run lint`, `npm run build`, and `npm test` pass locally.
4. **Submit**: Open a PR to `main`.
5. **CI Pipeline**: The **Quality Pipeline** workflow will run on every push and PR to ensure no regressions.
6. **Review**: All PRs require at least one approval from a maintainer.
