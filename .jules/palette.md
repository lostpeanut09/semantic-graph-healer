## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in AI Features
**Learning:** When implementing complex features like GraphRAG, starting with a completely empty view beneath a search bar creates a disorienting "blank page syndrome" for users, reducing initial interaction rates.
**Action:** Always implement guidance-driven empty states using the `healer-empty-state` container pattern (dashed border, brief description, and an `aria-hidden="true"` icon) before any interaction occurs to set clear expectations.
