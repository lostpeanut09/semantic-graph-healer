# Adapters

Adapters are responsible for normalizing disparate metadata sources into a unified graph format.

## Implementation Details

All adapters inherit from `BaseAdapter` and implement the `IMetadataAdapter` interface.

## Supported Adapters

- **DataviewAdapter:** Pulls link and metadata information from Dataview indexes.
- **BreadcrumbsAdapter:** Ingests hierarchy data from the Breadcrumbs plugin.
- **SmartConnectionsAdapter:** Uses embeddings and similarity data from Smart Connections.
- **NativeVaultAdapter:** Uses raw Obsidian API for core vault graph structure.

## Creating a Custom Adapter

1. Create a new file in `src/core/adapters/`.
2. Implement `IMetadataAdapter`.
3. Register the adapter in `src/core/DataAdapter.ts` to include it in the graph normalization process.
