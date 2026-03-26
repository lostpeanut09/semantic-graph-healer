![Banner](banner.png)

# Semantic Graph Healer

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**Semantic Graph Healer** is a topological restoration engine for Obsidian that utilizes [Dataview](https://github.com/blacksmithgu/obsidian-dataview), [Breadcrumbs](https://github.com/Sirenko/obsidian-breadcrumbs), and [ExcaliBrain](https://github.com/zsviczian/excalibrain) metadata to identify and resolve structural inconsistencies in the knowledge graph. It's designed for researchers and curators managing large-scale digital gardens where manual link auditing is no longer feasible.

---

## Technical Features

### AI Tribunal and Epistemic Stability

The plugin implements a dual-LLM verification system known as the **AI Tribunal**. Every suggestion is processed by a Primary and a Secondary model to ensure consensus and prevent hallucinations. If models disagree, the suggestion is quarantined for manual review. This system supports independent and diverse model providers (e.g., local Ollama vs. Cloud GPT) to ensure unbiased structural reasoning.

### Semantic Vector Discovery

Direct integration with the [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) environment unlocks vector-similarity scores for every link suggestion. The engine analyzes AI embeddings to propose candidates with the highest semantic proximity, ensuring that your graph architecture mirrors the conceptual depth of your notes.

### Note Exhaustion and State Tracking

To optimize compute resources, the engine tracks the epistemic state of each file. Notes where all AI-suggested links have been blacklisted are marked as "exhausted" and skipped in subsequent scans. This persistent tracking ensures the curation process remains focused on new, high-value semantic discoveries.

### Structural Gap Analysis

Integration with the [InfraNodus](https://infranodus.com) API enables the detection of structural holes within the graph topology. The plugin identifies isolated clusters and suggests bridging links to enhance the semantic density of the vault, transforming fragmented notes into a unified knowledge network.

### Deterministic Topology Alignment

The engine performs deterministic alignment of Map of Content (MOC) structures by analyzing Dataview-powered tag hierarchies. It automatically recognizes fields from Breadcrumbs and ExcaliBrain to maintain cross-plugin consistency, proposing hierarchical links that mirror your existing taxonomy without requiring AI inference.

### Graphology Topology Stack

Integration with the **Graphology library** enables advanced network science metrics within your vault. The engine utilizes **Louvain Community Detection** for automated clustering and **Bridge Scrutiny (Betweenness Centrality)** to identify critical knowledge bottlenecks and structural gaps that require manual bridging.

### Headless Analysis (Obsidian CLI)

For power users and automated environments, the plugin supports headless execution via the **Obsidian CLI**. Use the `analyze-silent` command to trigger background graph audits and suggest resolutions without opening the Obsidian workspace UI.

### Semantic Resilience and .ajson Fallback

The engine features high-availability semantic search. If the primary [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) v4 API is unreachable, the plugin automatically switches to a **.ajson fallback mode**, reading persistent vector indices directly from the `.smart-env` directory to ensure continuity of service.

### Secure Credential Management

API credentials for all providers are managed via the native **Obsidian Keychain API**. Secrets are never stored in plain text within the plugin configuration files, ensuring vault security across synchronized devices.

---

## Requirements

- Obsidian v1.12.0 or higher.
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin (active).
- [Ollama](https://ollama.com) or a valid Cloud LLM API key.
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) (optional, for vector discovery).

---

## Developer Quality

This project adheres to the highest engineering standards as of March 2026:

- **Prettier** for deterministic code formatting.
- **Stylelint** (Standard Config) for CSS vertical alignment.
- **Husky & lint-staged** for automated pre-commit quality enforcement.

---

## License

Since this plugin was fully vibe coded, it is distributed under the **GNU GPL v3 License**. See the `LICENSE` file for the full text.
