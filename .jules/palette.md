## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** Advanced feature views (like GraphRAG) that rely entirely on user input can feel broken or unapproachable when presented as a blank page with only a search bar.
**Action:** Always implement a guidance-driven empty state (e.g., using `healer-empty-state` container pattern with a dashed border, brief description, and decorative icon with `aria-hidden="true"`) to explain the feature's purpose and encourage interaction before any query occurs.
