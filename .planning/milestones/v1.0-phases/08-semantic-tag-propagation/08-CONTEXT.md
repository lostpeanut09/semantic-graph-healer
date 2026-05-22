# Phase 8 Context & Decisions: Semantic Tag Propagation

This document captures the implementation decisions for Phase 8, ensuring downstream planners and executors understand the chosen architecture and user preferences.

## 1. Automated Tag Propagation

- **Decision:** Implement a system that suggests tags based on parent MOC cluster semantics.
- **Rationale:** Notes belonging to a specific cluster or MOC should ideally share common categorization tags to maintain taxonomy integrity.

## 2. Threshold-Based Suggestions

- **Decision:** Use a majority-based threshold (default 50%) to trigger tag suggestions.
- **Example:** If >50% of notes in a parent's cluster have the tag `#science`, the remaining notes will be suggested to add it.

## 3. On-Demand AI Validation

- **Decision:** All suggested tag additions can be optionally validated by the AI Tribunal.
- **Settings:** Controlled by `requireAITagValidation` in settings. If enabled, the system will use the dual-LLM approach to confirm the semantic fit of the tag for the specific note content.

## 4. Exclusion List

- **Decision:** Certain tags (like `MOC`, `Index`, `Dashboard`) are excluded from propagation by default.
- **Config:** User can extend `tagPropagationExclusions` in settings.

## 5. Hierarchical Flow

- **Decision:** Propagation logic follows the 'down' hierarchy links (e.g., Parent -> Child).

---

_Generated during Phase 8 Research Phase._
