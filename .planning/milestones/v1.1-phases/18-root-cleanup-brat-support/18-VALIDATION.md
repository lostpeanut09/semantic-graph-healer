---
phase: 18
slug: 18-root-cleanup-brat-support
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-23
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/Phase18Validation.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/Phase18Validation.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | REQ-18.1 | — | Root is clean of planning and temporary files | integration | `npx vitest run -t "should have a clean root directory"` | ✅ | ✅ green |
| 18-01-02 | 01 | 1 | REQ-18.1 | — | Build artifacts ignored by Git and untracked | integration | `npx vitest run -t "should have build artifacts ignored by Git"` | ✅ | ✅ green |
| 18-01-03 | 01 | 1 | REQ-18.2 | — | CSS consolidated in src/styles.css and imported in main.ts | integration | `npx vitest run -t "should have unified CSS in src/"` | ✅ | ✅ green |
| 18-02-01 | 02 | 2 | REQ-18.3 | — | BRAT distribution release workflow exists | integration | `npx vitest run -t "should have BRAT distribution workflow"` | ✅ | ✅ green |
| 18-02-02 | 02 | 2 | REQ-18.3 | — | Installation instructions in README.md mentions BRAT | integration | `npx vitest run -t "should have BRAT distribution workflow"` | ✅ | ✅ green |
| 18-02-03 | 02 | 2 | REQ-18.1, REQ-18.2 | — | Build succeeds and root artifacts are clean | integration | `npx vitest run tests/Phase18Validation.test.ts` | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-23

---

## Validation Audit 2026-05-23
| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
