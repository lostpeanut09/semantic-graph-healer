## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome

**Learning:** Advanced features like GraphRAG that rely on search or query inputs often suffer from "blank page syndrome" when first opened, which leaves users confused about what action to take next if there is no explicit instruction.
**Action:** Always implement guidance-driven empty states (e.g., using the `healer-empty-state` container pattern with a dashed border, an icon, and a brief description) to instruct users before any initial interaction occurs.
