## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-24 - Accessibility in Empty States

**Learning:** When using decorative emojis or other non-text visual elements in empty states (e.g. "🎉 No issues found"), they must have `aria-hidden="true"` applied to them. Without it, screen readers will read out the emoji description (e.g. "party popper"), which disrupts the user flow and reduces the clarity of the empty state message.
**Action:** Always apply `aria-hidden="true"` to decorative emojis or visual elements in empty states to ensure screen reader users only hear the intended message.
