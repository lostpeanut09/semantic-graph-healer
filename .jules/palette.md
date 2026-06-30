## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-03 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** When developing advanced features that require initial input, like GraphRAG, presenting a completely blank page can lead to "blank page syndrome," confusing users about what to do next. Furthermore, adding decorative visual icons to empty states without hiding them from screen readers disrupts accessibility.
**Action:** Implement guidance-driven empty states using a container pattern (e.g., `healer-empty-state`) with a descriptive message before interaction occurs. Always use `aria-hidden="true"` on purely decorative visual elements to prevent screen reader disruption.
