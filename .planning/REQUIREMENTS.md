# Requirements

## v1 Requirements

### Infrastructure (INFRA)
- [x] **INFRA-01**: **Datacore Integration** — Strict requirement for high-performance reactive queries.
- [x] **INFRA-02**: **Modular Adapter Pattern** — Unified metadata surface supporting Datacore, Breadcrumbs, and Smart Connections.
- [x] **INFRA-03**: **Secure Keychain Management** — SecretStorage for API keys with AES-256 fallback.
- [x] **INFRA-04**: **Web Worker Offloading** — Offload Graphology computations to a background thread to prevent UI freezes.
- [x] **INFRA-05**: **Structural Cache** — LRU caching with event-based invalidation.

### Topological Analysis (TOPOL)
- [ ] **TOPOL-01**: **Bridge Scrutiny** — Detect missing links in sequential chains (A → B → C gap detection).
- [ ] **TOPOL-02**: **Link Prediction Engine** — Implement Jaccard, Adamic-Adar, and Resource Allocation indices.
- [ ] **TOPOL-03**: **Centrality Metrics** — PageRank, Louvain Community Detection, and Betweenness Centrality.
- [ ] **TOPOL-04**: **Ouroboros Detection** — DFS-based detection of infinite loops in hierarchical links.
- [ ] **TOPOL-05**: **Black Hole Detection** — Identify information sinks (high in-degree, zero out-degree).

### AI Intelligence (AI)
- [ ] **AI-01**: **AI Tribunal** — Dual-LLM (Primary vs Secondary) consensus verification for all suggestions.
- [ ] **AI-02**: **Semantic Tag Propagation** — AI-driven tag suggestions based on parent MOC clusters.
- [ ] **AI-03**: **Semantic Vector Discovery** — Integration with Smart Connections for vector-similarity scores.

### UX & Visualization (UX)
- [ ] **UX-01**: **Reactive Healing Dashboard** — Svelte 5 (Runes) based interface with partial re-rendering.
- [ ] **UX-02**: **Triple Relink Executor** — One-click complex repair for sequential bridge gaps.
- [x] **UX-03**: **Sync-Safe Hot Reload** — Detect external `data.json` changes and hot-reload settings.
- [x] **UX-04**: **Performance Hardening** — Debouncing, notices, and UI responsiveness.

## v2 Requirements (Deferred)
- **INFRA-06**: **WASM Graph Engine** — Migrate to Kuzu-WASM for vaults exceeding 50,000 nodes.
- **AI-04**: **InfraNodus Integration** — Structural hole analysis via external API.
- **UX-05**: **Deep Analytics Settings** — Fine-grained control over algorithmic weights and thresholds.

## Out of Scope
- **UI-04**: **3D Graph Visualization** — Focus is on healing algorithms, not visual eye-candy.
- **UI-05**: **Manual Mind-Mapping** — Let ExcaliBrain handle manual layout.

## Traceability

| Req ID | Phase | Plan | Status |
|--------|-------|------|--------|
| INFRA-01 | Phase 1 | — | ✓ Validated |
| INFRA-02 | Phase 1 | — | ✓ Validated |
| INFRA-03 | Phase 1 | — | ✓ Validated |
| INFRA-04 | Phase 2 | — | ✓ Validated |
| INFRA-05 | Phase 1 | — | ✓ Validated |
| UX-03 | Phase 7 | — | ✓ Validated |
| UX-04 | Phase 7 | — | ✓ Validated |
| TOPOL-01 | Phase 10 | — | Active |
| TOPOL-02 | Phase 11 | — | Planned |
| TOPOL-03 | Phase 11 | — | Planned |
| TOPOL-04 | Phase 10 | — | Active |
| TOPOL-05 | Phase 10 | — | Active |
| AI-01 | Phase 12 | — | Planned |
| AI-02 | Phase 13 | — | Planned |
| AI-03 | Phase 12 | — | Planned |
| UX-01 | Phase 14 | — | Planned |
| UX-02 | Phase 14 | — | Planned |

---
*Last updated: 2026-05-05 after initialization*
