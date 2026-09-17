## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in Complex Views

**Learning:** Advanced analytical views (like GraphRAG) can present an intimidating "blank page" if they lack initial content, confusing users about what the feature does or how to use it.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` pattern (dashed border, muted text, decorative icon) to guide the user's first interaction.
