# Phase 15 Context: GraphRAG & Embedding Hardening

## Status: LOCKED

**Date:** 2026-05-20
**Strategy:** Local-First Semantic Indexing & Multi-Layered Hardening

---

## Decisions

### 1. Native Embedding Service (EmbeddingService)

- **Priority:** Local providers (Ollama, LocalAI) are prioritized over external plugins.
- **Models:** Primary support for `Qwen3-embedding` and `EmbeddingGemma`.
- **Fallback:** Smart Connections (if available) is used ONLY if local providers are disabled or unavailable.
- **Protocol:** OpenAI-compatible embedding endpoint support.

### 2. GraphRAG Architecture

- **Indexing Depth:** Dual-mode support.
    - **Community-Centric:** Summarizes existing Louvain clusters for high-level semantic queries.
    - **Entity-Centric:** Optional background extraction of entities and relationships for granular RAG.
- **Storage:** Use **AJSON** (JSON-per-line) in `.planning/index/` for entity tables and community summaries. This ensures scalability within Obsidian's filesystem.
- **Query Engine:** New `GraphRagService` to orchestrate multi-hop semantic retrieval.

### 3. Embedding Hardening ("Stupid Model" Detection)

- **Semantic Anchors:** Implementation of a hardcoded benchmark (10 concept pairs) run during initialization to verify model alignment.
- **Real-time Monitoring:** Track "Mean Cosine Similarity" and "Vector Entropy" to detect model collapse or poor quality.
- **Tribunal Integration:** Use embeddings as a "Pre-Judge" (Stage 0) in the AI Tribunal to fast-fail suggestions with low semantic similarity (< 0.4).

### 4. Healer Topological Rank (HTR) v2

- **Vector Weighting:** Increase HTR's vector similarity weight and integrate it directly with graph centrality metrics (PageRank/Betweenness).
- **Incongruence Diagnostic:** New diagnostic type `semantic_incongruence` to flag existing links where note content has diverged from the link's topological meaning.

### 5. UI Integration

- **Dashboard:** Add a dedicated "GraphRAG" tab for global knowledge queries.
- **AI Tab:** Add a "Deep Search" toggle to the existing AI view to enable RAG-enhanced reasoning.

---

## Success Criteria for Phase 15

1. `EmbeddingService` successfully retrieves vectors from local Ollama/LocalAI endpoints.
2. Community summaries are generated and persisted in the `.planning/index/` directory.
3. "Stupid" models are successfully flagged during the "Semantic Anchor" check.
4. AI Tribunal utilizes embedding similarity to reduce unnecessary LLM calls by > 20%.
5. The Healer Dashboard shows GraphRAG-based suggestions for "Cross-Thematic" links.
