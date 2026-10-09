## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-03 - Obsidian ButtonComponent Accessibility

**Learning:** Obsidian's `ButtonComponent` API lacks a built-in `setAriaLabel` method, which can lead to inaccessible icon-only buttons (like `.setIcon('cross')`) if developers only use `setTooltip`. Screen readers often do not announce tooltips immediately or reliably.
**Action:** Always add an explicit ARIA label using `btn.buttonEl.setAttribute('aria-label', '...')` when creating icon-only `ButtonComponent` instances to ensure they are accessible.
