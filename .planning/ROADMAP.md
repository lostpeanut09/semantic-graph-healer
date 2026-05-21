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
- [x] **Phase 9: High-Fidelity Graph UI** - Provide a specialized view for visualizing graph issues. [2026-05-10]
- [x] **Phase 10: Reactive Healing Dashboard** - A central hub for managing all graph suggestions. [2026-05-10]
- [x] **Phase 11: Complex Suggestion Execution** - One-click repair for sophisticated topological issues. [2026-05-12]
- [x] **Phase 12: v1 Finalization & Stress Testing** - Ensure production readiness for large-scale digital gardens. [2026-05-12]
- [x] **Phase 13: Linting & Repository Hardening** - Final polish of repository standards, types, and hooks. ✅ 2026-05-18
- [x] **Phase 14: WSL Support & Dependency Validation** - Ensure seamless cross-platform support and modern environment standards. ✅ 20266-05-20
- [x] **Phase 15: GraphRAG & Embedding Hardening** - Integrate local embedding models for deep semantic indexing and graph-aware RAG. ✅ 2026-05-21
- [ ] **Phase 16: WASM Graph Engine (LadybugDB)** - Migrate to a high-performance WASM-based graph database for 50k+ node support.

## Phase Details

### Phase 16: WASM Graph Engine (LadybugDB)

**Goal:** Migrate or supplement the current engine with LadybugDB (WASM) to support large-scale vaults.

**Requirements:**

- INFRA-06 — WASM Graph Engine (LadybugDB)
- INFRA-07 — Cypher Query Layer for topological diagnostics
- HARDEN-10 — Lazy-loading & Background Initialization for 12MB+ WASM binaries
- PERF-01 — Benchmark suite for 50k and 100k node vaults

**Plans:** 1 plan created

- [ ] 16-01-PLAN.md — LadybugDB Infrastructure & Core Integration

**Success Criteria:**

- LadybugDB initializes successfully in background worker.
- Cypher queries return identical results to current Graphology implementation for core diagnostics.
- PageRank and Louvain benchmarks show >10x speedup on 50k+ nodes.
- Memory usage stays within 256MB for 50k node vault.

### Phase 15: GraphRAG & Embedding Hardening

**Goal:** Integrate local embedding models for deep semantic indexing and graph-aware RAG.

**Requirements:**

- INFRA-08 — Native EmbeddingService for local providers (Ollama/LocalAI)
- AI-05 — GraphRAG: Community-centric summarization and RAG query engine
- AI-06 — Entity/Relationship indexing fallback for deep semantic search
- HARDEN-08 — Embedding Hardening: Semantic anchors and Tribunal pre-filtering
- HARDEN-09 — HTR v2: Vector-weighted topological centrality
- UX-09 — Dedicated GraphRAG Dashboard tab and Deep Search integration

**Plans:** 4/4 plans executed

- [x] 15-01-PLAN.md — Embedding Service & Infrastructure
- [x] 15-02-PLAN.md — Embedding Hardening & HTR v2
- [x] 15-03-PLAN.md — GraphRAG Engine: Community Summarization & Indexing
- [x] 15-04-PLAN.md — GraphRAG Dashboard & Search Integration

**Success Criteria:**

- EmbeddingService passes benchmark with Qwen3/Gemma models.
- Community summaries generated and searchable via GraphRAG engine.
- Tribunal fast-fails semantically unrelated suggestions (<0.4 similarity).
- HTR v2 scores include vector similarity component (0.0-1.0).
- Cross-thematic suggestions bridge topologically distant communities.
