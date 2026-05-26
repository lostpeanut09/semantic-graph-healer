# Phase 5 Validation: Topological Diagnostics: Gaps & Loops

## Validation Strategy

The validation of this phase focuses on the correctness and performance of the three main topological algorithms: Bridge Scrutiny, Ouroboros (Cycle) Detection, and Black Hole Detection. Since these algorithms are offloaded to the Web Worker, unit testing will primarily target the worker's logic, while integration testing will verify the end-to-end flow through `TopologyAnalyzer`.

## Acceptance Criteria Verification

### 1. Bridge Scrutiny (TOPOL-01)

- **Goal**: Accurately detect missing direct links in A -> B -> C chains.
- **Verification**:
    - Unit test in `GraphAnalysisWorkerCore.test.ts`: Construct a small graph `A -> B`, `B -> C`, with no `A -> C`. Verify the worker returns `A -> C` as a bridge gap.
    - Integration test in `Phase5Nyquist.test.ts`: Verify `TopologyAnalyzer` transforms this into a `topology_gap` type suggestion with full metadata.

### 2. Ouroboros Detection (TOPOL-04)

- **Goal**: Detect circular dependencies in hierarchies.
- **Verification**:
    - Unit test in `GraphAnalysisWorkerCore.test.ts`: Construct a cycle `A -> B -> C -> A`. Verify the worker identifies the circular path.
    - Scope check in `Phase5Nyquist.test.ts` and `TopologyAnalyzer.test.ts`: Verify "Universal" vs "Boundary-Crossing" filters by constructing cross-folder cycles and asserting they are only caught when configured.

### 3. Black Hole Detection (TOPOL-05)

- **Goal**: Identify information sinks (In-degree >= 7, Out-degree = 0).
- **Verification**:
    - Unit test in `Phase5Nyquist.test.ts`: Create a node with 7 incoming edges and 0 outgoing. Verify it is flagged. Create a node with 6 incoming edges; verify it is NOT flagged (default threshold = 7).

### 4. Background Offloading

- **Goal**: Ensure heavy math runs in the worker.
- **Verification**:
    - Code review: Confirm `TopologyAnalyzer` calls `GraphWorkerService.runAnalysis`.
    - Manual check: Verify UI responsiveness during a "Full Scan" on a medium-sized vault.

## Test Matrix

| Req ID   | Test File                         | Test Case                                                   |
| -------- | --------------------------------- | ----------------------------------------------------------- |
| TOPOL-01 | `GraphAnalysisWorkerCore.test.ts` | `should detect bridge gaps (Depth 2)`          |
| TOPOL-01 | `Phase5Nyquist.test.ts`         | `should transform worker bridges into topology_gap suggestions` |
| TOPOL-04 | `GraphAnalysisWorkerCore.test.ts` | `should detect cycles (Ouroboros)`              |
| TOPOL-04 | `Phase5Nyquist.test.ts`         | `should correctly identify and filter boundary-crossing cycles` |
| TOPOL-05 | `Phase5Nyquist.test.ts`         | `should flag a node with 7 incoming edges when threshold is 7` |
| ALL      | `Integration.test.ts`             | `should coordinate end-to-end topological diagnostics`      |
| ALL      | `Integration.test.ts`             | `should successfully run a TOPOLOGY_DIAGNOSTICS analysis` |

## Final Pipeline

1. `npm run lint` (Zero warnings)
2. `npm test tests/core/Phase5Nyquist.test.ts`
3. `npm test tests/core/workers/GraphAnalysisWorkerCore.test.ts`
4. `npm test tests/core/workers/Integration.test.ts`
5. `npm test tests/core/TopologyAnalyzer.test.ts`
6. `npm run build`

