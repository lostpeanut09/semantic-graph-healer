# Requirements (GSD)

## v1 — Completed

- [x] Fix null-caching bug in UnifiedMetadataAdapter (P0)
- [x] Fix BoundedMap eviction to true LRU (P0)
- [x] Introduce IBreadcrumbsPort; ensure all adapters have port interfaces (P1)
- [x] Refactor UnifiedMetadataAdapter to depend on ports via constructor injection (P1)
- [x] Update main.ts composition root to inject adapter instances (P1)
- [x] Centralize vault path normalization in HealerUtils.normalizeVaultPath (P2a)
- [x] Remove duplicate normalization functions from all adapters (P2a)
- [x] Maintain backward compatibility; all tests type-check (P2a)

## v1 — Optional Remaining (P2b)

- [ ] Add cache stampede protection (in-flight promise coalescing)
- [ ] Add unit test: null-caching negative behavior (second call after data becomes available)
- [ ] Add unit test: BoundedMap LRU eviction order (explicit)

## Out of Scope (v2+)

- Full DI container implementation
- Separate cache backends (Redis, etc.)
