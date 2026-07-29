## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing "Blank Page Syndrome" in Advanced Features

**Learning:** Advanced features like GraphRAG can be intimidating when they only display a search bar with no initial content. This causes "blank page syndrome", confusing users on how to start. Additionally, visual icons used in empty states should have `aria-hidden="true"` to prevent screen readers from unnecessarily announcing decorative elements.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon) before any interaction occurs, providing example queries. Ensure all decorative icons use `aria-hidden="true"`.
