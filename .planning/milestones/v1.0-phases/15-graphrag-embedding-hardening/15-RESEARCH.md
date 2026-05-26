# Phase 15 Research: GraphRAG & Embedding Hardening

## Overview

Phase 15 introduces deep semantic capabilities to the Semantic Graph Healer by integrating local embedding models and GraphRAG (Retrieval-Augmented Generation) patterns. This research explores the technical requirements for native embedding support and hierarchical graph indexing, updated with SOTA findings as of May 2026.

## SOTA 2026 Findings (May Update)

### 1. Model Landscape

| Model                  | Role              | Highlights                                                  |
| :--------------------- | :---------------- | :---------------------------------------------------------- |
| **Harrier-OSS-v1-27B** | Absolute SOTA     | 32k context, 5376 dims. Ideal for complex multi-hop RAG.    |
| **Jina v5-text-small** | Efficiency King   | High quality-to-size ratio (677M params). Runs on 8GB VRAM. |
| **Qwen3-Embedding-8B** | Multilingual SOTA | Best for mixed corpora and cross-lingual retrieval.         |

### 2. Emerging Patterns

- **Skeleton-Based Construction (KET-RAG):** Uses KNN similarity graphs + PageRank centrality to identify a "skeleton" (top 20-30% of chunks) for full KG extraction. Reduces indexing costs by 10x.
- **Matryoshka (MRL) Compression:** Native support for truncating vectors (e.g., 3072 -> 256) with minimal loss, optimizing storage for large vaults.
- **Semantic Chunking:** Using the embedding model to find natural break points instead of fixed character counts. Crucial for stable retrieval.

## Core Components

### 1. Native EmbeddingService (INFRA-08)

- **Goal:** Provide a local-first embedding utility for semantic indexing.
- **Provider Support:**
    - **Ollama:** Use `/api/embeddings` endpoint. Support for `Harrier`, `Jina v5`, and `Qwen3`.
    - **LocalAI / OpenAI-Compatible:** Use `/v1/embeddings` endpoint.
- **Technical Considerations:**
    - Obsidian's `requestUrl` is suitable for these HTTP calls.
    - Implementation of **Semantic Chunking** as the default splitter.
    - Integration of **MRL Compression** settings for high-density vaults.

### 2. GraphRAG Engine (AI-05, AI-06)

- **Goal:** Enable community-centric summarization and deep semantic search across the graph.
- **Implementation Path:**
    - **Skeleton-Based Indexing (KET-RAG):** Implement a two-pass indexing strategy.
        1. Fast similarity graph + PageRank.
        2. Deep extraction on the identified skeleton.
    - **Community Summarization:** Use `LlmService` for "Community Reports" on Louvain clusters.
    - **Three-Index Requirement:** Synchronize Text (BM25), Vector (Dense), and Structural (Graph) indexes.

### 3. HTR v2: Vector-Weighted Centrality (HARDEN-09)

- **Goal:** Enhance Healer Topological Rank (HTR) with semantic similarity.
- **Logic:**
    - Edge Weight = `(StructuralWeight * htrStructuralWeight) + (VectorSimilarity * (1 - htrStructuralWeight))`.
    - Use these weights for both PageRank (global importance) and Louvain (community discovery).

### 4. Embedding Hardening (HARDEN-08)

- **Goal:** Use "Semantic Anchors" to prevent hallucinated suggestions.
- **Tribunal Pre-filtering:** Stage 0 pre-filter based on cosine similarity. Fast-fail suggestions < 0.4 similarity.
- **Stupid Model Detection:** Baseline check using 10 standard concept pairs during initialization.

## Dependencies & Infrastructure

- **Existing:** `graphology`, `graphology-communities-louvain`, `requestUrl`.
- **New:** `EmbeddingService`, `SemanticChunker`, `VectorIndex` (local persistence in `.planning/index/`).

## Potential Pitfalls

- **Resource Intensity:** Harrier requires significant VRAM. Jina v5 should be the default for consumer hardware.
- **Consistency:** Semantic chunking can lead to non-deterministic fragments. Requires stable anchors.
- **Cache Size:** High-dimensional vectors (5k+) grow `healer-cache.json` quickly. MRL truncation is essential.
