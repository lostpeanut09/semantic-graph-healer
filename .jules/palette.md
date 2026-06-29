## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-29 - Preventing Blank Page Syndrome in Complex Views
**Learning:** Advanced features like GraphRAG can suffer from 'blank page syndrome', where an empty interface leaves users confused about how to initiate interaction. Simply leaving the space below a search bar blank provides poor affordance.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an `aria-hidden` icon) before any interaction occurs to clearly communicate the feature's purpose and how to use it.
