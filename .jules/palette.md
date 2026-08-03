## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-08-03 - Mitigating Blank Page Syndrome with Empty States

**Learning:** When users first interact with an advanced feature like GraphRAG, they can experience "blank page syndrome" if there is no initial guidance or context.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon with `aria-hidden="true"`) before any interaction occurs to help users understand what to do next without negatively impacting screen readers.
