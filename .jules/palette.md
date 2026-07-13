## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-07-13 - Empty States in Advanced Features

**Learning:** When developing advanced features that require complex operations (like GraphRAG searches over the entire knowledge graph), initially displaying a blank space below the search bar before any interaction occurs can lead to "blank page syndrome", making the interface feel broken or unfinished.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., a dashed border, a brief description, and a visually muted icon with `aria-hidden="true"`) to provide immediate context and prompt user interaction.
