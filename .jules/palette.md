## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-27 - Blank Page Syndrome Prevention

**Learning:** Advanced features like GraphRAG can suffer from "blank page syndrome" when users first open them, causing confusion about how to interact with the interface.
**Action:** Always implement guidance-driven empty states (e.g., `healer-empty-state` container with a dashed border, brief description, and an icon with `aria-hidden="true"`) before any interaction occurs to set clear user expectations.
