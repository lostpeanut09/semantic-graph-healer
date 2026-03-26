![Banner](banner.png)

# Semantic Graph Healer: Platinum Edition

**Gold Master v1.1.0-endpoint**

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**Semantic Graph Healer** is a topological restoration and reasoning engine for Obsidian. It provides a state-of-the-art framework to identify, analyze, and repair structural inconsistencies in your digital garden using advanced graph theory and semantic intelligence.

---

## 🏗️ Core Topological Intelligence

The engine utilizes the **Graphology Stack** to perform deep structural analysis of your vault:

- **Louvain Community Detection**: Automatically identifies thematic clusters and tightly-knit note groups, suggesting candidates for new Map of Content (MOC) structures.
- **Bridge Scrutiny (Betweenness Centrality)**: Detects "bottleneck" notes that act as critical bridges between disparate topics. Perfect for identifying high-leverage conceptual nodes.
- **PageRank Authority Mapping**: Ranks notes by their structural authority within the graph, highlighting the central pillars of your knowledge network.
- **Flow Stagnation Analysis**: Identifies isolated nodes and dead-ends, proposing restorative links to re-integrate fragmented information into the global semantic flow.

---

## 🧠 Semantic Resilience & Reasoning

- **AI Tribunal**: A dual-LLM verification system that ensures suggestion accuracy through consensus. Supports local (Ollama) and Cloud (GPT/Claude) providers simultaneously.
- **Smart Connections v4 Integration**: Native support for the global `smart_env` API, enabling high-precision vector similarity discovery.
- **Robust Semantic Fallback**: When the Smart Connections API is unreachable, the engine automatically falls back to an **`.ajson` parsing logic**, maintaining semantic search capabilities even in restricted environments.

---

## 🤖 Automation & Headless CLI

Designed for power users and automated workflows, Semantic Graph Healer integrates directly with **Obsidian CLI**:

- **`analyze-silent`**: Dedicated command for headless automation. Run full vault scans and generate topological health reports directly from the terminal without manual interaction.

---

## ⚡ High-Performance Architecture

Built for scale, the plugin handles vaults with thousands of nodes with ease:

- **O(N+M) Logic**: Core algorithms are optimized for linear performance, ensuring that graph construction and metrics calculation remain fast even on 2000+ note vaults.
- **Partial UI Re-rendering**: The Dashboard utilizes a frame-based partial updates system, ensuring a smooth user experience even during high-frequency analysis updates.

---

## 🛠️ Requirements

- **Obsidian v1.12.0** or higher.
- **Dataview** plugin (required for metadata engine).
- **Smart Connections v4** (optional, recommended for semantic discovery).
- **Ollama** or a valid AI API Key for the Reasoning Service.

---

## 💎 Engineering Standards

This project is a **Platinum Gold Master**, adhering to the highest standards of the 2026 Obsidian ecosystem:

- **Husky & lint-staged**: Pre-commit CI for zero-defect delivery.
- **ESLint & Prettier**: Strict deterministic formatting and code hygiene.
- **Knip**: Zero dead code or unused dependencies.
- **SOTA 2026 Compliance**: Built with modern TypeScript and ESM interop.

---

## License

Distributed under the **GNU GPL v3 License**. Project reached **Endpoint** state on March 2026.
