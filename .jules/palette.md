## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-08-19 - Guidance-Driven Empty States for Advanced Features

**Learning:** Users can experience "blank page syndrome" when interacting with advanced querying features like GraphRAG if there is no initial content or guidance.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon) before any interaction occurs to set user expectations and provide a clear call to action. Add `aria-hidden="true"` to decorative icons to avoid cluttering screen reader announcements.
