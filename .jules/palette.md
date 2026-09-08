## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in AI Search

**Learning:** Users hesitate to interact with advanced features like GraphRAG when presented with a blank page. Implementing guidance-driven empty states (e.g. dashed borders, instructions, and decorative icons) encourages initial interaction. Visual icons in these states should use `aria-hidden="true"` to avoid disruptive screen reader announcements.
**Action:** Always implement a guidance-driven empty state using the `healer-empty-state` pattern before interaction occurs, ensuring decorative elements are hidden from screen readers.
