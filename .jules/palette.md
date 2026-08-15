## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2025-01-20 - Preventing Blank Page Syndrome with Guidance-Driven Empty States

**Learning:** Advanced features (like GraphRAG or filtered views) that require user action to populate data can result in "blank page syndrome" if no visual feedback is provided. A completely empty container causes confusion and can look like a broken state.
**Action:** Always implement a guidance-driven empty state using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an `aria-hidden="true"` icon) before any interaction occurs to set clear expectations and guide the user on what to do next. Ensure decorative icons use `aria-hidden="true"` to prevent screen readers from announcing them unnecessarily.
