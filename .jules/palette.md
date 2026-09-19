## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-09-19 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** Advanced, abstract features like GraphRAG often present users with a completely blank interface before interaction, which causes confusion and "blank page syndrome." Users don't know what to do or what the feature is capable of without explicit guidance.
**Action:** Always implement a guidance-driven empty state (e.g., using the `healer-empty-state` and `healer-card` container pattern with a dashed border, brief description, and a decorative icon) before any interaction occurs to orient the user.
