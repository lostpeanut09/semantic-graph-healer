# Requirements

## v1 Requirements

### Infrastructure (INFRA)

- [x] **INFRA-01**: **Datacore Integration** — Strict requirement for high-performance reactive queries.
- [x] **INFRA-02**: **Modular Adapter Pattern** — Unified metadata surface supporting Datacore, Breadcrumbs, and Smart Connections.
- [x] **INFRA-03**: **Secure Keychain Management** — SecretStorage for API keys with AES-256 fallback.
- [x] **INFRA-04**: **Web Worker Offloading** — Offload Graphology computations to a background thread to prevent UI freezes.
- [x] **INFRA-05**: **Structural Cache** — LRU caching with event-based invalidation.
- [x] **INFRA-06**: **WASM Graph Engine** — LadybugDB (WASM) for vaults exceeding 50,000 nodes.
- [x] **INFRA-07**: **Cypher Query Layer** — Support for Cypher-based topological diagnostics.
- [x] **INFRA-08**: **Native Embedding Service** — Local embedding provider support (Ollama/LocalAI).

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
- [x] **AI-05**: **GraphRAG Engine** — Community-centric summarization and RAG query engine.
- [x] **AI-06**: **Entity/Relationship Indexing** — Deep semantic search fallback.

### UX & Visualization (UX/UI)

- [x] **UI-01**: **High-Fidelity Graph View** — WebGL-based visualization highlighting topological errors (gaps, loops, sinks).
- [x] **UI-02**: **In-Graph Healing Interface** — Direct execution of fixes via interactive graph popups.
- [x] **UX-01**: **Reactive Healing Dashboard** — Svelte 5 (Runes) based interface with partial re-rendering.
- [x] **UX-02**: **Triple Relink Executor** — One-click complex repair for sequential bridge gaps.
- [x] **UX-03**: **Sync-Safe Hot Reload** — Detect external `data.json` changes and hot-reload settings.
- [x] **UX-04**: **Performance Hardening** — Debouncing, notices, and UI responsiveness.
- [x] **UX-09**: **GraphRAG Dashboard** — Dedicated tab for thematic search and community context.

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
- [x] **HARDEN-07**: **Environment-Aware Git Hooks** — WSL/Windows cross-platform support.
- [x] **HARDEN-08**: **Embedding Hardening** — Semantic anchors and Tribunal Stage 0 pre-filtering.
- [x] **HARDEN-09**: **HTR v2** — Vector-weighted topological centrality.
- [x] **HARDEN-10**: **Lazy-Loading & Background Init** — Memory-safe initialization for LadybugDB.

### Environment (ENV)

- [x] **ENV-01**: **Node.js/npm enforcement** — Strict versioning (Node >= 24, npm >= 11).

### Automation & CLI (REQ-17)

- [x] **REQ-17.1**: **Programmatic API Surface** — Decoupled interface (`runAnalysis`, `getSuggestions`, `getMetrics`, `executeFix`, `undoBatch`).
- [x] **REQ-17.2**: **Pure JSON reporting** — Support stdout-only piping without Obsidian Notice/UI pollution.
- [x] **REQ-17.3**: **CLI Command Registration** — Subcommands registered with Obsidian CLI parser (`healer:scan`, `healer:export-suggestions`, `healer:apply-batch`, `healer:undo-batch`).
- [x] **REQ-17.4**: **Safety & Headless Execution** — Confidence gating, mementos, and batch UUID transaction mapping for reverse-chronological rollback.

### Deployment & Distribution (REQ-18)

- [x] **REQ-18.1**: **Root Cleanup & AI Garbage Hiding** — Move internal AI files to .planning/ and untrack build artifacts from main.
- [x] **REQ-18.2**: **CSS Consolidation** — Automated bundling of Svelte and global CSS into a single styles.css.
- [x] **REQ-18.3**: **Automated BRAT Distribution** — GitHub Action to push artifacts to a dedicated dist branch.

## Quality Update Requirements (QUAL)

- [x] **QUAL-01**: **Knip Cleanup** — Resolve unused exports and types identified by Knip analysis.
- [x] **QUAL-02**: **Performance Audit Tooling** — Enhance `PerformanceBenchmark` to support custom vault sizes via CLI arguments.
- [x] **QUAL-03**: **Docstring Hardening** — Ensure all core services and utilities have TSDoc-compliant documentation for better developer ergonomics.
- [x] **QUAL-04**: **Test Resilience** — Fix Vitest warnings regarding `localstorage-file` path.
- [x] **QUAL-05**: **CI Pipeline Optimization** — Add Knip to pre-push hooks and enhance Windows/WSL path check robustness.

## v2 Requirements (Deferred)

- **AI-04**: **InfraNodus Integration** — Structural hole analysis via external API.
- **UX-05**: **Deep Analytics Settings** — Fine-grained control over algorithmic weights and thresholds.

## Out of Scope

- **UI-04**: **Manual Mind-Mapping** — Let ExcaliBrain handle manual layout.
- **UI-05**: **3D Graph Visualization (Eye-Candy)** — Focus is on healing, not just 3D effects. (Note: Phase 9 implements 3D for performance reasons, not just aesthetics).

## Traceability

| Req ID    | Phase    | Status        |
| --------- | -------- | ------------- |
| INFRA-01  | Phase 1  | ✓ Validated   |
| INFRA-02  | Phase 1  | ✓ Validated   |
| INFRA-03  | Phase 1  | ✓ Validated   |
| INFRA-04  | Phase 2  | ✓ Validated   |
| INFRA-05  | Phase 1  | ✓ Validated   |
| INFRA-06  | Phase 16 | ✓ Validated   |
| INFRA-07  | Phase 16 | ✓ Validated   |
| INFRA-08  | Phase 15 | ✓ Validated   |
| TOPOL-01  | Phase 5  | ✓ Validated   |
| TOPOL-02  | Phase 6  | ✓ Validated   |
| TOPOL-03  | Phase 6  | ✓ Validated   |
| TOPOL-04  | Phase 5  | ✓ Validated   |
| TOPOL-05  | Phase 5  | ✓ Validated   |
| AI-01     | Phase 7  | ✓ Validated   |
| AI-02     | Phase 8  | ✓ Validated   |
| AI-03     | Phase 7  | ✓ Validated   |
| AI-05     | Phase 15 | ✓ Validated   |
| AI-06     | Phase 15 | ✓ Validated   |
| UI-01     | Phase 9  | ✓ Validated   |
| UI-02     | Phase 9  | ✓ Validated   |
| UX-01     | Phase 10 | ✓ Validated   |
| UX-02     | Phase 11 | ✓ Validated   |
| UX-03     | Phase 3  | ✓ Validated   |
| UX-04     | Phase 3  | ✓ Validated   |
| UX-09     | Phase 15 | ✓ Validated   |
| HARDEN-01 | Phase 2  | ✓ Validated   |
| HARDEN-02 | Phase 2  | ✓ Validated   |
| HARDEN-03 | Phase 4  | ✓ Validated   |
| HARDEN-04 | Phase 13 | ✓ Validated   |
| HARDEN-05 | Phase 13 | ✓ Validated   |
| HARDEN-06 | Phase 13 | ✓ Validated   |
| HARDEN-07 | Phase 14 | ✓ Validated   |
| HARDEN-08 | Phase 15 | ✓ Validated   |
| HARDEN-09 | Phase 15 | ✓ Validated   |
| HARDEN-10 | Phase 16 | ✓ Validated   |
| ENV-01    | Phase 14 | ✓ Validated   |
| REQ-17.1  | Phase 17 | ✓ Validated   |
| REQ-17.2  | Phase 17 | ✓ Validated   |
| REQ-17.3  | Phase 17 | ✓ Validated   |
| REQ-17.4  | Phase 17 | ✓ Validated   |
| REQ-18.1  | Phase 18 | âœ“ Validated |
| REQ-18.2  | Phase 18 | âœ“ Validated |
| REQ-18.3  | Phase 18 | âœ“ Validated |
| QUAL-01   | Phase 19 | âœ“ Validated   |
| QUAL-02   | Phase 19 | âœ“ Validated   |
| QUAL-03   | Phase 19 | âœ“ Validated   |
| QUAL-04   | Phase 19 | âœ“ Validated   |
| QUAL-05   | Phase 19 | âœ“ Validated   |

---

_Last updated: 2026-05-22 after Milestone Audit_
