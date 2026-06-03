## 2026-06-03 - Dynamic aria-label synchronization
**Learning:** When dynamic buttons update their text for a loading state (e.g., 'Executing...'), the corresponding `aria-label` must strictly contain the exact visible text to comply with WCAG 2.5.3 (Label in Name).
**Action:** Ensure dynamic `aria-label` attributes are updated synchronously with visual changes for all async loading buttons.
