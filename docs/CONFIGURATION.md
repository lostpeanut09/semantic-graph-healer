# Configuration Guide

The Semantic Graph Healer provides extensive configuration through Obsidian's Settings view. These are grouped into modular sections defined in `src/views/sections/`.

## Key Configuration Categories

- **Core Settings:** Global plugin behavior.
- **Primary Model Settings:** Configuration for the LLM backend (e.g., GPT-4, Claude).
- **Security & API Keys:** Secure storage for third-party services using `KeychainService`.
- **Performance & Safety:** Thresholds for `PerformanceService` to throttle graph analysis.
- **Adapters:** Enable/disable imports from Dataview, Breadcrumbs, and Smart Connections.
- **Logging:** Configure the detail level of the `HealerLogger`.

## Advanced Settings

- **Intelligent Evolution:** Rules for automated graph structural updates.
- **Hierarchies:** Define expected knowledge structures for automatic propagation.
- **Blacklist:** Files or tags to ignore during graph healing.
