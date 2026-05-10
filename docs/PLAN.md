# Phase 8: Semantic Tag Propagation - Execution Plan

## Scope
- Refine `SemanticTagPropagator.ts` to support exclusion lists and better coverage math.
- Integrate tag propagation into the global `analyzeGraph()` loop.
- Implement unit tests for the propagator.

## Acceptance Criteria
- [ ] Tag suggestions are generated for child clusters based on majority tags.
- [ ] Exclusion list (MOC, Index, Dashboard) is respected.
- [ ] User-defined threshold (default 50%) is used for suggestions.
- [ ] Project builds successfully (`npm run build`).
- [ ] Unit tests pass (`npx vitest run tests/core/SemanticTagPropagator.test.ts`).

## Test Commands
- `npx vitest run tests/core/SemanticTagPropagator.test.ts`
- `npm run build`
