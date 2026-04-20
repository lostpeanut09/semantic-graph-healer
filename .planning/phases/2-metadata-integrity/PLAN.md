# Phase 20.0: Metadata Layer Integrity

## Goal

Audit, harden, and optimize the `UnifiedMetadataAdapter.ts` and related caching infrastructure to ensure 100% data consistency, zero data loss, and optimal performance across all Obsidian sync scenarios.

## Status

🔄 **IN PROGRESS** — Planning complete, ready for execution

## Background

The `UnifiedMetadataAdapter.ts` is the central hub for all metadata operations. It bridges:

- **Datacore** — Primary reactive query engine
- **Breadcrumbs** — Hierarchical navigation data
- **Smart Connections** — Vector similarity scores
- **Obsidian MetadataCache** — Native cache with backlink resolution

Current concerns from ROADMAP.md:

- Cache invalidation race conditions
- Backlink index staleness
- Data loss on rapid sequential updates
- Memory pressure on large vaults

## Success Criteria

| Criterion          | Metric | Verification                                     |
| ------------------ | ------ | ------------------------------------------------ |
| Data Consistency   | 100%   | No data loss in 1000 rapid update stress test    |
| Cache Hit Rate     | >95%   | Monitor via logger metrics                       |
| Memory Leaks       | 0      | Heap snapshot comparison before/after 100 cycles |
| Sync Compatibility | 100%   | Pass Obsidian Sync stress test                   |
| Test Coverage      | 100%   | All adapter methods have unit tests              |

## Task Breakdown

### T1: Audit Current Implementation [2h]

- [ ] Read `UnifiedMetadataAdapter.ts` fully
- [ ] Map all external dependencies
- [ ] Identify race condition points
- [ ] Document current cache invalidation flow
- [ ] List all event listeners and their cleanup

### T2: Cache Stress Test Suite [3h]

- [ ] Create `tests/core/UnifiedMetadataAdapter.stress.test.ts`
- [ ] Implement 1000 rapid update test
- [ ] Simulate Obsidian Sync concurrent updates
- [ ] Add memory profiling hooks
- [ ] Create race condition reproduction case

### T3: Fix Race Conditions [2h]

- [ ] Implement update queue/debounce for metadata changes
- [ ] Add version/timestamp check for stale data rejection
- [ ] Fix backlink index invalidation timing
- [ ] Ensure atomic cache updates

### T4: Optimize Memory Usage [2h]

- [ ] Implement LRU eviction with configurable limit
- [ ] Add weak references where appropriate
- [ ] Optimize backlink index data structure
- [ ] Profile and reduce object allocations

### T5: Enhanced Error Handling [2h]

- [ ] Add graceful degradation when adapters fail
- [ ] Implement retry with exponential backoff
- [ ] Create fallback to MetadataCache when Datacore unavailable
- [ ] Add structured logging for all adapter operations

### T6: Verification & Documentation [1h]

- [ ] Run full stress test suite — all pass
- [ ] Run full test suite — no regressions
- [ ] Update `ARCHITECTURE.md` with new flow
- [ ] Create ADR-020-cache-invalidation.md

## Dependencies

- Phase 10.0 Worker Hardening ✅ COMPLETE
- Phase 25.0 Audit Hardening ✅ COMPLETE
- Obsidian API documentation (public)

## Rollback Plan

If issues arise:

1. Revert to last known good adapter version
2. Disable Datacore bridge (fallback to MetadataCache only)
3. Increase cache TTL as temporary mitigation

## Artifacts

### Input

- `src/core/adapters/UnifiedMetadataAdapter.ts`
- `src/core/CacheService.ts`
- `src/core/adapters/DatacoreAdapter.ts`
- `src/core/adapters/BreadcrumbsAdapter.ts`

### Output

- Updated `UnifiedMetadataAdapter.ts` with fixes
- New stress test suite
- Updated `ARCHITECTURE.md`
- ADR-020-cache-invalidation.md

### Verification

- All stress tests pass
- No memory leaks detected
- No regressions in existing tests
- GitHub Actions still "Success"

## Estimated Effort

**12 hours** (split across 3-4 sessions)

## Priority

P1 — High priority after P0 fixes complete

## Notes

- Consider using `p-queue` for batching updates (already in deps)
- May need to coordinate with Datacore plugin updates
- Test with real large vault (>10k notes) if possible
