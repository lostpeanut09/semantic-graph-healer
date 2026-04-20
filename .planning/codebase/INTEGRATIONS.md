# Integrations: Semantic Graph Healer

## Obsidian Metadata Adapters

The project integrates with the major topological plugins in the Obsidian ecosystem:

- **Datacore (v1.0+)**: Primary source for high-performance metadata queries and link tracking.
- **Breadcrumbs (v4.0+)**: Ingests parent/child and custom adjacency relations from the BCAPI.
- **Smart Connections**: Provides semantic similarity embeddings to enrich the topological graph.
- **ExcaliBrain**: (Reference support) Utilized for visualization logic compatibility.

## External AI Integrations

- **Ollama**: Local integration for Llama 3.3 and other open-source models via `LlmService`.
- **Google Gemini API**: Cloud-scale analysis for massive clusters and indexing.
- **Anthropic Claude API**: Secondary model fallback.
- **InfraNodus**: (Integration planned/partial) For advanced graph visualization analytics.

## Internal Bridges

- **Metadata Unified Bridge**: A centralized adapter (`UnifiedMetadataAdapter.ts`) that merges results from multiple sources with error resilience.
- **Keychain Integration**: Secure storage of encrypted API keys in `data.json` via Obsidian's secret storage.
