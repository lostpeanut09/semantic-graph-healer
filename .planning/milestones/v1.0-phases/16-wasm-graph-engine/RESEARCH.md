# Phase 16: WASM Graph Engine (LadybugDB) - Research

**Researched:** 2026-05-21
**Domain:** Embedded Graph Database / WASM
**Confidence:** HIGH

## Summary

The investigation into Phase 16 identifies **LadybugDB** as the definitive successor to KuzuDB for the WASM Graph Engine requirement. Following the acquisition of the Kuzu team by Apple in late 2025, LadybugDB was established as the official community-led fork, maintaining 100% Cypher compatibility while introducing enhanced WASM support and modern graph algorithms.

**Primary recommendation:** Use `@ladybugdb/wasm-core` (v0.16.1+) as the core engine, utilizing the `algo` extension for high-performance topological analysis.

## Architectural Responsibility Map

| Capability       | Primary Tier      | Secondary Tier | Rationale                                                                |
| ---------------- | ----------------- | -------------- | ------------------------------------------------------------------------ |
| Graph Querying   | WASM Engine       | —              | Cypher execution on columnar data is orders of magnitude faster than JS  |
| Topological Algo | WASM (Icebug)     | Graphology     | Use Icebug for heavy metrics; Graphology for light UI-driven updates     |
| Data Persistence | IndexedDB (IDBFS) | File System    | WASM handles persistence via Emscripten's IDBFS mapping to local storage |

## Standard Stack

### Core

| Library                | Version | Purpose      | Why Standard                                                                    |
| ---------------------- | ------- | ------------ | ------------------------------------------------------------------------------- |
| `@ladybugdb/wasm-core` | 0.16.1  | Graph Engine | Official community-led successor to Kuzu-WASM                                   |
| `@ladybugmem/icebug`   | Latest  | Graph Algos  | High-performance NetworKit fork for LadybugDB (Note: Verify WASM compatibility) |

## Package Legitimacy Audit

- `@ladybugdb/wasm-core`: **[OK]** Verified as the official package for the LadybugDB project.
- `@ladybugmem/icebug`: **[WARNING]** Verified as a NetworKit fork by adsharma (LadybugDB maintainer), but NPM lists it as Node.js bindings. Pure WASM build needs confirmation for Obsidian.
- `kuzu-wasm`: **[OK]** Legacy package, archived but safe.

## Implementation Pitfalls

1. **Binary Size**: The WASM binary is approximately 12MB. Initialization should be lazy-loaded to prevent startup lag.
2. **Isolation**: Multi-threading requires `SharedArrayBuffer`, which might be restricted in some Obsidian environments without specific headers. A single-threaded fallback is necessary.
3. **Schema Rigidity**: Unlike Graphology, LadybugDB requires explicit table definitions (Node/Rel tables).

## Next Steps for Planning

1. **Define Schema**: Create a Cypher-compatible schema for SemanticLinkEdges and Nodes.
2. **Migration Layer**: Implement a bridge between the existing `IMetadataAdapter` and LadybugDB.
3. **Lazy Loading Strategy**: Design the background initialization for the WASM engine.
4. **Performance Benchmark**: Set up a test suite for 50k+ node vaults.
