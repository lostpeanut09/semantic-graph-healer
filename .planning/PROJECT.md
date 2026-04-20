# Semantic Graph Healer (SGH)

> v2.4.4 (April 2026) · Topological Restoration Engine

## Vision

A high-performance restoration engine for Obsidian that identifies and resolves structural inconsistencies in the knowledge graph using graph theory (algorithms like Louvain, PageRank) and LLM-assisted healing.

## Core Features

1. **Topological Auditing**: Identification of structural gaps, isolated clusters, and bottleneck nodes.
2. **Hybrid Reasoning**: Mix of local topological analysis (Graphology) and semantic reasoning (Ollama/Google Gemini).
3. **Guardrail-Protected Worker**: Computationally heavy tasks run in decoupled workers with memory/edge limits.
4. **Metadata Bridge**: Unified ingestion from Datacore, Breadcrumbs, and Smart Connections.

## Tech Stack

- **Core**: TypeScript, Obsidian API
- **Graph Engine**: Graphology
- **Validation**: Zod (catchall pattern for data integrity)
- **Tooling**: Vitest, Esbuild

---
