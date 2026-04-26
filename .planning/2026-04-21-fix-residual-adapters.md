# Fix Residuali Adapter Layer — Implementation Plan

> **Goal:** Applicare 5 fix residui identificati dall'audit di `src/core/adapters` per harden fallback I/O, cache bounds e lifecycle resilience.

**Architecture:** Modifiche locali e minimali in 3 file esistenti; nessuna modifica all'interfaccia pubblica (`IMetadataAdapter`).

**Tech Stack:** TypeScript, Obsidian Plugin API, Node.js `fs`-like (`DataAdapter`).

---

## Task 1: SmartConnectionsAdapter — Fix fallback loop + bounds + entry guard

**Files:**

- Modify: `src/core/adapters/SmartConnectionsAdapter.ts:286-367`

**Step 1: Add MAX_FALLBACK_FILE_SIZE constant**

Add inside `SmartConnectionsAdapter` class:

```ts
private static readonly MAX_FALLBACK_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
```

**Step 2: Fix `queryAjsonFallback` loop logic**

- Move `return suggestions` outside the `for (const singleFileFallback of singleFileFallbacks)` loop.
- Add `stat` check before `adapter.read()`; skip file if `stat.size > MAX_FALLBACK_FILE_SIZE`.
- Wrap `JSON.stringify(targetVal)` + `containsExactPath` in inner `try/catch` so one malformed entry does not abort the entire file scan.
- Keep `if (suggestions.length >= limit) return suggestions;` inside the loop so early-exit still works when limit reached.

**Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/core/adapters/SmartConnectionsAdapter.ts
git commit -m "fix(adapters): harden SmartConnections fallback I/O and loop logic"
```

---

## Task 2: DatacoreAdapter — Bound `pageChildrenCache`

**Files:**

- Modify: `src/core/adapters/DatacoreAdapter.ts:202`

**Step 1: Add `BoundedMap` helper**

Insert before `DatacoreAdapter` class definition:

```ts
class BoundedMap<K, V> extends Map<K, V> {
    constructor(private maxSize: number) {
        super();
    }
    set(key: K, value: V): this {
        if (this.size >= this.maxSize && !this.has(key)) {
            const first = this.keys().next().value;
            if (first !== undefined) this.delete(first);
        }
        return super.set(key, value);
    }
}
```

**Step 2: Replace unbounded Map**

Change:

```ts
private pageChildrenCache = new Map<string, { tasks: unknown[]; lists: unknown[] }>();
```

to:

```ts
private pageChildrenCache = new BoundedMap<string, { tasks: unknown[]; lists: unknown[] }>(500);
```

**Step 3: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 4: Commit**

```bash
git add src/core/adapters/DatacoreAdapter.ts
git commit -m "fix(adapters): bound pageChildrenCache to prevent unbounded growth"
```

---

## Task 3: UnifiedMetadataAdapter — Resilient `destroy()`

**Files:**

- Modify: `src/core/adapters/UnifiedMetadataAdapter.ts:199-210`

**Step 1: Wrap sub-adapter destroys in try/catch**

Replace `destroy()` body with:

```ts
public destroy(): void {
    this.pageCache.destroy();
    this.hierarchyCache.destroy();
    this.relatedNotesCache.destroy();

    for (const [name, adapter] of [
        ['datacore', this.datacore],
        ['breadcrumbs', this.breadcrumbs],
        ['smartConnections', this.smartConnections],
    ] as const) {
        try {
            adapter.destroy?.();
        } catch (e) {
            HealerLogger.error(`UnifiedMetadataAdapter: ${name}.destroy() failed`, e);
        }
    }
    HealerLogger.debug('UnifiedMetadataAdapter destroyed.');
}
```

**Step 2: Verify TypeScript compilation**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 3: Commit**

```bash
git add src/core/adapters/UnifiedMetadataAdapter.ts
git commit -m "fix(adapters): isolate sub-adapter destroy failures to prevent partial leaks"
```

---

## Verification

- `npx tsc --noEmit` clean
- Optional: run existing test suite (`npm test` or `npx jest`)
- Manual smoke test: disable Smart Connections plugin → verify no crash on `getRelatedNotes`
