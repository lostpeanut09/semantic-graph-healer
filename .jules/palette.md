## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-28 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** When implementing complex features like GraphRAG, starting with a completely blank screen under the search bar can leave users confused about what the feature does or what they should ask. This "blank page syndrome" negatively impacts feature discoverability.
**Action:** Always provide a guidance-driven empty state using the `healer-empty-state` container pattern (e.g., dashed border, brief descriptive text, and a decorative icon with `aria-hidden="true"`) to guide users before any interaction occurs.
