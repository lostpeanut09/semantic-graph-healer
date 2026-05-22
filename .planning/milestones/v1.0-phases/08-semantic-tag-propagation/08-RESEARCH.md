# Phase 8: Semantic Tag Propagation - Research

**Researched:** 2026-05-10
**Domain:** Taxonomy Management, Graph Semantics, AI Validation
**Confidence:** HIGH

## Summary

The Semantic Tag Propagation phase automates the management of tags across the knowledge graph by leveraging cluster semantics and AI validation. The system identifies clusters of notes (typically centered around an MOC or parent) and suggests propagating common tags to outlier notes. This ensures that hierarchical relationships are reflected in the vault's taxonomy.

**Primary recommendation:** Formalize the existing `SemanticTagPropagator.ts`, ensure its integration in the main analysis loop, and verify the `requireAITagValidation` workflow in the dashboard.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Automated Tag Propagation:** Implement a system that suggests tags based on parent MOC cluster semantics.
- **Threshold-Based Suggestions:** Use a majority-based threshold (default 50%) to trigger tag suggestions.
- **On-Demand AI Validation:** All suggested tag additions can be optionally validated by the AI Tribunal, controlled by `requireAITagValidation`.
- **Exclusion List:** Certain tags (like `MOC`, `Index`, `Dashboard`) are excluded from propagation by default.
- **Hierarchical Flow:** Propagation logic follows the 'down' hierarchy links.

### agent Discretion

- **Dashboard UI details:** The exact way these suggestions are displayed in the dashboard is left to implementation, provided they follow existing patterns.

### Deferred Ideas (OUT OF SCOPE)

- **Recursive multi-level propagation:** Propagation is currently limited to direct parent-child clusters to avoid taxonomic drift.
  </user_constraints>

<phase_requirements>

## Phase Requirements

| ID    | Description              | Research Support                                      |
| ----- | ------------------------ | ----------------------------------------------------- |
| AI-02 | Semantic Tag Propagation | Suggested tags based on parent MOC cluster semantics. |

</phase_requirements>

## Architectural Responsibility Map

| Capability           | Primary Tier               | Secondary Tier        | Rationale                                                                      |
| -------------------- | -------------------------- | --------------------- | ------------------------------------------------------------------------------ |
| Cluster Tag Analysis | core/SemanticTagPropagator | DataAdapter           | Logic for calculating majority tags belongs in a dedicated propagator service. |
| AI Validation        | core/LlmService            | core/ReasoningService | Validating semantic fit uses the established AI infrastructure.                |
| Settings Management  | views/SettingsTab          | src/types.ts          | Thresholds and exclusions are managed via standard settings.                   |
| Execution            | core/SuggestionExecutor    | vault/FileManager     | Applying tag changes to files via frontmatter processing.                      |

## Architecture Patterns

### System Architecture Diagram

```
[Graph Analysis Loop] --> [SemanticTagPropagator]
                                |
                        (Build Parent-Child Maps)
                                |
                        (Calculate Tag Coverage)
                                |
                        [Coverage > Threshold?] --- (No) ---> [Skip]
                                |
                              (Yes)
                                |
                        [Generate Suggestion]
                                |
        v <---------------------'
[Healing Dashboard]
        |
    (User Hits "Verify")
        |
[AI Tribunal (Optional)] -> (Confirm semantic fit)
        |
    (User Hits "Fix")
        |
[SuggestionExecutor] -> (Add tag to Frontmatter)
```

## Assumptions Log

| #   | Claim                                                 | Section              | Risk if Wrong                                                     |
| --- | ----------------------------------------------------- | -------------------- | ----------------------------------------------------------------- |
| A1  | Datacore provides reliable tag metadata for clusters. | Cluster Tag Analysis | High - logic depends on accurate metadata ingestion.              |
| A2  | Users want tags added to frontmatter by default.      | Execution            | Medium - some users may prefer inline tags (out of scope for v1). |

## Environment Availability

| Dependency   | Required By        | Available | Version | Fallback                |
| ------------ | ------------------ | --------- | ------- | ----------------------- |
| Datacore API | Metadata Ingestion | yes       | Latest  | Native MetadataCache    |
| AI Tribunal  | Validation         | yes       | Phase 7 | Static suggestions only |

---

_Generated during Phase 8 Research Phase._
