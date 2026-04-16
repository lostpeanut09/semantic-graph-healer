# Changelog

All notable changes to Semantic Graph Healer are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.3.0] — 2026-04-16 (`endpoint-v2.3`)

### Fixed

- **DatacoreAdapter — task `checked` semantics**: unchecked tasks (`[ ]`, status `' '`) now correctly yield `checked: true` (checkbox present) and `completed: false`, maintaining parity with Dataview. Previously `status.trim().length > 0` caused `[ ]` to be treated as non-task.
- **DatacoreAdapter — cache invalidation**: added `metadataCache.on('changed')` and `vault.on('delete')` listeners (with proper teardown in `destroy()`) alongside the existing `resolve`/`resolved`/`deleted`/`rename` listeners. Prevents stale backlink/task/list cache after file edits and deletions.
- **BreadcrumbsAdapter — hierarchy pollution**: removed default-to-`children` fallback for unknown/missing edge directions in the Breadcrumbs V4 API path. Unknown directions are now logged and ignored (fail-closed policy), preventing false hierarchical relationships.
- **SmartConnectionsAdapter — AJSON path resolution**: `adapter.read()` now always receives the full vault-relative path (`envPath/filename`) regardless of whether `adapter.list()` returns basenames or full paths.

### Improved

- **SmartConnectionsAdapter — semantic query micro-cache**: `buildSemanticQuery()` now caches results keyed by `file.path + mtime`. Repeated calls for an unchanged file skip vault I/O entirely; mtime change triggers a re-read.
- **SmartConnectionsAdapter — AJSON scan cap**: multi-index `.ajson` file scanning is capped at 200 files to prevent unbounded I/O on large vaults.
- **SmartConnectionsAdapter — `invalidate()` implementation**: was a no-op; now correctly clears the semantic query cache for a specific path (or all entries when called without arguments), respecting the `IMetadataAdapter` contract.

### Tests

- **DatacoreAdapter**: added explicit `checked` field assertions to lock in correct task semantics and prevent future regression.
- **SmartConnectionsAdapter**: new test suite (7 tests) covering cache hit, miss on mtime change, per-path invalidate, global invalidate, and `destroy()` cleanup.
- **BreadcrumbsAdapter**: added test documenting the fail-closed policy for directionless string edges from BCAPI; fixed stale inline comments that incorrectly described the old "default-to-children" behavior.

---

## [2.2.0] — 2026-04-08 (`endpoint-v2.2`)

### Fixed

- Breadcrumbs V4 API integration with unified `BCAPI` + `window.BCAPI` feature detection pipeline.
- DatacoreAdapter `query()` fallback when `tryQuery()` is unavailable.
- Partial cache poisoning: `getPageChildren()` no longer caches results when any sub-query fails.

### Improved

- CI/CD pipelines modernized for April 2026 compatibility (GitHub Actions, Prettier, ESLint).
- Repository structure cleaned: build artifacts excluded, `.husky` removed from git tracking.
- BRAT compatibility confirmed.

### Tests

- Adapter test harness introduced (Vitest + jsdom): DatacoreAdapter (10 tests), BreadcrumbsAdapter (12 tests).

---

## [2.0.1] — 2026-03-28 (`endpoint-v2.2`)

### Fixed

- Breadcrumbs V4.4.3 integration: reverse-`in` edge traversal for topological gap resolution.
- Type-safe zero-warning compliance for Obsidian Community Plugin submission.

---

## [2.0.0] — 2026-02-04

### Added

- Complete architectural rewrite: `src/` layout with adapter pattern (`DatacoreAdapter`, `BreadcrumbsAdapter`, `SmartConnectionsAdapter`, `UnifiedMetadataAdapter`).
- Deterministic graph similarity algorithms (Jaccard, Adamic-Adar, Co-Citations) in `GraphEngine`.
- `Related` metadata support via ExcaliBrain integration.
- Real-time scanning configuration in `SettingsTab`.
