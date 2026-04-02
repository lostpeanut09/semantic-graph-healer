![Banner](banner.png)

# Semantic Graph Healer

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-purple.svg)](https://obsidian.md/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

**Semantic Graph Healer** is a topological restoration and deep graph analysis engine for Obsidian. It leverages [Datacore](https://github.com/blacksmithgu/datacore) (with [Dataview](https://github.com/blacksmithgu/obsidian-dataview) fallback), [Breadcrumbs](https://github.com/Sirenko/obsidian-breadcrumbs), [ExcaliBrain](https://github.com/zsviczian/excalibrain), and [Graphology](https://graphology.github.io/) to identify and resolve structural inconsistencies in the knowledge graph. It's designed for researchers and curators managing large-scale digital gardens where manual link auditing is no longer feasible.

---

## Technical Features

### Hybrid Vault Query Engine

The plugin implements a production-grade **Hybrid Query Engine** that automatically selects the fastest available data backend:

1. **Datacore** (Primary) — Up to 100x faster than Dataview, with reactive queries and a modern schema (`$path`, `$tags`, `$links`).
2. **Dataview** (Fallback) — Full backward compatibility for vaults that haven't migrated yet.
3. **MetadataCache** (Baseline) — Native Obsidian cache for backlink resolution when no query plugin is available.

A critical adapter layer (`mapMarkdownToDataview`) transparently maps Datacore's schema to the legacy Dataview format, ensuring zero-disruption migration.

### Multi-Adapter Architecture (v2.0)

The plugin implements a modular adapter pattern (`IMetadataAdapter`) for seamless integration with the broader Obsidian ecosystem:

- **`DatacoreAdapter`** — High-performance reactive queries via the Datacore API.
- **`BreadcrumbsAdapter`** — Reads hierarchical relationships (up/down/next/prev) from the Breadcrumbs V4 plugin.
- **`SmartConnectionsAdapter`** — Fetches AI vector-similarity scores from Smart Connections v4+ with `.ajson` fallback.
- **`UnifiedMetadataAdapter`** — Orchestrates all adapters into a single, consistent API surface.

All adapters use type-safe access patterns (`ExtendedApp` interface) and are fully compliant with strict ESLint rules (zero warnings).

### Deep Graph Analysis (Graphology)

When enabled, the engine builds a full in-memory graph using [Graphology](https://graphology.github.io/) and runs academic-grade algorithms:

- **PageRank** — Identifies authority notes (top 5% by score). Includes automatic fallback to **Degree Centrality** if PageRank fails to converge on disconnected graphs.
- **Louvain Community Detection** — Discovers thematic clusters of tightly connected notes and suggests MOC creation for clusters with 5+ members.
- **Betweenness Centrality** — Finds critical bridge notes connecting disparate topics. Includes a safety guard that skips analysis for vaults exceeding 2,500 nodes to prevent UI freezes.

The `GraphEngine` is lazy-loaded via dynamic `import()` to minimize initial plugin load time.

#### Web Worker Offloading (v2.0)

On desktop, all heavy graph computations (PageRank, Louvain, Betweenness) are offloaded to a dedicated **Web Worker** thread via `GraphWorkerService`. This prevents UI freezes during analysis of large vaults. On mobile (iOS/Android), the worker is automatically disabled to avoid Capacitor crashes, and analysis falls back to the main thread with adaptive batch sizes.

### Deterministic Link Prediction Engine (v2.0)

The `LinkPredictionEngine` implements a scientifically-grounded three-way blend of link prediction indices to discover **"Missing Rings"** — note pairs with high shared-neighbor overlap that are not yet directly connected:

| Algorithm | Weight | Reference |
| :--- | :--- | :--- |
| **Jaccard Similarity** | 0.35 | Liben-Nowell & Kleinberg, 2004 |
| **Adamic-Adar Index** | 0.35 | Adamic & Adar, 2003 |
| **Resource Allocation** | 0.30 | Lü & Zhou, 2010 |

All weights are user-configurable and auto-normalized to sum to 1. A **Temporal Decay** multiplier (λ=0.005, half-life ≈139 days) prioritizes notes created or modified around the same time, reflecting human memory and context coherence.

**Co-Citation Analysis**: The engine also detects notes that are frequently cited together in the same source ("2nd-order backlinks"), surfacing latent semantic relationships invisible to direct link analysis.

### StructuralCache — Performance Layer (v2.0)

A generic LRU (Least Recently Used) caching layer sits between the query engine and the analysis modules. It features:

- **Event-based invalidation** — Cache entries are automatically purged when files are modified, renamed, or deleted.
- **Configurable TTL** — Default 5-minute expiry prevents stale data without excessive recomputation.
- **Memory budget** — Hard cap of 10,000 entries with LRU eviction to prevent memory bloat on mobile devices.
- **Explicit lifecycle management** — `destroy()` unregisters all event listeners to prevent memory leaks.

### AI Tribunal and Epistemic Stability

The plugin implements a dual-LLM verification system known as the **AI Tribunal**. Every suggestion is processed by a Primary and a Secondary model to ensure consensus and prevent hallucinations. If models disagree, the suggestion is quarantined for manual review. This system supports independent and diverse model providers (e.g., local Ollama vs. Cloud GPT) to ensure unbiased structural reasoning.

Consensus states are classified as:

- **STABLE** — Both models agree on the winner.
- **CONFLICT** — Models disagree; manual intervention required.
- **UNCERTAIN** — One or both models failed to produce a clear verdict.

### Semantic Vector Discovery

Direct integration with the [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) environment unlocks vector-similarity scores for every link suggestion. The engine analyzes AI embeddings to propose candidates with the highest semantic proximity, ensuring that your graph architecture mirrors the conceptual depth of your notes.

**Smart Connections v4+ Compatibility**: The adapter uses the modern `window.smart_env.smart_sources.find()` API. If the runtime API is unavailable, a graceful fallback reads semantic data directly from `.smart-env/multi/*.ajson` index files.

### Structural Gap Detection (Bridge Scrutiny)

The engine identifies **structural gaps** in sequential chains: if note A links directly to note C, but a note B exists that logically fits between them (B links to both A and C), the plugin suggests inserting B into the chain. Detection uses an **O(N·K²) reverse-index algorithm** for performance on large vaults.

A dedicated **Triple Relink Executor** can repair the entire chain in one action, updating the frontmatter of A, B, and C simultaneously (A → B → C with correct `next`/`prev` properties).

### Hierarchical Cycle Detection (Ouroboros)

A DFS-based cycle detector finds infinite loops in the hierarchy graph (e.g., A → B → C → A). Cycles are flagged as critical errors with the full loop path displayed for immediate resolution.

### Information Sink Detection (Black Holes)

Notes with **high in-degree but zero out-degree** are identified as information sinks — they attract links but lead nowhere. The analysis uses a pre-computed degree map for O(N) performance and supports **Canvas** and **Excalidraw** files when the `includeNonMarkdownHubs` setting is enabled.

### Real-Time Reactive Healing

The plugin monitors vault events in real-time with intelligent triggers:

- **File Creation** — New notes are automatically scanned for bridge gap opportunities after a brief stabilization delay.
- **Metadata Changes** — Background files are analyzed with a 1-second debounce. The currently active (editing) file is skipped to avoid conflicts.
- **Focus Change** — When the user switches away from a note, deferred analysis runs on the file they just left.

### Note Exhaustion and State Tracking

To optimize compute resources, the engine tracks the epistemic state of each file. Notes where all AI-suggested links have been blacklisted are marked as "exhausted" and skipped in subsequent scans. This persistent tracking ensures the curation process remains focused on new, high-value semantic discoveries.

### Structural Gap Analysis (InfraNodus)

Integration with the [InfraNodus](https://infranodus.com) API enables the detection of structural holes within the graph topology. The plugin identifies isolated clusters and suggests bridging links to enhance the semantic density of the vault, transforming fragmented notes into a unified knowledge network.

### Deterministic Topology Alignment

The engine performs deterministic alignment of Map of Content (MOC) structures by analyzing Dataview-powered tag hierarchies. It automatically recognizes fields from Breadcrumbs and ExcaliBrain to maintain cross-plugin consistency, proposing hierarchical links that mirror your existing taxonomy without requiring AI inference.

### Secure Credential Management (v2.0 Hardened)

API credentials for all providers are managed via the **KeychainService** with defense-in-depth encryption:

1. **Obsidian SecretStorage** (v1.11.4+) — Primary backend using the OS-native credential store.
2. **Legacy Keychain** — Backward-compatible fallback for older Obsidian versions.
3. **AES-256-GCM Software Encryption** — When no native secure storage is available, secrets are encrypted at rest using a derived master key via `CryptoUtils`. Initialization vectors are unique per credential.

Secrets are **never stored in plain text** within `data.json` or any plugin configuration file.

### Sync-Safe Settings (Hot Reload)

The plugin implements `onExternalSettingsChange()` to detect when `data.json` is modified externally (e.g., via Obsidian Sync, iCloud, or Git). All analytical services are hot-reloaded without requiring a plugin restart, ensuring multi-device workflows remain consistent.

### CLI-Ready Silent Analysis

A dedicated `Run silent graph analysis (CLI)` command enables headless execution without UI notices, designed for integration with the **Obsidian CLI** and automated workflows.

---

## Experimental Phase 3 (AI Inference)

A new suite of features currently in development leveraging local LLMs (Ollama, LM Studio) to provide profound semantic validation:
- **Semantic Tag Propagation:** Let the AI analyze parent clusters (MOCs) and suggest pushing relevant tags down to child notes based on content synergy.
- **AI Branch Validation:** When a sequence splits into parallel paths (multiple `next` or `prev` links), the AI determines if these branches are mutually exclusive (topological error) or valid non-linear continuations.
- **Related Reciprocity Override:** Force strict bidirectional validation even for weak "related" links using intelligent semantic analysis.

---

## Dashboard

The dashboard features a **partial re-rendering architecture**: the static frame (banner, header, filters) is rendered once, while only the dynamic suggestion list updates on interactions. This eliminates flicker and preserves scroll position.

### Filters

| Filter                  | Description                        |
| ----------------------- | ---------------------------------- |
| All Issues              | Full unfiltered view               |
| Orphan Notes            | Notes with zero hierarchical links |
| Semantic Conflicts      | Multi-value incongruences          |
| Missing Reciprocals     | Asymmetric directional links       |
| Structural Gaps         | Bridge chain insertions            |
| Logic Loops (Ouroboros) | Hierarchical cycle errors          |
| Black Holes (Sinks)     | High in-degree, zero out-degree    |
| AI Suggestions          | LLM-generated proximity links      |
| Network Gaps            | InfraNodus structural holes        |

### Pagination

Suggestions are rendered in pages of 30 items with a **"Show more"** button displaying the remaining count, preventing DOM overload on large vaults.

### Actions

Each suggestion card supports:

- **Execute** — Apply the fix (or trigger Triple Relink for bridge gaps).
- **Check results / Re-reason** — Invoke AI reasoning for incongruences.
- **Dismiss** — Remove from the current queue.
- **Ignore** — Permanently blacklist a suggestion.

---

## Requirements

- Obsidian v1.5.0 or higher.
- [Datacore](https://github.com/blacksmithgu/datacore) (recommended) or [Dataview](https://github.com/blacksmithgu/obsidian-dataview) plugin (active).
- [Ollama](https://ollama.com) or a valid Cloud LLM API key (for AI features).
- [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) (optional, for vector discovery).
- [Graphology](https://graphology.github.io/) is bundled — no external install required.

---

## License

Since this plugin was fully vibe coded, it is distributed under the **GNU GPL v3 License**. See the `LICENSE` file for the full text.
