# Plan 04-04 Summary: Supporting Adapters Hardening

## Accomplishments

1. **DatacoreAdapter Hardening**: Implemented `onInitialize()` and added `ensureInitialized()` guards to all public data retrieval methods. Verified with `tests/core/adapters/DatacoreAdapterHardening.test.ts`.
2. **BreadcrumbsAdapter Hardening**: Implemented the `onInitialize()` lifecycle hook and added `ensureInitialized()` guards to `getLinks()` and `getHierarchy()`.
3. **Async Consistency**: Ensured both supporting adapters follow the same initialization protocol as the core adapters, preventing race conditions during vault scanning.

## Key Files Created/Modified

- `src/core/adapters/DatacoreAdapter.ts`
- `src/core/adapters/BreadcrumbsAdapter.ts`
- `tests/core/adapters/DatacoreAdapterHardening.test.ts`
- `tests/core/adapters/BreadcrumbsAdapter.test.ts`

## Self-Check

- [x] DatacoreAdapter throws if called before init.
- [x] BreadcrumbsAdapter throws if called before init.
- [x] All existing Breadcrumbs and Datacore tests pass after updating to handle initialization.
