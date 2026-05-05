# Semantic Graph Healer

**Core Value:** Topological restoration and deep graph analysis for Obsidian to maintain knowledge graph integrity.

## Context

Managing large-scale digital gardens requires automated link auditing. Manual curation is no longer feasible as the volume of notes and connections grows beyond human cognitive limits. Semantic Graph Healer bridges this gap by identifying and resolving structural inconsistencies in the knowledge graph.

### What This Is

A production-grade graph analysis engine and suggestion executor for Obsidian. It integrates with Datacore, Breadcrumbs, Smart Connections, and Graphology to provide a unified "healing" interface.

### Why This Matters

- **Prevents Information Rot:** Identifies dead ends and circular logic.
- **Discovers Latent Connections:** Surfaces missing links through algorithmic analysis (Jaccard, Adamic-Adar).
- **Ensures Structural Consistency:** Enforces hierarchical rules and MOC alignment.
- **Offloads Cognitive Burden:** Automates the "janitorial" work of knowledge management.

## Requirements

### Validated

- ✓ **ADAPTER-01**: Fix null-caching bug in UnifiedMetadataAdapter (P0)
- ✓ **ADAPTER-02**: Fix BoundedMap eviction to true LRU (P0)
- ✓ **ARCH-01**: introduce IBreadcrumbsPort; ensure all adapters have port interfaces (P1)
- ✓ **ARCH-02**: Refactor UnifiedMetadataAdapter to depend on ports via constructor injection (P1)
- ✓ **ARCH-03**: Update main.ts composition root to inject adapter instances (P1)
- ✓ **UTIL-01**: Centralize vault path normalization in HealerUtils.normalizeVaultPath (P2a)
- ✓ **UTIL-02**: Remove duplicate normalization functions from all adapters (P2a)
- ✓ **COMPAT-01**: Maintain backward compatibility; all tests type-check (P2a)
- ✓ **HARDEN-01**: Add cache stampede protection (in-flight promise coalescing)
- ✓ **HARDEN-02**: Add unit tests for null-caching negative behavior and LRU eviction order
- ✓ **UX-01**: Performance & UX Hardening (Debouncing & Notices)
- ✓ **EXTRACT-01**: Extraction Robustness (Datacore & SmartConnections)
- ✓ **TEST-01**: Verification & Stress Testing

### Active

- [ ] **HARDEN-03**: BaseAdapter Ultra-Hardening (Audit Findings)
- [ ] **UI-01**: UI Integration: High-Fidelity Graph
- [ ] **UI-02**: UI Component: Reasoning Explainer
- [ ] **UI-03**: Real-time Healing Dashboard

### Out of Scope

- **DI-01**: Full Dependency Injection container implementation — unnecessary overhead for current scale.
- **CACHE-01**: Separate cache backends (Redis, etc.) — strictly limited to local LRU for performance and simplicity.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Datacore as Primary | 100x faster than Dataview, reactive schema. | — Validated |
| Port/Adapter Pattern | decouples core logic from third-party plugin APIs. | — Validated |
| Web Worker Offloading | Prevents UI freezes during graph analysis. | — Validated |
| AI Tribunal | Dual-LLM verification ensures epistemic stability. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

---
*Last updated: 2026-05-05 after initialization*
