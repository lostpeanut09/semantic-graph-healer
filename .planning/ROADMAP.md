# Roadmap

## Phases

- [x] **Phase 1: Core Foundation & Adapter Architecture** - Establish a stable, modular data ingestion layer.
- [x] **Phase 2: Concurrency & Performance Hardening** - Ensure the plugin doesn't freeze the UI during heavy computations.
- [x] **Phase 3: Setting Resilience & UX Stability** - Robust settings management and basic user feedback.
- [x] **Phase 4: BaseAdapter Ultra-Hardening** - Address residual audit findings and edge cases in the adapter layer. [2026-05-05]
- [x] **Phase 5: Topological Diagnostics: Gaps & Loops** - Detect structural issues like missing links and infinite hierarchies. [2026-05-08]
- [x] **Phase 6: Advanced Topological Metrics** - Implement sophisticated graph algorithms for link prediction and centrality. [2026-05-08]
- [x] **Phase 7: AI Tribunal & Similarity Analysis** - Integrate AI for verification and vector-based discovery. [2026-05-09]
- [x] **Phase 8: Semantic Tag Propagation** - Automate tag management using graph context and AI. [2026-05-10]
- [ ] **Phase 9: High-Fidelity Graph UI** - Provide a specialized view for visualizing graph issues.
- [ ] **Phase 10: Reactive Healing Dashboard** - A central hub for managing all graph suggestions.
- [ ] **Phase 11: Complex Suggestion Execution** - One-click repair for sophisticated topological issues.
- [ ] **Phase 12: v1 Finalization & Stress Testing** - Ensure production readiness for large-scale digital gardens.

## Phase Details

### Phase 1: Core Foundation & Adapter Architecture
**Goal**: Establish a stable, modular data ingestion layer.
**Depends on**: Nothing
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-05, ADAPTER-01, ADAPTER-02, ARCH-01, ARCH-02, ARCH-03, UTIL-01, UTIL-02, COMPAT-01  
**Success Criteria** (what must be TRUE):
  1. Plugin successfully initializes and loads metadata via Datacore.
  2. Multiple adapters (Breadcrumbs, Smart Connections) can be injected into the UnifiedMetadataAdapter.
  3. Vault path normalization is centralized and consistent across all adapters.
  4. Secure keychain can store and retrieve API keys with AES-256 fallback.
**Plans**: Completed

### Phase 2: Concurrency & Performance Hardening
**Goal**: Ensure the plugin doesn't freeze the UI during heavy computations.
**Depends on**: Phase 1
**Requirements**: INFRA-04, HARDEN-01, HARDEN-02, UX-01 (PROJECT: Hardening), EXTRACT-01, TEST-01
**Success Criteria** (what must be TRUE):
  1. Graph computations (Graphology) run in a background Web Worker.
  2. Cache stampede protection prevents redundant metadata fetches.
  3. BoundedMap correctly evicts items using true LRU logic.
  4. UI notices provide feedback for long-running operations.
**Plans**: Completed

### Phase 3: Setting Resilience & UX Stability
**Goal**: Robust settings management and basic user feedback.
**Depends on**: Phase 2
**Requirements**: UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Settings hot-reload automatically when `data.json` is modified externally.
  2. Debounced metadata updates prevent excessive re-analysis during typing.
  3. Plugin remains stable and type-safe across all supported Obsidian versions.
**Plans**: Completed

### Phase 4: BaseAdapter Ultra-Hardening
**Goal**: Address residual audit findings and edge cases in the adapter layer.
**Depends on**: Phase 3
**Requirements**: HARDEN-03a, HARDEN-03b, HARDEN-03c, HARDEN-03d, HARDEN-03e, HARDEN-03f, HARDEN-03g
**Success Criteria** (what must be TRUE):
  1. `UnifiedMetadataAdapter` correctly removes `metadataCache` listeners in `destroy()`.
  2. `NativeVaultAdapter` normalizes paths and filters self-links/non-file targets in `getLinks()`.
  3. `UnifiedMetadataAdapter` deduplicates edges and preserves the highest confidence score.
  4. All adapters implement `ensureInitialized()` guards to prevent race conditions.
  5. Type safety is improved across all adapters by removing implicit `any` in `Promise` returns.
  6. SmartConnections fallback optimization reduces CPU overhead on dense vaults.
**Plans**: Completed

### Phase 5: Topological Diagnostics: Gaps & Loops
**Goal**: Detect structural issues like missing links and infinite hierarchies.
**Depends on**: Phase 4
**Requirements**: TOPOL-01, TOPOL-04, TOPOL-05
**Success Criteria** (what must be TRUE):
  1. User can identify "Bridge Gaps" where sequential notes (A -> B -> C) are missing connections.
  2. Circular dependencies in hierarchies (Ouroboros) are detected and flagged.
  3. "Black Holes" (notes with many incoming but no outgoing links) are surfaced.
**Plans**: Completed

### Phase 6: Advanced Topological Metrics
**Goal**: Implement sophisticated graph algorithms for link prediction and centrality.
**Depends on**: Phase 5
**Requirements**: TOPOL-02, TOPOL-03
**Success Criteria** (what must be TRUE):
  1. Plugin suggests new links based on Jaccard and Adamic-Adar indices.
  2. PageRank and Betweenness Centrality metrics are available for all notes.
  3. Louvain Community Detection identifies natural MOC clusters.
  4. Topological scores are persisted in the cache.
**Plans**:
- [ ] 06-01-PLAN.md — Engine Formalization & Persistence (Link Prediction, Cache)
- [ ] 06-02-PLAN.md — Advanced UI & MOC Suggestions (Settings, Clusters)

### Phase 7: AI Tribunal & Similarity Analysis
**Goal**: Integrate AI for verification and vector-based discovery.
**Depends on**: Phase 6
**Requirements**: AI-01, AI-03
**Success Criteria** (what must be TRUE):
  1. AI Tribunal (dual-LLM) provides consensus on whether a suggested link is semantically valid.
  2. Vector similarity scores from Smart Connections are integrated into the healing logic.
  3. Primary and Secondary models can be configured for the tribunal.
**Plans**: 3 plans
- [ ] 07-01-PLAN.md — Foundation & AI Tribunal Core
- [ ] 07-02-PLAN.md — Vector Similarity & HTR
- [ ] 07-03-PLAN.md — UI Hardening & Consensus Visualization

### Phase 8: Semantic Tag Propagation
**Goal**: Automate tag management using graph context and AI.
**Depends on**: Phase 7
**Requirements**: AI-02
**Success Criteria** (what must be TRUE):
  1. User receives tag suggestions based on parent MOC cluster semantics.
  2. Tags can be propagated down hierarchies automatically.
**Plans**: 1 plan
- [ ] 08-01-PLAN.md — Semantic Tag Propagation Core

### Phase 9: High-Fidelity Graph UI
**Goal**: Provide a specialized view for visualizing graph issues.
**Depends on**: Phase 5
**Requirements**: UI-01, UI-02
**Success Criteria** (what must be TRUE):
  1. A custom graph view highlights detected topological errors (gaps, loops, sinks).
  2. The "Reasoning Explainer" UI explains WHY a specific healing action is suggested.
**Plans**: 3 plans
- [x] 09-01-PLAN.md — Foundation & Data Mapping [2026-05-10]
- [x] 09-02-PLAN.md — Graph Visualization View [2026-05-10]
- [x] 09-03-PLAN.md — Interaction & Suggestion Integration [2026-05-10]
**UI hint**: yes

### Phase 10: Reactive Healing Dashboard
**Goal**: A central hub for managing all graph suggestions using Svelte 5.
**Depends on**: Phase 9
**Requirements**: UX-01, UI-03
**Success Criteria** (what must be TRUE):
  1. A Svelte 5 (Runes) dashboard displays all suggested repairs in real-time.
  2. Partial re-rendering ensures the dashboard remains responsive with 100+ suggestions.
  3. Batch execution logic with yielding prevents UI lockup.
  4. Interactions include "Undo" toast and visual "Fixed" state.
**Plans**: 4 plans
- [x] 10-01-PLAN.md — Build Foundation & Reactive Store [2026-05-10]
- [x] 10-02-PLAN.md — Svelte Migration & Tabbed Layout [2026-05-10]
- [ ] 10-03-PLAN.md — Interaction Logic (Batch, Undo)
- [ ] 10-04-PLAN.md — AI Verification & Reasoning UI
**UI hint**: yes

### Phase 11: Complex Suggestion Execution
**Goal**: One-click repair for sophisticated topological issues.
**Depends on**: Phase 10
**Requirements**: UX-02
**Success Criteria** (what must be TRUE):
  1. "Triple Relink Executor" can fix multiple missing links in a chain with one click.
  2. Multi-file edits for healing are atomic and reversible.
**Plans**: TBD

### Phase 12: v1 Finalization & Stress Testing
**Goal**: Ensure production readiness for large-scale digital gardens.
**Depends on**: Phase 11
**Requirements**: None
**Success Criteria** (what must be TRUE):
  1. Plugin performance remains acceptable on vaults with 10,000+ nodes.
  2. All v1 requirements are verified and documented.
**Plans**: TBD

## Progress Table
| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Core Foundation & Adapter Architecture | 1/1 | Completed | 2026-05-05 |
| 2. Concurrency & Performance Hardening | 1/1 | Completed | 2026-05-05 |
| 3. Setting Resilience & UX Stability | 1/1 | Completed | 2026-05-05 |
| 4. BaseAdapter Ultra-Hardening | 1/1 | Completed | 2026-05-05 |
| 5. Topological Diagnostics: Gaps & Loops | 1/1 | Completed | 2026-05-08 |
| 6. Advanced Topological Metrics | 1/1 | Completed | 2026-05-08 |
| 7. AI Tribunal & Similarity Analysis | 3/3 | Completed | 2026-05-09 |
| 8. Semantic Tag Propagation | 1/1 | Completed | 2026-05-10 |
| 9. High-Fidelity Graph UI | 3/3 | Completed | 2026-05-10 |
| 10. Reactive Healing Dashboard | 0/4 | Not started | - |
| 11. Complex Suggestion Execution | 0/1 | Not started | - |
| 12. v1 Finalization & Stress Testing | 0/1 | Not started | - |
