## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2025-01-08 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** When users encounter complex views without initial data (like GraphRAG search before a query), presenting a blank area can leave them confused about what to do next. An empty state with no content or guidance violates good UX interaction principles.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon with `aria-hidden="true"`) to provide clear instructions before any interaction occurs.
