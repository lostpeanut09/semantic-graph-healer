## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2026-07-09 - Decorative Icons and Empty States

**Learning:** When adding visual icons or emojis to UI components like empty states or decorative containers, they must use the `aria-hidden="true"` attribute to prevent screen readers from announcing them unnecessarily. This ensures that the navigational flow for visually impaired users is not disrupted.
**Action:** Apply `aria-hidden="true"` to visual elements that do not provide functional context or that are purely decorative, especially in pattern templates like `healer-empty-state`.
