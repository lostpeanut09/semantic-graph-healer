<!-- generated-by: gsd-doc-writer -->
![Banner](assets/banner.png)

# Semantic Graph Healer (v3.0.0)

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**Semantic Graph Healer** is a topological restoration and deep graph analysis engine for Obsidian. It leverages [LadybugDB](https://github.com/ladybugdb/ladybugdb), [Datacore](https://github.com/blacksmithgu/datacore), [Breadcrumbs](https://github.com/Sirenko/obsidian-breadcrumbs), and [Graphology](https://graphology.github.io/) to identify and resolve structural inconsistencies in the knowledge graph.

## Core v3.0.0 Features

### 🐞 LadybugDB WASM Engine & Adaptive Performance

The plugin utilizes `@ladybugdb/wasm-core` to offload massive graph topologies (10,000+ notes) directly to dedicated Web Workers. This ensures zero main-thread blocking, keeping the Obsidian UI responsive while executing complex Cypher queries and native graph algorithms (PageRank, Louvain).

### 🧠 GraphRAG (Retrieval-Augmented Generation)

- **Community Indexing:** Automatically extracts and summarizes semantic communities using weighted Louvain clustering.
- **Deep Thematic Queries:** Ask questions about your vault and receive answers enriched by topological context and cross-thematic bridges.

### 🏛️ AI Tribunal & Epistemic Stability

Every semantic suggestion is cross-verified by a dual-LLM system. A Primary and Secondary model must reach consensus (STABLE state) before a high-confidence recommendation is made, eliminating hallucinations.

### 🔍 Deep Topological Diagnostics

- **Bridge Scrutiny:** Finds missing links in sequential chains (A → B → C).
- **Ouroboros Detection:** Identifies infinite hierarchical loops.
- **Black Hole Discovery:** Locates information sinks (notes that attract links but lead nowhere).
- **Missing Reciprocals:** Ensures bi-directional link integrity.

---

## Performance Benchmarks (v3.0.0)

Tests conducted on standard desktop environments targeting high-density simulated vaults:

| Operation                  | Latency  | Complexity |
| :------------------------- | :------- | :--------- |
| **LadybugDB Sync (50k nodes)** | Async worker | O(N + E)   |
| **Graph Construction (10k nodes)**| < 500ms  | O(N + E)   |
| **Deterministic Analysis** | < 100ms  | O(N·K²)    |
| **PageRank (10k nodes)**   | Worker   | O(I·(N+E)) |

---

## Technical Architecture

### Multi-Adapter Engine

The `UnifiedMetadataAdapter` orchestrates multiple sources into a single API:

- **LadybugDB:** Primary high-speed query engine for deep topology via Cypher.
- **Datacore:** Fallback for high-speed metadata extraction.
- **Breadcrumbs:** Hierarchical navigation.
- **Smart Connections:** Vector-similarity discovery.

### WASM GraphEngine & Web Workers

Heavy graph metrics (Betweenness Centrality, Louvain, PageRank) and deep topology similarity analysis are entirely delegated to background workers (`ladybug-worker.ts`, `graph-analysis-worker.ts`), preventing UI stutters during complex structural queries.

### Secure by Design

- **KeychainService:** Credentials are stored in OS-native secure storage or AES-256-GCM encrypted local blocks.
- **Local-First:** Supports Ollama and LM Studio for 100% private AI analysis.

---

## Installation & Quick Start

**Prerequisites (for development):** Node.js >= 24.0.0 and npm >= 11.0.0

1. Install via the Obsidian Community Plugins tab (Search for "Semantic Graph Healer").
2. **Setup API Keys:** Go to Settings -> Security & API Keys to configure your LLM providers.
3. **Open Dashboard:** Click the ribbon icon to see your first topological health report.

### Beta Installation (via BRAT)

For the latest features and bug fixes before they hit the community store:
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat).
2. Go to **Settings** -> **BRAT** -> **Add Beta plugin**.
3. Enter this repository URL: `gabrielelana/semantic-graph-healer`.
4. **Important:** In BRAT settings, ensure you specify the `dist` branch for this plugin to receive optimized release builds.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for developer setup and benchmarking guides.

## License

Distributed under the **GNU GPL v3 License**.
