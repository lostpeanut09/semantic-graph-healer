# Phase 5 Validation: Topological Diagnostics: Gaps & Loops

## Validation Strategy

The validation of this phase focuses on the correctness and performance of the three main topological algorithms: Bridge Scrutiny, Ouroboros (Cycle) Detection, and Black Hole Detection. Since these algorithms are offloaded to the Web Worker, unit testing will primarily target the worker's logic, while integration testing will verify the end-to-end flow through `TopologyAnalyzer`.

## Acceptance Criteria Verification

### 1. Bridge Scrutiny (TOPOL-01)

- **Goal**: Accurately detect missing direct links in A -> B -> C chains.
- **Verification**:
    - Unit test in `GraphAnalysisWorkerCore.test.ts`: Construct a small graph `A -> B`, `B -> C`, with no `A -> C`. Verify the worker returns `A -> C` as a bridge gap.
    - Integration test: Verify `TopologyAnalyzer` transforms this into a `deterministic` type suggestion.

### 2. Ouroboros Detection (TOPOL-04)

- **Goal**: Detect circular dependencies in hierarchies.
- **Verification**:
    - Unit test in `GraphAnalysisWorkerCore.test.ts`: Construct a cycle `A -> B -> C -> A`. Verify the worker identifies the circular path.
    - Scope check: Verify "Universal" vs "Boundary-Crossing" filters by constructing cross-folder cycles and asserting they are only caught when configured.

### 3. Black Hole Detection (TOPOL-05)

- **Goal**: Identify information sinks (In-degree >= 7, Out-degree = 0).
- **Verification**:
    - Unit test in `GraphAnalysisWorkerCore.test.ts`: Create a node with 7 incoming edges and 0 outgoing. Verify it is flagged. Create a node with 6 incoming edges; verify it is NOT flagged.

### 4. Background Offloading

- **Goal**: Ensure heavy math runs in the worker.
- **Verification**:
    - Code review: Confirm `TopologyAnalyzer` calls `GraphWorkerService.runAnalysis`.
    - Manual check: Verify UI responsiveness during a "Full Scan" on a medium-sized vault.

## Test Matrix

| Req ID   | Test File                         | Test Case                                                   |
| -------- | --------------------------------- | ----------------------------------------------------------- |
| TOPOL-01 | `GraphAnalysisWorkerCore.test.ts` | `should detect transitive gaps in directed chains`          |
| TOPOL-04 | `GraphAnalysisWorkerCore.test.ts` | `should identify cycles in hierarchical edges`              |
| TOPOL-05 | `GraphAnalysisWorkerCore.test.ts` | `should flag nodes with high in-degree and zero out-degree` |
| ALL      | `Integration.test.ts`             | `should coordinate end-to-end topological diagnostics`      |

## Final Pipeline

1. `npm run lint` (Zero warnings)
2. `npm test tests/core/workers/GraphAnalysisWorkerCore.test.ts`
3. `npm test tests/core/workers/Integration.test.ts`
4. `npm run build`
