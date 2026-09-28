## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-05-24 - Empty State UX Pattern with Existing Styles

**Learning:** When fulfilling a UX empty state pattern without custom CSS, relying on base component classes (e.g., `healer-card`) combined with minimal inline structural styles (e.g., `border-style: dashed`, `padding: 2em`) and accessible decorative icons (`aria-hidden="true"`) effectively improves visual communication without violating design boundaries.
**Action:** Re-use this pattern for empty states across other views, ensuring decorative elements are hidden from screen readers and fallback base classes are applied.
