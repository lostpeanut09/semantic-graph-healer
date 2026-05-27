# Phase 6: Advanced Topological Metrics - Research

**Researched:** 2026-05-08
**Domain:** Graph Theory, Link Prediction, Centrality Metrics
**Confidence:** HIGH

## Summary

Phase 6 transitions the Semantic Graph Healer from a diagnostic tool into a predictive and structural analysis engine. While the foundation for these metrics was laid in Phase 2 (Web Worker implementation of PageRank and Louvain), this phase focuses on formalizing the **Link Prediction Engine (TOPOL-02)** and deeply integrating **Centrality Metrics (TOPOL-03)** into the healing pipeline.

The primary challenge is balancing algorithmic complexity (O(N^2) for some metrics) with the requirement to support vaults of 5000+ nodes. The research confirms that the current "Candidate Generation" strategy in the Link Prediction engine is sound, but requires better normalization and user-facing weights to be effective across different note-taking styles.

**Primary recommendation:** Formalize the `LinkPredictionEngine` as a core service, expose weights/thresholds in the UI, and implement a sampling strategy for computationally expensive metrics like Betweenness Centrality on large graphs.

## Architectural Responsibility Map

| Capability           | Primary Tier  | Secondary Tier | Rationale                                                                                |
| -------------------- | ------------- | -------------- | ---------------------------------------------------------------------------------------- |
| Graph Computation    | Web Worker    | —              | Prevents UI freezing during O(V\*E) or O(V^2) analysis. [VERIFIED: code audit]           |
| Suggestion Synthesis | Plugin Core   | —              | Transforms raw scores (0.85 PageRank) into human-readable advice. [VERIFIED: code audit] |
| Parameter Tuning     | UI (Settings) | —              | Allows users to define what "similarity" means for their vault. [ASSUMED]                |
| Metric Persistence   | Cache Layer   | —              | Prevents redundant heavy computation on every plugin boot. [VERIFIED: CacheService]      |

## Standard Stack

### Core

| Library                        | Version | Purpose              | Why Standard                                                                  |
| ------------------------------ | ------- | -------------------- | ----------------------------------------------------------------------------- |
| graphology                     | ^0.26.0 | Graph Data Structure | The industry standard for JS graph theory. [VERIFIED: npm]                    |
| graphology-metrics             | ^2.4.0  | Centrality & Density | Official implementation of PageRank and Brandes' Betweenness. [VERIFIED: npm] |
| graphology-communities-louvain | ^2.0.2  | Clustering           | High-performance modularity-based community detection. [VERIFIED: npm]        |

### Supporting

| Library | Version | Purpose                  | When to Use                                                                       |
| ------- | ------- | ------------------------ | --------------------------------------------------------------------------------- |
| Zod     | ^4.3.6  | Worker Schema Validation | Ensuring serialized graph data is valid before analysis. [VERIFIED: package.json] |
| p-queue | ^9.1.2  | Worker Task Management   | Sequential execution of heavy graph tasks. [VERIFIED: package.json]               |

### Alternatives Considered

| Instead of                  | Could Use          | Tradeoff                                                                                                                         |
| --------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Hand-rolled Link Prediction | graphology-library | Graphology does not currently have a dedicated link prediction package. Hand-rolling is necessary. [CITED: WebSearch]            |
| Louvain                     | Leiden Algorithm   | Leiden is theoretically better for disconnected components but has fewer mature JS implementations. Louvain is stable. [ASSUMED] |

**Installation:**

```bash
npm install graphology graphology-metrics graphology-communities-louvain
```

## Architecture Patterns

### Link Prediction Engine (TOPOL-02)

The engine utilizes a **Candidate Generation** pattern to avoid O(N^2) comparisons. It only evaluates pairs that share at least two common neighbors.

**Formulae used:**

1. **Jaccard Coefficient**: `|N(u) ∩ N(v)| / |N(u) ∪ N(v)|` (0.0 - 1.0)
2. **Adamic-Adar (AA)**: `Σ 1 / log(degree(w))` for shared neighbors `w`.
3. **Resource Allocation (RA)**: `Σ 1 / degree(w)` for shared neighbors `w`.

**Hybrid Scoring:**
The final score is a weighted average of these three, multiplied by a **Temporal Decay** factor (files edited closer in time are more likely to be related).

### Centrality & Community Integration (TOPOL-03)

- **PageRank**: Identifies "Knowledge Pillars" (high-authority notes).
- **Betweenness**: Identifies "Bridges" (notes connecting different clusters).
- **Louvain**: Groups notes into "Conceptual Islands".

### Anti-Patterns to Avoid

- **Sync Analysis on UI Thread:** Never run `betweennessCentrality` on the main thread for graphs > 100 nodes.
- **Unweighted Centrality:** Treating all links as equal. Obsidian links have weights (count) and types (up/down/next), which should influence PageRank and Louvain.

## Don't Hand-Roll

| Problem                | Don't Build      | Use Instead                                 | Why                                                                   |
| ---------------------- | ---------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Betweenness Centrality | Custom DFS       | `graphology-metrics/centrality/betweenness` | Brandes' algorithm is highly optimized and edge-case tested.          |
| PageRank               | Custom Iteration | `graphology-metrics/centrality/pagerank`    | Handles convergence and dangling nodes correctly.                     |
| Graph Serialization    | Custom JSON      | `graph.export()`                            | Built-in methods handle attributes and edge directionality correctly. |

## Common Pitfalls

### Pitfall 1: Metric Explosion

**What goes wrong:** A graph with 5000 nodes produces 1000+ PageRank "Info" suggestions, overwhelming the user.
**Why it happens:** Lack of percentile-based thresholds.
**How to avoid:** Only suggest top 1% or top 10 nodes for centrality metrics. Use the `meta.confidence` field to prioritize.

### Pitfall 2: Memory Bloat in Web Worker

**What goes wrong:** Large graphs (5000+ nodes) cause OOM in the worker or slow serialization.
**Why it happens:** Passing full `DataviewPage` objects instead of minimal `{key, attributes}` pairs.
**How to avoid:** The worker bridge already implements minimal serialization. Ensure we don't accidentally bloat `attributes`.

### Pitfall 3: Fragmented Graph Bias

**What goes wrong:** PageRank fails to converge or gives misleading results on a vault with many small isolated clusters.
**Why it happens:** PageRank assumes a mostly connected component.
**How to avoid:** Detect isolated ratio; fallback to Degree Centrality if isolated nodes > 30%. [VERIFIED: already in GraphEngine.ts]

## Code Examples

### Verified Link Prediction Pattern (from worker)

```typescript
// Source: src/core/workers/graph-analysis-core.ts
const common = new Set([...sourceNeighbors].filter((x) => targetNeighbors.has(x)));
if (shared.size < 2) return;

const jaccard = shared.size / new Set([...sourceNeighbors, ...targetNeighbors]).size;

let adamicAdar = 0;
shared.forEach((z) => {
    const deg = neighborsMap.get(z)?.size || 0;
    if (deg > 1) adamicAdar += 1 / Math.log(deg);
});
```

## State of the Art

| Old Approach     | Current Approach  | When Changed | Impact                                                           |
| ---------------- | ----------------- | ------------ | ---------------------------------------------------------------- |
| Sync Analysis    | Web Worker        | Phase 2      | Plugin never freezes the UI, regardless of vault size.           |
| Manual MOCs      | Louvain Detection | Phase 6      | System suggests MOCs automatically based on structural clusters. |
| Direct Link-only | Link Prediction   | Phase 6      | Discovery of "Implicit" links that the user missed.              |

## Assumptions Log

| #   | Claim                                | Section      | Risk if Wrong                                              |
| --- | ------------------------------------ | ------------ | ---------------------------------------------------------- |
| A1  | Louvain is better than Leiden for JS | Alternatives | Louvain is standard in Graphology; risk is minimal.        |
| A2  | Users want to tune weights           | Summary      | They might prefer "Auto" mode, but pro users need control. |
| A3  | 5000 nodes is the 2026 baseline      | Summary      | Some vaults are 20k+, requiring even stricter sampling.    |

## Open Questions

1. **How to display Louvain Clusters?**
    - Recommendation: Use a "Thematic Cluster" suggestion that proposes adding a common tag to the cluster or creating a parent MOC note.
2. **Should we store metrics in the Cache?**
    - Recommendation: Yes. Storing the top-K nodes for each metric in `healer-cache.json` avoids re-running analysis until the graph changes significantly.

## Environment Availability

| Dependency  | Required By      | Available | Version | Fallback     |
| ----------- | ---------------- | --------- | ------- | ------------ |
| Node.js     | Build & Runtime  | ✓         | v25.2.1 | —            |
| Web Workers | Background Tasks | ✓         | Browser | Sync (Laggy) |
| Datacore    | Graph Data       | ✓         | latest  | Dataview     |

## Validation Architecture

### Test Framework

| Property           | Value              |
| ------------------ | ------------------ |
| Framework          | Vitest             |
| Config file        | `vitest.config.ts` |
| Quick run command  | `npm test`         |
| Full suite command | `npm test`         |

### Phase Requirements → Test Map

| Req ID   | Behavior                        | Test Type | Automated Command     | File Exists? |
| -------- | ------------------------------- | --------- | --------------------- | ------------ |
| TOPOL-02 | Link Prediction Correctness     | unit      | `npm run test:worker` | ✅           |
| TOPOL-03 | Centrality Calculation Accuracy | unit      | `npm run test:worker` | ✅           |

## Security Domain

### Applicable ASVS Categories

| ASVS Category       | Applies | Standard Control                                                  |
| ------------------- | ------- | ----------------------------------------------------------------- |
| V5 Input Validation | yes     | Zod schemas in `graph-analysis-core.ts` validate worker messages. |
| V6 Cryptography     | no      | No cryptography involved in topological analysis.                 |

### Known Threat Patterns for Graphology

| Pattern                        | STRIDE                 | Standard Mitigation                             |
| ------------------------------ | ---------------------- | ----------------------------------------------- |
| Denial of Service (Complexity) | Denial of Service      | Timeouts (120s) and Node/Edge guardrails.       |
| Data Leakage (Worker)          | Information Disclosure | Workers are same-origin and memory is isolated. |

## Sources

### Primary (HIGH confidence)

- `graphology` - [Official algorithms checked]
- `src/core/workers/graph-analysis-core.ts` - [Current implementation audit]

### Secondary (MEDIUM confidence)

- Web search for "graphology link prediction" - [Confirmed missing official package]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - Libraries are mature and already in use.
- Architecture: HIGH - Worker pattern is established.
- Pitfalls: MEDIUM - Performance tuning is vault-dependent.

**Research date:** 2026-05-08
**Valid until:** 2026-06-08
