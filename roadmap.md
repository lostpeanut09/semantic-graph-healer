# 🗺️ Semantic Graph Healer: Future Roadmap

Following the successful release of the **Gold Master (v1.4.7)**, this roadmap outlines the strategic evolution of the plugin towards a fully autonomous, time-aware, and block-level topological engine.

## 🟢 v1.5: The "Liveliness" Update

_Focus: Long-term memory and note health._

- **Note Staleness with FSRS**:
    - Integrate the **Free Spaced Repetition Scheduler (FSRS)** algorithm to track the "retrievability" of your MOCs and core nodes.
    - Automated alerts when a high-centrality node hasn't been reviewed or updated in its "forgetting window".
- **Dashboard v2**:
    - New "Health" tab visualizing vault entropy over time.
    - "Stale Notes" category in the main list.
- **Improved Semantic Proximity**:
    - Deeper integration with **Smart Connections** to use local vector embeddings for "Related" suggestion types.

## 🔵 v2.0: The "Granular" Update

_Focus: Beyond metadata — block-level intelligence._

- **Intra-paragraph Co-occurrence**:
    - Shift from note-level backlink analysis to block-level proximity.
    - Using `Vault.read()` and Regex/AST parsing to identify concepts cited within the same paragraph.
    - Direct "Create link" action that can insert bracketed links into the text itself.
- **Multi-Hierarchy Support**:
    - Support for multiple Breadcrumbs hierarchies simultaneously in the same scan.
    - Differentiated weights for different relationship types (e.g., `up` > `related`).

## 🟣 v2.1+: The "Scalability" Update

_Focus: Performance for million-node vaults._

- **Incremental Graph Analysis**:
    - Moving away from full "Build Graph" cycles.
    - Implementing a diff-based graph update system that only modifies affected local sub-graphs when a file changes.
- **WASM Acceleration**:
    - Evaluating **Rust/WebAssembly** (via `rustworkx` or similar) for the `GraphWorkerService` if the 100k+ node threshold is reached.
- **Obsidian Bases Integration**:
    - Adaptive mapping once the native Obsidian Database API (Bases) is stabilized.

---

> [!TIP]
> **Priority Policy**: We prioritize stability and UI fluidness. All analysis must remain worker-delegated to ensure a 60fps experience even as the engine grows in complexity.
