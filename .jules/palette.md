## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-05 - Empty States with Decorative Elements

**Learning:** When using visual cues (like emojis) in empty states where custom CSS is constrained, using structural classes combined with an `aria-hidden="true"` attribute ensures screen readers focus only on the descriptive helper text, preventing disruption to navigation flow.
**Action:** When creating empty states, use existing classes (e.g., `healer-card healer-empty-state`) and apply `aria-hidden="true"` to any decorative visual elements.
