# Phase 3 Validation: Setting Resilience & UX Stability

## Validation Strategy

Phase 3 validation focuses on the reliability of the settings management system and the adaptive performance service. Validation is achieved through unit tests for the core logic of `PerformanceService` and `KeychainService`, and structural verification of the hot-reload mechanism in the plugin lifecycle.

## Acceptance Criteria Verification

### 1. Sync-Safe Hot Reload (UX-03)

- **Goal**: Detect external `data.json` changes and hot-reload settings/services without a full plugin restart.
- **Verification**:
    - **Structural Audit**: `main.ts` implements `onExternalSettingsChange` which re-instantiates adapters and services with fresh settings.
    - **Integration Pattern**: Verified through manual testing of Obsidian Sync simulation (patching `data.json` while active).

### 2. Performance Hardening (UX-04)

- **Goal**: Proactively transition to Safety Mode based on vault size thresholds to maintain UI responsiveness.
- **Verification**:
    - **Unit Test**: `tests/core/services/PerformanceService.test.ts` validates state transitions (Standard â†” Safety) and threshold logic for both Mobile and Desktop.
    - **Verification Command**: `npm test tests/core/services/PerformanceService.test.ts`

### 3. Secure Keychain Management (INFRA-03)

- **Goal**: Secure storage of API keys with proper cleanup on deletion.
- **Verification**:
    - **Unit Test**: `tests/core/services/KeychainService.test.ts` verifies plaintext-to-encrypted migration and atomic deletion of keys from both fields.
    - **Verification Command**: `npm test tests/core/services/KeychainService.test.ts`

### 4. Zod Settings Validation

- **Goal**: Prevent settings corruption during load via schema validation.
- **Verification**:
    - **Structural Audit**: `main.ts` uses `SettingsSchema.safeParse` in `loadSettings()`.
    - **Unit Test**: `tests/core/utils/LlmHardening.test.ts` (covers LLM-related settings validation).

## Test Matrix

| Req ID   | Test File                    | Test Case                                                     |
| -------- | ---------------------------- | ------------------------------------------------------------- |
| UX-04    | `PerformanceService.test.ts` | `should transition to Safety mode when note count exceeds...` |
| UX-04    | `PerformanceService.test.ts` | `should use mobile threshold when on mobile platform`         |
| INFRA-03 | `KeychainService.test.ts`    | `clears both fields in one saveSettings call`                 |
| INFRA-03 | `KeychainService.test.ts`    | `returns key found in plaintext settings (migration)`         |
| UX-03    | `main.ts` (Manual)           | `onExternalSettingsChange logic audit`                        |

## Final Pipeline

1. `npm test tests/core/services/PerformanceService.test.ts` âœ…
2. `npm test tests/core/services/KeychainService.test.ts` âœ…
3. `npm run build` (Ensures type-safe settings access) âœ…

## Nyquist Audit Confirmation

- **Audit Date**: 2026-05-19
- **Verifier**: Gemini CLI
- **Status**: PASSED
- **Gaps Identified**: 0
- **Gaps Closed**: 0

All Phase 3 requirements are validated at the Nyquist frequency. The system demonstrates high resilience to external state changes and vault-scale pressures.
