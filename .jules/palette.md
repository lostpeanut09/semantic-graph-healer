## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-09-22 - Providing Delightful Empty States

**Learning:** When users encounter a list or dashboard with no items, an unstyled or purely text-based "No items found" message can feel broken or unhelpful. Providing a styled empty state with visual feedback (like a dashed border and an emoji) improves the user experience significantly without needing complex custom CSS or new components. It makes the application feel more complete and handles edge cases gracefully.
**Action:** Always consider the empty state of lists, dashboards, and search results. If existing components don't cover it, use minimal, constraint-compliant styling (e.g., inline dashed borders with existing base classes) to create a distinct, visually pleasing empty state. Use `aria-hidden="true"` on decorative emojis to preserve accessibility.
