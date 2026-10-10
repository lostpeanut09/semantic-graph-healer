## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-24 - Empty State Accessibility Pattern

**Learning:** When using decorative emojis or icons in empty states to make them feel more delightful, these visual elements can be confusing or disruptive for screen readers if read aloud out of context. The `healer-empty-state` pattern requires strict handling.
**Action:** Always apply `aria-hidden="true"` to decorative visual elements (like emojis) in these empty states to ensure screen reader flow is not disrupted, and use minimal inline styles (like `border-style: dashed`) if custom CSS is forbidden.
