## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2026-08-21 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** Empty states in advanced tools like GraphRAG can cause "blank page syndrome" where users don't know what to do. Adding a guidance-driven empty state (e.g. dashed border, brief description, decorative icon with aria-hidden="true") provides immediate context and encouragement before any interaction occurs.
**Action:** Always implement guidance-driven empty states for search or complex interaction views using the `healer-empty-state` container pattern before user action begins.
