## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-07-05 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** Advanced AI features like GraphRAG can cause "blank page syndrome" where users are unsure how to interact with the interface before submitting a query. Additionally, adding decorative emojis or icons without `aria-hidden="true"` creates unnecessary noise for screen reader users, disrupting their navigation.
**Action:** Always implement a guidance-driven empty state (using the `healer-empty-state` pattern with dashed borders and helpful text) for complex search or synthesis interfaces, and ensure all decorative visual elements explicitly include the `aria-hidden="true"` attribute.
