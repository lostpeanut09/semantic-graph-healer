## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-03 - Guidance-Driven Empty States and Decorative Emojis

**Learning:** To prevent 'blank page syndrome' in advanced features like GraphRAG, guidance-driven empty states using the `healer-empty-state` container pattern (e.g., dashed border, brief description, and an icon) should be implemented before any interaction occurs. Additionally, visual icons or emojis in these empty states must use the `aria-hidden="true"` attribute to prevent screen readers from announcing them unnecessarily, which can disrupt the navigational flow for visually impaired users.
**Action:** Always implement empty states for advanced features and ensure decorative emojis are hidden from screen readers using `aria-hidden="true"`.
