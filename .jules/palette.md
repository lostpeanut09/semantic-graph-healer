## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-10-02 - Enhancing Empty States with Accessible Decorative Elements

**Learning:** When adding visual delight (like emojis) to empty states to make them more engaging, screen readers can interpret them literally, disrupting the flow. If a required UX pattern lacks a defined CSS class, we can combine existing base classes with strictly minimal inline styles (e.g. `border-style: dashed`) to achieve the intended visual hierarchy.
**Action:** Always apply `aria-hidden="true"` to decorative visual elements in empty states, and use a combination of existing classes (like `healer-card`) with minimal inline styles (like `border-style: dashed`) to override specific visuals when custom CSS is forbidden.
