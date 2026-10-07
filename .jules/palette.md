## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-07 - Accessible Decorative Emojis in Empty States

**Learning:** When using emojis or visual icons as decorative elements in empty states (e.g., "No issues found" or "No history"), screen readers will announce them if left unhidden, disrupting the logical flow of the helper text and adding unnecessary noise.
**Action:** Always apply `aria-hidden="true"` to decorative emojis and visual elements within empty states, ensuring the screen reader focus stays smoothly on the descriptive content.
