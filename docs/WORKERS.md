# Workers

The Semantic Graph Healer uses Web Workers to perform resource-intensive tasks without blocking the main UI thread.

## Worker Architecture

- The main plugin communicates with the worker via `GraphWorkerService`.
- `graph-analysis-worker.ts` acts as the entry point for the worker thread.
- `graph-analysis-core.ts` contains the logic for topological analysis and graph computations.

## Key Operations Offloaded to Workers

- Large-scale graph traversal (using `TopologyAnalyzer`).
- LLM response post-processing.
- Suggestion ranking and filtering.
- Graph visualizer pre-calculations.
