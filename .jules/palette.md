## 2026-05-25 - ARIA Input Labels and Busy States
**Learning:** Screen readers require explicit context for inputs and loading states. For input fields, an `aria-label` provides this context. For async operations triggered by buttons, an `aria-busy` state correctly communicates the loading phase to assistive technologies, avoiding silent failures.
**Action:** Always attach `aria-label` to search inputs, and ensure dynamic buttons tracking loading states utilize the `aria-busy` attribute.
