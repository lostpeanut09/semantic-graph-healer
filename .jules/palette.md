## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-07-21 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** When users encounter complex new features (like GraphRAG search) that initially return no data, showing a completely blank page causes confusion and hesitation. The "blank page syndrome" can make users think the feature is broken or not ready.
**Action:** Always implement guidance-driven empty states for interactive advanced features. Use the `healer-empty-state` container pattern (e.g., dashed border, brief description) to instruct the user on how to start. Ensure decorative visual elements (like emojis/icons) in these empty states are marked with `aria-hidden="true"` to avoid disrupting screen readers.
