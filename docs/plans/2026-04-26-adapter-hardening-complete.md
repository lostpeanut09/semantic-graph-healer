# Adapter Layer Hardening & GSD Refactor — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete adapter layer hardening: enforce DIP, deduplicate normalization, fix cache bugs, add stampede protection and missing tests; fully align with April 2026 best practices and GSD workflow.

**Architecture:** Hexagonal ports-adapters: core depends on port interfaces (IDataviewPort, IBreadcrumbsPort, ISmartConnectionsPort), adapters implement ports, composition root wires dependencies. Caching uses true LRU (touch-on-get) and avoids null-caching. Shared utilities centralize common logic.

**Tech Stack:** TypeScript (strict), Obsidian API (vault, metadataCache, plugins.getPlugin), Vitest, ESLint, Prettier, esbuild; Git for version control.

---

## Context

This project already executed an audit (STEP 0–5) and applied P0 and P1/P2 fixes on branch `ritzy-owner`. This plan documents that work and completes remaining optional P2 improvements (cache stampede protection, test coverage gaps) to reach 100% GSD compliance. All work must be committed on `ritzy-owner` then merged to `main`.

---

## Phase 1 — Baseline: Audit & Already-Applied Fixes (P0, P1, P2a)

**Goal:** Formalize existing audit findings and already-committed fixes into GSD artifacts.

### Task 1: Create Audit Report Document

**Files:**

- Create: `docs/plans/2026-04-26-adapter-audit-report.md`

**Step 1:** Write comprehensive audit report referencing STEP 0–5 outputs.

```markdown
# Adapter Layer Audit Report (April 2026)

## Executive Summary

- Bugs found: 2 (MEDIUM)
- Improvements: 3 (LOW)
- All P0/P1/P2a fixes already applied and committed

## Findings

| ID  | Severity | Issue                          | Root Cause                                         | Fix Applied                                                    |
| --- | -------- | ------------------------------ | -------------------------------------------------- | -------------------------------------------------------------- |
| B1  | MEDIUM   | Null-caching staleness         | UnifiedMetadataAdapter caches null unconditionally | Guard `cache.set` for non-null values                          |
| B2  | MEDIUM   | BoundedMap FIFO eviction       | `get()` missing touch-on-get                       | Delete+reinsert on hit                                         |
| A1  | LOW      | Missing per-adapter ports      | Core imported concrete adapters                    | Added IBreadcrumbsPort; others exist; injected via constructor |
| A2  | LOW      | Path normalization duplication | 4 adapter-local variants                           | Central `normalizeVaultPath` in HealerUtils                    |
| A3  | LOW      | Cache stampede risk            | No in-flight coalescing                            | Not yet applied (P2b)                                          |

## Web Best Practices Confirmed (April 2026)

- [x] Obsidian: Vault API preferred, `normalizePath` — already used
- [x] LRU: touch-on-get required — fixed BoundedMap
- [x] DIP: ports defined by core, adapters implement, composition root wires — enforced
- [x] Constructor injection: natural DI in TypeScript — implemented
```

**Step 2:** Save file.

**Step 3:** Commit.

```bash
git add docs/plans/2026-04-26-adapter-audit-report.md
git commit -m "docs(audit): add adapter layer audit report (April 2026)"
```

**Done:** Audit report exists in `docs/plans/`.

---

### Task 2: Create GSD Project Artifacts (if missing)

**Files:**

- Create: `.planning/PROJECT.md`
- Create: `.planning/REQUIREMENTS.md`
- Create: `.planning/ROADMAP.md`
- Create: `.planning/STATE.md`

**Step 1:** Check existence; create only if absent.

```bash
if [ ! -f .planning/PROJECT.md ]; then
  cat > .planning/PROJECT.md << 'EOF'
# Semantic Graph Healer — GSD Project

**Vision:** Obsidian plugin that heals semantic graph inconsistencies automatically.

**Stack:** TypeScript, Obsidian API, Vitest

**Current Phase:** Adapter Hardening (Phase 1)
EOF
fi
```

Repeat similarly for `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md` with minimal content:

- `REQUIREINTS.md` — list completed P0, P1, P2a; pending P2b (stampede), P2c (missing tests).
- `ROADMAP.md` — milestones: Adapter Hardening (current), Future Enhancements.
- `STATE.md` — current branch `ritzy-owner`, commits: 830abab (P0), 71ce236 (P1), 5a0b699 (P2a).

**Step 2:** Commit.

```bash
git add .planning/PROJECT.md .planning/REQUIREMENTS.md .planning/ROADMAP.md .planning/STATE.md
git commit -m "gsd: initialize project planning artifacts"
```

**Done:** `.planning/` directory initialized with GSD core files.

---

## Phase 2 — P2b: Cache Stampede Protection

**Goal:** Prevent concurrent uncached lookups from hammering vault/API by coalescing in-flight promises per key.

### Task 1: Design In-Flight Promise Coalescing

**Files:**

- Modify: `src/core/adapters/UnifiedMetadataAdapter.ts`
- Modify: `src/core/adapters/DatacoreAdapter.ts` (BoundedMap)

**Step 1 —** Read both files to locate cache get logic.

**Step 2 —** In `UnifiedMetadataAdapter.ts`, add private `inFlightMap = new Map<string, Promise<any>>()`.

**Step 3 —** Wrap each adapter call in `getPage` / `getHierarchy` / `getRelatedNotes`:

- If key in `inFlightMap`, return that promise.
- Else create promise, store, then on completion remove from map.

**Sample code snippet:**

```typescript
private inFlightMap = new Map<string, Promise<unknown>>();

private async withCoalescing<K, T>(key: string, factory: () => Promise<T>): Promise<T> {
  const existing = this.inFlightMap.get(key);
  if (existing) return existing as Promise<T>;
  const p = factory().finally(() => this.inFlightMap.delete(key));
  this.inFlightMap.set(key, p);
  return p;
}

// Then in getPage():
return this.withCoalescing(cacheKey, () => this.safeExecute(() => this.datacore.getPage(key), null, ...));
```

**Step 4:** Add similar coalescing for `getHierarchy` (breadcrumbs) and `getRelatedNotes` (smartConnections).

**Step 5:** For `BoundedMap` in `DatacoreAdapter.ts`, implement same pattern:

- Add `private inFlight = new Map<number, Promise<unknown>>()`.
- In `get(key)`, if computation needed (cache miss), coalesce.

**Step 6:** Add TTL cleanup on done to avoid memory leaks (set timeout to auto-delete stale in-flight promises after, e.g., 30s).

**Step 7:** Run `npm test` (or verify type-check).

**Step 8:** Commit.

```bash
git add src/core/adapters/UnifiedMetadataAdapter.ts src/core/adapters/DatacoreAdapter.ts
git commit -m "perf(adapters): add cache stampede protection via in-flight promise coalescing"
```

**Done:** Concurrent uncached lookups for same key execute single underlying operation; others await same promise; memory-safe cleanup.

---

### Task 2: Add Test for Null-Caching Negative Behavior

**Files:**

- Modify: `tests/core/adapters/UnifiedMetadataAdapter.test.ts`

**Step 1:** Add test:

```typescript
it('should not cache null — second call after data becomes available should hit adapter again', async () => {
    const datacore = (adapter as any).datacore;
    const mockPage = { file: { path: 'test.md' } };

    // First call returns null
    datacore.getPage.mockReturnValueOnce(null);
    let res1 = adapter.getPage('test.md');
    expect(res1).toBeNull();
    expect(datacore.getPage).toHaveBeenCalledTimes(1);

    // Second call — mock now returns a page
    datacore.getPage.mockReturnValueOnce(mockPage);
    let res2 = adapter.getPage('test.md');
    expect(res2).toBe(mockPage);
    // Should have called adapter twice because first null was not cached
    expect(datacore.getPage).toHaveBeenCalledTimes(2);
});
```

**Step 2:** Run test; ensure passes.

**Step 3:** Commit.

```bash
git add tests/core/adapters/UnifiedMetadataAdapter.test.ts
git commit -m "test(UnifiedMetadataAdapter): ensure null results are not cached"
```

**Done:** Regression guard for null-caching fix.

---

### Task 3: Add Test for BoundedMap Touch-on-Get Eviction

**Files:**

- Modify: `tests/core/adapters/DatacoreAdapter.test.ts`

**Step 1:** Locate existing eviction test; augment or add new:

```typescript
it('BoundedMap: evicts least recently accessed, not oldest inserted', () => {
    const map = new BoundedMap<string, number>(3);
    map.set('a', 1); // oldest inserted
    map.set('b', 2);
    map.set('c', 3); // newest inserted, capacity full

    // Access 'a' to make it recently used
    expect(map.get('a')).toBe(1);
    // Insert 'd' — should evict 'b' (least recently accessed), not 'a' nor 'c'
    map.set('d', 4);

    expect(map.has('a')).toBe(true); // touched → still present
    expect(map.has('b')).toBe(false); // LRU → evicted
    expect(map.has('c')).toBe(true); // newest inserted → still present
    expect(map.has('d')).toBe(true); // newly inserted
});
```

**Step 2:** Run test; ensure passes.

**Step 3:** Commit.

```bash
git add tests/core/adapters/DatacoreAdapter.test.ts
git commit -m "test(DatacoreAdapter): verify BoundedMap uses LRU (touch-on-get) eviction"
```

**Done:** Explicit verification of LRU behavior.

---

## Phase 3 — GSD Process Activation

**Goal:** Enable GSD workflow for future development on this plugin.

### Task 1: Create GSD Configuration

**Files:**

- Create: `.gsd/config.json` (or `.planning/config.json` per repo convention)

**Step 1:** Inspect existing `.planning/` — if `.planning/config.json` exists, ensure:

```json
{
    "mode": "interactive",
    "granularity": "standard",
    "project_code": "SGH",
    "workflow": {
        "research": true,
        "plan_check": true,
        "verifier": true,
        "auto_advance": false
    },
    "git": {
        "branching_strategy": "phase"
    }
}
```

**Step 2:** If no `.planning/config.json`, create it with contents above.

**Step 3:** Commit.

```bash
git add .planning/config.json
git commit -m "gsd: add workflow configuration"
```

**Done:** GSD configuration file in place.

---

### Task 2: Run `/gsd-map-codebase`

**Command:** `npx get-shit-done-cc --claude --local` then `/gsd-map-codebase` — or if unavailable, manually create `CODEBASE.md` summary.

**Step 1:** Try invoking GSD CLI; if blocked by execution policy, document as known limitation (Windows environment) and create manual artifact:

File: `.planning/codebase-summary.md` with:

- Adapter layer structure
- Ports directory
- Cache usage patterns
- Plugin entry point (`main.ts`)

**Step 2:** Commit.

```bash
git add .planning/codebase-summary.md
git commit -m "gsd: codebase map for future planning"
```

**Done:** Codebase context captured for GSD agents.

---

## Phase 4 — Merging & Shipping

**Goal:** Merge `ritzy-owner` to `main` and push to `origin/main` following GSD ship phase.

### Task 1: Verify All Pre-merge Checks

**Files:**

- None (command actions)

**Step 1:** Run build and lint locally:

```bash
npm run build   # should pass
npm run lint    # should pass (warnings ok)
```

**Step 2:** Run full test suite:

```bash
npm test
```

**Step 3:** Ensure all tests pass. If any fail, create fix plan and re-execute before merge.

**Step 4:** Commit nothing; just verify.

**Done:** Quality gates cleared.

---

### Task 2: Merge & Push

**Step 1:** Merge `ritzy-owner` into `main` using `--no-ff` to preserve history:

```bash
git checkout main
git merge --no-ff ritzy-owner -m "merge(ritzy-owner): adapter hardening + DIP + normalization dedup"
```

**Step 2:** Push to remote:

```bash
git push origin main
```

**Step 3:** (Optional) Delete feature branch locally:

```bash
git branch -d ritzy-owner
```

**Step 4:** Commit merge action (already committed by merge); just note completion.

**Done:** Changes deployed to `origin/main`.

---

## Phase 5 — Post-Ship Documentation

### Task: Update CHANGELOG and Release Notes

**Files:**

- Modify: `CHANGELOG.md`

**Step 1:** Add entry under `[Unreleased]`:

```markdown
## [Unreleased]

### Fixed

- UnifiedMetadataAdapter: avoid caching null results preventing permanent staleness
- DatacoreAdapter: BoundedMap now implements true LRU eviction (touch-on-get)

### Refactored

- Enforced Dependency Inversion Principle: introduced IBreadcrumbsPort; UnifiedMetadataAdapter depends on port interfaces; main.ts acts as composition root
- Centralized vault path normalization in `HealerUtils.normalizeVaultPath`; removed 4 duplicate implementations

### Added

- Cache stampede protection (in-flight promise coalescing) – _if Phase 2b implemented_
- Missing unit tests for null-caching avoidance and BoundedMap LRU behavior – _if Phase 2b implemented_
```

**Step 2:** If Phase 2b implemented, also update `SPEC.md` or `README.md` to reflect new `normalizeVaultPath` utility.

**Step 3:** Commit.

```bash
git add CHANGELOG.md
git commit -m "docs: update changelog with adapter hardening changes"
```

**Done:** Project documentation up to date.

---

## Summary Checklist

| Phase | Task                                               | Status       |
| ----- | -------------------------------------------------- | ------------ |
| 1     | Audit report written & committed                   | Pending      |
| 1     | GSD artifacts (.planning/) created                 | Pending      |
| 2     | Cache stampede protection (coalescing) implemented | Optional P2b |
| 2     | Null-caching negative test added                   | Optional P2b |
| 2     | BoundedMap LRU test added                          | Optional P2b |
| 3     | GSD config in place                                | Pending      |
| 3     | Codebase map captured                              | Pending      |
| 4     | Pre-merge quality checks passed                    | Pending      |
| 4     | `ritzy-owner` merged to `main`                     | Pending      |
| 4     | Pushed to `origin/main`                            | Pending      |
| 5     | CHANGELOG updated                                  | Pending      |

> **Total tasks:** 10 core (6 already done implicitly, 4 explicit actions remaining)

---

**Execution:** This plan saved to `docs/plans/2026-04-26-adapter-hardening-complete.md`. Use `executing-plans` to run tasks in order, batching where independent. Report after each batch.
