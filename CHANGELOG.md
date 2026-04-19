# Changelog

All notable changes to Semantic Graph Healer are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [2.4.4] — 2026-04-19

### Fixed

- **Build Pipeline**: bumped esbuild `target` from `es2018` to `es2020` in both `mainCtx` (CJS) and `workerCtx` (IIFE). Resolves `BigInt literals are not available` error caused by `p-queue` v9 using `#idAssigner = 1n`.
- **Type Safety**: resolved `no-unsafe-argument` in `graph-analysis-worker.ts` by introducing a typed `postMessage` bridge (`WorkerResponse`).
- **Zod v4 Compatibility**: updated all `z.record()` calls to the required 2-argument form `z.record(z.string(), ...)`.
- **Test Harness**: replaced `@vitest/web-worker` with an inline `MockWorker` to avoid `blob:nodedata:` crash in Node CI environment.

### Improved

- **ESLint / Knip / Prettier**: added `.agent/` to all tool ignore configs; eliminated ~431 spurious lint errors from internal GSD tooling.
- **Repository Hygiene**: added `tsc_out.txt` and `lint_results.txt` to `.gitignore` to prevent debug artifacts from polluting commits.

> **Compatibility note**: `minAppVersion` remains `1.11.4`. BigInt is natively supported from Chrome 67+ (2018), so no installer update is required for this specific fix. Installer updates may still be needed for other Electron/Chromium changes over time.

---

## [2.4.0] — 2026-04-19

### Added

- **Runtime Integrity Layer (OSS Hardening v2)**:
    - **Zod Validation**: implemented strict schema validation for all cross-thread messages in `graph-analysis-core.ts`. Prevents topological hallucinations by enforcing runtime data integrity.
    - **Concurrency Management**: integrated `p-queue` in `GraphWorkerService` to serialize heavy graph analysis requests, preventing worker thread contention and resource exhaustion.
    - **Worker Testing Harness**: configured `@vitest/web-worker` for realistic end-to-end multi-threaded validation.

### Improved

- **UnifiedMetadataAdapter Hardening**:
    - **Safe Execution Wrappers**: implemented `safeExecute` and `safeExecuteAsync` decorators to isolate and gracefully handle third-party adapter failures (Datacore, Breadcrumbs, Smart Connections).
    - **Semantic Similarity Cache**: added a high-performance cache (TTL: 120s) for semantic relatedness lookups, significantly reducing Obsidian "Substrate" search overhead.
    - **Unified Invalidation**: synchronized cache clearing across all metadata providers (hierarchical, semantic, and field-based).

### Tests

- **Coordination Layer**: introduced `UnifiedMetadataAdapter.test.ts` (5 tests) covering cache hits, resilient fail-opens, and invalidation propagation.
- **Worker Protocol**: expanded `GraphAnalysisWorkerCore.test.ts` to verify Zod schema enforcement and error message readability.

---

## [2.3.1] — 2026-04-17

### Fixed

- **Build Pipeline — BigInt support**: updated `tsconfig.json` target to `ES2022`. Fixed `BigInt literals are not available when targeting lower than ES2020` regression.
- **SmartConnectionsAdapter — Logger regression**: resolved invalid property access in `if (this.debug)`. Replaced with direct `HealerLogger` calls.

### Improved

- **Metadata Bridges Hardening**:
    - **DatacoreAdapter**: strict isolation of internal `$`-prefixed fields in `extractUserFields` and expanded reserved key protection for Dataview parity.
    - **BreadcrumbsAdapter**: added ghost-edge protection at the re-indexing layer to filter out null/empty target objects.
    - **SmartConnectionsAdapter**: implemented mandatory `smart_env.ready` check to prevent semantic search race conditions in the April 2026 "Substrate" update.
- **Repository Cleanliness**: purged temporary audit logs from root and hardened `.gitignore` for zero-noise releases.

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
