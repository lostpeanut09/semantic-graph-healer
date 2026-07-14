## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.
## 2025-02-23 - Prevent Blank Page Syndrome in AI Search
**Learning:** Users encounter a blank white space in advanced AI search features (like GraphRAG) before interaction, leading to confusion about what to do next.
**Action:** Always implement a `healer-empty-state` container with brief guidance text and an `aria-hidden="true"` decorative icon for initial empty states to provide context without cluttering screen readers.
