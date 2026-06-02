<!-- generated-by: gsd-doc-writer -->

# Testing

## Test framework and setup

The Semantic Graph Healer project uses **Vitest** (v4.1.6) as its primary testing framework, configured to handle the unique requirements of an Obsidian plugin and graph-intensive operations.

- **Environment**: Tests run in the `jsdom` environment to simulate the browser environment required by Obsidian and Svelte.
- **Worker Support**: Background analysis logic (like `ladybug-worker.js`) is tested using `@vitest/web-worker`, allowing worker threads to be instantiated directly in the test environment.
- **UI Components**: Svelte views and components are tested using `@sveltejs/vite-plugin-svelte`.
- **Obsidian API Mocking**: Since the Obsidian API is only available inside the app, we use a comprehensive mock located at `tests/obsidian.ts`. In `vitest.config.ts`, the `obsidian` module is aliased to this mock file.
- **Runtime Requirements**: Testing requires **Node.js >= 24.0.0** and **npm >= 11.0.0** as specified in `package.json`.

## Testing Strategy

The project employs a multi-layered testing strategy to ensure structural integrity and performance:

- **Unit Tests**: Focused on individual logic modules in `src/core/utils/` and `src/core/services/`.
- **Integration Tests**: Verified coordination between multiple services, such as the `GraphEngine` and `CacheService`.
- **E2E Simulation**: Located in `tests/core/LadybugE2E.test.ts`, these tests simulate the entire lifecycle of a graph analysis cycle—from initialization and data ingestion to query execution and algorithm results—using a mocked worker.
- **Benchmarks**: Located in `tests/benchmarks/`, these tests measure the performance of graph algorithms (like PageRank and Louvain) on large datasets (up to 10k nodes).
- **Performance Audits**: `tests/benchmarks/PerformanceAudit.benchmark.test.ts` tracks memory footprints of storage adapters and the bypass rate of LLM calls to ensure cost-efficiency.
- **Hardening & Security**: Specialized tests (e.g., `*.hardening.test.ts`) verify system resilience against race conditions, corrupted metadata, and invalid LLM responses.

## Running tests

Use the following commands to execute various parts of the test suite:

```bash
# Run the full test suite once
npm run test

# Run tests in interactive watch mode
npx vitest

# Run specific subsets of tests
npm run test:adapter     # Datacore adapter tests
npm run test:breadcrumbs   # Breadcrumbs adapter tests
npm run test:worker      # Graph analysis worker core tests

# Performance and Benchmarking
npm run bench:generate   # Generate a 10k-node mock vault for benchmarking
npm run bench:run        # Execute the primary performance benchmark suite
```

## Writing new tests

- **File naming conventions**:
    - Unit and integration tests: `tests/**/*.test.ts` (generally mirroring the `src/` directory structure).
    - Benchmarks: `tests/benchmarks/*.test.ts` or `*.benchmark.test.ts`.
    - Hardening/Security: `*.hardening.test.ts` or `*.security.test.ts`.

- **Mocking Obsidian APIs**:
  Import from `obsidian` as usual. Vitest will automatically redirect these imports to the mock implementation in `tests/obsidian.ts`.

    ```typescript
    import { describe, it, expect } from 'vitest';
    import { Notice } from 'obsidian';

    describe('Feature', () => {
        it('shows a notice', () => {
            new Notice('Success!');
            // The mock will track this call
        });
    });
    ```

- **Testing Workers**:
  When writing tests for logic that runs in a Web Worker, ensure the test file is included in the Vitest configuration and leverages the `@vitest/web-worker` setup to handle `postMessage` and `onmessage` flows.

## Coverage requirements

No coverage threshold configured.

| Type       | Threshold |
| :--------- | :-------- |
| Lines      | N/A       |
| Branches   | N/A       |
| Functions  | N/A       |
| Statements | N/A       |

## CI integration

Tests are automatically executed on every push and pull request to ensure stability.

- **Workflow**: Quality Pipeline (`.github/workflows/quality.yml`)
- **Trigger**: Pushes and PRs targeting `main` or `master`.
- **Job Name**: `quality`
- **Command Run**: `npm run test`
