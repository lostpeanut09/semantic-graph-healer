# Phase 4 Context: BaseAdapter Ultra-Hardening

## Domain
Ultra-hardening of the metadata adapter layer to ensure topological restoration is performed on a reliable, leak-free, and high-performance foundation.

## Decisions

### Listener Management
- **Strategy**: Local `EventRef` tracking within each adapter.
- **Implementation**: Each adapter (specifically `UnifiedMetadataAdapter`) must store `EventRef` objects for every registered Obsidian event and call `offref()` in its `destroy()` method.

### NativeVaultAdapter Filtering
- **Scope**: Hybrid (Broad by default, Strict via settings).
- **Behavior**: The adapter will support both Markdown-only and broad semantic formats (Canvas, Excalidraw). This toggle will be exposed in the plugin settings dashboard.
- **Normalization**: All paths must be normalized using `HealerUtils.normalizeVaultPath` before being emitted as edges.

### Deduplication & Merge Policy
- **Policy**: Metadata merging with confidence priority.
- **Logic**: When multiple adapters return the same link (source, target, type), their metadata (context, position) should be merged, and the link with the highest confidence score should be preserved as the primary representation.

### Initialization Guards
- **Severity**: Fail Loudly.
- **Behavior**: If an adapter method is called before `initialize()` has completed, it must throw an explicit error. This ensures that race conditions and improper integration are caught during the hardening phase.

### Performance & Types
- **Parallelism**: `UnifiedMetadataAdapter.getLinks()` will use `Promise.all` to aggregate results from leaf adapters.
- **Type Safety**: All adapter methods returning `Promise` will be parameterized (e.g., `Promise<SemanticLinkEdge[]>`) to remove implicit `any` usage.

## Canonical Refs
- `src/core/adapters/IMetadataAdapter.ts`
- `src/core/adapters/UnifiedMetadataAdapter.ts`
- `src/core/adapters/BaseAdapter.ts`
- `src/core/adapters/NativeVaultAdapter.ts`
- `src/core/HealerUtils.ts`

## Deferred Ideas
- Full symbolic grounding logic (Deferred to Phase 7: AI Tribunal).
- SharedArrayBuffer for large graph serialization (Deferred to Phase 12: Stress Testing).

---
*Created: 2026-05-05*
