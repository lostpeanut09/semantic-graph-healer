## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in GraphRAG

**Learning:** Advanced features like GraphRAG suffer from "blank page syndrome," where users face an empty interface before interacting, lacking guidance. Furthermore, when adding decorative emojis to empty states, screen readers announce them unnecessarily, disrupting navigation.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, icon) before any interaction occurs. Always apply `aria-hidden="true"` to decorative icons or emojis to prevent screen reader disruption.
