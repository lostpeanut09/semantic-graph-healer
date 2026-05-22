<!-- generated-by: gsd-doc-writer -->

# Development: Semantic Graph Healer

This guide is for developers who want to contribute to the Semantic Graph Healer plugin.

## Local Setup

1. Clone the repository into your Obsidian vault's plugins directory.
2. Install dependencies:
    ```bash
    npm install
    ```
3. Run the development build:
    ```bash
    npm run dev
    ```

## Build Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Compiles the plugin and worker in development mode with source maps. |
| `npm run build` | Compiles the plugin for production (minified, no source maps) via `tsc` and `esbuild`. |
| `npm run lint` | Runs ESLint to check for TypeScript code issues. |
| `npm run lint:css` | Runs Stylelint to check for CSS style issues. |
| `npm run lint:fix` | Automatically fixes ESLint and Stylelint issues. |
| `npm run format` | Uses Prettier to automatically format the codebase. |
| `npm run knip` | Identifies unused files, dependencies, and exports. |
| `npm run nano-staged` | Runs linting and formatting on staged files (used via Husky pre-commit hook). |
| `npm test` | Runs the full test suite using Vitest. |
| `npm run test:adapter` | Runs only the DatacoreAdapter tests. |
| `npm run test:breadcrumbs` | Runs only the BreadcrumbsAdapter tests. |
| `npm run test:worker` | Runs only the GraphAnalysisWorkerCore tests. |
| `npm run bench:generate` | Generates a mock vault for benchmarking. |
| `npm run bench:run` | Runs the performance benchmarks. |

## Code Style

The project enforces strict coding standards via **ESLint**, **Prettier**, and **Stylelint**.

- **Linter**: ESLint with the `@typescript-eslint` plugin. Configuration is in `.config/eslint.config.js`. Run with `npm run lint`.
- **Formatter**: Prettier. Configuration is in `.config/.prettierrc`. Run with `npm run format`.
- **CSS**: Stylelint is used for CSS files. Configuration is in `.config/.stylelintrc.json`. Run with `npm run lint:css`.

To fix linting and formatting issues automatically, run:

```bash
npm run lint:fix
```

## Branch Conventions

Please follow these naming conventions for branches:

- `feat/`: New features or improvements.
- `fix/`: Bug fixes.
- `chore/`: Maintenance tasks, dependencies updates, etc.
- `docs/`: Documentation updates.

The main/default branch is `main`.

## PR Process

1. **Fork and Branch**: Create a new branch for your work.
2. **Commit Often**: Use clear, descriptive commit messages following the Conventional Commits format.
3. **Add Tests**: Ensure your changes are covered by unit or integration tests.
4. **Run Quality Checks**: Before submitting, ensure `npm run build`, `npm run lint`, and `npm test` all pass.
5. **Submit PR**: Open a Pull Request against the `main` branch. Provide a summary of your changes and link any relevant issues. At least one maintainer must review and approve.