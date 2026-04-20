# Requirements: Semantic Graph Healer

## Functional Requirements

- **Topological Ingestion (R1)**: Must fetch links and adjacency metadata from at least three sources: Obsidian core, Datacore, and Breadcrumbs.
- **Background Analysis (R2)**: Graph computations (clustering, pathfinding) must run in a separate worker thread to avoid UI lag.
- **Semantic Similarity (R3)**: Integrate Smart Connections embeddings to identify related but unlinked notes.
- **Suggestion Engine (R4)**: Generate actionable proposals (new links, tag changes) based on analysis.
- **Manual Verification (R5)**: User must approve any vault modification proposed by the AI.

## Technical Requirements

- **Data Integrity (T1)**: Settings persistence must be immutable regarding unknown fields (Zod Guard).
- **Concurrency (T2)**: Metadata caching and writing must use atomic serializable patterns to prevent race conditions.
- **Performance (T3)**: Support vaults with up to 5,000 nodes and 50,000 edges without crashing.
- **Security (T4)**: Encrypt API keys at rest and use Obsidian's Keychain for secondary protection.

## Quality Requirements

- **Test Coverage (Q1)**: Minimum 90% coverage for the `core/` package.
- **Stability (Q2)**: Zero-crash policy for graph analysis even on malformed or infinite link cycles.
- **Auditability (Q3)**: All actions and AI calls must be logged in a rolling buffer for diagnostic purposes.
