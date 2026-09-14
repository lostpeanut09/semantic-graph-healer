## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-24 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** Advanced features like GraphRAG can suffer from "blank page syndrome" where an empty interface confuses users before interaction. Additionally, screen readers announce decorative visual icons or emojis unnecessarily if they are not explicitly hidden, which disrupts navigation for visually impaired users.
**Action:** Implement guidance-driven empty states using the `healer-empty-state` pattern (combining `healer-card` with minimal inline styles like `border-style: dashed`) before interaction occurs. Always apply `aria-hidden="true"` to visual icons or emojis used in these states.
