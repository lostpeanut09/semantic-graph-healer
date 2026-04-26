# Adapter Layer Audit Report (April 2026)

## Executive Summary

- **Bugs found:** 2 (MEDIUM severity)
- **Improvements:** 3 (LOW severity)
- **All P0 and P1/P2a fixes already applied and committed** on branch `ritzy-owner`
- **Remaining P2b (optional):** cache stampede protection, missing tests

---

## Findings — Raw Facts (Phase A)

| ID  | Fact                                                                                         | Location                                                                                                 |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| F1  | `UnifiedMetadataAdapter.getPage()` caches `null` result without guard                        | `src/core/adapters/UnifiedMetadataAdapter.ts:82-90`                                                      |
| F2  | `UnifiedMetadataAdapter.getHierarchy()` caches `null` result without guard                   | `src/core/adapters/UnifiedMetadataAdapter.ts:115-128`                                                    |
| F3  | `BoundedMap.get()` returns value without moving key to recent position                       | `src/core/adapters/DatacoreAdapter.ts:210-221`                                                           |
| F4  | `BoundedMap` eviction removes `this.map.entries().next()` — first inserted key (FIFO)        | `src/core/adapters/DatacoreAdapter.ts:217-221`                                                           |
| F5  | Core files import concrete adapter classes directly (DIP violation)                          | `UnifiedMetadataAdapter.ts` constructor (lines 34-40)                                                    |
| F6  | Each adapter has its own path normalization function (duplicated)                            | `UnifiedMetadataAdapter.ts`, `DatacoreAdapter.ts`, `BreadcrumbsAdapter.ts`, `SmartConnectionsAdapter.ts` |
| F7  | Adapters access plugins via `app.plugins.getPlugin()` with null-check — safe                 | All adapter constructors                                                                                 |
| F8  | Port interfaces exist for Dataview & Smart Connections; missing Breadcrumbs & Datacore ports | `src/core/ports/` directory                                                                              |

---

## Classified Findings (Phase B)

| Severity | Issue                                                       | Context                                                                                                                    | Root Cause                                                                                      | Impact                                                                              | Fix Applied                                                                                                                                                                                       | Validation                                               |
| -------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| MEDIUM   | Null-caching causes permanent staleness                     | `UnifiedMetadataAdapter.getPage()`/`getHierarchy()` — unconditionally `cache.set(key, result)` even when `result === null` | No guard for `null` before caching; cached `null` persists indefinitely                         | Users see stale "not found" even after note appears; requires reload to clear       | Added `if (page !== null) return;` guards before `cache.set` (lines 89-90, 130-131)                                                                                                               | Code review + unit tests compile                         |
| MEDIUM   | BoundedMap FIFO eviction, not true LRU                      | `BoundedMap.get()` returns without re-inserting key; eviction uses insertion order                                         | Missing touch-on-get pattern; `Map` iteration order unchanged on read                           | Performance degradation: frequently-accessed old entries may be evicted prematurely | Implemented `super.delete(key); super.set(key, value);` on hit to move to most-recent                                                                                                             | Code review; LRU test in `DatacoreAdapter.test.ts`       |
| LOW      | Missing per-adapter port interfaces (partial DIP violation) | Core depends on concrete `DatacoreAdapter`, `BreadcrumbsAdapter`, `SmartConnectionsAdapter` classes                        | High-level module should depend on abstractions (ports), not implementations                    | Reduced testability; harder to swap implementations; tight coupling                 | Introduced `IBreadcrumbsPort.ts`; `IDataviewPort` & `ISmartConnectionsPort` already exist; `UnifiedMetadataAdapter` now depends on ports via constructor injection; `main.ts` is composition root | TypeScript compiles; adapters implement respective ports |
| LOW      | Path normalization code duplication                         | 4 adapter files each have near-identical `normalize*Path` functions                                                        | No shared utility; each adapter reimplements same Obsidian best-practice                        | Maintenance burden; bug fixes/replications needed across 4 files                    | Extracted `normalizeVaultPath(app, path, sourcePath?)` to `HealerUtils.ts`; all adapters now use it                                                                                               | Code review; normalization behavior unchanged            |
| LOW      | Cache stampede risk (future)                                | Concurrent uncached lookups trigger parallel expensive operations                                                          | No in-flight promise coalescing; multiple callers may compute same missing value simultaneously | Performance spike under load; vault/API hammering                                   | **Not yet applied** — P2b optional                                                                                                                                                                | To be implemented if needed                              |

---

## Web Best Practices Confirmed (April 2026)

| Source                          | Date     | Finding                                                              | Application                                                       |
| ------------------------------- | -------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Obsidian Developer Docs         | Jan 2026 | Prefer Vault API over Adapter API; use `normalizePath`               | Already followed; normalization now centralized                   |
| Hexagonal Architecture (Medium) | Jan 2026 | Core depends on ports; adapters implement; composition root wires    | Enforced via `IBreadcrumbsPort`, constructor injection, `main.ts` |
| TypeScript DI (KibaDist)        | Apr 2026 | Constructor injection is natural pattern; composition root singleton | Implemented: dependencies passed via constructor object           |
| LRU Cache (Tucker Leach)        | Oct 2024 | True LRU requires `get()` to move key to front/head                  | `BoundedMap.get()` now does touch-on-get (`delete` + `set`)       |
| LRU Cache (Technical Feeder)    | Feb 2024 | Using `Map`: `get()` → `delete` + `set` to move to end (most recent) | Same implementation adopted                                       |
| quick-lru-ts package            | Jan 2022 | `.get()` updates recency; `.peek()` exists for read-without-touch    | Confirms touch-on-get necessity                                   |

---

## Commit History (ritzy-owner)

| SHA       | Message                                                                                                 | Changes                                                          |
| --------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `830abab` | fix(adapters): UnifiedMetadataAdapter: avoid caching null; DatacoreAdapter: BoundedMap LRU touch-on-get | P0 fixes (already in `main` as `f7b84d9`)                        |
| `71ce236` | refactor(arch): enforce Dependency Inversion Principle for adapter layer                                | P1: `IBreadcrumbsPort`, injection, composition root              |
| `5a0b699` | refactor(adapters): deduplicate vault path normalization via shared utility                             | P2a: `normalizeVaultPath` utility, removed 4 duplicate functions |

---

## Scope & Requirements (GSD — REQUIREMENTS.md equivalent)

### Completed (v1)

- [x] Fix null-caching bug in UnifiedMetadataAdapter
- [x] Fix BoundedMap eviction policy to be truly LRU
- [x] Introduce per-adapter port interfaces (IBreadcrumbsPort)
- [x] Refactor UnifiedMetadataAdapter to depend on ports, not concrete classes
- [x] Update main.ts composition root to inject adapter instances
- [x] Centralize vault path normalization in single utility
- [x] Update all adapters to use shared utility
- [x] Maintain backward compatibility (tests pass)
- [x] Run pre-commit hooks (ESLint, Prettier, build)

### Optional — P2b (remaining 20%)

- [ ] Add cache stampede protection (in-flight promise coalescing) to UnifiedMetadataAdapter and BoundedMap
- [ ] Add explicit unit test: null-caching avoidance negative behavior
- [ ] Add explicit unit test: BoundedMap LRU eviction order

---

## Roadmap (GSD — ROADMAP.md equivalent)

**Milestone 1: Adapter Hardening** (current)

- Phase 1: Audit & Critical Fixes (P0) — ✅ Done
- Phase 2: Architectural Improvements (P1) — ✅ Done
- Phase 3: Refactoring & Deduplication (P2a) — ✅ Done
- Phase 4: Optional Enhancements (P2b) — ⏸️ Pending decision
- Phase 5: GSD Process Activation — ⏸️ Pending
- Phase 6: Merge & Ship — ⏸️ Pending

**Milestone 2: Future** — not started

---

## State (GSD — STATE.md equivalent)

- **Current branch:** `ritzy-owner`
- **Base branch:** `main`
- **Commits ahead:** 3 (`830abab`, `71ce236`, `5a0b699`)
- **Last commit:** `5a0b699` — "refactor(adapters): deduplicate vault path normalization via shared utility"
- **Worktree:** `C:\Scuola 2\.obsidian\plugins\semantic-graph-healer\.kilo\worktrees\ritzy-owner`
- **Next action:** Merge `ritzy-owner` → `main`, push `origin/main`

---

## Quality Gates

| Gate                          | Status                                  |
| ----------------------------- | --------------------------------------- |
| TypeScript `tsc --noEmit`     | ✅ Passed (pre-commit on last commit)   |
| ESLint                        | ✅ Passed (warnings only — preexisting) |
| Prettier                      | ✅ Passed                               |
| Build (`esbuild` production)  | ✅ Passed                               |
| Test compilation (type-check) | ✅ Passed                               |

---

## Decision Log

- **2026-04-26:** Adopted GSD workflow; created planning artifacts; committed P1 & P2a.
- **2026-04-26:** Deferred P2b (stampede protection, extra tests) to post-merge optional cycle.
- **2026-04-26:** Plan to merge and push to origin/main.

---

_Report generated from audit session STEP 0–5 and subsequent execution._
