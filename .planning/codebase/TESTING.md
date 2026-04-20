# Testing: Semantic Graph Healer

## Testing Framework

- **Engine**: Vitest 4.1+
- **Environment**: jsdom (for Obsidian-like DOM simulation where needed)
- **Organization**: Tests are located in the `tests/` directory and mirror the `src/` structure.

## Core Test Suites

- **Adapters (`tests/core/adapters/`)**: Verifies integration with Datacore, Breadcrumbs, and Smart Connections. Uses mocks for the Obsidian/Plugin APIs.
- **Services (`tests/core/services/`)**: Validates the Keychain, Cache, and Worker lifecycles.
- **Workers (`tests/core/workers/`)**: Focused on the topological algorithms (Louvain, PageRank) implemented in `graph-analysis-core.ts`.
- **Utils (`tests/core/utils/`)**: Ensures robust logging and LLM hardening.

## Coverage Goals

- **100% Coverage** required for:
    - Topological algorithms.
    - Data ingestion logic.
    - Encryption/Keychain services.
- **Integration Tests**: Focus on the worker-main thread communication boundary.

## How to Run

```bash
npm test          # Run all tests
npm run test:worker # Run only graph analysis tests
```
