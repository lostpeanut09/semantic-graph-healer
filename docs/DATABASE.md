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

### GraphRAG Persistence (`AjsonStorage`)

For large-scale indexing required by GraphRAG, the plugin utilizes `AjsonStorage` (Append-only JSON lines).

- **Optimized for Scale**: Allows the plugin to append new data (`appendLine`) without rewriting the entire file or keeping the whole JSON tree in memory.
- **Memory Safety**: `readAll` parses the file line-by-line, which is critical for handling large indices (thousands of entities or relationships) without exceeding memory limits.
- **Key Files** (stored in `.planning/index/`):
    - `community_summaries.ajson`: Thematic summaries of graph clusters.
    - `entities.ajson`: Extracted entities and their semantic types.
    - `relationships.ajson`: Semantic connections discovered by the AI.

## Cache Management (`CacheService`)

The `CacheService` manages `healer-cache.json` to prevent settings bloat and ensure fast re-hydration of analysis results.

- **Storage Scope**: Caches PageRank scores, Betweenness Centrality, Louvain Community assignments, pending suggestions, and history.
- **Vector Embeddings**: Stores embeddings indexed by content hash. This prevents redundant API calls to embedding providers when note content hasn't changed.
- **Data Integrity (Atomic Writes)**:
    - **Single-Writer Chain**: Uses a promise-based queue to ensure that concurrent save operations are linearized, preventing race conditions during disk I/O.
    - **Temp-File Pattern**: Writes data to `healer-cache.json.tmp` first. Once the write is confirmed, it renames the temp file to the target path. This ensures that a power loss or crash during writing doesn't leave the main cache file truncated or corrupted.
    - **Corruption Recovery**: If JSON parsing fails during load, the service renames the corrupt file to `healer-cache.json.corrupt` and starts fresh rather than deleting the potentially valuable data.

## Memory Safety & LRU Cache (`StructuralCache`)

The `StructuralCache` is a memory-only LRU (Least Recently Used) cache designed to hold metadata and structural analysis results without leaking memory.

- **Eviction Strategy**: Automatically evicts the oldest entries when the node limit (`maxNodes`, default 10,000) is reached or the Time-To-Live (`ttlMs`, default 5 minutes) expires.
- **Automated Invalidation**: Listens to Obsidian's `metadataCache` and `vault` events (`changed`, `rename`, `delete`) to ensure cached metadata stays synchronized with physical file changes.
- **Lifecycle Management**: Implements an explicit `destroy()` method to unregister global event listeners, preventing memory leaks when the plugin is disabled or reloaded.

## Security & Encryption (`KeychainService`)

Credential management is handled by `KeychainService`, which implements a "Double-Lock" security model:

1.  **Layer 1 (Local)**: Keys are stored in Obsidian's `SecretStorage` (v1.11.4+) to keep them out of plaintext files.
2.  **Layer 2 (Encryption)**: Before storage, keys are encrypted using **AES-256-GCM** via `CryptoUtils`. The encryption key is derived using PBKDF2 (600,000 iterations) with a `vault-id` salt (unique per vault).
3.  **Sync Resilience**: Encrypted versions of keys are mirrored in `data.json`. This allows users to sync settings across devices while ensuring that keys cannot be decrypted on another machine without the specific vault's context/salt.

## Memory Guardrails

To ensure stability in large environments, the data layer includes active memory management:

- **Safety Mode** (`PerformanceService`): Automatically restricts graph construction and suspends heavy analysis if the vault size exceeds thresholds (e.g., 2000 nodes on mobile).
- **Worker Offloading**: Heavy computation is pushed to `ladybug-worker.ts` and `graph-analysis-worker.ts`, keeping the main Obsidian UI thread responsive.
- **Graph Capping**: `GraphEngine` applies strict caps on the number of nodes and edges during graph construction based on performance mode.
