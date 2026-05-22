<!-- generated-by: gsd-doc-writer -->

# Testing

## Test framework and setup

The Semantic Graph Healer project uses **Vitest** (v4.1.6) as its primary testing framework. 

- **Environment**: Tests run in the `jsdom` environment to simulate the browser and Obsidian UI contexts.
- **Worker Support**: The `@vitest/web-worker` package is used to test background graph analysis logic (e.g., `ladybug-worker.js`).
- **UI Components**: Svelte elements are tested using `@sveltejs/vite-plugin-svelte` via Vitest.
- **Global Setup**: The global setup and Obsidian API mocks are managed through `vitest.config.ts`, where `obsidian` is aliased to `tests/obsidian.ts`. Before running tests locally, ensure all dependencies are installed via `npm install`.

## Running tests

The following commands are available to run the test suite or specific subsets.

```bash
# Run the full test suite once
npm run test

# Run tests in interactive watch mode
npx vitest

# Run only the Datacore adapter tests
npm run test:adapter

# Run only the Breadcrumbs adapter tests
npm run test:breadcrumbs

# Run the graph analysis worker core tests
npm run test:worker

# Generate a mock vault for large-scale benchmarks
npm run bench:generate

# Execute the performance benchmark suite
npm run bench:run
```

## Writing new tests

- **File naming conventions**: 
  - Unit and integration tests: `tests/**/*.test.ts` (mirroring the `src/` directory structure).
  - Benchmarks: `tests/benchmarks/*.benchmark.test.ts`.
  - Specialized suites: `*.security.test.ts` or `*.race.test.ts`.

- **Mocking Obsidian APIs**: 
  We use a custom mock located at `tests/obsidian.ts` to simulate the Obsidian Vault, `MetadataCache`, and UI components (like `Modal`, `Notice`, and `Setting`). Import `obsidian` directly in your test, and Vitest will use the aliased mock.
  
  ```typescript
  import { describe, it, expect } from 'vitest';
  import { Notice } from 'obsidian';

  describe('Feature', () => {
      it('shows a notice', () => {
          new Notice('Success!');
          // Assertions
      });
  });
  ```

- **Worker testing**:
  When testing background workers, leverage `@vitest/web-worker` APIs to instantiate workers directly inside the test environment without needing a real browser shell.

- **Benchmarks**:
  For performance metrics on WASM or topological graph operations, place benchmark tests in `tests/benchmarks/`. Always use `npm run bench:generate` to bootstrap a realistic large mock graph before running them.

## Coverage requirements

No coverage threshold configured. 

| Type | Threshold |
| :--- | :--- |
| Lines | N/A |
| Branches | N/A |
| Functions | N/A |
| Statements | N/A |

## CI integration

Tests are automatically executed on pushes and pull requests via GitHub Actions.

- **Workflow**: Quality Pipeline (`.github/workflows/quality.yml`)
- **Trigger**: Pushes and PRs targeting the `main` or `master` branches.
- **Job Name**: `quality`
- **Command Run**: `npm run test` (alongside linting and format checks)
