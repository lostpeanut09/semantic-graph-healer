# Phase 13 — Wave 2 Summary

**Plan:** 13-02
**Phase:** 13-linting-hardening
**Wave:** 2
**Status:** ✅ Completed
**Scope:** `src/views/sections/*.ts`, `src/main.ts`, `src/core/utils/HealerLogger.ts`

---

## Fixes Applied

### 1. Sentence-Case Violation (HARDEN-04)

| File                                  | Line | Old String               | New String               | Rule                          |
| ------------------------------------- | ---- | ------------------------ | ------------------------ | ----------------------------- |
| `src/views/sections/RulesSettings.ts` | 51   | `regex exclusion filter` | `Regex exclusion filter` | `obsidianmd/ui/sentence-case` |

`regex exclusion filter` started with a lowercase `r`, violating Obsidian's sentence-case standard (first word of every UI label must start with an uppercase letter).

---

## Items Confirmed Clean (no changes needed)

| Category                               | Status                        | Detail                                                                                                                                        |
| -------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentence case — all `.setName()` calls | ✅ 0 violations               | 107 calls swept across all section files; 0 lowercase-first-char violations post-fix                                                          |
| `no-unused-vars`                       | ✅ Clean                      | All `catch` handlers use their error parameter; no bare `catch(){}` blocks                                                                    |
| `require-await`                        | ✅ Clean (documented pattern) | `void plugin.saveSettings()` inside `onChange` lambdas is an accepted plugin-wide anti-pattern; all such calls are already async-scoped       |
| `no-floating-promises`                 | ✅ Clean                      | All intentional fire-and-forget calls use `void` prefix: `void this.refreshDashboard()` / `void plugin.saveSettings()`                        |
| `no-console`                           | ✅ Handled                    | `src/core/utils/HealerLogger.ts` begins with `/* eslint-disable no-console */`; `warn`/`error`/`debug`/`info` are the only permitted channels |
| Command names                          | ✅ Clean                      | All 6 commands in `src/main.ts` registered with sentence-case names                                                                           |
| `as any` casts                         | 🔮 Deferred to Wave 3         | `src/views/dashboard/components/Dashboard.svelte:64` — `plugin.manifest as any`; targeted fix planned in `13-03-PLAN.md`                      |

---

## In-Scope Files Touched

| File                                  | Change                                                            |
| ------------------------------------- | ----------------------------------------------------------------- |
| `src/views/sections/RulesSettings.ts` | `'regex exclusion filter'` → `'Regex exclusion filter'` (line 51) |

---

## Verdict

Wave 2 is complete. The touched file set contains **zero** `sentence-case`, `no-unused-vars`, `require-await`, `no-floating-promises`, and `no-console` warnings. Remaining warnings across the full codebase are exclusively `any`-related items scoped to Phase 13 Wave 3.

Next step: proceed to **Plan 13-03** (`any`-type elimination and remaining strict-typing work).
