# Phase 9 Context & Decisions: High-Fidelity Graph UI

This document captures the implementation decisions for Phase 9, ensuring downstream planners and executors understand the chosen architecture and user preferences.

## 1. Visualization Engine

- **Decision:** Use **force-graph** (WebGL version) for the graph engine.
- **Rationale:** Best performance for large graphs. Native integration with WebGL ensures smooth interaction even with 10,000+ nodes.
- **Integration:** Explore potential ExcaliBrain integration patterns if no external sources are needed.

## 2. Visual Semantics

- **Decision:** Implement specialized visual indicators for topological errors.
- **Indicators:**
    - **Hierarchical Cycles (Ouroboros):** Pulsate in red.
    - **Structural Gaps:** Displayed as dotted ghost-edges between the notes forming the gap.
- **Customization:** Colors and animation intensities must be user-configurable via settings.

## 3. Interaction Model

- **Decision:** Clicking a problematic node/edge triggers an in-graph popup.
- **Content:** The popup must display:
    - AI reasoning summary (if available).
    - An "Execute Fix" button to apply the healing action directly without leaving the graph view.

## 4. Platform Constraints

- **Decision:** Ensure compatibility with Obsidian Desktop and Mobile.
- **Fallback:** Force-graph (Canvas) fallback for platforms where WebGL might be restricted (though rare in modern Obsidian).

---

_Generated during Phase 9 Planning Phase._
