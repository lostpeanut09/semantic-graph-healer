# Semantic Graph Healer: Adapter Architecture

## Overview

The Semantic Graph Healer plugin integrates with multiple external indexers and graph tools (Datacore, Breadcrumbs, Smart Connections) to build its semantic graph. To ensure stability, high performance, and security, the plugin strictly adheres to the **Dependency Inversion Principle** via an Adapter Architecture.

## Core Concepts

### `IMetadataAdapter`

At the center of the architecture is the `IMetadataAdapter` interface. This defines the contract that any metadata source must fulfill. It includes methods for querying pages, retrieving hierarchy, and fetching related notes.

### `UnifiedMetadataAdapter`

The `UnifiedMetadataAdapter` acts as an orchestrator and multiplexer. Instead of direct connections to plugins, it instantiates specific adapters for each supported system:

- **`DatacoreAdapter`**: Bridges Dataview and Datacore APIs.
- **`BreadcrumbsAdapter`**: Bridges the Breadcrumbs hierarchy data.
- **`SmartConnectionsAdapter`**: Bridges AI-driven related notes.

The `UnifiedMetadataAdapter` is responsible for:

1. **Aggregating results**: It merges hierarchies and related notes.
2. **Caching**: It maintains the `StructuralCache` to prevent redundant queries during graph analysis.
3. **Stampede Protection**: It implements "Promise Coalescing" (`withCoalescing`) for asynchronous calls like `getHierarchy` and `getRelatedNotes` to ensure that simultaneous requests for the same path do not trigger multiple expensive external calls.
4. **Lifecycle Management**: It propagates `destroy()` signals to all child adapters.

### Isolation and Defensiveness

To prevent third-party plugins from crashing the main Semantic Graph Healer loop, the architecture enforces strict guardrails:

- **`safeExecute` and `safeExecuteAsync`**: All external calls are wrapped in defensive try-catch blocks. If an external plugin throws an exception, the adapter falls back gracefully (e.g., returning `null` or an empty array).
- **`_isDestroyed` Guards**: Operations immediately short-circuit if the adapter has been destroyed. This prevents memory leaks and zombies from executing callbacks after the plugin is disabled or reloading.

### Caching Strategy

The system utilizes specialized caching mechanisms to respect Obsidian's memory limits:

- **`BoundedMap`**: A custom Map implementation that enforces a maximum size (e.g., 500 items). It uses an **LRU (Least Recently Used)** eviction policy. When the map is full, the least recently accessed item is evicted. Read operations (`get`) use a "touch-on-get" strategy, moving the accessed item to the most-recently-used position.
- **`StructuralCache`**: Wraps cached items with TTL (Time-To-Live) and invalidation logic to keep graph data fresh without polling.

## Component Interaction

1. **GraphEngine** requests node metadata via `UnifiedMetadataAdapter.getPage(path)`.
2. **UnifiedMetadataAdapter** checks `pageCache`. If cache miss:
3. **UnifiedMetadataAdapter** calls `safeExecute(() => datacoreAdapter.getPage(path))`.
4. **DatacoreAdapter** translates the request to Datacore's internal API (`tryQuery` or `query`), normalizes the result into a `DataviewPage`, and returns it.
5. **UnifiedMetadataAdapter** caches the normalized page and returns it to the GraphEngine.

This architecture ensures that changes to external plugins (like Dataview upgrading to Datacore) only require changes within the specific adapter, leaving the core GraphEngine completely insulated from external API churn.
