# Phase 7 UAT Fix Plan

**Goal:** Resolve UI visibility issues and runtime errors found during Phase 7 UAT.

## Diagnosis

1. **HTR Slider Missing:** Obsidian sliders can be finicky with small fractional steps (0.05). Converting to an integer-based scale (0-100) will fix visibility and UX.
2. **Consensus Error:** `LlmService` was hardcoded to fetch 'openai' and 'anthropic' keys, causing failures for users with different configurations.
3. **TypeScript Errors:** Residual type mismatches in `GraphEngine` and `LinkPredictionEngine` are blocking clean builds.

## Tasks

### Task 1: Fix HTR Slider in TribunalSettings

- Change `setLimits(0.0, 1.0, 0.05)` to `setLimits(0, 100, 5)`.
- Map the value to `0.0 - 1.0` in `onChange`.

### Task 2: Robust Key Fetching in LlmService

- Implement `getProviderFromEndpoint(endpoint: string)` helper.
- Use this helper to fetch the correct API key for primary and secondary models.

### Task 3: Fix TypeScript Residuals

- Fix `TagCache` member access in `GraphEngine.ts`.
- Ensure `ExtendedApp` casting is consistent.
- Address unused directives.

## Verification

- `npm run build` should pass.
- `npm test` should pass.
