# Phase 6 Validation: Advanced Topological Metrics

## Validation Strategy

The validation of Phase 6 focuses on the formalization of the link prediction engine, the persistence of topological metrics in the cache, and the implementation of intelligent MOC (Map of Content) suggestions. Validation is performed through unit tests for the new engines, cache integration tests, and UI verification.

## Acceptance Criteria Verification

### 1. Link Prediction Engine (TOPOL-02)

- **Goal**: Implement Jaccard, Adamic-Adar, and Resource Allocation indices for semantic link prediction.
- **Verification**:
    - `LinkPredictionEngine.test.ts`: Verify hybrid weighted scoring logic and temporal decay integration.
    - `DeepAnalyticsSettings.ts`: Verify sliders for tuning Jaccard, AA, and RA weights.
    - Integration: Confirm `GraphEngine` delegates similarity tasks to `LinkPredictionEngine`.

### 2. Centrality Metrics & Persistence (TOPOL-03)

- **Goal**: Implement PageRank, Louvain Community Detection, and Betweenness Centrality, with persistence to avoid redundant computation.
- **Verification**:
    - `CacheService.test.ts`: Verify that `topologicalScores` (pageRank, betweenness, communities) are correctly initialized and saved/loaded.
    - `GraphEngine.test.ts`: Verify that `runPageRankAnalysis` and other methods check the cache fingerprint and timestamp before offloading to workers.
    - `GraphWorkerService`: (Off-thread) Verify that Louvain and Betweenness algorithms return correct results for known graph structures.

### 3. Thematic Hub / MOC Suggestions (UX-05 / MOC)

- **Goal**: Identify clusters that lack a centralizing Map of Content and suggest candidates based on PageRank pillars.
- **Verification**:
    - `GraphEngine.moc.test.ts`: Verify that Louvain clusters exceeding the `mocSaturationThreshold` trigger a suggestion if no existing note contains 'MOC' in the name or tags.
    - Centrality check: Confirm the suggested hub note is named after the highest PageRank authority in the cluster.

### 4. Advanced Analytical UI (UX-05)

- **Goal**: Provide user control over analytical parameters and cache maintenance.
- **Verification**:
    - `DeepAnalyticsSettings.ts`: Review implementation for weight sliders, MOC saturation threshold, Black Hole threshold, and the "Clear Analytical Cache" button.
    - `plugin.saveSettings()` calls verified for all new inputs.

## Test Matrix

| Req ID   | Test File                      | Test Case                                           |
| -------- | ------------------------------ | --------------------------------------------------- |
| TOPOL-02 | `LinkPredictionEngine.test.ts` | `should synthesize suggestions from worker results` |
| TOPOL-02 | `LinkPredictionEngine.test.ts` | `should apply weighted scoring correctly`           |
| TOPOL-03 | `CacheService.test.ts`         | `should persist topological metrics`                |
| TOPOL-03 | `GraphEngine.test.ts`          | `should use cached metrics if graph hasn't changed` |
| UX-05    | `GraphEngine.moc.test.ts`      | `should suggest MOC for large saturated clusters`   |
| UX-05    | `GraphEngine.moc.test.ts`      | `should skip MOC suggestion if one already exists`  |

## Final Pipeline

1. `npm test tests/core/LinkPredictionEngine.test.ts`
2. `npm test tests/core/GraphEngine.test.ts`
3. `npm test tests/core/GraphEngine.moc.test.ts`
4. `npm run build`
