# Changelog

All notable changes to the `Semantic Graph Healer` Obsidian plugin will be documented in this file.

## [1.5.0] - 2026-03-30
### Added
- **Ouroboros Detection:** Advanced DFS recursive traversal to flag graph sequence loops (A → B → C → A).
- **Network Gap Sink Scanner:** Detection of structural stagnation where ideas fail to connect forward.
- **Tag Siblings Integration:** Derived transitive sibling relations dynamically from overlapping taxonomy tags.
- **InfraNodus Network Synergy:** Experimental gap logic analysis over individual notes using AI graph algorithms.

### Changed
- Refactored core topology engine replacing O(N^2) searches with optimized adjacency indexing.
- Implemented **WebWorker** threading architecture for PageRank and Betweenness Centrality avoiding UI block.
- Refined Dashboard memory footprint enabling paginated visualization via virtual DOM logic.

### Security
- **Strict SecretStorage (v1.11.4+) Migration:** Secure encryption wrapper to store API tokens.

## [1.4.3] - 2026-03-29
### Added
- Multi-Model Selection and automated detection of primary vs independent verification models.
- Support for `Ollama` and `LM Studio` local AI proxy.
### Fixed
- Stabilized `app.keychain` API for legacy Vault configurations.

## [1.3.0] - 2026-02-28
### Added
- Smart Connections integration for vector embeddings retrieval.
- "Related" semantic non-reciprocal mappings.

## [1.0.0] - 2025-10-15
### Added
- Initial release featuring base Deterministic Topology `next/prev/same/down/up`.
- Dashboard Interface.
