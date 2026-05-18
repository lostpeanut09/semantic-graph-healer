![Banner](assets/banner.png)

# Semantic Graph Healer (v1.0.0)

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**Semantic Graph Healer** is a topological restoration and deep graph analysis engine for Obsidian. It leverages [Datacore](https://github.com/blacksmithgu/datacore), [Breadcrumbs](https://github.com/Sirenko/obsidian-breadcrumbs), [ExcaliBrain](https://github.com/zsviczian/excalibrain), and [Graphology](https://graphology.github.io/) to identify and resolve structural inconsistencies in the knowledge graph.

## Core v1 Features

### 🚀 Adaptive Performance (Safety Mode)

The plugin automatically scales its resource usage based on your vault size. When entering vaults with >10,000 notes, **Safety Mode** activates:

- **Throttled Analysis:** Background scans use higher debounces to preserve CPU.
- **LOD Rendering:** 3D Graph uses Level-of-Detail optimizations (points instead of spheres, static physics) to maintain high frame rates.
- **Worker Offloading:** All heavy graph math runs in a separate thread.

### 🏛️ AI Tribunal & Epistemic Stability

Every semantic suggestion is cross-verified by a dual-LLM system. A Primary and Secondary model must reach consensus (STABLE state) before a high-confidence recommendation is made, eliminating hallucinations.

### 🏷️ Semantic Tag Propagation

AI-powered cluster analysis that suggests relevant tags for child notes based on parent MOC (Map of Content) synergy, ensuring consistent taxonomy across your vault.

### 🔍 Deep Topological Diagnostics

- **Bridge Scrutiny:** Finds missing links in sequential chains (A → B → C).
- **Ouroboros Detection:** Identifies infinite hierarchical loops.
- **Black Hole Discovery:** Locates information sinks (notes that attract links but lead nowhere).
- **Missing Reciprocals:** Ensures bi-directional link integrity.

---

## Performance Benchmarks (v1.0)

Tests conducted on a standard desktop environment with a 1,000-note simulated vault:

| Operation                  | Latency  | Complexity |
| :------------------------- | :------- | :--------- |
| **Graph Construction**     | ~11.17ms | O(N + E)   |
| **Deterministic Analysis** | ~4.27ms  | O(N·K²)    |
| **PageRank (10k nodes)**   | < 5.0s   | O(I·(N+E)) |

---

## Technical Architecture

### Multi-Adapter Engine

The `UnifiedMetadataAdapter` orchestrates multiple sources into a single API:

- **Datacore:** Primary high-speed query engine.
- **Breadcrumbs:** Hierarchical navigation.
- **Smart Connections:** Vector-similarity discovery.

### Secure by Design

- **KeychainService:** Credentials are stored in OS-native secure storage or AES-256-GCM encrypted local blocks.
- **Local-First:** Supports Ollama and LM Studio for 100% private AI analysis.

---

## Installation & Quick Start

1. Install via the Obsidian Community Plugins tab (Search for "Semantic Graph Healer").
2. **Setup API Keys:** Go to Settings -> Security & API Keys to configure your LLM providers.
3. **Open Dashboard:** Click the ribbon icon to see your first topological health report.

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for developer setup and benchmarking guides.

## License

Distributed under the **GNU GPL v3 License**.
