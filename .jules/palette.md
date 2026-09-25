## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-25 - Styling Empty States without Custom CSS

**Learning:** When custom CSS is forbidden, empty states can still be visually distinct by combining an existing base component class (e.g., `healer-card`) with the intended semantic class (`healer-empty-state`) and using minimal inline styles like `border-style: dashed`. Additionally, decorative visual elements like emojis in these empty states must use `aria-hidden="true"` to prevent them from disrupting screen reader flow.
**Action:** Use this pattern (`healer-card healer-empty-state` + inline dashed border + `aria-hidden` decorative icons) for all future empty states in this project to improve visual hierarchy and accessibility while adhering to CSS constraints.
