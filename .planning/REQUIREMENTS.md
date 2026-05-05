# Requirements

## v1 Requirements

### Infrastructure (INFRA)
- [x] **INFRA-01**: **Datacore Integration** â€” Strict requirement for high-performance reactive queries.
- [x] **INFRA-02**: **Modular Adapter Pattern** â€” Unified metadata surface supporting Datacore, Breadcrumbs, and Smart Connections.
- [x] **INFRA-03**: **Secure Keychain Management** â€” SecretStorage for API keys with AES-256 fallback.
- [x] **INFRA-04**: **Web Worker Offloading** â€” Offload Graphology computations to a background thread to prevent UI freezes.
- [x] **INFRA-05**: **Structural Cache** â€” LRU caching with event-based invalidation.

### Topological Analysis (TOPOL)
- [ ] **TOPOL-01**: **Bridge Scrutiny** â€” Detect missing links in sequential chains (A â†’ B â†’ C gap detection).
- [ ] **TOPOL-02**: **Link Prediction Engine** â€” Implement Jaccard, Adamic-Adar, and Resource Allocation indices.
- [ ] **TOPOL-03**: **Centrality Metrics** â€” PageRank, Louvain Community Detection, and Betweenness Centrality.
- [ ] **TOPOL-04**: **Ouroboros Detection** â€” DFS-based detection of infinite loops in hierarchical links.
- [ ] **TOPOL-05**: **Black Hole Detection** â€” Identify information sinks (high in-degree, zero out-degree).

### AI Intelligence (AI)
- [ ] **AI-01**: **AI Tribunal** â€” Dual-LLM (Primary vs Secondary) consensus verification for all suggestions.
- [ ] **AI-02**: **Semantic Tag Propagation** â€” AI-driven tag suggestions based on parent MOC clusters.
- [ ] **AI-03**: **Semantic Vector Discovery** â€” Integration with Smart Connections for vector-similarity scores.

### UX & Visualization (UX)
- [ ] **UX-01**: **Reactive Healing Dashboard** â€” Svelte 5 (Runes) based interface with partial re-rendering.
- [ ] **UX-02**: **Triple Relink Executor** â€” One-click complex repair for sequential bridge gaps.
- [x] **UX-03**: **Sync-Safe Hot Reload** â€” Detect external `data.json` changes and hot-reload settings.
- [x] **UX-04**: **Performance Hardening** â€” Debouncing, notices, and UI responsiveness.

## v2 Requirements (Deferred)
- **INFRA-06**: **WASM Graph Engine** â€” Migrate to Kuzu-WASM for vaults exceeding 50,000 nodes.
- **AI-04**: **InfraNodus Integration** â€” Structural hole analysis via external API.
- **UX-05**: **Deep Analytics Settings** â€” Fine-grained control over algorithmic weights and thresholds.

## Out of Scope
- **UI-04**: **3D Graph Visualization** â€” Focus is on healing algorithms, not visual eye-candy.
- **UI-05**: **Manual Mind-Mapping** â€” Let ExcaliBrain handle manual layout.

## Traceability

| Req ID | Phase | Status |
|--------|-------|--------|
| INFRA-01 | Phase 1 | âœ“ Validated |
| INFRA-02 | Phase 1 | âœ“ Validated |
| INFRA-03 | Phase 1 | âœ“ Validated |
| INFRA-04 | Phase 2 | âœ“ Validated |
| INFRA-05 | Phase 1 | âœ“ Validated |
| TOPOL-01 | Phase 5 | Active |
| TOPOL-02 | Phase 6 | Pending |
| TOPOL-03 | Phase 6 | Pending |
| TOPOL-04 | Phase 5 | Active |
| TOPOL-05 | Phase 5 | Active |
| AI-01 | Phase 7 | Pending |
| AI-02 | Phase 8 | Pending |
| AI-03 | Phase 7 | Pending |
| UX-01 | Phase 10 | Pending |
| UX-02 | Phase 11 | Pending |
| UX-03 | Phase 3 | âœ“ Validated |
| UX-04 | Phase 3 | âœ“ Validated |
| ADAPTER-01 | Phase 1 | âœ“ Validated |
| ADAPTER-02 | Phase 1 | âœ“ Validated |
| ARCH-01 | Phase 1 | âœ“ Validated |
| ARCH-02 | Phase 1 | âœ“ Validated |
| ARCH-03 | Phase 1 | âœ“ Validated |
| UTIL-01 | Phase 1 | âœ“ Validated |
| UTIL-02 | Phase 1 | âœ“ Validated |
| COMPAT-01 | Phase 1 | âœ“ Validated |
| HARDEN-01 | Phase 2 | âœ“ Validated |
| HARDEN-02 | Phase 2 | âœ“ Validated |
| HARDEN-03 | Phase 4 | Active |
| UX-01 (Hardening) | Phase 2 | âœ“ Validated |
| EXTRACT-01 | Phase 2 | âœ“ Validated |
| TEST-01 | Phase 2 | âœ“ Validated |
| UI-01 | Phase 9 | Pending |
| UI-02 | Phase 9 | Pending |
| UI-03 | Phase 10 | Pending |

---
*Last updated: 2026-05-05 after roadmap creation*
