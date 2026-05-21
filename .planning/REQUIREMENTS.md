# Requirements

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: **Datacore Integration** — Strict requirement for high-performance reactive queries.
- [x] **INFRA-02**: **Modular Adapter Pattern** — Unified metadata surface supporting Datacore, Breadcrumbs, and Smart Connections.
- [x] **INFRA-03**: **Secure Keychain Management** — SecretStorage for API keys with AES-256 fallback.
- [x] **INFRA-04**: **Web Worker Offloading** — Offload Graphology computations to a background thread to prevent UI freezes.
- [x] **INFRA-05**: **Structural Cache** — LRU caching with event-based invalidation.

### Topological Analysis (TOPOL)

- [x] **TOPOL-01**: **Bridge Scrutiny** — Detect missing links in sequential chains (A → B → C gap detection).
- [x] **TOPOL-02**: **Link Prediction Engine** — Implement Jaccard, Adamic-Adar, and Resource Allocation indices.
- [x] **TOPOL-03**: **Centrality Metrics** — PageRank, Louvain Community Detection, and Betweenness Centrality.
- [x] **TOPOL-04**: **Ouroboros Detection** — DFS-based detection of infinite loops in hierarchical links.
- [x] **TOPOL-05**: **Black Hole Detection** — Identify information sinks (high in-degree, zero out-degree).

### AI Intelligence (AI)

- [x] **AI-01**: **AI Tribunal** — Dual-LLM (Primary vs Secondary) consensus verification for all suggestions.
- [x] **AI-02**: **Semantic Tag Propagation** — AI-driven tag suggestions based on parent MOC clusters.
- [x] **AI-03**: **Semantic Vector Discovery** — Integration with Smart Connections for vector-similarity scores.

### UX & Visualization (UX/UI)

- [x] **UI-01**: **High-Fidelity Graph View** — WebGL-based visualization highlighting topological errors (gaps, loops, sinks).
- [x] **UI-02**: **In-Graph Healing Interface** — Direct execution of fixes via interactive graph popups.
- [x] **UX-01**: **Reactive Healing Dashboard** — Svelte 5 (Runes) based interface with partial re-rendering.
- [x] **UX-02**: **Triple Relink Executor** — One-click complex repair for sequential bridge gaps.
- [x] **UX-03**: **Sync-Safe Hot Reload** — Detect external `data.json` changes and hot-reload settings.
- [x] **UX-04**: **Performance Hardening** — Debouncing, notices, and UI responsiveness.

### Hardening (HARDEN)

- [x] **HARDEN-01**: **Cache Stampede Protection** — In-flight promise coalescing to prevent redundant fetches.
- [x] **HARDEN-02**: **Unit Testing (Negative/LRU)** — Explicit tests for null-caching behavior and LRU eviction order.
- [x] **HARDEN-03**: **BaseAdapter Ultra-Hardening (Audit Findings)**
    - [x] **HARDEN-03a**: Fix lifecycle: remove `metadataCache` listener in `UnifiedMetadataAdapter.destroy()`.
    - [x] **HARDEN-03b**: Harden `NativeVaultAdapter` edges: normalize paths, skip self/non-file targets.
    - [x] **HARDEN-03c**: Add deterministic deduplication to `getLinks()` in `UnifiedMetadataAdapter`.
    - [x] **HARDEN-03d**: Add `ensureInitialized()` guard across all adapters.
    - [x] **HARDEN-03e**: Parametrize `Promise<...>` for stronger type-safety in adapter interfaces.
    - [x] **HARDEN-03f**: Optimize `UnifiedMetadataAdapter.getLinks()` with `Promise.all`.
    - [x] **HARDEN-03g**: Optimize SmartConnections fallback (size cap, early break).
- [x] **HARDEN-04**: **Linting & Style Standards** — zero lint warnings, Obsidian HIG compliance (Sentence case).
- [x] **HARDEN-05**: **Strict Type Safety** — Elimination of `any` and `as any` from core logic and UI.
- [x] **HARDEN-06**: **CI/CD Quality Gates** — Husky hooks enforce standards on commit/push.

## v2 Requirements (Deferred)

- **INFRA-06**: **WASM Graph Engine** — Migrate to Kuzu-WASM for vaults exceeding 50,000 nodes.
- **AI-04**: **InfraNodus Integration** — Structural hole analysis via external API.
- **UX-05**: **Deep Analytics Settings** — Fine-grained control over algorithmic weights and thresholds.

## Out of Scope

- **UI-04**: **Manual Mind-Mapping** — Let ExcaliBrain handle manual layout.
- **UI-05**: **3D Graph Visualization (Eye-Candy)** — Focus is on healing, not just 3D effects. (Note: Phase 9 implements 3D for performance reasons, not just aesthetics).

## Traceability

| Req ID    | Phase    | Status      |
| --------- | -------- | ----------- |
| INFRA-01  | Phase 1  | ✓ Validated |
| INFRA-02  | Phase 1  | ✓ Validated |
| INFRA-03  | Phase 1  | ✓ Validated |
| INFRA-04  | Phase 2  | ✓ Validated |
| INFRA-05  | Phase 1  | ✓ Validated |
| TOPOL-01  | Phase 5  | ✓ Validated |
| TOPOL-02  | Phase 6  | ✓ Validated |
| TOPOL-03  | Phase 6  | ✓ Validated |
| TOPOL-04  | Phase 5  | ✓ Validated |
| TOPOL-05  | Phase 5  | ✓ Validated |
| AI-01     | Phase 7  | ✓ Validated |
| AI-02     | Phase 8  | ✓ Validated |
| AI-03     | Phase 7  | ✓ Validated |
| UI-01     | Phase 9  | ✓ Validated |
| UI-02     | Phase 9  | ✓ Validated |
| UX-01     | Phase 10 | ✓ Validated |
| UX-02     | Phase 11 | ✓ Validated |
| UX-03     | Phase 3  | ✓ Validated |
| UX-04     | Phase 3  | ✓ Validated |
| HARDEN-01 | Phase 2  | ✓ Validated |
| HARDEN-02 | Phase 2  | ✓ Validated |
| HARDEN-03 | Phase 4  | ✓ Validated |
| HARDEN-04 | Phase 13 | ✓ Validated |
| HARDEN-05 | Phase 13 | ✓ Validated |
| HARDEN-06 | Phase 13 | ✓ Validated |

---

_Last updated: 2026-05-18 after Phase 13 completion_
