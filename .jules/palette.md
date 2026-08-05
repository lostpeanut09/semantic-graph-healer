## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-03 - Accessible Empty States

**Learning:** When adding decorative emojis or icons to empty state containers (like `healer-empty-state`), screen readers might unnecessarily announce them, disrupting the navigational flow for visually impaired users.
**Action:** Always apply the `aria-hidden="true"` attribute to visual icons or emojis in UI components (like empty states or decorative containers) to prevent screen readers from announcing them.
