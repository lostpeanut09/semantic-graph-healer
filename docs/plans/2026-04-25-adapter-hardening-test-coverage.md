# Adapter Layer Hardening & Test Coverage Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add missing unit tests for adapter hardening changes and implement port interfaces to improve DIP compliance in the `semantic-graph-healer` Obsidian plugin's adapter layer.

**Architecture:** Two-pronged: (1) TDD-based unit test additions for three specific failure scenarios identified in the audit; (2) Introduce port interfaces to decouple core from Obsidian APIs, improving testability and DIP compliance. All work stays within `src/core/adapters/` and `tests/core/adapters/`.

**Tech Stack:** TypeScript, Jest/Vitest (existing test setup), Obsidian plugin architecture, Obsidian ESLint rules v0.2.3

---

## Scope Reference

**Adapter files in scope:**

- `src/core/adapters/SmartConnectionsAdapter.ts`
- `src/core/adapters/UnifiedMetadataAdapter.ts`
- `src/core/adapters/DatacoreAdapter.ts`
- `src/core/adapters/BreadcrumbsAdapter.ts`
- `src/core/adapters/IMetadataAdapter.ts`

**Test directory:** `tests/core/adapters/`

**Related infrastructure:**

- `src/core/StructuralCache.ts` — destroy pattern reference
- `src/types.ts` — type definitions
- `.config/eslint.config.js` — Obsidian ESLint rules
- `package.json` — test scripts

---

### Task 1: Unit Test — SmartConnectionsAdapter Single-File Fallback (stat Failure)

**Files:**

- Modify: `tests/core/adapters/SmartConnectionsAdapter.test.ts`
- Modify: `src/core/adapters/SmartConnectionsAdapter.ts` (already hardened; verify behavior)

**Step 1: Identify test location**

Open `tests/core/adapters/SmartConnectionsAdapter.test.ts`. Find the existing single-file fallback test (around line 200-230). Confirm it tests happy path (`stat` succeeds, `read` succeeds). We need a new test for `stat` throws + `read` succeeds.

**Step 2: Write the failing test**

Add new test function `queryAjsonFallback_singleFile_statThrows_readSucceeds` after existing single-file tests.

Mock setup:

- `mockAdapter.stat()` throws TFileNotFoundError (use `new Error("File not found")` or Obsidian's `NotFoundError` if imported)
- `mockAdapter.read()` returns valid JSON string `{"nodes":[],"links":[]}`
- `this.sut.queryAjsonFallback(nonExistentFile)` should NOT throw, should return parsed JSON `{nodes: [], links: []}`

Assertions:

- Expect `adapter.stat` called once with file path
- Expect `adapter.read` called once with file path
- Return value structure matches expected shape
- No error thrown (test itself does not fail)

**Step 3: Run test to verify it fails**

Run: `npm test -- SmartConnectionsAdapter.test.ts -t "queryAjsonFallback_singleFile_statThrows_readSucceeds"`

Expected: FAIL — current code catches `stat` error and logs, then proceeds to `read()`. Wait — the hardened code already does this. Check current implementation lines 320-339. If it already handles this case, the test should PASS. If not, adjust mock to use the right error type.

**Step 4: Adjust test expectations if needed**

If test fails because current code re-throws stat error, fix is already in place from earlier hardening commit (`a371390`). Verify by checking code:

```typescript
// Inside SmartConnectionsAdapter.queryAjsonFallback (single-file path, ~320-339)
try {
    await this.adapter.stat(filePath);
} catch (statErr) {
    this.logger.debug(`stat failed for ${filePath}, proceeding to read: ${statErr.message}`);
    // Continue to read regardless
}
const content = await this.adapter.read(filePath);
```

If this pattern exists, test should PASS. Move to Step 5.

**Step 5: Commit**

```bash
git add tests/core/adapters/SmartConnectionsAdapter.test.ts
git commit -m "test(SmartConnectionsAdapter): add unit test for stat-throw + read-success fallback scenario"
```

---

### Task 2: Unit Test — UnifiedMetadataAdapter Destroy Cache Isolation

**Files:**

- Modify: `tests/core/adapters/UnifiedMetadataAdapter.test.ts`

**Step 1: Identify test location**

Open `tests/core/adapters/UnifiedMetadataAdapter.test.ts`. Find existing `destroy` test (around line 120-150). It likely tests that `destroy` calls sub-adapter destroy and clears caches. We need a test where one cache destroy throws, others still run.

**Step 2: Write the failing test**

Add test `destroy_oneCacheThrows_othersStillCleared`.

Mock setup:

- Create three mock caches: `pageCache`, `hierarchyCache`, `relatedNotesCache`
- Make `pageCache.destroy` throw `new Error("destroy failed")`
- Make `hierarchyCache.destroy` and `relatedNotesCache.destroy` be spies (jest.fn())
- Create UnifiedMetadataAdapter instance with these mocked caches
- Call `adapter.destroy()`

Assertions:

- `hierarchyCache.destroy` called once
- `relatedNotesCache.destroy` called once
- `dataviewAdapter.destroy` still called (or other sub-adapter)
- The throwing `pageCache.destroy` does NOT prevent other cleanup
- Test should NOT fail even though one cache throws

**Step 3: Run test to verify it fails**

Run: `npm test -- UnifiedMetadataAdapter.test.ts -t "destroy_oneCacheThrows_othersStillCleared"`

Expected: FAIL — current code (lines 164-181) wraps each cache destroy in try/catch via helper `destroyCache`. This was the fix already applied. Test should PASS if implementation is correct.

**Step 4: Verify implementation already correct**

Check `src/core/adapters/UnifiedMetadataAdapter.ts:164-181`. Look for:

```typescript
private destroyCache(cache: Cache | undefined, name: string): void {
  try {
    cache?.destroy();
  } catch (e) {
    this.logger.error(`Failed to destroy ${name} cache:`, e);
  }
}
// ...
this.destroyCache(this.pageCache, 'pageCache');
this.destroyCache(this.hierarchyCache, 'hierarchyCache');
this.destroyCache(this.relatedNotesCache, 'relatedNotesCache');
```

If present, test should PASS. Move to Step 5.

**Step 5: Commit**

```bash
git add tests/core/adapters/UnifiedMetadataAdapter.test.ts
git commit -m "test(UnifiedMetadataAdapter): add unit test for destroy cache isolation with partial failure"
```

---

### Task 3: Unit Test — SmartConnectionsAdapter Multi-Index No-Result Warning

**Files:**

- Modify: `tests/core/adapters/SmartConnectionsAdapter.test.ts`

**Step 1: Identify test location**

Find multi-index fallback test section (around line 350-420). Locate the `queryAjsonFallback` multi-index path test. We need to verify warning logged when files processed but no suggestions found.

**Step 2: Write the failing test**

Add test `queryAjsonFallback_multiIndex_filesProcessedButNoSuggestions_logsWarning`.

Mock setup:

- `mockAdapter.list()` returns an array of 3 mock TFile objects (simulate files present)
- `mockAdapter.stat()` resolves for each file (simulate files exist)
- `mockAdapter.read()` returns JSON with valid data but that yields no suggestions after filtering (e.g., empty links array, or links with `null` dest resolved to skip)
- Or mock `SmartConnectionsAdapter` internal processing to end with empty `suggestions` array after non-zero `anyFileProcessed` flag
- Mock `logger.warn` as jest.fn()

Invoke: `await this.sut.queryAjsonFallback(mockFolder)`

Assertions:

- `logger.warn` called exactly once
- Warning message includes text like "processed X files but found no suggestions"
- `suggestions` result is empty array
- No error thrown

**Note:** The flag `anyFileProcessed` is set in lines 406, 428. The warning branch is lines 454-460:

```typescript
if (this.anyFileProcessed && suggestions.length === 0) {
    this.logger.warn(
        `SmartConnections fallback processed ${this.filesProcessed} file(s) but no suggestions were produced. Check settings/folder configuration.`,
    );
}
```

**Step 3: Run test to verify it fails**

Run: `npm test -- SmartConnectionsAdapter.test.ts -t "queryAjsonFallback_multiIndex_filesProcessedButNoSuggestions_logsWarning"`

Expected: FAIL if mocks don't set `anyFileProcessed` correctly or if read data yields suggestions non-empty. Adjust mocks to simulate: files exist → `stat` true → `read` returns JSON that after parsing and filtering yields empty suggestions.

**Step 4: Implement minimal mock data**

Inspect existing multi-index test data shapes. Mimic structure but ensure link resolution results in empty suggestions. Pay attention to `getFirstLinkpathDest` mock — it may need to return `null` for all links to produce empty suggestions.

**Step 5: Commit**

```bash
git add tests/core/adapters/SmartConnectionsAdapter.test.ts
git commit -m "test(SmartConnectionsAdapter): add unit test for multi-index no-result warning condition"
```

---

### Task 4: Port Interfaces — Define IDataviewPort and ISmartConnectionsPort

**Files:**

- Create: `src/core/ports/IDataviewPort.ts`
- Create: `src/core/ports/ISmartConnectionsPort.ts`
- Modify: `src/core/adapters/DatacoreAdapter.ts` — implement IDataviewPort
- Modify: `src/core/adapters/SmartConnectionsAdapter.ts` — implement ISmartConnectionsPort
- Modify: `src/core/adapters/UnifiedMetadataAdapter.ts` — depend on IDataviewPort instead of concrete DatacoreAdapter

**Step 1: Research port boundaries**

Review adapter responsibilities:

- `DatacoreAdapter` wraps `App`'s `datacore` (provides `getFirstLinkpathDest`, `getPreviousLinkpathDest`, `pageChildrenCacheMaxSize`, `getEntityName`, `getEntityType`, `getEntity`, `getField`)
- `SmartConnectionsAdapter` wraps `Plugin`'s `smartConnections` instance (calls `queryAjson`, `queryAjsonFallback`)
- `UnifiedMetadataAdapter` orchestrates both to provide metadata API

Ports should expose ONLY methods used by downstream consumers (e.g., UnifiedMetadataAdapter, external callers). No more, no less.

**Step 2: Write IDataviewPort interface**

Create `src/core/ports/IDataviewPort.ts`:

```typescript
import type { TFile } from 'obsidian';
import type { DataviewEntity } from 'obsidian-dataview';

export interface IDataviewPort {
    getFirstLinkpathDest(filePath: string, linkPath: string): TFile | null;
    getPreviousLinkpathDest(filePath: string, linkPath: string): TFile | null;
    getEntityName(entity: DataviewEntity): string;
    getEntityType(entity: DataviewEntity): 'file' | 'link';
    getEntity(entity: DataviewEntity): TFile | null;
    getField(entity: DataviewEntity, fieldName: string): unknown;
    readonly pageChildrenCacheMaxSize: number;
}
```

**Step 3: Write ISmartConnectionsPort interface**

Create `src/core/ports/ISmartConnectionsPort.ts`:

```typescript
import type { TFile } from 'obsidian';
import type { SmartConnections } from 'smartconnections';

export interface ISmartConnectionsPort {
    queryAjson(file: TFile, settings: unknown): Promise<{ nodes: unknown[]; links: unknown[] }>;
    queryAjsonFallback(folder: TFile | string, settings: unknown): Promise<{ nodes: unknown[]; links: unknown[] }>;
    readonly enabled: boolean;
    // Add any other methods used by UnifiedMetadataAdapter or external consumers
}
```

**Step 4: Make DatacoreAdapter implement IDataviewPort**

Modify `src/core/adapters/DatacoreAdapter.ts`:

- Add `implements IDataviewPort` to class declaration
- No logic changes; just formalizes the contract. Ensure all interface methods exist (they do).

**Step 5: Make SmartConnectionsAdapter implement ISmartConnectionsPort**

Modify `src/core/adapters/SmartConnectionsAdapter.ts`:

- Add `implements ISmartConnectionsPort` to class declaration
- Ensure methods match interface signatures (they do: `queryAjson`, `queryAjsonFallback`, `enabled` getter exists).

**Step 6: Refactor UnifiedMetadataAdapter to depend on IDataviewPort**

Modify `src/core/adapters/UnifiedMetadataAdapter.ts`:

- Change constructor param type from `DatacoreAdapter` to `IDataviewPort`
- Update property type: `private readonly dataviewAdapter: IDataviewPort`
- All calls to `this.dataviewAdapter.xxx` are still valid because DatacoreAdapter implements the interface

**Step 7: Update factory/instantiation sites**

Search for `new UnifiedMetadataAdapter(` calls. Likely in `src/index.ts` or `src/main.ts`. Update to pass `datacoreAdapter` as `IDataviewPort`.

**Step 8: Compile and lint**

Run: `npm run build`
Expected: TypeScript compiles with 0 errors (interface implementations match)

Run: `npm run lint`
Expected: ESLint passes (Obsidian rules satisfied)

**Step 9: Run full test suite**

Run: `npm test`
Expected: All 90+ tests still pass (no behavioral change)

**Step 10: Commit (split into two logical commits)**

Commit 1 — ports definitions and adapter implements:

```bash
git add src/core/ports/ src/core/adapters/DatacoreAdapter.ts src/core/adapters/SmartConnectionsAdapter.ts
git commit -m "feat(ports): introduce IDataviewPort and ISmartConnectionsPort for DIP compliance"
```

Commit 2 — UnifiedMetadataAdapter refactor:

```bash
git add src/core/adapters/UnifiedMetadataAdapter.ts
git commit -m "refactor(UnifiedMetadataAdapter): depend on IDataviewPort abstraction"
```

---

### Task 5: Lint and Final Validation

**Files:** N/A (quality gate checks)

**Step 1: TypeScript type-check**

Run: `npx tsc --noEmit --skipLibCheck`
Expected: 0 errors

**Step 2: ESLint full suite**

Run: `npm run lint`
Expected: 0 errors (all Obsidian ESLint rules pass)

**Step 3: Prettier check**

Run: `npx prettier --check .`
Expected: 0 warnings

**Step 4: Knip dead code scan**

Run: `npx knip`
Expected: 0 issues (or only false positives)

**Step 5: Full test run**

Run: `npm test`
Expected: All tests pass (count ≥90)

**Step 6: Build production**

Run: `npm run build`
Expected: dist/ generated without errors

**Step 7: Final commit if any changes from steps 1-5**

If any lint/format fixes applied by pre-commit hooks or manual, commit:

```bash
git add .
git commit -m "chore: final quality gate passes (typecheck, lint, prettier, knip, build)"
```

---

## Context Research — April 2026 Obsidian Plugin Ecosystem

**Action:** Perform web search to confirm current Obsidian API state (April 2026), ESLint plugin version, and any breaking changes affecting adapter implementations.

**Step 1: Search Obsidian plugin development guidelines (April 2026)**

Search query: `Obsidian plugin development best practices TypeScript 2026`

**Step 2: Search eslint-plugin-obsidianmd status (April 2026)**

Search query: `eslint-plugin-obsidianmd v0.2.3 Obsidian 2026`

**Step 3: Search Obsidian API changes (2025-2026)**

Search query: `Obsidian API breaking changes 2025 2026 plugin compatibility`

**Step 4: Document findings**

If results found, note any:

- Updated API signatures (e.g., `requestUrl` vs `fetch` recommendations)
- Deprecated methods
- ESLint rule additions/removals
- Recommended TypeScript settings

If no results or ambiguous, document that latest known baseline remains eslint-plugin-obsidianmd v0.2.3 and standard Obsidian API patterns.

---

## Verification Steps

After all tasks complete, run GSD verification gate:

1. **Test count check:** `npm test -- --listTests | measure-command` or manually count passing tests; confirm ≥90
2. **TypeScript strict:** Run `npx tsc --noEmit --skipLibCheck`; 0 errors
3. **Lint/format:** `npm run lint` and `npx prettier --check .`; 0 issues
4. **Knip:** `npx knip`; no unused exports
5. **Build:** `npm run build`; dist/ files generated
6. **Git status:** `git status` — no uncommitted changes (or all changes committed to `main`)
7. **Documentation:** No README updates required (internal refactor, no API change visible to end-user)

---

## Execution Notes

- Use **TDD**: Write failing test first, then minimal implementation, then verify pass
- Commit **frequently** — at least once per task
- **DO NOT** commit generated `dist/` files; `dist/` in `.gitignore`
- If port interface design needs adjustment to match actual usage, iterate with minimal changes
- Keep Obsidian ESLint rules satisfied (no `any` abuse, proper types, no global side-effects)
- If new ESLint errors appear, fix immediately before proceeding

---

**Plan saved to:** `docs/plans/2026-04-25-adapter-hardening-test-coverage.md`

**Ready to execute.** Which execution approach?

1. **Subagent-Driven (this session)** — dispatch fresh subagent per task with code review between steps
2. **Parallel Session (separate)** — open new worktree session and run executing-plans skill
