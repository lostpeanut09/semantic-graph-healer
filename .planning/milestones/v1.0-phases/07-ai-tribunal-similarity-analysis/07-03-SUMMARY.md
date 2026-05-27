---
phase: 07-ai-tribunal-similarity-analysis
plan: 03
subsystem: UI
tags: [dashboard, tribunal, ux, transparency]
requires: [AI-01]
provides: [Audit Transparency UI]
affects: [src/views/DashboardView.ts]
tech-stack: [Obsidian API, CSS]
key-files: [src/views/DashboardView.ts, styles.css]
decisions:
    - Add verdict indicators to both the suggestion card and the detailed reasoning view.
    - Use collapsible sections for secondary reasoning to maintain a clean UI while providing full audit trails.
    - Fallback to legacy reasoning fields (winner/winnerWhy) if new fields are not yet populated by the reasoner.
metrics:
    duration: 45m
    completed_date: '2026-05-09'
---

# Phase 07 Plan 03: Tribunal UX & Audit Transparency Summary

Implemented full audit transparency for the AI Tribunal in the Healing Dashboard, allowing users to see the final verdict and the reasoning from both Primary and Secondary models.

## Key Changes

### Dashboard Suggestion UI (`src/views/DashboardView.ts`)

- Added a **Tribunal Verdict Badge** to suggestion cards that have reasoning results.
- The badge displays "STABLE", "CONFLICT", or "UNCERTAIN" with corresponding color-coding.
- Updated the **ReasoningView** (sidebar) to show:
    - A prominent verdict banner with confidence score.
    - The Primary model's reasoning clearly labeled.
    - A collapsible "View secondary model audit" section containing the secondary reasoning (if available).
- Improved the display of raw model responses for transparency.
- Ensured all LLM-generated text is rendered using safe DOM methods (`setText`) to prevent XSS.

### Styles (`styles.css`)

- Added comprehensive styles for:
    - `.healer-verdict-banner`: Top-level verdict display in the sidebar.
    - `.healer-verdict-badge`: Inline verdict indicators in suggestion cards.
    - `.healer-verdict-stable`, `.healer-verdict-conflict`, `.healer-verdict-uncertain`: Color-coding for different outcomes.
    - `.healer-secondary-reasoning-details`: Styling for the collapsible audit trail.
    - `.healer-reasoning-text`: Proper typography and `white-space: pre-wrap` to preserve LLM formatting.

## Verification Results

### Automated Tests

- `npm run build`: PASSED.
- Grep check for `secondaryReasoning` in `src/views/DashboardView.ts`: SUCCESS (found in rendering logic).

### Self-Check: PASSED

- [x] Dashboard UI explicitly displays the final Tribunal Verdict (STABLE or CONFLICT).
- [x] Dashboard UI displays the primary reasoning.
- [x] Dashboard UI conditionally displays the secondary reasoning (if the secondary model was engaged).
- [x] LLM-generated reasonings are sanitized before rendering.

## Deviations from Plan

None - plan executed exactly as written.
