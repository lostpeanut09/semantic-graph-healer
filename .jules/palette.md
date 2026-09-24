## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2025-02-14 - Empty States and Decorative Emojis

**Learning:** When using emojis as visual decorators in empty states (like 📜 or ✨), screen readers may announce them awkwardly (e.g., "scroll" or "sparkles"), disrupting the flow of the actual empty state message. Also, when custom CSS is forbidden, the `healer-empty-state` pattern can be effectively implemented by combining `healer-card` with minimal inline styles (`border-style: dashed`) to create a distinct, polished appearance.
**Action:** Always add `aria-hidden="true"` to purely decorative emojis in empty states. Use the `healer-card` class combined with `border-style: dashed` for empty state containers when custom classes cannot be created.
