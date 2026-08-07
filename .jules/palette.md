## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-02 - Preventing Blank Page Syndrome in Advanced Features

**Learning:** For advanced features like GraphRAG, starting with a completely blank screen provides no guidance, which can confuse users and lead to a poor first impression ("blank page syndrome"). Additionally, when adding visual flair like decorative emojis to empty states, screen readers will announce them unnecessarily if not properly hidden.
**Action:** Always implement guidance-driven empty states (using the `healer-empty-state` container pattern) before any interaction occurs. Furthermore, apply `aria-hidden="true"` to any decorative icons or emojis to ensure screen reader announcements remain focused on actionable content.
