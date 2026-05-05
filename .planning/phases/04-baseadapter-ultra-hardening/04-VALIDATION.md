# Phase 4 Validation: BaseAdapter Ultra-Hardening

## Validation Strategy
This phase focuses on cross-cutting hardening of the metadata adapter layer. Validation will be performed through a combination of unit tests for logic and integration tests for lifecycle/Obsidian API interaction.

## Acceptance Criteria Verification

### 1. Listener Lifecycle (HARDEN-03a)
- **Goal**: Zero memory leaks from `metadataCache` events.
- **Verification**:
    - Unit test: Mock `metadataCache` and verify `offref` is called when `adapter.destroy()` is invoked.
    - Test File: `tests/core/services/Lifecycle.test.ts` (new) or `tests/core/adapters/UnifiedMetadataAdapter.test.ts`.

### 2. Path Hardening (HARDEN-03b)
- **Goal**: All edges in the graph use canonical vault-absolute paths.
- **Verification**:
    - Unit test: Provide raw linktext to `NativeVaultAdapter.getLinks()` and assert returned edges use normalized paths.
    - Verification Command: `npm test tests/core/adapters/NativeVaultAdapter.test.ts`.

### 3. Edge Deduplication (HARDEN-03c)
- **Goal**: Deterministic merge of overlapping links with confidence priority.
- **Verification**:
    - Unit test: Inject overlapping edges from two mock adapters into `UnifiedMetadataAdapter` and assert the result is unique and preserves the highest confidence/metadata.
    - Verification Command: `npm test tests/core/adapters/UnifiedMetadataAdapter.test.ts`.

### 4. Initialization Guards (HARDEN-03d)
- **Goal**: "Fail Loudly" if methods are called before `initialize()`.
- **Verification**:
    - Unit test: Instantiate an adapter, call `getLinks()` without calling `initialize()`, and assert an error is thrown.
    - Unit test: Ensure concurrent `initialize()` calls return the same promise and don't double-register events.
    - Verification Command: `npm test tests/core/adapters/BaseAdapter.test.ts`.

### 5. Type Safety (HARDEN-03e)
- **Goal**: Parameterized `Promise` returns for all `IMetadataAdapter` methods.
- **Verification**:
    - Build check: `npm run build` must pass with zero TypeScript errors or `any` warnings in the adapter layer.

### 6. Performance Optimizations (HARDEN-03f, HARDEN-03g)
- **Goal**: Parallel execution and size-capped fallback parsing.
- **Verification**:
    - Unit test: Mock `SmartConnectionsAdapter` with a >1MB mock `ajson` file and verify it skips deep parsing.
    - Verification Command: `npm test tests/core/adapters/SmartConnectionsAdapter.test.ts`.

## Test Matrix

| Req ID | Test File | Test Case |
|--------|-----------|-----------|
| HARDEN-03a | `UnifiedMetadataAdapter.test.ts` | `should unregister listener on destroy` |
| HARDEN-03b | `NativeVaultAdapter.test.ts` | `should normalize all emitted edge paths` |
| HARDEN-03c | `UnifiedMetadataAdapter.test.ts` | `should deduplicate and merge metadata` |
| HARDEN-03d | `BaseAdapter.test.ts` | `should throw if not initialized` |
| HARDEN-03f | `UnifiedMetadataAdapter.test.ts` | `should fetch links in parallel` |
| HARDEN-03g | `SmartConnectionsAdapter.test.ts` | `should respect 1MB size cap for fallback` |

## Final Pipeline
1. `npm run lint` (Zero warnings)
2. `npm run test` (All tests pass)
3. `npm run build` (Successful build)
