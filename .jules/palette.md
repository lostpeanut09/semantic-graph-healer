## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-03 - Empty State Visualization without Custom CSS

**Learning:** When restricted to existing CSS classes for an empty state (e.g., `healer-empty-state` logic), plain text messages are often overlooked. You can construct an effective visual hierarchy by reusing the base `healer-card` class and applying strictly minimal inline styles (like `border-style: dashed; padding: 2em; text-align: center;`). Decorative elements like emojis can replace custom icon SVGs, provided they are explicitly marked with `aria-hidden="true"` to maintain accessibility and prevent screen reader disruption.
**Action:** Always enhance bare text empty states by combining base container classes with dashed borders and accessible, decorative emojis to create a structured, zero-custom-CSS empty state.
