---
phase: 17-automation-cli
plan: 01
subsystem: core
tags: [automation, cli, headless, notifier]
requires: []
provides: [HealerAutomationApi, SilentNotifier, HealerNotifier]
affects:
    [
        src/types.ts,
        src/core/services/Notifier.ts,
        src/core/services/PluginContext.ts,
        src/core/SuggestionExecutor.ts,
        src/core/services/AutomationApi.ts,
        tests/core/AutomationApi.test.ts,
    ]
tech_stack:
    added: [SilentNotifier, HealerAutomationApi]
    patterns: [Dependency Injection, Headless Mode]
key_files:
    created: [src/core/services/AutomationApi.ts, tests/core/AutomationApi.test.ts]
    modified:
        [
            src/types.ts,
            src/core/services/Notifier.ts,
            src/core/services/PluginContext.ts,
            src/core/SuggestionExecutor.ts,
        ]
decisions:
    - 'Decoupled UI notifications from the engine using an injected HealerNotifier interface.'
    - 'Implemented SilentNotifier to allow headless automation without Obsidian UI elements.'
    - 'Created AutomationApi to serve as the integration surface for the Obsidian CLI.'
metrics:
    duration_minutes: 15
    completed_date: '2024-05-22'
---

# Phase 17 Plan 01: Core API and Headless Operation Foundation

Implemented the programmatic API surface and notification abstraction layer for Semantic Graph Healer to enable safe and headless CLI execution.

## Key Accomplishments

1. **Notifier Service Abstraction**: Replaced hardcoded `new Notice()` calls within `SuggestionExecutor` with an injected `HealerNotifier` via `ExecutionContext`.
2. **Silent Execution Mode**: Introduced `SilentNotifier` implementation that routes output to the console instead of the Obsidian UI, which is necessary for background CLI tasks.
3. **Automation API Surface**: Created `HealerAutomationApi` and `AutomationApi` which expose `runAnalysis()`, `getSuggestions()`, and `getMetrics()` specifically tailored for programmatic integration.
4. **Data Optimization**: `AutomationApi.getSuggestions()` returns optimized JSON-friendly shallow clones of suggestions to prevent deep reference leaks or cyclical errors during output serialization.
5. **Headless Tests**: Validated the `SilentNotifier` interaction through automated `vitest` tests ensuring no UI boundaries are crossed when running in silent mode.

## Deviations from Plan

**1. [Rule 1 - Bug] Fixed type error in LadybugAdapter.ts**

- **Found during:** Task 2 (Build validation)
- **Issue:** TypeScript error due to accessing `.path` on type `unknown`.
- **Fix:** Explicitly typed `n` as `{ path: string }`.
- **Files modified:** `src/core/adapters/LadybugAdapter.ts`
- **Commit:** 4feecc5

## Threat Flags

None found.

## Self-Check: PASSED

- `src/core/services/AutomationApi.ts` created.
- `tests/core/AutomationApi.test.ts` created and passes successfully.
- Commits `3c78c71` and `4feecc5` exist.
