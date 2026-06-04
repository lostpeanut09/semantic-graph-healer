## 2024-06-01 - Synchronizing Dynamic aria-labels with Visual Text

**Learning:** When dynamic text is used in buttons to show async loading states (e.g. changing from "Execute" to "Executing..."), the `aria-label` must also update to contain this new text. If it doesn't, it violates WCAG 2.5.3 (Label in Name), which can cause speech recognition software to fail to activate the button when users speak its visible name.
**Action:** Always ensure that conditional text in interactive elements is mirrored exactly in its `aria-label`, and use `aria-busy` to communicate active loading states to screen readers.

## 2024-06-04 - Screen Reader UX for Loading States

**Learning:** While WCAG 2.5.3 (Label in Name) requires synchronizing dynamic `aria-label` attributes with visible text, adding literal ellipses ("...") to `aria-label`s during loading states (e.g., "Executing...") is an accessibility anti-pattern. Screen readers literally read "dot dot dot", degrading the auditory UX.
**Action:** Exclude the ellipsis from the `aria-label` even if it is present in the visible text, and rely on `aria-busy="true"` to announce the active loading state to assistive technologies.
