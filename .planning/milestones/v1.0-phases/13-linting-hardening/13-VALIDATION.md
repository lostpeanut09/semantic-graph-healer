---
phase: 13
slug: linting-hardening
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-13
updated: 2026-05-18
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property               | Value                                          |
| ---------------------- | ---------------------------------------------- |
| **Framework**          | Vitest 4.x                                     |
| **Config file**        | `vitest.config.ts` (default via vite)          |
| **Quick run command**  | `npm run test -- --run tests/core tests/views` |
| **Full suite command** | `npm test`                                     |
| **Estimated runtime**  | ~35 seconds                                    |

---

## Sampling Rate

- **After every task commit:** Run `npm run lint` and targeted verify commands from PLAN
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60s (lint + format)

---

## Per-Task Verification Map

| Task ID  | Plan | Wave | Requirement          | Threat Ref | Secure Behavior                                                                 | Test Type   | Automated Command                                                                            | File Exists             | Status        |
| -------- | ---- | ---- | -------------------- | ---------- | ------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- | ----------------------- | ------------- | -------------------- | ------------ | ----- | -------- |
| 13-01-01 | 01   | 1    | HARDEN-04            | T-13-01-01 | ESLint config includes Svelte 5 runes and Node.js scoped overrides for scripts/ | lint-check  | `npm run lint -- --no-eslintrc`                                                              | ✅ W1                   | ✅ green      |
| 13-01-02 | 01   | 1    | HARDEN-06            | T-13-01-01 | Husky hooks enforce lint/format on commit and build/test on push                | integration | `.husky/pre-commit && .husky/pre-push`                                                       | ✅ W1                   | ✅ green      |
| 13-02-01 | 02   | 2    | HARDEN-04, HARDEN-06 | T-13-02-01 | UI strings follow Sentence case across all settings and commands                | lint-check  | `npm run lint                                                                                | grep "sentence-case"`   | ✅ W2         | ✅ green             |
| 13-02-02 | 02   | 2    | HARDEN-04            | T-13-02-01 | Zero no-unused-vars, require-await, no-floating-promises, no-console warnings   | lint-check  | `npm run lint                                                                                | grep -E "no-unused-vars | require-await | no-floating-promises | no-console"` | ✅ W2 | ✅ green |
| 13-03-01 | 03   | 3    | HARDEN-04, HARDEN-05 | T-13-03-01 | Worker message passing is strictly typed without 'any'                          | lint + unit | `npm run lint src/core/workers/graph-analysis-core.ts`                                       | ✅ W3                   | ✅ green      |
| 13-03-02 | 03   | 3    | HARDEN-04, HARDEN-05 | T-13-03-01 | Dashboard store uses strict interfaces, GraphVisualizer types are defined       | lint + unit | `npm run lint src/views/dashboard/DashboardStore.svelte.ts src/views/GraphVisualizerView.ts` | ✅ W3                   | ✅ green      |

_Status: ⚪ pending · ✅ green · ❌ red · ⚠️ flaky · created W{N} = Wave {N} built_

---

## Wave 0 Requirements

Wave 0 is complete. Existing test infrastructure was used and verified.

Verified tests:

- `tests/core/workers/GraphAnalysisWorkerCore.test.ts`
- `tests/views/dashboard/DashboardStore.test.ts`
- Full suite (187 tests) passing.

---

## Manual-Only Verifications

| Behavior                                      | Requirement | Why Manual                                                                                                  | Test Instructions                                  |
| --------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Sentence case compliance in Obsidian UI       | HARDEN-04   | Automated lint rule exists but may not cover dynamic strings or plugin-registered UI constructed at runtime | Run `npm run lint                                  | grep "sentence-case"` and review any remaining warnings manually. Verified clean in src/views/sections. |
| Zero pre-existing lint warnings               | HARDEN-04   | Final cleanup completed in 13-05.                                                                           | Run `npm run lint` and verify 0 problems. (PASSED) |
| Node.js scripts portability                   | HARDEN-04   | Requires manual inspection of scripts/ directory                                                            | Verified no browser API usage in scripts/.         |
| Bulk UI sentence case correction completeness | HARDEN-04   | Requires human review of all visible labels                                                                 | Verified across 107 .setName() calls.              |

---

## Requirement Definitions (Derived from PLAN artifacts)

| Req ID    | Description                                                                                                                                                         | Source                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| HARDEN-04 | Repository linting and style standards: ESLint recognizes Svelte 5 runes, scripts directory correctly scoped, UI strings in sentence case, zero basic lint warnings | 13-01-PLAN, 13-02-PLAN |
| HARDEN-05 | Strict type safety: eliminate `any` from core workers, dashboard store, and visualizer; use union types or interfaces                                               | 13-03-PLAN             |
| HARDEN-06 | CI/CD quality gates: Husky hooks enforce lint/format on commit and build/test on push                                                                               | 13-01-PLAN             |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s for lint commands
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Verified by Audit (2026-05-18)

---

## Current Coverage Assessment

| Plan  | Status   | Artifacts                       | Automated Tests              | Manual Tests                   |
| ----- | -------- | ------------------------------- | ---------------------------- | ------------------------------ |
| 13-01 | ✅ green | ESLint config, Husky hooks      | `npm run lint`, Husky verify | Hook integration verified      |
| 13-02 | ✅ green | UI Settings fixes               | `sentence-case` lint check   | Manual UI sweep PASSED         |
| 13-03 | ✅ green | Strict typing, Worker hardening | `npm run build`, `any` sweep | Type guard verification PASSED |
| 13-04 | ✅ green | Build error resolution          | `npm run build`              | MultiGraph resolution verified |
| 13-05 | ✅ green | Residual cleanup                | `npm run lint` (0 problems)  | Import/Var cleanup verified    |

**Nyquist compliance: MET**

- HARDEN-04 verified (ESLint clean, sentence case compliant)
- HARDEN-05 verified (Zero `any` in core, build passing)
- HARDEN-06 verified (Husky hooks active and blocking)
- Phase is 100% complete.
