# Phase 13 Research: Repository Hardening & Standard Alignment

## 1. Summary

The project is an Obsidian plugin ("Semantic Graph Healer") with mature lint, type-checking, and Obsidian-specific ESLint configuration. The current ESLint config already includes Svelte 5 runes globals, a scoped `scripts/` override, and a solid Husky pipeline. However, `npm run lint` timed out during research and full lint output was not captured, so exact warning counts are **estimated** from code patterns and config. The key gaps are: (a) UI string case compliance, (b) a handful of eslint-ignored `any` usages, (c) potential `ObserverManager` / `onload` listener leak audit, (d) referenced but missing `lint:fix` step coverage in Husky.

---

## 2. Lint Output (npm run lint)

**Status:** `npm run lint` command timed out during research run; no captured JSON/text output.  
**Estimated total problems:** Based on config and code patterns, approximately 60-120 warnings (likely dominated by `no-unused-vars`, `require-await`, `no-floating-promises`, `obsidianmd/ui/sentence-case`, and several `any` casts). Zero strict errors (`error` severity rules like `no-tfile-tfolder-cast` and `no-static-styles-assignment` are enforced and should be clean).

**Most likely warning categories:**
| Rule | Approx. Count | Notes |
|---|---|---|
| `obsidianmd/ui/sentence-case` | 20-60 | All `.setName()` calls; many are multi-word phrases |
| `@typescript-eslint/no-unused-vars` | 10-30 | Debatable whether all variables are reused in closures |
| `@typescript-eslint/require-await` | 5-10 | Some `void plugin.saveSettings()` patterns inside `onChange` |
| `@typescript-eslint/no-floating-promises` | 5-10 | `void dbus.saveSettings()` may trigger without awaiting |
| `@typescript-eslint/no-explicit-any` | 3-5 | `as any` casts in `DashboardStore.svelte.ts` and `AdvancedMaintenanceSettings.ts` |
| `@typescript-eslint/restrict-template-expressions` | 1-3 | `${e.message}` in catch blocks |
| `no-console` | 0 | Already allows warn/error/debug/info |
| `obsidianmd/no-tfile-tfolder-cast` | 0 | Should be clean if no casts remain |

---

## 3. Build / Type Errors (npm run build)

**Status:** `npm run build` command timed out during research. TypeScript compilation step (`tsc --noEmit --skipLibCheck`) produced no captured errors. Esbuild bundling step not captured. No observed type errors in review, but `@typescript-eslint` `@typescript-eslint/no-explicit-any: 'warn'` would flag existing `any` usage during type-checked lint phase.

---

## 4. ESLint Configuration (Svelte 5 Support)

File: `.config/eslint.config.js`

The config actively supports Svelte 5 runes:

```javascript
// Browser/Svelte globals (lines 36-43)
$state: 'readonly',
$derived: 'readonly',
$effect: 'readonly',
$props: 'readonly',
$inspect: 'readonly',
$host: 'readonly',
$bindable: 'readonly',
```

- `$bindable` is included (extra good practice).
- `files: ['**/*.ts']` includes all `.ts` files, covering `.svelte.ts` files used as Svelte stores.
- The Obsidian plugin `eslint-plugin-obsidianmd` provides `obsidianmd/ui/sentence-case`.
- Type-checked rules are enabled via `tseslint.configs.recommendedTypeChecked` under `files: ['**/*.ts']`.

**Missing?** No Svelte 5 globals appear missing; all standard runes are recognized.

---

## 5. Scripts Directory Scoping

Files in `scripts/`:

- `generate-mock-vault.ts` — uses `fs`, `path`, `crypto` (via `@faker-js/faker`), `console`
- `kilo_review.mjs` — uses `fs`, `child_process.execSync`, `console`, `fetch`

ESLint override (lines 103-127):

```javascript
{
    files: ['scripts/**/*.ts'],
    languageOptions: { globals: { /* node globals */ } },
    rules: {
        'no-console': 'off',
        'import/no-nodejs-modules': 'off',
        '@typescript-eslint/require-await': 'off',
    },
}
```

✔ `generate-mock-vault.ts` is correctly scoped to this override (matches `scripts/**/*.ts`).  
⚠ `kilo_review.mjs` is a `.mjs` file and is **ignored** by the override pattern; it falls under the main config and may emit `import/no-nodejs-modules` errors. However, the top-level `ignores: ['**/*.mjs']` (line 131) ignores all `.mjs` files. So `kilo_review.mjs` is silently ignored by ESLint, which is acceptable for a review-only script, but worth documenting.

**Conclusion:** Scripts directory is correctly scoped for Node.js built-ins, but `kilo_review.mjs` relies on being ignored.

---

## 6. Obsidian Plugin UI Guidelines

### 6a. Sentence Case

- **Confirmed requirement:** Obsidian's Human Interface Guidelines and the `obsidianmd/ui/sentence-case` rule enforce sentence case (only first word capitalized, no internal capitals) for settings labels, command names, and button labels.
- The codebase already uses the rule at `'obsidianmd/ui/sentence-case': 'warn'`.

### 6b. `any` Type Avoidance

- **Confirmed practice:** Obsidian's official plugin review discourages `any`. The project already enforces `@typescript-eslint/no-explicit-any: 'warn'`.
- Explicit `any` locations found (see UI String section).

### 6c. Resource Cleanup (EventRef)

- **Confirmed expectation:** `EventRef` listeners from `metadataCache.on()` and `vault.on()` must be cleaned up in `onunload()` via `offref()`.
- The project has a dedicated `ListenerManager` class implementing `destroy()` with proper cleanup. StructuralCache and main plugin also do direct cleanup. The `onunload` is implemented (no leaks apparent).

---

## 7. UI String Violations (Status Quo)

I surveyed all setting labels (via `.setName()` across all section files). Below are the most likely violations of sentence case:

**Likely VIOLATIONS (multi-word labels with mid-phrase capital):**
| File | String | Issue |
|---|---|---|
| `ResilienceSettings.ts:7` | `'Llm max retries'` | ❌ `LLM` is uppercase abbreviation → should be `'LLM max retries'` or `'Model max retries'` |
| `RulesSettings.ts:51` | `'Regex exclusion filter'` | Starts with abbreviation `Regex`, possibly flagged |
| `TribunalSettings.ts:56` | `'Healer trust rate structural weight'` | ✅ all lowercase, OK |
| `-blacklistSettings.ts:32` | `link dynamic` | dynamic; should be linted at runtime |

**Summary:** Without lint JSON output I can't count exactly, but expect **20-60 UI string warnings**, primarily from:

- Headers using capitalized multi-word phrases that aren't sentence case
- Abbreviation-starting labels (`Regex ...`, `LLM ...`, `URL ...`)

---

## 8. Husky Hooks

| File                | Content                               | Gap                                                                                             |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `.husky/pre-commit` | `npm run lint:fix` → `npm run format` | No `nano-staged` integration; no `lint` (warn-only) check; auto-fix can hide remaining warnings |
| `.husky/pre-push`   | `npm run build` → `npm test`          | No `lint` check before push; can push with lingering warnings                                   |

---

## 9. Recommendations

### Wave 1: ESLint/Svelte 5 Foundation + Husky Hooks

- **Svelte 5:** Already configured; ensure all `.svelte.ts` files are covered by `['**/*.ts']`.
- **Run `npm run lint:fix`** locally to auto-fix all fixable issues (`--fix`) before and/or after Wave 2 & 3.
- **Prefer `lint:fix` over `lint` in Husky** or add `lint:fix` as an additional pre-commit step.
- **Add `lint` (non-fix) to pre-push** after the build/build-check step: `npm run lint || exit 1` – catches any non-auto-fixable warnings.
- **Ensure `nano-staged` is wired** in `package.json` (`"prepare": "husky"` already present, but no `husky add ... .husky/pre-commit` statement found). Document `npx husky add .husky/pre-commit ...` usage.

### Wave 2: UI Sentence Case + Lint Hygiene

- **Systematic rename of all UI labels** to sentence case. Use word-by-case check (first word capitalized, rest lowercase unless proper noun). Update both English source and any localization/l10n files if used.
- **Obsidianmd plugin compliance:** enable `'obsidianmd/ui/sentence-case': 'error'` after Wave 2 cleanup to lock it in.
- **Fix `obsidianmd/no-tfile-tfolder-cast` and `no-static-styles-assignment` errors** (already at `error`).
- **Add `obsidianmd` string rule tuning** — for units, confirm that units like "MB", "KB" are not falsely flagged if they contain caps.

### Wave 3: Strict Typing (`any` Elimination)

- `DashboardStore.svelte.ts:65` — Replace `callback: (...args: any[]) => any` with generic `<T extends any[]>` or `unknown[]` return type, using `Plugin` API typing.
- `DashboardStore.svelte.ts` — replace `as any` casts for `manifest` with structural typing.
- `AdvancedMaintenanceSettings.ts:112,136,162,198,222` — Replace type assertion `(slider as { setInstant(v: boolean): void })` with a type-guarded extended interface or create a helper method.
- `BaseAdapter.ts` and `DatacoreAdapter.ts` — explore `unknown` return types instead of `any` in `getLinks()` wrapper.
- Enable `@typescript-eslint/no-explicit-any: 'error'` after wave cleanup.

---

## 10. Additional Sub-Steps & Pitfalls

| Area                                                        | Issue                                                                                                                                                                                                              | Recommendation                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------------------- |
| `import/no-nodejs-modules`                                  | `kilo_review.mjs` excluded via `ignores: ['**/*.mjs']` but not covered by scripts override                                                                                                                         | Acceptable; document why it's ignored; add comment in ESLint config                                    |
| `no-console` in `HealerLogger.ts`                           | Logger deliberately writes to `console.warn/error/debug` — rule is overridden as `'warn'` with `allow: ['warn', 'error', 'debug', 'info']`, but logger calls should be explicitly silenced via file-level override | Add file-level override comment: `/* eslint-disable no-console */` for `HealerLogger.ts` for clarity   |
| `obsidianmd/ui/sentence-case` for abbreviations             | Labels like 'LLM', 'API', 'JSON' may be flagged as improper caps                                                                                                                                                   | Add prefix exceptions or use `obsidianmd/ui/sentence-case` override for these specific files/settings  |
| `@typescript-eslint/require-await` / `no-floating-promises` | `void plugin.saveSettings()` is an intentional anti-pattern to avoid `async` in onChange lambdas; these are currently `'warn'`, not `'error'`                                                                      | Keep at `'warn'` until codebase can consistently await; document as acceptable pattern for this plugin |
| Stage 13 milestone quality gate                             | `lint:fix` should yield zero remaining warnings before commit                                                                                                                                                      | Add `                                                                                                  |     | exit 1`in`pre-commit`to enforce; consider`--max-warnings=0` in CI if needed |
| `Svelte` store `.svelte.ts` file linting                    | Ensure `eslint-plugin-svelte` or Svelte-aware parser handles `.svelte.ts` store files                                                                                                                              | Already covered by general `**/*.ts` glob but worth confirming after Wave 1 run                        |

---

## 11. Effort Estimate

| Wave                                   | Complexity | Estimated Time | Notes                                                                                                   |
| -------------------------------------- | ---------- | -------------- | ------------------------------------------------------------------------------------------------------- |
| Wave 1 (ESLint foundation + Husky)     | Low        | 30-60 min      | Mostly config changes; no code changes if pre-existing is clean                                         |
| Wave 2 (UI string case + lint hygiene) | Medium     | 4-8 hours      | 50-80 labels to audit and update; plus string rule tuning; requires testing in Obsidian UI              |
| Wave 3 (Type strictness)               | High       | 6-12 hours     | ~managed `any` removal (~300 lines impacted); careful type-safe refactor needed; regression risk medium |

---

## 12. Open Items for Follow-Up

- [ ] Re-run `npm run lint` locally with a non-timeout wrapper; confirm exact warning counts before Wave 1
- [ ] Open issue for `kilo_review.mjs` coverage or add explicit `eslint-disable` comment in ESLint config next to scripts override
- [ ] Replace `any` in `DashboardStore.svelte.ts` with proper Obsidian API globals or a shim type
- [ ] Add `no-console: ['error', { allow: ['warn', 'error', 'debug', 'info'] }]` specifically for `HealerLogger.ts` via file-level override for clarity

---

**Files referenced in research:**

- `.config/eslint.config.js` — primary ESLint config
- `.husky/pre-commit`, `.husky/pre-push` — Git hooks
- `scripts/generate-mock-vault.ts` — Node.js build script
- `scripts/kilo_review.mjs` — MJS review script
- `src/main.ts` — plugin entry point
- `src/views/sections/CoreSettings.ts` — sample UI
- `src/views/sections/*` — all settings section files
- `src/core/utils/HealerLogger.ts` — console usage location
- `src/core/utils/ListenerManager.ts` — cleanup pattern
- `src/views/dashboard/DashboardStore.svelte.ts` — `any` usage
- `src/views/sections/AdvancedMaintenanceSettings.ts` — casts and dynamic OSV naming
