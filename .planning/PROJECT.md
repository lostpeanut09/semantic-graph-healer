# Semantic Graph Healer

## Core Value

Topological restoration and deep graph analysis for Obsidian to maintain knowledge graph integrity.

## Context

Managing large-scale digital gardens requires automated link auditing. Manual curation is no longer feasible as the volume of notes and connections grows beyond human cognitive limits. Semantic Graph Healer bridges this gap by identifying and resolving structural inconsistencies in the knowledge graph.

### What This Is

A production-grade graph analysis engine and suggestion executor for Obsidian. It integrates with Datacore, Breadcrumbs, Smart Connections, and Graphology to provide a unified "healing" interface. It features a high-fidelity 3D WebGL graph view and an AI-driven "Tribunal" for suggestion verification.

### Why This Matters

- **Prevents Information Rot:** Identifies dead ends and circular logic.
- **Discovers Latent Connections:** Surfaces missing links through algorithmic analysis (Jaccard, Adamic-Adar).
- **Ensures Structural Consistency:** Enforces hierarchical rules and MOC alignment.
- **Offloads Cognitive Burden:** Automates the "janitorial" work of knowledge management.
- **Scales to v10k+:** Optimized for large vaults with adaptive performance and Web Worker offloading.

## Requirements

### Validated (v1.1 Complete)

- ✓ **INFRA-01 - 08**: Core architecture, Adapters, Keychain, Workers, Cache, LadybugDB (WASM), Cypher, Local Embeddings.
- ✓ **TOPOL-01 - 05**: Bridges, Prediction Engine, Centrality Metrics, Ouroboros, Black Holes.
- ✓ **AI-01 - 03, 05, 06**: AI Tribunal, Tag Propagation, Vector Discovery, GraphRAG, Entity Indexing.
- ✓ **UX-01 - 04, 09**: Dashboard, Complex Executors, Hot Reload, Performance, GraphRAG Search.
- ✓ **UI-01 - 02**: 3D Graph UI, Reasoning Explainer.
- ✓ **HARDEN-01 - 10**: Safety Mode, Testing, Linting, CI/CD, WSL Support, Embedding Hardening, HTR v2, Lazy-Loading.
- ✓ **ENV-01**: Node.js/npm strict environment enforcement.
- ✓ **REQ-17.1 - 17.4**: Obsidian CLI integration, programmatic API, JSON reporting, safe headless batch execution and rollback.

### Deferred (v2.0+)

- **AI-04**: InfraNodus Integration.
- **UX-05**: Deep Analytics Settings UI.

## Key Decisions

| Decision               | Rationale                                                    | Outcome     |
| ---------------------- | ------------------------------------------------------------ | ----------- |
| Datacore as Primary    | 100x faster than Dataview, reactive schema.                  | ✓ Validated |
| Port/Adapter Pattern   | decouples core logic from third-party plugin APIs.           | ✓ Validated |
| Web Worker Offloading  | Prevents UI freezes during graph analysis.                   | ✓ Validated |
| AI Tribunal            | Dual-LLM verification ensures epistemic stability.           | ✓ Validated |
| Svelte 5 (Runes)       | Modern, high-performance UI reactivity.                      | ✓ Validated |
| WebGL (3D Force Graph) | Performance scaling for 10k+ node digital gardens.           | ✓ Validated |
| Adaptive Safety Mode   | LOD rendering and analysis throttling for UX.                | ✓ Validated |
| Strict TypeScript      | Zero-any policy and typed message passing.                   | ✓ Hardened  |
| Linting & Hooks        | Automated enforcement of HIG and code standards.             | ✓ Hardened  |
| LadybugDB (WASM)       | High-performance Cypher queries for 50k+ nodes.              | ✓ Validated |
| GraphRAG (AJSON)       | Memory-efficient semantic retrieval and community summaries. | ✓ Validated |
| CLI Automation         | Injected HealerNotifier and SilentNotifier for headless run. | ✓ Validated |

## Evolution

This project has transitioned from an experimental topological tool to a production-grade repository.

**Milestone: v1.0 Release** (2026-05-21)
The repository is now fully hardened with zero lint warnings, strict typing, and comprehensive stress-testing coverage across all 16 phases.

**Milestone: v1.1 Release** (2026-05-22)
Deep automation and headless interaction via the Obsidian CLI (v1.12+) successfully integrated and verified.

---

_Last updated: 2026-05-22 after Milestone Audit_

## Domain Glossary

| Term | Definition
|
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Adapter** | Integration layer translating external plugin APIs (Datacore, Breadcrumbs, Smart Connections) into a stable internal format. |
| **Port** | Vertical interface (e.g., `IDataviewPort`) that a specific adapter implements to avoid monolithic interfaces.
|
| **IMetadataAdapter** | Unified interface exposed by the orchestrator (`UnifiedMetadataAdapter`) combining multiple sources.
|
| **SemanticLinkEdge** | Normalized representation of a graph link (source → target) with metadata (context, position, confidence).
|
| **AI Tribunal** | Dual-LLM verification system (Primary + Secondary) to ensure consensus and prevent hallucinations.
|
| **StructuralCache** | LRU caching layer with event-based invalidation and stampede protection.
|
| **Safety Mode** | Adaptive performance state that throttles analysis and simplifies rendering based on vault size thresholds.
|
| **GraphRAG** | Retrieval-Augmented Generation using graph-aware community context and vector embeddings.
|
| **LadybugDB** | High-performance WASM-based graph database providing Cypher query support in the browser.
|
