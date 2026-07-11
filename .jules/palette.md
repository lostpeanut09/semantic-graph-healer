## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-07-11 - Preventing Blank Page Syndrome in GraphRAG

**Learning:** When users first navigate to advanced features like GraphRAG, an empty state without a query can cause confusion. An empty container without guidance leads to "blank page syndrome".
**Action:** Implement guidance-driven empty states using a clear, descriptive `.healer-empty-state` container pattern (dashed border, brief description, and an `aria-hidden` icon) to prompt user interaction before any search occurs.
