## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-16 - Avoid literal ellipses in `aria-label`s

**Learning:** Adding literal ellipses ('...') to `aria-label`s during loading states (e.g., 'Executing...') is an accessibility anti-pattern, as screen readers literally read 'dot dot dot', degrading auditory UX.
**Action:** Rely on the `aria-busy` attribute to convey loading state, and keep the `aria-label` free of literal ellipses while updating the visible text of the button with ellipses if desired.
