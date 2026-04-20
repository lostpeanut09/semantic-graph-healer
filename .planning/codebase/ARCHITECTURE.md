# Architecture: Semantic Graph Healer

## Threading Model

The plugin follows a strict split-thread architecture to maintain Obsidian's UI responsiveness during heavy graph computations:

- **Main Thread (src/main.ts)**:
    - Plugin lifecycle (onLoad, onUnload).
    - UI Management (DashboardView, SettingsTab).
    - Metadata extraction (Adapters).
    - Persistence (loadData/saveData via Zod validation).
- **Worker Thread (src/core/workers/graph-analysis-worker.ts)**:
    - Decoupled graph theory logic.
    - Pathfinding and cluster analysis.
    - Link prediction and topological healing suggestions.

## Data Flow

1. **Ingestion**: `DataAdapter` collects links/tags from Obsidian/Datacore.
2. **Analysis**: Data is sent to `GraphWorkerService`, which communicates with the worker.
3. **Reasoning**: `ReasoningService` evaluates worker outputs using configured AI models.
4. **Execution**: `SuggestionExecutor` applies approved changes to the vault.

## Persistence & Validation

- **Settings**: Validated through `SettingsSchema` (Zod) in `types.schema.ts`.
- **Cache**: `StructuralCache` stores the graph state between vault reloads to avoid full rescans.
