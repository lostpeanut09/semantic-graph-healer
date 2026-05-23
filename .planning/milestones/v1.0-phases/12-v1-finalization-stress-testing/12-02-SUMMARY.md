# Phase 12 Wave 2 Summary: Adaptive Performance (Safety Mode)

Implemented the Adaptive Performance infrastructure to allow the plugin to proactively manage resource consumption in large vaults.

## Changes

### 1. Settings and Types

- Added `enableSafetyMode`, `safetyModeThresholdDesktop`, and `safetyModeThresholdMobile` to `SemanticGraphHealerSettings`.
- Added `performanceMode` ('Standard' | 'Safety') as a runtime state within settings.
- Updated `DEFAULT_SETTINGS` with appropriate defaults.
- Updated `src/types.schema.ts` with Zod validation rules for the new settings.

### 2. PerformanceService

- Created `src/core/services/PerformanceService.ts`.
- Implemented a state machine that transitions between 'Standard' and 'Safety' modes based on vault size (markdown file count) and platform (Desktop/Mobile).
- Included helper methods for operation batching and delay recommendations.

### 3. Integration

- Initialized `PerformanceService` in `src/main.ts` during `onload()`.
- Integrated performance mode re-evaluation into the settings hot-reload cycle (`onExternalSettingsChange`).
- Added a new "Performance & Safety" section to `src/views/SettingsTab.ts` for user configuration.

## Verification Results

- **Build**: `npm run build` executed. `tsc` reported no errors in the modified files.
- **Initialization**: `PerformanceService.reEvaluate()` is called on startup, ensuring the correct mode is active from the beginning.
- **Settings UI**: Added toggles and threshold fields for all new settings.
