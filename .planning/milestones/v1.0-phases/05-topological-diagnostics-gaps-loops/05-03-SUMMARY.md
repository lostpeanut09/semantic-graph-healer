---
phase: 05-topological-diagnostics-gaps-loops
plan: 03
subsystem: topology-analyzer
tags: [architecture, graph, refactor]
requires: [05-02]
provides: [refactored-topology-diagnostics]
affects: [src/types.ts, src/views/sections/ExperimentalSettings.ts, src/core/TopologyAnalyzer.ts]
tech-stack:
    added: []
    patterns: [Worker-Delegate, Settings Integration, Boundary Filter]
key-files:
    modified:
        - src/types.ts
        - src/views/sections/ExperimentalSettings.ts
        - src/core/TopologyAnalyzer.ts
        - src/core/workers/graph-analysis-core.ts
        - tests/core/workers/GraphAnalysisWorkerCore.test.ts
decisions:
    - 'Offload Bridge, Cycle, and Sink detection to background worker via GraphEngine.'
    - 'Implement Ouroboros Scope (Universal vs Boundary) to reduce noise in large vaults.'
    - 'Standardize on Depth 2 for Bridge Scrutiny as the 2026 baseline.'
metrics:
    tasks_completed: 2
    tasks_total: 2
    duration_seconds: 1200
    files_modified: 5
---

# Phase 5 Plan 03: TopologyAnalyzer Refactor & Settings Summary

Successfully refactored `TopologyAnalyzer` to use worker-delegated diagnostic results via `GraphEngine`. Updated system settings to support fine-grained control over cycle detection and flow stagnation thresholds.

## Completion Status

All tasks completed successfully:

1. **Settings Update**: Added `ouroborosScope` and `blackHoleThreshold` to `src/types.ts` and integrated them into the `ExperimentalSettings` UI.
2. **TopologyAnalyzer Refactor**:
    - `runBridgeScrutiny`: Now calls `graphEngine.runTopologicalAnalysis({ bridgeDepth: 2 })` and maps transitive gaps to suggestions.
    - `runCycleAnalysis`: Now calls worker-delegated logic. Implemented `isCycleBoundary` to support the 'boundary' scope, filtering cycles that don't cross folder boundaries.
    - `runFlowStagnationAnalysis`: Now uses worker-detected sinks with user-defined thresholds.
3. **Worker Alignment**: Fixed `graph-analysis-core.ts` to return the structured data format expected by `GraphEngine.ts`, ensuring consistency between worker output and main-thread types.

## Deviations from Plan

- **Worker Fix**: While not explicitly in 05-03 PLAN, I identified and fixed a type mismatch in the worker return payload (sinks vs blackHoles, string[] vs typed objects) that would have blocked integration.
- **Automated Test Creation**: Created `tests/core/TopologyAnalyzer.test.ts` (which was referenced in the plan but missing from disk) to verify mapping logic and boundary filters.

## Self-Check: PASSED

- FOUND: src/types.ts
- FOUND: src/views/sections/ExperimentalSettings.ts
- FOUND: src/core/TopologyAnalyzer.ts
- VERIFIED: `npm test` passes (154 tests passed).
- VERIFIED: `npx vitest run tests/core/TopologyAnalyzer.test.ts` (3 tests passed).
