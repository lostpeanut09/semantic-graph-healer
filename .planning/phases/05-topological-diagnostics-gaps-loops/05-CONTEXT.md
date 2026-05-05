# Phase 5 Context: Topological Diagnostics: Gaps & Loops

## Domain
Implementation of core graph algorithms to identify structural inconsistencies (Bridge Gaps, Ouroboros cycles, and Black Holes) within the Obsidian knowledge graph.

## Decisions

### Bridge Scrutiny Depth
- **Depth**: 2 steps.
- **Logic**: Focus on finding missing direct links in sequential chains (A -> B, B -> C, missing A -> C). This provides high-signal suggestions for "leapfrog" links that strengthen local clusters.

### Ouroboros Detection Scope
- **Scope**: Universal by default.
- **Customization**: A setting in the plugin tab will allow users to toggle between "All Cycles" and "Boundary-Crossing Only" (cycles that span different folders or MOC hierarchies).
- **Algorithm**: DFS-based cycle detection performed on the hierarchical subset of the graph.

### Black Hole Thresholds
- **Threshold**: Moderate (In-degree >= 7, Out-degree = 0).
- **Logic**: Notes that accumulate significant incoming references but fail to "forward" the signal are flagged as information bottlenecks.

### Detection Trigger Mode
- **Mode**: Automatic (Background).
- **Implementation**: Diagnostics run in the background Web Worker whenever the graph is re-analyzed (debounced). Suggestions are pushed to the internal state for subsequent UI consumption (Phase 10).

## Canonical Refs
- `src/core/GraphEngine.ts`
- `src/core/TopologyAnalyzer.ts`
- `src/core/workers/graph-analysis-core.ts`

## Deferred Ideas
- High-depth pathfinding (3+ steps) for Bridge Scrutiny (Deferred to Phase 12: Stress Testing).
- Community-based Black Hole weighting (using PageRank instead of simple in-degree) (Deferred to Phase 6: Advanced Metrics).

---
*Created: 2026-05-05*
