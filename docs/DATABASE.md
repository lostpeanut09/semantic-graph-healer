<!-- generated-by: gsd-doc-writer -->

# DATABASE.md

## Overview

Semantic Graph Healer uses a hybrid storage architecture designed for high-performance graph operations, secure credential management, and sync-resilient state persistence. The system balances memory-resident data for speed with file-based persistence for durability, and introduces local WASM-based graph indexing for heavy computations.

## Data Storage Strategy

The plugin distributes data across several specialized storage locations based on the nature, size, and sensitivity of the information:

| Storage Type        | Location            | Purpose                                                                                                             | Persistence         |
| :------------------ | :------------------ | :------------------------------------------------------------------------------------------------------------------ | :------------------ |
| **Settings**        | `data.json`         | Core configuration, hierarchy definitions, and encrypted sync-resilient API keys.                                   | Permanent           |
| **Volatile Cache**  | `healer-cache.json` | Pending suggestions, analysis history, topological scores, and vector embeddings.                                   | Permanent (Managed) |
| **Indices (AJSON)** | `.planning/index/`  | Large-scale indices for GraphRAG (entities, relationships, community summaries).                                    | Permanent           |
| **Graph DB (WASM)** | Memory / Worker     | LadybugDB instance handling complex Cypher-like queries and graph algos.                                            | Transient / Worker  |
| **Secure Keys**     | `SecretStorage`     | Local-only secure storage for decrypted API keys. <!-- VERIFY: Obsidian API version >= 1.11.4 for SecretStorage --> | Vault-Local         |
| **Graph Data**      | Memory              | Live `Graphology` instance representing the vault's current topology.                                               | Transient           |

## Local Databases & Indexing

### LadybugDB (WASM Graph Database)

The plugin integrates **LadybugDB** (`@ladybugdb/wasm-core`) in a dedicated Web Worker (`ladybug-worker.ts`).

- **Initialization**: Automatically degrades to a single-threaded WASM version (or skips entirely on mobile) depending on `SharedArrayBuffer` support.
- **Schema**: Maintains an explicit schema (`Metadata`, `Node`, `SemanticLink`) for Cypher-like query execution.
- **Graph Algorithms**: Offloads heavy tasks such as PageRank and Louvain community detection to the worker, extracting from LadybugDB directly to Graphology.

### Datacore Integration

Instead of building a separate metadata index, the plugin connects to **Datacore** via `DatacoreAdapter`.

- **Query Bridge**: Executes queries directly against the Datacore API (falling back from `tryQuery` to `query`).
- **Semantic Mapping**: Normalizes Datacore's `MarkdownPage` format into `DataviewPage` equivalents for backwards compatibility and structural analysis.

## Cache Management (`healer-cache.json`)

The `CacheService` manages a dedicated cache file to prevent settings bloat and ensure fast re-hydration.

- **Topological Metrics**: Caches PageRank scores, Betweenness Centrality, and Louvain Community assignments.
- **Vector Embeddings**: Stores embeddings indexed by content hash. This prevents redundant API calls to embedding providers when note content hasn't changed.
- **Consistency**: Uses a debounced, atomic write pattern (temp file + rename) with a single-writer promise chain to prevent JSON corruption during system crashes.

## State Management & LRU Cache

The `StructuralCache` is an LRU (Least Recently Used) cache implementation designed to prevent memory bloat on low-end devices.

- **Eviction**: Evicts oldest entries when the node limit (`maxNodes`) is reached or TTL (`ttlMs`) expires.
- **Invalidation**: Subscribes to Obsidian's `metadataCache` and `vault` events (`changed`, `rename`, `delete`) to ensure metadata freshness.

## GraphRAG Persistence (AJSON)

For large-scale indexing required by GraphRAG, the plugin utilizes `AjsonStorage` (Append-only JSON lines).

- **Optimized for Scale**: Allows the plugin to append new data without rewriting the entire file or keeping the whole JSON tree in memory. `readAll` parses line-by-line.
- **Key Files**:
    - `community_summaries.ajson`: Thematic summaries of graph clusters.
    - `entities.ajson`: Extracted entities and their semantic types.
    - `relationships.ajson`: Semantic connections discovered by the AI.

## Security & Encryption

Credential management is handled by `KeychainService`, which implements a "Double-Lock" security model:

1.  **Layer 1 (Local)**: Keys are stored in Obsidian's `SecretStorage` (or legacy `keychain`) to keep them out of plaintext files.
2.  **Layer 2 (Encryption)**: Before storage, keys are encrypted using AES-256-GCM with a `vault-id` salt derived from the Obsidian application ID.
3.  **Sync Resilience**: Encrypted versions of keys are mirrored in `data.json`. This allows users to sync their settings across devices while ensuring that keys remain encrypted at rest and cannot be decrypted without the specific vault's context.

## Memory Guardrails

To ensure stability in large environments, the data layer includes active memory management:

- **Safety Mode**: Automatically restricts graph construction and suspends heavy analysis (like community detection) if the vault size exceeds platform-specific thresholds.
- **Worker Offloading**: Heavy computation is pushed to `ladybug-worker.js` (LadybugDB) and standard Graphology workers.
- **Disposal**: Explicit event unregistration (`destroy()`) inside `StructuralCache` and `LadybugService` prevents memory leaks when the plugin unloads.
